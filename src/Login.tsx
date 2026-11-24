import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { db } from "./data";

export default function Login({
  initialError = "",
}: {
  initialError?: string;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timeout = setTimeout(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000
    );
    return () => clearTimeout(timeout);
  }, [cooldown]);
  async function send() {
    if (!db || busy || cooldown) return;
    setBusy(true);
    setError("");
    try {
      const result = await db.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: location.origin + location.pathname,
        },
      });
      if (result.error) throw result.error;
      setSent(true);
      setCode("");
      setCooldown(60);
    } catch (error) {
      const reason = error as { code?: string };
      setError(
        reason.code === "email_address_not_authorized"
          ? "L’invio delle email non è ancora configurato. Riprova dopo l’attivazione del servizio."
          : reason.code === "over_email_send_rate_limit" ||
            reason.code === "over_request_rate_limit"
          ? "Troppi tentativi. Attendi qualche minuto e riprova."
          : "Non riusciamo a inviare il codice. Controlla l’indirizzo e riprova."
      );
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!db || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await db.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      // The app's Auth listener loads membership and the existing profile.
    } catch {
      setError(
        "Codice non valido o scaduto. Controllalo oppure richiedine uno nuovo."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="entry">
      <div className="logo">
        <span className="logo-symbol">
          <Sparkles size={19} />
        </span>
        mezzanotte<span className="accent">.</span>
      </div>
      <div className="entry-copy">
        <span className="eyebrow">IL TUO POSTO NEL GRUPPO</span>
        <h1>
          {sent ? (
            <>
              Controlla
              <br />
              la tua email.
            </>
          ) : (
            <>
              Il bello è<br />
              esserci.
            </>
          )}
        </h1>
        <p>
          {sent
            ? `Inserisci il codice inviato a ${email}. Controlla anche lo spam.`
            : "Entra con la tua email. Ti inviamo un codice, senza creare una password."}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (sent) void verify();
            else void send();
          }}
        >
          {sent ? (
            <label className="field">
              <span>Codice di accesso</span>
              <input
                name="code"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                maxLength={10}
                required
                autoFocus
                placeholder="Il codice ricevuto"
              />
            </label>
          ) : (
            <label className="field">
              <span>La tua email</span>
              <input
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                placeholder="nome@email.it"
              />
            </label>
          )}
          <button disabled={busy || (!sent && cooldown > 0)}>
            {busy
              ? "Un momento…"
              : sent
              ? "Verifica e accedi"
              : "Inviami il codice"}
          </button>
        </form>
        {sent && (
          <div className="login-options">
            <button
              className="text-button"
              disabled={busy || cooldown > 0}
              onClick={() => void send()}
            >
              {cooldown
                ? `Invia di nuovo tra ${cooldown}s`
                : "Invia un nuovo codice"}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setCode("");
                setError("");
                setCooldown(0);
              }}
            >
              Cambia email
            </button>
          </div>
        )}
        <p className="form-note">
          La tua email non viene mostrata al gruppo. Al primo accesso ti servirà
          anche il codice d’invito. Accedere non conferma la tua presenza.
        </p>
      </div>
      <p className="entry-foot">Capodanno 2027 · si organizza, insieme.</p>
    </div>
  );
}
