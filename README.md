# Agon
Agon — quiz live in classe con WebSocket (Node.js, Express, ws). Progetto TPSIT 5A INFO.

Il docente scrive le domande (a risposta multipla o vero/falso) e guida la partita; gli studenti entrano con il proprio nome e rispondono dal telefono. Più si risponde in fretta, più punti si prendono.

## Avvio

```bash
npm install
npm start
```

- Docente: `http://localhost:3000/docente` (la prima volta: registrati da `/login`)
- Studenti: l'indirizzo che compare sulla pagina del docente (es. `http://192.168.1.20:3000`), sulla stessa rete Wi-Fi.

## Struttura

| File | Cosa fa |
|---|---|
| `server.js` | File principale: Express, middleware, rotte, avvio del WebSocket |
| `rotte/domande.js` | API REST delle domande (Express Router), riservata ai docenti |
| `rotte/utenti.js` | Registrazione, login e logout dei docenti |
| `moduli/utenti.js` | Docenti in `docenti.json`, token di accesso, middleware `richiediLogin` |
| `moduli/archivio.js` | Legge e scrive `domande.json` (modulo `fs`) |
| `moduli/partita.js` | Stato della partita, punteggi, classifica |
| `moduli/websocket.js` | Server WebSocket con il modulo `ws` |
| `public/index.html` | Pagina dello studente |
| `public/login.html` | Accesso e registrazione del docente |
| `public/docente.html` | Pagina del docente |
| `public/style.css` | Stile |

Nei commenti del codice le etichette `[NODE]`, `[EXPRESS]`, `[WS]` e `[JS]` segnalano le conoscenze usate; l'elenco completo è in cima a `server.js`.

## Docenti

I docenti si registrano e accedono da `/login`. Sono salvati in `docenti.json` **in chiaro** (progetto didattico):

```json
{ "utente": "rossi", "password": "1234", "registrato": "2026-11-19T09:52:37.277Z", "accessi": ["2026-11-19T09:52:37.306Z"] }
```

`accessi` registra data e ora di ogni login. Dopo il login il server restituisce un **token** (stringa casuale creata con `crypto.randomUUID()`) che il browser conserva e rimanda:

- nelle richieste HTTP, nell'intestazione `Authorization` → il middleware `richiediLogin` risponde 401 se manca o non è valido;
- nel WebSocket, nel messaggio `{ type: 'docente', token }` → altrimenti il server risponde `non-autorizzato`.

I token stanno in memoria: dopo un riavvio del server il docente deve rifare il login.

| Metodo | Rotta | Cosa fa |
|---|---|---|
| POST | `/utenti/registrazione` | `{ utente, password }`; 400 se mancano o il nome è già usato |
| POST | `/utenti/login` | `{ utente, password }` → `{ utente, token }`; 401 se sbagliati |
| POST | `/utenti/logout` | cancella il token |

## Domande

Stessa forma per i due tipi; il vero/falso è una domanda con le risposte `["Vero", "Falso"]`.

```json
{ "id": 1, "tipo": "multipla", "testo": "…", "risposte": ["A", "B", "C", "D"], "corretta": 2 }
{ "id": 2, "tipo": "vf",       "testo": "…", "risposte": ["Vero", "Falso"],   "corretta": 0 }
```

Tutte le rotte richiedono il login (le domande contengono le risposte giuste).

| Metodo | Rotta | Cosa fa |
|---|---|---|
| GET | `/domande` | elenco |
| POST | `/domande` | aggiunge (JSON nel corpo); 400 se i dati non vanno bene |
| DELETE | `/domande/:id` | elimina; 404 se non esiste |

## Partita (WebSocket)

Fasi: `attesa` → `domanda` → `risultato` → … → `fine`. Ogni domanda dura 20 secondi e si chiude prima se hanno risposto tutti o se il docente la chiude.

Tutti i messaggi sono JSON con un campo `type`.

| Da → a | `type` | Campi |
|---|---|---|
| docente → server | `docente` | `token` |
| docente → server | `avanti` | — avvia, chiude la domanda o passa alla successiva |
| docente → server | `ricomincia` | — |
| studente → server | `entra` | `nome` |
| studente → server | `risposta` | `scelta` |
| server → studente | `entrato` / `errore` | `nome` / `testo` |
| server → docente | `non-autorizzato` | — token mancante o scaduto |
| server → tutti | `giocatori` | `giocatori` |
| server → tutti | `attesa` | — |
| server → tutti | `domanda` | `numero`, `totale`, `tipo`, `testo`, `risposte`, `tempo` (senza la risposta giusta) |
| server → tutti | `risposte` | `date`, `totale` |
| server → tutti | `risultato` | `corretta`, `ultima`, `classifica` |
| server → tutti | `fine` | `classifica` |

**Punteggio:** risposta giusta = 100 punti + 10 per ogni secondo rimasto; sbagliata o nessuna risposta = 0.
