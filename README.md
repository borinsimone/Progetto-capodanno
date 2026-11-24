# Capodanno 2027

Webapp mobile per il 31 dicembre 2026: React 19, TypeScript, Vite e Supabase. Tre sezioni: Home, Organizza, Spese. Navigazione fissa; il contenuto scorre solo quando serve. Moduli a schermo intero su telefono, focus confinato e ritorno al controllo precedente.

## Avvio

Node 22+: `npm ci`, poi `npm run dev`. Verifiche: `npm test` e `npm run build`.

Senza variabili ambiente parte una **demo locale**, inizialmente vuota. I dati restano in localStorage in questo browser; i dati vengono condivisi solo dopo il collegamento a Supabase. La demo non simula condivisione o un database attivo. Per azzerarla elimina le chiavi `mezzanotte-demo-v2` e `mezzanotte-demo-v2-user` dai dati del sito. I dati demo non vengono importati nel database.

## Supabase gratuito

1. Crea un **nuovo progetto** Supabase. Lo schema è una nuova implementazione: non riutilizzare lo schema precedente della repository.
2. In `supabase/schema.sql`, sostituisci `CAMBIA-QUESTO-CODICE-PRIVATO` con un invito lungo e casuale. Esegui lo script nel SQL Editor. Non committare il codice reale. Il database conserva solo l'hash.
3. Abilita Email in Authentication, mantieni Confirm email attivo e Anonymous Sign-ins disattivato. Imposta Site URL e Redirect URLs all'URL GitHub Pages e, per lo sviluppo, a `http://localhost:5173`.
4. Copia `.env.example` in `.env` e imposta URL e publishable key. `.env` e tutte le varianti `.env.*` sono escluse da Git; il solo `.env.example` viene versionato, con valori vuoti. **Mai service_role o secret key nel frontend.** I valori `VITE_` vengono incorporati nel JavaScript del browser: la publishable key è pubblica per definizione; i segreti amministrativi e il codice d'invito non devono avere quel prefisso.
5. Entra con l'invito e crea il profilo dell'organizzatore. Recupera il suo UUID in Authentication > Users e promuovilo con la query indicata in fondo allo schema. Nessun partecipante diventa amministratore automaticamente.
6. In GitHub Settings > Secrets and variables > Actions > Secrets imposta `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Il workflow legge questi valori dai GitHub Secrets, senza committare il file `.env`. Non aggiungere codice d'invito o chiavi amministrative al workflow di build. Il workflow compila e pubblica su GitHub Pages. Imposta Pages > Source su GitHub Actions se necessario.

### Vincolo di costo

Usare esclusivamente un progetto in un'organizzazione con piano **Free**. Prima di creare o collegare il progetto, verificare il piano effettivo nell'account: il nome del progetto non garantisce che sia gratuito. Non attivare upgrade, add-on o branch a pagamento. Database e storage devono restare entro i limiti Free; se lo spazio per i media finisce, fermare i caricamenti anziché attivare un piano a pagamento. La configurazione locale non crea risorse Supabase e non modifica il piano dell'account.

La chiave pubblica nel client è prevista: le policy RLS proteggono dati e file. Tutti i membri invitati possono leggere le informazioni del gruppo, comprese allergie e preferenze. Ogni persona modifica i propri elementi. L'organizzatore sceglie il posto e può confermare i versamenti; il destinatario può confermare quelli ricevuti. Un versamento confermato non può essere modificato o cancellato dall'app.

## Identità

L'accesso avviene con email e codice OTP generato e verificato da Supabase. L'app non crea utenti anonimi e non gestisce password. Il profilo si recupera entrando con la stessa email da un altro dispositivo. L'email resta in Supabase Auth e non viene salvata nei record condivisi. Accedere non conferma la presenza: il profilo nasce con stato “forse”. Il codice d'invito è richiesto prima di leggere o scrivere i dati del gruppo.

Il browser conserva la sessione personale; “Esci da questo dispositivo” la rimuove. Su dispositivi condivisi è necessario uscire. I membri autorizzati vedono le informazioni condivise con il gruppo, comprese allergie e preferenze. RLS non impedisce a un membro di copiare ciò che è autorizzato a leggere.

### EmailJS per i codici di accesso

La funzione `supabase/functions/send-auth-email` verifica la firma webhook e il timestamp Supabase prima di inviare codici via EmailJS. Non registra email, codici o risposte del provider nei log. Le chiavi EmailJS non entrano nel frontend. Le impostazioni degli inviti e i ruoli si trovano nello schema `private`, non esposto dalla Data API.

1. Nell'account EmailJS Free crea un template con **To Email** `{{to_email}}`, **Subject** “Il tuo codice di accesso a Capodanno” e corpo contenente `{{otp_code}}`. Cc, Bcc e Auto-Reply devono restare vuoti/disabilitati. Il piano Free ha 200 richieste mensili condivise con gli altri utilizzi dell'account; l'app non attiva upgrade.
2. In EmailJS Account > Security abilita le chiamate API da applicazioni non-browser. Se richiedi una private key per queste chiamate, usala esclusivamente lato server.
3. Salva in `.env`: `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, l'eventuale `EMAILJS_PRIVATE_KEY` e `SEND_EMAIL_HOOK_SECRET`. Nessuno di questi valori deve avere prefisso VITE\_. Il segreto webhook deve essere casuale e distinto dal codice d'invito.
4. Copia questi cinque valori nelle **Edge Function Secrets** di Supabase. Il plugin corrente distribuisce le funzioni ma non gestisce secrets o configurazione Auth: usa la dashboard autenticata o la CLI autenticata. Non committare file con valori reali.
5. In Authentication > Hooks aggiungi **Send Email** di tipo HTTPS, URL `https://<PROJECT_REF>.supabase.co/functions/v1/send-auth-email`, usando lo stesso `SEND_EMAIL_HOOK_SECRET` per la firma. La funzione verifica la firma del webhook anziché un JWT utente. Mantieni Email Provider e Confirm email attivi.
6. Imposta la durata OTP a 600 secondi nelle impostazioni Email. Mantieni i limiti di invio. Il frontend limita il reinvio per 60 secondi; i limiti effettivi sono applicati da Supabase ed EmailJS. Valuta CAPTCHA prima di distribuire ampiamente il link.
7. Verifica un invio reale, codice errato, codice corretto, uscita e accesso da un altro browser. Finché secrets e hook non sono configurati, **l'invio agli amici non è attivo**: l'email predefinita di Supabase è solo per test verso membri dell'organizzazione.

