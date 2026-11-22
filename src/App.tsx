import { useEffect, useRef, useState } from "react";
import {
  Home,
  LayoutGrid,
  Wallet,
  Images,
  Plus,
  X,
  Check,
  Moon,
  Users,
  MapPin,
  Utensils,
  Sparkles,
  Settings,
  Heart,
  Trash2,
  Camera,
  Copy,
} from "lucide-react";
import {
  db,
  identity,
  membership,
  join,
  readRows,
  saveRow,
  deleteRow,
  upload,
  mediaUrl,
  type Row,
} from "./data";
import { balances, settlements } from "./domain.mjs";
const euro = (c: number) =>
  (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const makeRow = (
  owner: string,
  kind: string,
  payload: Row["payload"],
  id: string = crypto.randomUUID()
): Row => ({ id, owner, kind, payload, created_at: new Date().toISOString() });
const labels: Record<string, string> = {
  yes: "Ci sono",
  maybe: "Forse",
  no: "Non ci sono",
};
type Modal =
  | "profile"
  | "place"
  | "food"
  | "expense"
  | "transfer"
  | "media"
  | "settings"
  | null;
export default function App() {
  const [rows, setRows] = useState<Row[]>([]),
    [user, setUser] = useState(""),
    [joined, setJoined] = useState(false),
    [admin, setAdmin] = useState(false);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("home"),
    [section, setSection] = useState("people"),
    [modal, setModal] = useState<Modal>(null),
    [notice, setNotice] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const profile = rows.find((r) => r.kind === "profile" && r.owner === user);
  const people = rows.filter((r) => r.kind === "profile"),
    places = rows.filter((r) => r.kind === "place"),
    foods = rows.filter((r) => r.kind === "food"),
    expenses = rows.filter((r) => r.kind === "expense"),
    transfers = rows.filter((r) => r.kind === "transfer"),
    media = rows.filter((r) => r.kind === "media");
  const confirmed = people.filter((p) => p.payload.status === "yes"),
    sleeping = confirmed.filter((p) => p.payload.sleep);
  const balance = balances(people, expenses, transfers),
    total = expenses.reduce((n, r) => n + r.payload.cents, 0);
  const name = (id: string) =>
    people.find((p) => p.owner === id)?.payload.name || "Partecipante";
  const chosen = rows.find((r) => r.kind === "decision");
  const votes = (id: string) =>
    rows.filter((r) => r.kind === "vote" && r.payload.place === id);
  async function refresh() {
    setRows(await readRows());
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const id = await identity();
        const m = await membership();
        if (!active) return;
        setUser(id);
        setJoined(m.joined);
        setAdmin(m.admin);
        if (m.joined) await refresh();
      } catch (e) {
        if (active) setError(message(e));
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!joined) return;
    const update = () => refresh().catch((e) => setError(message(e)));
    const t = setInterval(update, 20000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", update);
    };
  }, [joined]);
  useEffect(() => {
    let active = true;
    Promise.all(
      media.map(async (m) => [m.id, await mediaUrl(m.payload.path)] as const)
    )
      .then((entries) => {
        if (active) setUrls(Object.fromEntries(entries));
      })
      .catch((e) => setError(message(e)));
    return () => {
      active = false;
    };
  }, [rows]);
  function message(e: unknown) {
    return e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "Operazione non riuscita. Riprova.";
  }
  async function action(fn: () => Promise<void>, close = true) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      if (close) setModal(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: Row) {
    if (!confirm("Eliminare questo elemento?")) return;
    await action(async () => {
      if (row.kind === "media" && db) {
        const { error } = await db.storage
          .from("party-media")
          .remove([row.payload.path]);
        if (error) throw error;
      }
      await deleteRow(row.id);
    }, false);
  }
  function open(kind: Modal) {
    setError("");
    setModal(kind);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const value = (key: string) => String(f.get(key) || "").trim();
    await action(async () => {
      if (modal === "profile") {
        const guests = Number(value("guests"));
        if (!Number.isInteger(guests) || guests < 0 || guests > 10)
          throw new Error("Accompagnatori non validi");
        await saveRow(
          makeRow(
            user,
            "profile",
            {
              name: value("name"),
              status: value("status"),
              guests,
              sleep: f.has("sleep"),
              allergies: value("allergies"),
              avoid: value("avoid"),
            },
            profile?.id
          )
        );
      }
      if (modal === "place") {
        const link = value("link");
        if (link && !/^https?:\/\//i.test(link))
          throw new Error("Inserisci un link https:// o http://");
        await saveRow(
          makeRow(user, "place", {
            title: value("title"),
            description: value("description"),
            link,
            beds: Number(value("beds")),
            cost: Math.round(Number(value("cost")) * 100),
          })
        );
      }
      if (modal === "food")
        await saveRow(
          makeRow(user, "food", {
            title: value("title"),
            category: value("category"),
            notes: value("notes"),
          })
        );
      if (modal === "expense") {
        const selected = f.getAll("people").map(String);
        const cents = Math.round(Number(value("amount")) * 100);
        if (!selected.length || !Number.isSafeInteger(cents) || cents <= 0)
          throw new Error("Indica importo e almeno un partecipante.");
        await saveRow(
          makeRow(user, "expense", {
            title: value("title"),
            cents,
            people: selected,
          })
        );
      }
      if (modal === "transfer") {
        const cents = Math.round(Number(value("amount")) * 100);
        if (!Number.isSafeInteger(cents) || cents <= 0)
          throw new Error("Importo non valido");
        if (value("to") === user)
          throw new Error("Scegli un altro destinatario");
        await saveRow(
          makeRow(user, "transfer", {
            from: user,
            to: value("to"),
            cents,
            confirmed: false,
          })
        );
      }
      if (modal === "media") {
        const file = f.get("file") as File;
        if (!file?.size) throw new Error("Scegli un file");
        const path = await upload(file, user);
        try {
          await saveRow(
            makeRow(user, "media", {
              path,
              type: file.type,
              caption: value("caption"),
            })
          );
        } catch (e) {
          if (db) await db.storage.from("party-media").remove([path]);
          throw e;
        }
      }
    });
  }
  if (!ready)
    return (
      <div className="splash">
        <Sparkles size={32} />
        <p>Prepariamo la serata…</p>
      </div>
    );
  if (!user)
    return (
      <div className="splash">
        <h1>Non riusciamo ad entrare</h1>
        <p role="alert">{error}</p>
        <button onClick={() => location.reload()}>Riprova</button>
      </div>
    );
  if (!joined)
    return (
      <div className="entry">
        <Logo />
        <div className="entry-copy">
          <span className="eyebrow">31 DICEMBRE 2026 · INSIEME</span>
          <h1>
            Il bello è<br />
            esserci.
          </h1>
          <p>
            Un posto per organizzare la notte.
            <br />E ritrovarne i ricordi.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get("invite"));
              setBusy(true);
              try {
                await join(code);
                const m = await membership();
                setJoined(m.joined);
                setAdmin(m.admin);
                await refresh();
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Codice d’invito">
              <input
                name="invite"
                required
                autoComplete="off"
                placeholder="Il codice del gruppo"
              />
            </Field>
            <button disabled={busy}>Entra nel gruppo</button>
          </form>
          <Recovery />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
        <p className="entry-foot">Una notte, tutte le nostre idee.</p>
      </div>
    );
  if (!profile && modal !== "profile")
    return (
      <div className="entry">
        <Logo />
        <div className="entry-copy">
          <span className="eyebrow">BENVENUTO NEL GRUPPO</span>
          <h1>
            Cominciamo
            <br />
            da te.
          </h1>
          <p>
            Come ti chiami? Il tuo profilo resterà salvato su questo
            dispositivo.
          </p>
          {!db && (
            <p className="demo-inline">
              Demo locale: i dati restano solo in questo browser.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = String(
                new FormData(e.currentTarget).get("name")
              ).trim();
              if (n)
                action(() =>
                  saveRow(
                    makeRow(user, "profile", {
                      name: n,
                      status: "maybe",
                      guests: 0,
                      sleep: false,
                      allergies: "",
                      avoid: "",
                    })
                  )
                );
            }}
          >
            <Field label="Il tuo nome">
              <input
                name="name"
                required
                maxLength={60}
                placeholder="Come ti chiamano gli amici"
                autoComplete="given-name"
              />
            </Field>
            <button disabled={busy}>
              Ci sono anch’io <Sparkles size={18} />
            </button>
          </form>
          <Recovery />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <p className="entry-foot">Capodanno 2027 · si organizza, insieme.</p>
      </div>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <Logo />
        <p className="sidebar-note">
          Una notte.
          <br />
          Tutto il gruppo.
        </p>
        <Navigation tab={tab} setTab={setTab} />
        <div className="side-year">
          20<span>27</span>
          <small>IL PROSSIMO BEL RICORDO</small>
        </div>
      </aside>
      <div className="shell">
        <header>
          <div className="mobile-logo">
            <Logo />
          </div>
          <span className="desktop-kicker">IL NOSTRO CAPODANNO</span>
          <div className="header-right">
            <span className="date-chip">
              31 dic <span>·</span> 01 gen
            </span>
            <button
              className="avatar"
              aria-label="Apri il tuo profilo"
              onClick={() => open("profile")}
            >
              {profile?.payload.name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>
        {!db && (
          <div className="demo-banner">
            DEMO LOCALE <span>Dati salvati solo su questo dispositivo</span>
            <button className="text-button" onClick={() => open("settings")}>
              Info
            </button>
          </div>
        )}
        <main id="main" className={tab === "home" ? "home-page" : undefined}>
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Chiudi errore"
                onClick={() => setError("")}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {tab === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">LA NOTTE CHE CI ASPETTA</span>
                  <h1>
                    Ciao, {profile?.payload.name.split(" ")[0]}
                    <span className="accent">.</span>
                  </h1>
                  <p>Mettiamo insieme un bel Capodanno.</p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Impostazioni"
                  onClick={() => open("settings")}
                >
                  <Settings size={21} />
                </button>
              </div>
              <section className="hero">
                <div className="hero-top">
                  <span className="pill">CAPODANNO 2027</span>
                  <Sparkles size={22} />
                </div>
                <h2>
                  Il conto alla rovescia
                  <br />
                  inizia da noi.
                </h2>
                <div className="hero-bottom">
                  <span>31 dicembre 2026</span>
                  <span>Una notte da ricordare</span>
                </div>
                <div className="orb" aria-hidden="true" />
              </section>
              <div className="stats">
                <button
                  onClick={() => {
                    setTab("organize");
                    setSection("people");
                  }}
                >
                  <Users />
                  <strong>
                    {confirmed.reduce((n, p) => n + 1 + p.payload.guests, 0)}
                  </strong>
                  <span>Ci siamo</span>
                </button>
                <button
                  onClick={() => {
                    setTab("organize");
                    setSection("sleep");
                  }}
                >
                  <Moon />
                  <strong>
                    {sleeping.reduce((n, p) => n + 1 + p.payload.guests, 0)}
                  </strong>
                  <span>Restiamo a dormire</span>
                </button>
                <button onClick={() => setTab("money")}>
                  <Wallet />
                  <strong>{euro(Math.max(0, -(balance[user] || 0)))}</strong>
                  <span>Devi ancora mettere</span>
                </button>
              </div>
              <div className="section-title">
                <h2>Facciamo il punto</h2>
                <span>PASSO DOPO PASSO</span>
              </div>
              <div className="home-grid">
                <button
                  className="summary-card"
                  onClick={() => open("profile")}
                >
                  <span className="soft-icon">
                    <Check />
                  </span>
                  <div>
                    <small>LA TUA PRESENZA</small>
                    <h3>
                      {labels[profile?.payload.status] || "Da confermare"}
                    </h3>
                    <p>
                      {profile?.payload.sleep
                        ? "Ti fermi anche a dormire"
                        : "Una risposta e ci organizziamo meglio"}
                    </p>
                  </div>
                  <span className="edit-label">Modifica</span>
                </button>
                <button
                  className="summary-card"
                  onClick={() => {
                    setTab("organize");
                    setSection("places");
                  }}
                >
                  <span className="soft-icon violet">
                    <MapPin />
                  </span>
                  <div>
                    <small>IL NOSTRO POSTO</small>
                    <h3>
                      {places.find((p) => p.id === chosen?.payload.place)
                        ?.payload.title || "Dove ci troviamo?"}
                    </h3>
                    <p>
                      {places.length
                        ? `${places.length} proposte da scoprire`
                        : "La prima proposta potrebbe essere la tua"}
                    </p>
                  </div>
                </button>
              </div>
              <button
                className="quiet-row"
                onClick={() => {
                  setTab("organize");
                  setSection("food");
                }}
              >
                <Utensils size={20} />
                <span>
                  <strong>A tavola, senza pensieri</strong>
                  <small>Aggiungi allergie e scegli cosa portare</small>
                </span>
                <Plus size={20} />
              </button>
            </>
          )}
          {tab === "organize" && (
            <>
              <PageTitle
                eyebrow="OGNUNO FA LA SUA PARTE"
                title="Organizziamoci."
                text="Le idee diventano una serata."
              />
              <div className="segmented" aria-label="Categorie">
                {[
                  ["people", "Presenze"],
                  ["places", "Posto"],
                  ["food", "Cibo"],
                  ["sleep", "Dormire"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={section === key}
                    className={section === key ? "selected" : ""}
                    onClick={() => setSection(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {section === "people" && (
                <>
                  <SectionTitle
                    title={`${people.length} nel gruppo`}
                    action="Il mio profilo"
                    onClick={() => open("profile")}
                  />
                  <div className="list">
                    {people.map((p) => (
                      <article className="person-row" key={p.id}>
                        <span className="person-avatar">
                          {p.payload.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <h3>
                            {p.payload.name}
                            {p.owner === user && <small> · tu</small>}
                          </h3>
                          <p>
                            {p.payload.guests
                              ? `+${p.payload.guests} accompagnatori · `
                              : ""}
                            {p.payload.sleep
                              ? "Anche a dormire"
                              : "Solo la serata"}
                          </p>
                        </div>
                        <span className={`status ${p.payload.status}`}>
                          {labels[p.payload.status]}
                        </span>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {section === "places" && (
                <>
                  <SectionTitle
                    title="Un posto per tutti"
                    action="Proponi"
                    onClick={() => open("place")}
                  />
                  {!places.length && (
                    <Empty
                      icon={<MapPin />}
                      title="Dove facciamo mezzanotte?"
                      text="Una casa, una baita, un posto speciale. Inizia con una proposta."
                      action="Proponi un posto"
                      onClick={() => open("place")}
                    />
                  )}
                  <div className="cards">
                    {places.map((p) => (
                      <article className="card place" key={p.id}>
                        <div className="card-top">
                          <span className="soft-icon violet">
                            <MapPin />
                          </span>
                          {chosen?.payload.place === p.id && (
                            <span className="status yes">Posto scelto</span>
                          )}
                          {p.owner === user && (
                            <Delete onClick={() => remove(p)} />
                          )}
                        </div>
                        <h3>{p.payload.title}</h3>
                        <p>{p.payload.description}</p>
                        <div className="metadata">
                          <span>{euro(p.payload.cost)} indicativi</span>
                          <span>{p.payload.beds} posti letto</span>
                        </div>
                        {p.payload.link && (
                          <a
                            href={p.payload.link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Vedi il posto
                          </a>
                        )}
                        <div className="card-footer">
                          <button
                            className={
                              votes(p.id).some((v) => v.owner === user)
                                ? "vote active"
                                : "vote"
                            }
                            disabled={busy}
                            onClick={() =>
                              action(async () => {
                                const v = votes(p.id).find(
                                  (v) => v.owner === user
                                );
                                v
                                  ? await deleteRow(v.id)
                                  : await saveRow(
                                      makeRow(user, "vote", { place: p.id })
                                    );
                              }, false)
                            }
                          >
                            <Heart size={17} />
                            {votes(p.id).length} voti
                          </button>
                          {admin && (
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                action(
                                  () =>
                                    saveRow(
                                      makeRow(
                                        user,
                                        "decision",
                                        { place: p.id },
                                        "00000000-0000-0000-0000-000000000001"
                                      )
                                    ),
                                  false
                                )
                              }
                            >
                              Scegli
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {section === "food" && (
                <>
                  <SectionTitle
                    title="Ognuno porta qualcosa"
                    action="Aggiungi"
                    onClick={() => open("food")}
                  />
                  <button
                    className="allergy-tip"
                    onClick={() => open("profile")}
                  >
                    <Utensils size={20} />
                    <span>
                      <strong>Prima di pensare al menu</strong>
                      <small>
                        Indica allergie e cosa non mangi nel tuo profilo.
                      </small>
                    </span>
                  </button>
                  {people.some(
                    (p) => p.payload.allergies || p.payload.avoid
                  ) && (
                    <div className="diet-list">
                      {people
                        .filter((p) => p.payload.allergies || p.payload.avoid)
                        .map((p) => (
                          <p key={p.id}>
                            <strong>{p.payload.name}</strong>
                            {p.payload.allergies && (
                              <span>
                                Allergie / intolleranze: {p.payload.allergies}
                              </span>
                            )}
                            {p.payload.avoid && (
                              <span>Non mangia: {p.payload.avoid}</span>
                            )}
                          </p>
                        ))}
                    </div>
                  )}
                  {!foods.length && (
                    <Empty
                      icon={<Utensils />}
                      title="La tavola è ancora da riempire"
                      text="Scrivi cosa porti, incluse bevande e ingredienti."
                      action="Aggiungi qualcosa"
                      onClick={() => open("food")}
                    />
                  )}
                  <div className="list">
                    {foods.map((f) => (
                      <article className="person-row" key={f.id}>
                        <span className="soft-icon">
                          <Utensils />
                        </span>
                        <div>
                          <small>{f.payload.category}</small>
                          <h3>{f.payload.title}</h3>
                          <p>
                            {name(f.owner)} ·{" "}
                            {f.payload.notes ||
                              "Nessuna nota sugli ingredienti"}
                          </p>
                        </div>
                        {f.owner === user && (
                          <Delete onClick={() => remove(f)} />
                        )}
                      </article>
                    ))}
                  </div>
                </>
              )}
              {section === "sleep" && (
                <>
                  <SectionTitle
                    title="Chi resta per la colazione?"
                    action="La mia scelta"
                    onClick={() => open("profile")}
                  />
                  <div className="sleep-summary">
                    <Moon size={32} />
                    <strong>
                      {sleeping.reduce((n, p) => n + 1 + p.payload.guests, 0)}
                    </strong>
                    <p>persone restano a dormire</p>
                    <small>
                      La scelta include gli accompagnatori indicati.
                    </small>
                  </div>
                  {chosen && (
                    <p className="muted">
                      Posti letto dichiarati:{" "}
                      {places.find((p) => p.id === chosen.payload.place)
                        ?.payload.beds || 0}
                    </p>
                  )}
                  <div className="list">
                    {sleeping.map((p) => (
                      <article className="person-row" key={p.id}>
                        <span className="person-avatar">
                          {p.payload.name.slice(0, 2)}
                        </span>
                        <div>
                          <h3>{p.payload.name}</h3>
                          <p>
                            {1 + p.payload.guests}{" "}
                            {p.payload.guests ? "persone" : "persona"}
                          </p>
                        </div>
                        <Moon size={18} />
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {tab === "money" && (
            <>
              <PageTitle
                eyebrow="CONTI CHIARI, SERATA LEGGERA"
                title="La cassa comune."
                text="Chi anticipa, chi versa. Tutto qui."
              />
              <section className="money-hero">
                <span>IL TUO SALDO</span>
                <h2>{euro(Math.abs(balance[user] || 0))}</h2>
                <p>
                  {(balance[user] || 0) < 0
                    ? "Da mettere"
                    : (balance[user] || 0) > 0
                    ? "Da ricevere"
                    : "Tutto in pari, per ora"}
                </p>
                <div>
                  <small>Spese del gruppo</small>
                  <strong>{euro(total)}</strong>
                </div>
              </section>
              <div className="button-pair">
                <button onClick={() => open("expense")}>
                  <Plus size={18} /> Aggiungi spesa
                </button>
                <button className="secondary" onClick={() => open("transfer")}>
                  Segna versamento
                </button>
              </div>
              <SectionTitle title="Spese sostenute" />
              {!expenses.length && (
                <Empty
                  icon={<Wallet />}
                  title="Si parte da zero"
                  text="Hai anticipato qualcosa? Registra la spesa e scegli con chi dividerla."
                />
              )}
              <div className="list">
                {expenses.map((e) => (
                  <article className="person-row" key={e.id}>
                    <span className="soft-icon">
                      <Wallet />
                    </span>
                    <div>
                      <h3>{e.payload.title}</h3>
                      <p>
                        {name(e.owner)} ha anticipato ·{" "}
                        {e.payload.people.length} quote
                      </p>
                      <small>{e.payload.people.map(name).join(", ")}</small>
                    </div>
                    <strong>{euro(e.payload.cents)}</strong>
                    {e.owner === user && <Delete onClick={() => remove(e)} />}
                  </article>
                ))}
              </div>
              <SectionTitle title="Come sistemare i conti" />
              <div className="list">
                {settlements(balance).map((s, i) => (
                  <div className="person-row" key={i}>
                    <div>
                      <h3>
                        {name(s.from)} paga {name(s.to)}
                      </h3>
                      <p>Saldo calcolato sui versamenti confermati</p>
                    </div>
                    <strong>{euro(s.cents)}</strong>
                  </div>
                ))}
              </div>
              <SectionTitle title="Versamenti" />
              <div className="list">
                {transfers.map((t) => (
                  <article className="person-row" key={t.id}>
                    <div>
                      <h3>
                        {name(t.payload.from)} a {name(t.payload.to)}
                      </h3>
                      <p>
                        {t.payload.confirmed
                          ? "Ricevuto e confermato"
                          : "In attesa di conferma"}
                      </p>
                    </div>
                    <strong>{euro(t.payload.cents)}</strong>
                    {!t.payload.confirmed &&
                      (admin || t.payload.to === user) && (
                        <button
                          className="icon-button"
                          title="Conferma ricezione"
                          disabled={busy}
                          onClick={() =>
                            action(
                              () =>
                                saveRow({
                                  ...t,
                                  payload: { ...t.payload, confirmed: true },
                                }),
                              false
                            )
                          }
                        >
                          <Check />
                        </button>
                      )}
                    {!t.payload.confirmed && t.owner === user && (
                      <Delete onClick={() => remove(t)} />
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === "memories" && (
            <>
              <PageTitle
                eyebrow="LE COSE BELLE RESTANO"
                title="C’eravamo noi."
                text="Foto mosse, brindisi e video da riguardare."
              />
              <SectionTitle
                title={`${media.length} ricordi condivisi`}
                action="Carica"
                onClick={() => open("media")}
              />
              {!media.length && (
                <Empty
                  icon={<Camera size={32} />}
                  title="Il primo ricordo deve ancora arrivare"
                  text="Qui raccoglieremo la nostra serata, un momento alla volta."
                  action="Carica un ricordo"
                  onClick={() => open("media")}
                />
              )}
              <div className="gallery">
                {media.map((m) => (
                  <figure key={m.id}>
                    {urls[m.id] ? (
                      m.payload.type.startsWith("video/") ? (
                        <video controls preload="metadata" src={urls[m.id]} />
                      ) : (
                        <a href={urls[m.id]} target="_blank" rel="noreferrer">
                          <img
                            loading="lazy"
                            src={urls[m.id]}
                            alt={
                              m.payload.caption || `Ricordo di ${name(m.owner)}`
                            }
                          />
                        </a>
                      )
                    ) : (
                      <div className="media-loading">Caricamento…</div>
                    )}
                    <figcaption>
                      <div>
                        <strong>
                          {m.payload.caption || "Una notte insieme"}
                        </strong>
                        <small>{name(m.owner)}</small>
                      </div>
                      {m.owner === user && <Delete onClick={() => remove(m)} />}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </main>
        <footer className="desktop-footer">
          CAPODANNO 2027 <span>Il bello è esserci.</span>
        </footer>
      </div>
      <div className="bottom-nav">
        <Navigation tab={tab} setTab={setTab} />
      </div>
      {modal && (
        <ModalPanel
          title={
            {
              profile: "Il tuo posto nel gruppo",
              place: "Un’idea per il posto",
              food: "Cosa porti di buono?",
              expense: "Hai anticipato qualcosa?",
              transfer: "Segna un versamento",
              media: "Un altro bel ricordo",
              settings: "Il nostro spazio",
            }[modal]
          }
          onClose={() => {
            if (!busy) setModal(null);
          }}
          busy={busy}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {modal === "settings" ? (
            <div className="settings">
              <p>
                {db
                  ? "Spazio privato del gruppo. L’accesso resta salvato su questo browser."
                  : "Sei nella demo locale. I dati non vengono condivisi e i caricamenti sono disabilitati."}
              </p>
              <p>
                Per recuperare l’accesso da un altro dispositivo, associa un
                indirizzo email al profilo. Non verrà mostrato agli altri.
              </p>
              {db ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const email = String(
                      new FormData(e.currentTarget).get("email")
                    ).trim();
                    await action(async () => {
                      const { error } = await db!.auth.updateUser(
                        { email },
                        { emailRedirectTo: location.origin + location.pathname }
                      );
                      if (error) throw error;
                      setNotice(
                        "Controlla la tua email e conferma il collegamento al profilo."
                      );
                    });
                  }}
                >
                  <Field label="Email di recupero">
                    <input type="email" name="email" required />
                  </Field>
                  <button disabled={busy}>Collega email</button>
                </form>
              ) : (
                <p>
                  Le istruzioni per attivare Supabase sono nel README della
                  repository.
                </p>
              )}
              {db && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const email = String(
                      new FormData(e.currentTarget).get("email")
                    );
                    await action(async () => {
                      const { error } = await db!.auth.signInWithOtp({
                        email,
                        options: {
                          shouldCreateUser: false,
                          emailRedirectTo: location.origin + location.pathname,
                        },
                      });
                      if (error) throw error;
                      setNotice(
                        "Link di accesso inviato. Aprilo per recuperare il profilo associato."
                      );
                    });
                  }}
                >
                  <Field label="Hai già collegato un’email?">
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="La tua email"
                    />
                  </Field>
                  <button className="secondary" disabled={busy}>
                    Invia link di accesso
                  </button>
                </form>
              )}
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      location.origin + location.pathname
                    );
                    setNotice(
                      "Link copiato. Per entrare serve anche il codice d’invito."
                    );
                    setModal(null);
                  } catch {
                    setError("Copia il link dalla barra degli indirizzi.");
                  }
                }}
              >
                <Copy size={16} /> Copia link dell’app
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              {modal === "profile" && (
                <>
                  <Field label="Il tuo nome">
                    <input
                      name="name"
                      required
                      maxLength={60}
                      defaultValue={profile?.payload.name}
                    />
                  </Field>
                  <Field label="Ci sarai?">
                    <select
                      name="status"
                      defaultValue={profile?.payload.status || "maybe"}
                    >
                      <option value="yes">Ci sono!</option>
                      <option value="maybe">Devo ancora decidere</option>
                      <option value="no">Non riesco a esserci</option>
                    </select>
                  </Field>
                  <Field label="Accompagnatori">
                    <input
                      type="number"
                      name="guests"
                      min="0"
                      max="10"
                      required
                      defaultValue={profile?.payload.guests || 0}
                    />
                  </Field>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      name="sleep"
                      defaultChecked={profile?.payload.sleep}
                    />{" "}
                    Mi fermo a dormire, con i miei accompagnatori
                  </label>
                  <Field label="Allergie e intolleranze">
                    <textarea
                      name="allergies"
                      maxLength={500}
                      defaultValue={profile?.payload.allergies}
                      placeholder="Es. frutta a guscio, lattosio…"
                    />
                  </Field>
                  <Field label="Cosa non mangi / preferenze">
                    <textarea
                      name="avoid"
                      maxLength={500}
                      defaultValue={profile?.payload.avoid}
                      placeholder="Es. vegetariano, niente funghi…"
                    />
                  </Field>
                  <p className="form-note">
                    Queste informazioni saranno visibili al gruppo per
                    organizzare il menu.
                  </p>
                </>
              )}
              {modal === "place" && (
                <>
                  <Field label="Nome del posto">
                    <input
                      name="title"
                      required
                      maxLength={100}
                      placeholder="Es. La casa in montagna"
                    />
                  </Field>
                  <Field label="Raccontaci l’idea">
                    <textarea
                      name="description"
                      required
                      maxLength={1000}
                      placeholder="Dove si trova, spazi, come arrivarci…"
                    />
                  </Field>
                  <div className="field-pair">
                    <Field label="Costo totale indicativo (€)">
                      <input
                        type="number"
                        name="cost"
                        min="0"
                        max="100000"
                        step="0.01"
                        required
                        defaultValue="0"
                      />
                    </Field>
                    <Field label="Posti letto">
                      <input
                        type="number"
                        name="beds"
                        min="0"
                        max="1000"
                        required
                        defaultValue="0"
                      />
                    </Field>
                  </div>
                  <Field label="Link (facoltativo)">
                    <input
                      name="link"
                      type="url"
                      maxLength={2000}
                      placeholder="https://…"
                    />
                  </Field>
                </>
              )}
              {modal === "food" && (
                <>
                  <Field label="Cosa porti?">
                    <input
                      name="title"
                      required
                      maxLength={100}
                      placeholder="Es. Lasagne per 8"
                    />
                  </Field>
                  <Field label="Categoria">
                    <select name="category">
                      <option>Cibo</option>
                      <option>Bevande</option>
                      <option>Dolci</option>
                      <option>Altro</option>
                    </select>
                  </Field>
                  <Field label="Quantità e ingredienti">
                    <textarea
                      name="notes"
                      maxLength={1000}
                      placeholder="Porzioni, allergeni, ingredienti…"
                    />
                  </Field>
                </>
              )}
              {modal === "expense" && (
                <>
                  <Field label="Per cosa hai pagato?">
                    <input
                      name="title"
                      required
                      maxLength={100}
                      placeholder="Es. Spesa per il cenone"
                    />
                  </Field>
                  <Field label="Quanto hai anticipato (€)">
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      max="100000"
                      step="0.01"
                      required
                    />
                  </Field>
                  <fieldset>
                    <legend>Dividi con</legend>
                    <p className="form-note">
                      Una quota per profilo. Includi solo chi partecipa a questa
                      spesa.
                    </p>
                    {people.map((p) => (
                      <label className="check-row" key={p.id}>
                        <input
                          name="people"
                          type="checkbox"
                          value={p.owner}
                          defaultChecked={p.payload.status === "yes"}
                        />
                        {p.payload.name}
                        {p.payload.sleep ? " · dorme" : ""}
                      </label>
                    ))}
                  </fieldset>
                  <p className="form-note">
                    La spesa verrà registrata come anticipata da te.
                  </p>
                </>
              )}
              {modal === "transfer" && (
                <>
                  <Field label="A chi hai dato i soldi?">
                    <select name="to" required defaultValue="">
                      <option value="" disabled>
                        Scegli una persona
                      </option>
                      {people
                        .filter((p) => p.owner !== user)
                        .map((p) => (
                          <option key={p.id} value={p.owner}>
                            {p.payload.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Importo (€)">
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      max="100000"
                      step="0.01"
                      required
                    />
                  </Field>
                  <p className="form-note">
                    Il saldo si aggiorna quando il destinatario o
                    l’organizzatore conferma il versamento.
                  </p>
                </>
              )}
              {modal === "media" && (
                <>
                  <Field label="Foto o video">
                    <input
                      name="file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                      required
                      disabled={!db}
                    />
                  </Field>
                  <p className="form-note">
                    Foto fino a 5 MB, video fino a 20 MB. Visibili solo al
                    gruppo.{" "}
                    {!db && "Collega Supabase per attivare i caricamenti."}
                  </p>
                  <Field label="Una didascalia (facoltativa)">
                    <input
                      name="caption"
                      maxLength={200}
                      placeholder="Es. Il primo brindisi"
                    />
                  </Field>
                </>
              )}
              <button
                className="submit"
                disabled={busy || (modal === "media" && !db)}
              >
                {busy
                  ? "Salvataggio…"
                  : modal === "profile"
                  ? "Salva il mio profilo"
                  : modal === "media"
                  ? "Carica ricordo"
                  : "Salva"}
                <Check size={18} />
              </button>
            </form>
          )}
        </ModalPanel>
      )}
    </div>
  );
}
function Recovery() {
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  if (!db) return null;
  return (
    <details className="recovery">
      <summary>Hai già un profilo? Recupera l’accesso</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSending(true);
          setStatus("");
          const email = String(new FormData(event.currentTarget).get("email"));
          try {
            const { error } = await db!.auth.signInWithOtp({
              email,
              options: {
                shouldCreateUser: false,
                emailRedirectTo: location.origin + location.pathname,
              },
            });
            if (error) throw error;
            setStatus(
              "Se l’email è associata al tuo profilo, riceverai un link per entrare."
            );
          } catch (error) {
            setStatus(
              error instanceof Error
                ? error.message
                : "Invio non riuscito. Riprova."
            );
          } finally {
            setSending(false);
          }
        }}
      >
        <Field label="Email già collegata al profilo">
          <input type="email" name="email" required autoComplete="email" />
        </Field>
        <button className="secondary" disabled={sending}>
          Invia link di accesso
        </button>
        <p role="status">{status}</p>
      </form>
    </details>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span className="logo-symbol">
        <Sparkles size={19} />
      </span>
      mezzanotte<span className="accent">.</span>
    </div>
  );
}
function Navigation({
  tab,
  setTab,
}: {
  tab: string;
  setTab: (t: string) => void;
}) {
  return (
    <nav aria-label="Navigazione principale">
      {[
        ["home", "Home", Home],
        ["organize", "Organizza", LayoutGrid],
        ["money", "Spese", Wallet],
        ["memories", "Ricordi", Images],
      ].map(([key, label, Icon]: any) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className={tab === key ? "active" : ""}
          aria-current={tab === key ? "page" : undefined}
        >
          <Icon size={21} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function PageTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
function SectionTitle({
  title,
  action,
  onClick,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action && (
        <button className="text-button" onClick={onClick}>
          <Plus size={16} />
          {action}
        </button>
      )}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="secondary" onClick={onClick}>
          {action}
        </button>
      )}
    </div>
  );
}
function Delete({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="icon-button delete"
      onClick={onClick}
      aria-label="Elimina elemento"
    >
      <Trash2 size={17} />
    </button>
  );
}
function ModalPanel({
  title,
  onClose,
  children,
  busy,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  busy: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const panel = ref.current!;
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select,textarea,a[href]"
        )
      );
    focusable()[0]?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) onClose();
      if (e.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Chiudi"
          >
            <X />
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
