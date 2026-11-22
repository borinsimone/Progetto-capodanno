# Mezzanotte · Capodanno 2027

Webapp mobile per il 31 dicembre 2026: React 19, TypeScript, Vite e Supabase. Quattro sezioni: Home, Organizza, Spese, Ricordi. Navigazione fissa; il contenuto scorre solo quando serve. Moduli a schermo intero su telefono, focus confinato e ritorno al controllo precedente.

## Avvio

Node 22+: `npm ci`, poi `npm run dev`. Verifiche: `npm test` e `npm run build`.

Senza variabili ambiente parte una **demo locale**, inizialmente vuota. I dati restano in localStorage in questo browser; foto/video richiedono Supabase. La demo non simula condivisione o un database attivo. Per azzerarla elimina le chiavi `mezzanotte-demo-v2` e `mezzanotte-demo-v2-user` dai dati del sito. I dati demo non vengono importati nel database.

## Supabase gratuito

1. Crea un **nuovo progetto** Supabase. Lo schema è una nuova implementazione: non riutilizzare lo schema precedente della repository.
2. In `supabase/schema.sql`, sostituisci `CAMBIA-QUESTO-CODICE-PRIVATO` con un invito lungo e casuale. Esegui lo script nel SQL Editor. Non committare il codice reale. Il database conserva solo l'hash.
3. Abilita Anonymous Sign-ins in Authentication. Imposta Site URL e Redirect URLs all'URL GitHub Pages e, per lo sviluppo, a `http://localhost:5173`.
4. Copia `.env.example` in `.env.local` e imposta URL e publishable key. **Mai service_role o secret key nel frontend.**
5. Entra con l'invito e crea il profilo dell'organizzatore. Recupera il suo UUID in Authentication > Users e promuovilo con la query indicata in fondo allo schema. Nessun partecipante diventa amministratore automaticamente.
6. In GitHub Settings > Secrets and variables > Actions > Variables imposta `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Il workflow compila e pubblica su GitHub Pages. Imposta Pages > Source su GitHub Actions se necessario.

La chiave pubblica nel client è prevista: le policy RLS proteggono dati e file. Tutti i membri invitati possono leggere le informazioni del gruppo, comprese allergie e preferenze. Ogni persona modifica i propri elementi. L'organizzatore sceglie il posto e può confermare i versamenti; il destinatario può confermare quelli ricevuti. Un versamento confermato non può essere modificato o cancellato dall'app.

## Identità

Il primo ingresso crea un utente anonimo Supabase, persistente sul browser. Il codice d'invito è necessario per accedere ai dati. Per recuperare il profilo dopo cambio dispositivo o cancellazione dei dati del browser, **prima** collega e conferma un'email in Impostazioni. Dal nuovo dispositivo usa “Invia link di accesso” con la stessa email. Il solo nome non recupera un profilo. Non esistono link personali che espongano token nella URL condivisa.

Per uso privato tra amici: non pubblicare il codice invito, abilita le protezioni antiabuso/CAPTCHA e i limiti Auth disponibili nella dashboard Supabase prima di diffondere ampiamente il link. L'accesso email dipende dalle impostazioni SMTP e dai limiti di invio del progetto.

## Funzioni e regole

- Presenze sì/forse/no, accompagnatori 0–10, allergie e preferenze. Il pernottamento include gli accompagnatori del profilo e conta solo i confermati.
- Proposte con descrizione, link, costo indicativo, posti letto; un voto rimovibile per persona per posto; scelta definitiva dell'organizzatore. Cancellando una proposta si eliminano voti e scelta collegati.
- Cibo/bevande/dolci: ciascuno indica cosa porta e ingredienti. Allergie visibili nel riepilogo.
- Spese: l'autore è chi ha anticipato. Divisione uguale tra i profili selezionati, con distribuzione stabile dei centesimi residui. **Gli accompagnatori non generano quote separate**: il loro referente può tenerne conto nell'importo e nella divisione concordata. Per spese notturne seleziona solo chi dorme.
- Saldo = anticipi meno quote più versamenti inviati confermati meno versamenti ricevuti confermati. Positivo = da ricevere; negativo = da mettere. Suggerimenti di rimborso derivati dai saldi; non vengono eseguiti pagamenti reali.
- Album privato: foto fino a 5 MB e video fino a 20 MB per file; link firmati temporanei, niente file multimediali nel database. Formati ammessi nello schema. Le foto JPEG, PNG e WebP fino a 20 MB in ingresso vengono ridimensionate a un massimo di 1920 px e compresse in WebP prima del caricamento (massimo 5 MB in uscita). Le GIF restano originali, fino a 5 MB. Monitora lo spazio in Supabase. La riproduzione dipende dai codec supportati dal browser. Le URL vengono rinnovate con il caricamento periodico dei dati.
- Aggiornamento dati ogni 20 secondi e al ritorno sulla finestra. Non scrive dati di esempio nel gruppo.

## Verifica manuale prima dell'uso

Con due browser distinti: verifica rifiuto dell'invito errato, isolamento dei profili, voto unico, ripartizione di 1 € in tre quote, versamento non confermabile dal solo mittente, conferma da destinatario, foto leggibile da membri e non da visitatori esterni. Prova collegamento email e recupero da secondo browser. Questi test richiedono un progetto Supabase configurato e non sono sostituiti dai test locali di dominio.

Il piano Free ha limiti di database, storage, traffico e possibile pausa per inattività: controlla il [listino Supabase](https://supabase.com/pricing). Nessuna credenziale Supabase è inclusa. Pagamenti, chat e quote personalizzate per accompagnatore restano fuori da questa versione.