Senza secrets la funzione rifiuta l'invio con 503. Non collegare l'Auth Hook finché i secrets non sono configurati. Il flusso supporta signup e magiclink/OTP; Google e cambio email non sono attivati.

## Funzioni e regole

- Presenze sì/forse/no, accompagnatori 0–10, allergie e preferenze. Il pernottamento include gli accompagnatori del profilo e conta solo i confermati.
- Proposte con descrizione, link, costo indicativo, posti letto; un voto rimovibile per persona per posto; scelta definitiva dell'organizzatore. Cancellando una proposta si eliminano voti e scelta collegati.
- Cibo/bevande/dolci: ciascuno indica cosa porta e ingredienti. Allergie visibili nel riepilogo.
- Spese: l'autore è chi ha anticipato. Divisione uguale tra i profili selezionati, con distribuzione stabile dei centesimi residui. **Gli accompagnatori non generano quote separate**: il loro referente può tenerne conto nell'importo e nella divisione concordata. Per spese notturne seleziona solo chi dorme.
- Saldo = anticipi meno quote più versamenti inviati confermati meno versamenti ricevuti confermati. Positivo = da ricevere; negativo = da mettere. Suggerimenti di rimborso derivati dai saldi; non vengono eseguiti pagamenti reali.
- Aggiornamento dati ogni 20 secondi e al ritorno sulla finestra. Non scrive dati di esempio nel gruppo.

## Verifica manuale prima dell'uso

Con due browser distinti: verifica rifiuto dell'invito errato, isolamento dei profili, voto unico, ripartizione di 1 € in tre quote, versamento non confermabile dal solo mittente, conferma da destinatario, accesso ai dati negato ai visitatori esterni. Prova email + OTP e recupero del profilo da secondo browser. Questi test richiedono un progetto Supabase configurato e non sono sostituiti dai test locali di dominio.

Il piano Free ha limiti di database, storage, traffico e possibile pausa per inattività: controlla il [listino Supabase](https://supabase.com/pricing). Nessuna credenziale Supabase è inclusa. Pagamenti, chat e quote personalizzate per accompagnatore restano fuori da questa versione.

La sezione foto/video e i caricamenti sono stati rimossi dall’app. Le strutture storage esistenti sono conservate per non cancellare eventuali file storici. Nessun dato remoto viene eliminato da questa modifica.
