# agon
Agon — quiz live in classe con WebSocket (Node.js, Express, ws). Progetto TPSIT 5A INFO.

Il docente proietta le domande, gli studenti rispondono dal telefono. Più si risponde in fretta, più punti si prendono.

## Avvio

```bash
npm install
npm start
```

- Docente: `http://localhost:3000/host`
- Studenti: l'indirizzo che compare sulla pagina del docente (es. `http://192.168.1.20:3000`), sulla stessa rete Wi-Fi.

## Come funziona

Stessa struttura degli esempi `ws_socket_00..07`: Express serve le pagine, `ws` gira sullo stesso server HTTP, tutti i messaggi sono oggetti JSON con un campo `tipo`.

| File | Cosa fa |
|---|---|
| `server.js` | Stato della partita, punteggi, invio dello stato a tutti |
| `domande.json` | Le domande: `testo`, 4 `risposte`, indice `corretta`, `tempo` in secondi |
| `public/host.html`, `host.js` | Pagina del docente |
| `public/index.html`, `player.js` | Pagina dello studente |
| `public/comune.js`, `style.css` | Funzioni e stile condivisi |

### Fasi

`attesa` → `domanda` → `soluzione` → `classifica` → (domanda successiva …) → `fine`

La domanda si chiude da sola allo scadere del tempo o quando hanno risposto tutti. Il docente può anche chiuderla prima.

### Messaggi

Dal client al server:

| tipo | chi | campi |
|---|---|---|
| `host` | docente | — |
| `entra` | studente | `nome`, `id` (per rientrare dopo un refresh) |
| `risposta` | studente | `scelta` (0–3) |
| `avanti` | docente | — passa alla fase successiva |
| `ricomincia` | docente | — azzera i punti e torna alla sala |

Dal server al client: `stato` (la situazione completa, diversa per docente e studente), `errore` (`testo`), `sostituito` (il docente ha aperto un'altra scheda).

### Punteggio

Risposta giusta: da 1000 punti (subito) a 500 (allo scadere). Risposta sbagliata o nessuna risposta: 0.
