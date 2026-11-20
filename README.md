# Agon
Agon — quiz live in classe con WebSocket (Node.js, Express, ws). Progetto TPSIT 5A INFO.

I docenti creano i loro quiz (domande a risposta multipla o vero/falso) e li avviano quando vogliono: ogni quiz avviato diventa una partita con un **PIN di 6 cifre**. Gli studenti entrano dal telefono con PIN e nome. Più docenti possono avere una partita aperta nello stesso momento. Più si risponde in fretta, più punti si prendono.

## Avvio

```bash
npm install
npm start
```

- Docente: `http://localhost:3000/docente` (la prima volta: registrati da `/login`)
- Studenti: l'indirizzo che compare sulla pagina della partita (es. `http://192.168.1.20:3000`), sulla stessa rete Wi-Fi, più il PIN. Funziona anche `http://…:3000/?pin=482913`, con il PIN già scritto.

## Struttura

| File | Cosa fa |
|---|---|
| `server.js` | File principale: Express, middleware, rotte, avvio del WebSocket |
| `rotte/quiz.js` | API REST dei quiz (Express Router), riservata ai docenti |
| `rotte/utenti.js` | Registrazione, login e logout dei docenti |
| `moduli/archivio.js` | Legge e scrive `quiz.json` (modulo `fs`) e controlla i dati |
| `moduli/utenti.js` | Docenti in `docenti.json`, token di accesso, middleware `richiediLogin` |
| `moduli/partita.js` | Le partite in corso, ognuna con il suo PIN: fasi, punteggi, classifica |
| `moduli/websocket.js` | Server WebSocket con il modulo `ws` |
| `public/index.html` | Studente: PIN e nome, poi la partita |
| `public/login.html` | Accesso e registrazione del docente |
| `public/docente.html` | Docente: i quiz (i propri e quelli degli altri) |
| `public/editor.html` | Docente: crea o modifica un quiz |
| `public/conduci.html` | Docente: la partita da proiettare, con il PIN |
| `public/sessione.js` | Login condiviso dalle tre pagine del docente |
| `public/effetti.js` | Animazioni condivise: coriandoli, classifica, podio |
| `public/style.css` | Design system: token, componenti, impaginazione, movimento |

Nei commenti del codice le etichette `[NODE]`, `[EXPRESS]`, `[WS]` e `[JS]` segnalano le conoscenze usate; l'elenco completo è in cima a `server.js`.

## Docenti

I docenti si registrano e accedono da `/login`. Sono salvati in `docenti.json` **in chiaro** (progetto didattico):

```json
{ "utente": "rossi", "password": "1234", "registrato": "2026-11-19T09:52:37.277Z", "accessi": ["2026-11-19T09:52:37.306Z"] }
```

Proprio perché contiene le password, `docenti.json` **non è su Git** (è nel `.gitignore`): il server lo crea vuoto al primo avvio.

`accessi` registra data e ora di ogni login. Dopo il login il server restituisce un **token** (stringa casuale creata con `crypto.randomUUID()`) che il browser conserva e rimanda:

- nelle richieste HTTP, nell'intestazione `Authorization` → il middleware `richiediLogin` risponde 401 se manca o non è valido;
- nel WebSocket, nel messaggio `{ type: 'crea', token, quiz }` → altrimenti il server risponde `non-autorizzato`.

I token stanno in memoria: dopo un riavvio del server il docente deve rifare il login.

| Metodo | Rotta | Cosa fa |
|---|---|---|
| POST | `/utenti/registrazione` | `{ utente, password }`; 400 se mancano o il nome è già usato |
| POST | `/utenti/login` | `{ utente, password }` → `{ utente, token }`; 401 se sbagliati |
| POST | `/utenti/logout` | cancella il token |

## Quiz

Salvati in `quiz.json`. Ogni docente vede e può avviare **tutti** i quiz, ma modifica ed elimina solo i suoi.

```json
{
  "id": 1, "nome": "WebSocket e Node.js", "autore": "rossi", "tempo": 20, "creato": "…",
  "domande": [
    { "tipo": "multipla", "testo": "…", "risposte": ["A", "B", "C", "D"], "corretta": 2 },
    { "tipo": "vf",       "testo": "…", "risposte": ["Vero", "Falso"],   "corretta": 0 }
  ]
}
```

`tempo` sono i secondi per ogni domanda: 10, 20 o 30. Il vero/falso è una domanda con le risposte `["Vero", "Falso"]`, così il resto del programma tratta i due tipi nello stesso modo.

Tutte le rotte richiedono il login (i quiz contengono le risposte giuste).

| Metodo | Rotta | Cosa fa |
|---|---|---|
| GET | `/quiz` | elenco, senza domande: `id`, `nome`, `autore`, `tempo`, `numeroDomande`, `mio` |
| GET | `/quiz/:id` | un quiz completo; 404 se non esiste |
| POST | `/quiz` | crea `{ nome, tempo, domande }`; 400 se i dati non vanno bene |
| PUT | `/quiz/:id` | modifica; 403 se non è tuo, 404 se non esiste, 400 se i dati non vanno bene |
| DELETE | `/quiz/:id` | elimina; 403 se non è tuo, 404 se non esiste |

## Partite (WebSocket)

Quando un docente apre `/conduci?quiz=ID`, la pagina chiede al server di creare una partita. Il server sceglie un PIN libero e da quel momento ogni socket ricorda in `ws.pin` la partita in cui si trova: il broadcast manda i messaggi solo ai client con lo stesso PIN. Se il docente chiude o ricarica la pagina la partita finisce e gli studenti ricevono `chiusa`.

Fasi di ogni partita: `attesa` → `domanda` → `risultato` → … → `fine`. Ogni domanda dura il `tempo` del quiz e si chiude prima se hanno risposto tutti o se il docente la chiude.

Tutti i messaggi sono JSON con un campo `type`.

| Da → a | `type` | Campi |
|---|---|---|
| docente → server | `crea` | `token`, `quiz` (id) |
| docente → server | `avanti` | — avvia, chiude la domanda o passa alla successiva |
| docente → server | `ricomincia` | — |
| studente → server | `entra` | `pin`, `nome` |
| studente → server | `risposta` | `scelta` |
| server → docente | `creata` | `pin`, `nome`, `domande` |
| server → docente | `non-autorizzato` | — token mancante o scaduto |
| server → studente | `entrato` / `errore` | `nome`, `quiz` / `testo` |
| server → partita | `giocatori` | `giocatori` |
| server → partita | `attesa` | — |
| server → partita | `domanda` | `numero`, `totale`, `tipo`, `testo`, `risposte`, `tempo` (senza la risposta giusta) |
| server → partita | `risposte` | `date`, `totale` |
| server → partita | `risultato` | `corretta`, `ultima`, `classifica` |
| server → partita | `fine` | `classifica` |
| server → partita | `chiusa` | — il docente ha chiuso la partita |

**Punteggio:** risposta giusta = 100 punti + 10 per ogni secondo rimasto; sbagliata o nessuna risposta = 0.
