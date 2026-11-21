# Capodanno insieme · 2027

Web app React + TypeScript + Vite per organizzare il Capodanno del 31 dicembre 2026. Responsive, in italiano, pronta per Supabase.

## Funzioni

- Ingresso con il nome, identità anonima Supabase persistente nel browser.
- Presenza sì / forse / no, fino a 10 accompagnatori, note e modifica del proprio nome.
- Proposte di località con descrizione, budget indicativo e link.
- Bacheca idee per categoria; voti rimovibili, un voto per persona e proposta.
- Eliminazione delle proprie proposte, con conferma e cancellazione dei voti collegati.
- Filtri presenze e ordinamento proposte per data o voti.
- Dashboard con conteggio delle persone confermate, accompagnatori inclusi, e countdown.
- Album e foto profilo predisposti: iniziali, sezione dedicata, tabella e bucket privato. Caricamento intenzionalmente rinviato.

## Avvio

Richiede Node.js 22 o successivo.

```sh
npm install
npm run dev
```

Senza variabili Supabase si avvia la **demo locale**, senza partecipanti inventati. I dati sono salvati in localStorage, non vengono condivisi. Il banner distingue sempre demo e modalità database. Per ripartire nella demo, eliminare le chiavi `capodanno-2027-demo-v1` e `capodanno-2027-demo-user` dai dati del sito.

```sh
npm test
npm run build
npm run preview
```

## Attivare il database gratuito

1. Crea un progetto **Free** su [Supabase](https://supabase.com). Il piano attuale include PostgreSQL, autenticazione anonima e storage; limiti e sospensione per inattività sono descritti nel [listino](https://supabase.com/pricing).
2. Esegui `supabase/schema.sql` una sola volta nel SQL Editor di un progetto nuovo. Crea tabelle, vincoli, indici, Row Level Security e bucket foto privato.
3. In Authentication > Sign In / Providers abilita **Anonymous Sign-ins** (la posizione esatta può cambiare nella dashboard).
4. Copia `.env.example` in `.env.local` e inserisci URL progetto e **publishable key** (o legacy anon key) da Project Settings > API Keys. Non usare mai `service_role` o secret key nel frontend.
5. Riavvia il server Vite. In produzione imposta le stesse variabili nell'hosting e ricostruisci l'app.
6. Verifica con due browser separati: ingresso, aggiornamento presenza, proposta e voto. I dati vengono riletti ogni 20 secondi e al ritorno sulla scheda.

Il database non viene creato automaticamente e nessuna credenziale reale è inclusa. I dati demo non sono migrati nel database quando lo si attiva.

## Identità e accesso

Il solo nome non è una password: viene creato un utente anonimo distinto con sessione persistente. Dopo aver cancellato i dati del browser o cambiato dispositivo non è possibile recuperare quella identità; lo stesso nome può essere usato da più persone. Per recupero e accesso da più dispositivi, aggiungere in seguito email OTP o OAuth e collegare l'identità anonima. Non viene mostrato un logout che farebbe perdere involontariamente il profilo.

Questo MVP gestisce **un unico evento**, accessibile a chi può aprire la pagina e registrare un nome. Non è un sistema a inviti: tutti gli utenti autenticati del progetto possono leggere l'evento e inserire proposte; possono modificare soltanto i propri dati e voti tramite RLS. Per un gruppo riservato aggiungere inviti e membership prima di distribuire il link. Valutare CAPTCHA e limiti anti abuso quando si apre l'app a un pubblico ampio; la protezione CAPTCHA richiede anche l'integrazione del token nel form prima di abilitarla.

## Foto, fase successiva

`profiles.avatar_path`, `photos` e il bucket **privato** `event-photos` sono predisposti. Non esistono policy di upload o pulsanti di caricamento attivi. In seguito: percorsi per utente, policy proprietario, validazione immagini, URL firmati, compressione e galleria. Il nome del file non deve diventare un URL pubblico implicito.

## Pubblicazione

GitHub Actions pubblica automaticamente ogni push su `main` tramite `.github/workflows/deploy-pages.yml`: installazione con lockfile, test, build e deploy su GitHub Pages. È disponibile anche l'avvio manuale da Actions. In Settings > Pages la sorgente deve essere **GitHub Actions**.

URL: https://borinsimone.github.io/Protratto-capodanno/

Senza variabili viene pubblicata la demo locale. Per attivare Supabase aggiungere `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` in Settings > Secrets and variables > Actions > Variables, poi rieseguire il workflow. Questi sono parametri pubblici del frontend: mai inserire chiavi secret o service_role. La condivisione dei dati si attiva solo dopo la configurazione del database.

È possibile usare anche Vercel, Netlify o altro hosting statico: comando `npm run build`, cartella `dist`. Non è necessario un server Node in produzione. I font Google richiedono rete; in assenza di rete restano i font di sistema.

## Fuori dal primo rilascio

Album attivo, recupero identità, inviti, chat, pagamenti/raccolta quote, amministrazione, gestione di più eventi e decisione automatica della località vincente.
