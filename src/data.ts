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
let identityPromise: Promise<string> | null = null;
export function identity(): Promise<string> {
  if (!identityPromise)
    identityPromise = initializeIdentity().catch((error) => {
      identityPromise = null;
      throw error;
    });
  return identityPromise;
}
async function initializeIdentity() {
  if (db) {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session.user.id;
    const result = await db.auth.signInAnonymously();
    if (result.error) throw result.error;
    return result.data.user!.id;
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
export async function upload(file: File, owner: string) {
  if (!db)
    throw new Error(
      "I caricamenti sono disponibili dopo aver collegato Supabase."
    );
  let body: Blob = file;
  if (
    ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
    file.size <= 20 * 1024 * 1024
  ) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Impossibile preparare la foto.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      body = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Impossibile comprimere la foto.")),
          "image/webp",
          0.82
        )
      );
    } finally {
      bitmap.close();
    }
  }
  const max = file.type.startsWith("video/") ? 20 : 5;
  if (
    !(file.type.startsWith("image/") || file.type.startsWith("video/")) ||
    body.size > max * 1024 * 1024
  )
    throw new Error(`Formato non supportato o file oltre ${max} MB.`);
  const path = `${owner}/${crypto.randomUUID()}`;
  const { error } = await db.storage
    .from("party-media")
    .upload(path, body, { contentType: body.type });
  if (error) throw error;
  return path;
}
export async function mediaUrl(path: string) {
  if (!db) return "";
  const { data, error } = await db.storage
    .from("party-media")
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
