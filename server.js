// =====================================================================
//  AGON — quiz live in classe con WebSocket
//  Progetto TPSIT 5A INFO
//
//  I docenti creano i quiz e li avviano da /docente: ogni quiz avviato
//  diventa una partita con un PIN. Gli studenti entrano da / con PIN e
//  nome e rispondono dal telefono. Più partite possono girare insieme.
//
//  Questo è il file principale: crea il server Express, monta le rotte
//  e avvia il server WebSocket sullo stesso server HTTP.
//
//  STRUTTURA DEL PROGETTO
//    server.js              → file principale (questo)
//    rotte/quiz.js          → API REST per gestire i quiz (Express Router)
//    rotte/utenti.js        → registrazione, login e logout dei docenti
//    moduli/archivio.js     → lettura e scrittura di quiz.json (modulo fs)
//    moduli/utenti.js       → docenti in docenti.json, token, middleware di login
//    moduli/partita.js      → partite in corso con il loro PIN, punteggi e classifica
//    moduli/websocket.js    → server WebSocket con il modulo ws
//    public/                → pagine HTML, foglio di stile ed effetti animati
//
//  CONOSCENZE USATE (cercare le etichette nei commenti)
//    [NODE]     require e module.exports, moduli fs, path, os e crypto, process
//    [EXPRESS]  app, middleware (anche scritti da noi), express.json,
//               express.static, Router, rotte GET/POST/PUT/DELETE, req.params,
//               req.body, req.get (intestazioni), res.json, res.status,
//               res.sendFile, middleware di login su router e su singola rotta,
//               codici 400/401/403/404, pagina 404
//    [WS]       Server di ws, evento connection, message e close,
//               ws.send, ws_server.clients, broadcast filtrato per PIN,
//               proprietà salvate sul socket (ws.pin, ws.nome), messaggi JSON con type
//    [JS]       oggetti e array, JSON.stringify e JSON.parse, setTimeout,
//               metodi degli array (find, filter, map, sort, forEach)
// =====================================================================

// [NODE] require carica un modulo: express è installato con npm,
// os fa parte di Node, gli altri sono file scritti da noi (percorso con ./)
const express = require('express');
const os = require('os');
const rotteQuiz = require('./rotte/quiz');
const rotteUtenti = require('./rotte/utenti');
const avviaWebSocket = require('./moduli/websocket');

// [NODE] process.env legge le variabili d'ambiente: se PORT non c'è uso la 3000
const PORTA = process.env.PORT || 3000;

// [EXPRESS] middleware scritto da noi: riceve (req, res, next),
// stampa ogni richiesta e con next() passa al middleware successivo
function registro(req, res, next) {
  console.log(req.method + ' ' + req.url);
  next();
}

// [NODE] os.networkInterfaces() restituisce le schede di rete del computer:
// prendo gli indirizzi IPv4 non interni, quelli da dare agli studenti
function indirizziRete() {
  const indirizzi = [];
  const schede = os.networkInterfaces();
  for (const nome in schede) {
    schede[nome].forEach((scheda) => {
      if (scheda.family === 'IPv4' && !scheda.internal) {
        indirizzi.push('http://' + scheda.address + ':' + PORTA);
      }
    });
  }
  return indirizzi;
}

// [EXPRESS] creo l'app e la configuro a catena, come negli esercizi in classe.
// L'ordine conta: Express prova i middleware e le rotte dall'alto verso il basso.
const server = express()
  .use(registro)

  // [EXPRESS] middleware integrato: legge il corpo JSON delle richieste
  // POST e lo mette già convertito in req.body
  .use(express.json())

  // [EXPRESS] middleware integrato: serve i file della cartella public
  // (index.html, style.css...). __dirname è la cartella di questo file.
  .use(express.static(__dirname + '/public'))

  // [EXPRESS] monto i Router: tutte le rotte di rotte/quiz.js iniziano
  // con /quiz, quelle di rotte/utenti.js con /utenti
  .use('/quiz', rotteQuiz)
  .use('/utenti', rotteUtenti)

  // [EXPRESS] rotte GET: le pagine del docente, mandate con res.sendFile.
  //   /docente  → elenco dei quiz      /editor  → crea o modifica un quiz
  //   /conduci  → la partita da proiettare, con il PIN
  // Se non trovano il token rimandano da sole a /login; i dati veri
  // (quiz e comandi della partita) sono comunque protetti dal server.
  .get('/docente', (req, res) => res.sendFile('/public/docente.html', { root: __dirname }))
  .get('/editor', (req, res) => res.sendFile('/public/editor.html', { root: __dirname }))
  .get('/conduci', (req, res) => res.sendFile('/public/conduci.html', { root: __dirname }))
  .get('/login', (req, res) => res.sendFile('/public/login.html', { root: __dirname }))

  // [EXPRESS] rotta GET che risponde in JSON: gli indirizzi da mostrare agli studenti
  .get('/indirizzo', (req, res) => res.json(indirizziRete()))

  // [EXPRESS] ultimo middleware: se nessuna rotta ha risposto la pagina non esiste
  .use((req, res) => res.status(404).send('Pagina non trovata'))

  // [EXPRESS] avvio il server HTTP; listen restituisce il server di Node
  .listen(PORTA, () => {
    console.log('Listening on ' + PORTA);
    console.log('Docente:  http://localhost:' + PORTA + '/docente');
    indirizziRete().forEach((indirizzo) => console.log('Studenti: ' + indirizzo));
  });

// [WS] il server WebSocket lavora sullo stesso server HTTP di Express
avviaWebSocket(server);
