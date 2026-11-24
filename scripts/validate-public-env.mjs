const allowed = new Set(["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]);

export function validatePublicEnv(env) {
  for (const name of Object.keys(env)) {
    if (name.startsWith("VITE_") && !allowed.has(name)) {
      throw new Error(
        `Variabile frontend non consentita: ${name}. I segreti non devono usare il prefisso VITE_.`
      );
    }
  }
  const url = env.VITE_SUPABASE_URL || "";
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!url && !key) return;
  if (!url || !key)
    throw new Error(
      "Configurazione Supabase incompleta. Servono URL e publishable key."
    );
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(parsed.hostname)
  )
    throw new Error("Supabase richiede una connessione HTTPS.");
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  // Legacy anon JWTs are supported, but service-role and other privileged keys are rejected before bundling.
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1] || "", "base64url").toString()
    );
    if (key.split(".").length === 3 && payload.role === "anon") return;
  } catch {}
  throw new Error(
    "Chiave frontend non consentita. Usa esclusivamente una publishable key o una legacy anon key."
  );
}
