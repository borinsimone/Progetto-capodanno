import { createClient } from '@supabase/supabase-js';
import type { Data, Profile, Proposal, Vote } from './types';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloud = Boolean(url && key);
export const supabase = cloud ? createClient(url, key) : null;
const storageKey = 'capodanno-2027-demo-v1';
const identityKey = 'capodanno-2027-demo-user';
const empty = (): Data => ({ profiles: [], proposals: [], votes: [] });
function local(): Data {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return empty();
  try { const data = JSON.parse(raw); if (!Array.isArray(data.profiles) || !Array.isArray(data.proposals) || !Array.isArray(data.votes)) throw Error(); return data; }
  catch { throw new Error('I dati demo salvati non sono leggibili. Rimuovi i dati del sito dal browser per ricominciare.'); }
}
function persist(data: Data) { localStorage.setItem(storageKey, JSON.stringify(data)); }
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }
export async function getIdentity(): Promise<string | null> {
  if (!supabase) return localStorage.getItem(identityKey);
  const { data, error } = await supabase.auth.getSession(); check(error); return data.session?.user.id ?? null;
}
export async function loadData(): Promise<Data> {
  if (!supabase) return local();
  // RLS keeps the event data available only to signed-in participants.
  if (!await getIdentity()) return empty();
  const results = await Promise.all([supabase.from('profiles').select('*').order('created_at'), supabase.from('proposals').select('*').order('created_at', { ascending: false }), supabase.from('votes').select('*')]);
  results.forEach(r => check(r.error));
  return { profiles: results[0].data as Profile[], proposals: results[1].data as Proposal[], votes: results[2].data as Vote[] };
}
export async function join(name: string): Promise<string> {
  let id = await getIdentity();
  if (supabase && !id) { const { data, error } = await supabase.auth.signInAnonymously(); check(error); id = data.user!.id; }
  if (!id) id = crypto.randomUUID();
  const profile: Profile = { id, name, attendance: 'maybe', guests: 0, note: '', avatar_path: null, created_at: new Date().toISOString() };
  if (supabase) {
    const { data, error } = await supabase.from('profiles').select('id').eq('id', id).maybeSingle(); check(error);
    if (!data) { const result = await supabase.from('profiles').insert(profile); check(result.error); }
  } else { const data = local(); if (!data.profiles.some(p => p.id === id)) { data.profiles.push(profile); persist(data); } localStorage.setItem(identityKey, id); }
  return id;
}
export async function saveProfile(profile: Profile) {
  if (supabase) { const { error } = await supabase.from('profiles').update({ name: profile.name, attendance: profile.attendance, guests: profile.guests, note: profile.note }).eq('id', profile.id); check(error); }
  else { const data = local(); data.profiles = data.profiles.map(p => p.id === profile.id ? profile : p); persist(data); }
}
export async function addProposal(proposal: Proposal) {
  if (supabase) { const { error } = await supabase.from('proposals').insert(proposal); check(error); }
  else { const data = local(); data.proposals.unshift(proposal); persist(data); }
}
export async function removeProposal(id: string) {
  if (supabase) { const { error } = await supabase.from('proposals').delete().eq('id', id); check(error); }
  else { const data = local(); data.proposals = data.proposals.filter(p => p.id !== id); data.votes = data.votes.filter(v => v.proposal_id !== id); persist(data); }
}
export async function toggleVote(userId: string, proposalId: string, voted: boolean) {
  if (supabase) { const result = voted ? await supabase.from('votes').delete().eq('user_id', userId).eq('proposal_id', proposalId) : await supabase.from('votes').insert({ user_id: userId, proposal_id: proposalId }); check(result.error); }
  else { const data = local(); data.votes = data.votes.filter(v => !(v.user_id === userId && v.proposal_id === proposalId)); if (!voted) data.votes.push({ user_id: userId, proposal_id: proposalId }); persist(data); }
}
