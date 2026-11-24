import { createClient } from "@supabase/supabase-js";
export type Row = {
  id: string;
  owner: string;
  kind: string;
  payload: Record<string, any>;
  created_at: string;
};
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const db = url && key ? createClient(url, key) : null;
const storageKey = "mezzanotte-demo-v2";
export async function identity(): Promise<string | null> {
  if (db) {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    if (data.session && !data.session.user.is_anonymous)
      return data.session.user.id;
    if (data.session?.user.is_anonymous) await db.auth.signOut();
    return null;
  }
  let id = localStorage.getItem(storageKey + "-user");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(storageKey + "-user", id);
  }
  return id;
}
export async function readRows(): Promise<Row[]> {
  if (!db) return JSON.parse(localStorage.getItem(storageKey) || "[]");
  const { data, error } = await db
    .from("party_records")
    .select("*")
    .order("created_at");
  if (error) throw error;
  return data || [];
}
export async function saveRow(row: Row) {
  if (!db) {
    const rows = await readRows();
    localStorage.setItem(
      storageKey,
      JSON.stringify([...rows.filter((r) => r.id !== row.id), row])
    );
    return;
  }
  const existing = await db
    .from("party_records")
    .select("created_at")
    .eq("id", row.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const { error } = await db.from("party_records").upsert({
    ...row,
    created_at: existing.data?.created_at || row.created_at,
  });
  if (error) throw error;
}
export async function deleteRow(id: string) {
  if (!db) {
    localStorage.setItem(
      storageKey,
      JSON.stringify(
        (await readRows()).filter(
          (r) =>
            r.id !== id &&
            !(["vote", "decision"].includes(r.kind) && r.payload.place === id)
        )
      )
    );
    return;
  }
  const { error } = await db.from("party_records").delete().eq("id", id);
  if (error) throw error;
}
export async function membership() {
  if (!db) return { joined: true, admin: true };
  const { data, error } = await db.rpc("party_membership");
  if (error) throw error;
  return data as { joined: boolean; admin: boolean };
}
export async function join(code: string) {
  if (!db) return;
  const { error } = await db.rpc("join_party", { invite: code });
  if (error) throw error;
}
