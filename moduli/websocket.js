// =====================================================================
//  moduli/websocket.js — il quiz dal vivo con il modulo ws
//
//  Tutti i messaggi sono oggetti JSON con un campo "type".
//
//  Dal client al server:
//    { type: 'docente' }                 la pagina del docente si presenta
//    { type: 'entra', nome }             uno studente entra con il suo nome
//    { type: 'risposta', scelta }        uno studente risponde (indice 0..3)
//    { type: 'avanti' }                  (docente) avvia / chiudi domanda / prossima
//    { type: 'ricomincia' }              (docente) torna alla sala d'attesa
//
//  Dal server ai client:
//    entrato, errore, giocatori, attesa, domanda, risposte, risultato, fine
// =====================================================================

// [WS] dal modulo ws prendo la classe Server, come negli esercizi in classe
const { Server } = require('ws');
const archivio = require('./archivio');
const partita = require('./partita');

let ws_server;
let quale = 0;        // contatore per dare un id a ogni client (come ws_socket_04)
let timer = null;     // il setTimeout che chiude la domanda allo scadere del tempo

// l'ultimo messaggio di fase mandato a tutti: chi entra a partita
// iniziata lo riceve subito e vede la stessa schermata degli altri
let ultimoMessaggio = { type: 'attesa' };

// [WS] broadcast: trasformo l'oggetto in stringa JSON una volta sola
// e lo mando a tutti i client collegati (ws_server.clients)
function broadcast(msg) {
  const data = JSON.stringify(msg);
  ws_server.clients.forEach((client) => {
    client.send(data);
  });
}

// [WS] invio a un solo client
function manda(ws, msg) {
  ws.send(JSON.stringify(msg));
}

// Manda a tutti un cambio di fase e se lo ricorda per chi entra dopo
function cambiaFase(msg) {
  ultimoMessaggio = msg;
  broadcast(msg);
}

function mandaGiocatori() {
  broadcast({ type: 'giocatori', giocatori: partita.elencoGiocatori() });
}

// ---------------------------------------------------------------------
// Svolgimento della partita
// ---------------------------------------------------------------------

function prossimaDomanda() {
  const msg = partita.prossimaDomanda();
  cambiaFase(msg);
  if (msg.type === 'domanda') {
    broadcast(partita.contaRisposte());
    // la domanda si chiude da sola quando finisce il tempo
    timer = setTimeout(chiudiDomanda, msg.tempo * 1000);
  }
}

function chiudiDomanda() {
  clearTimeout(timer);
  cambiaFase(partita.chiudiDomanda());
}

// Il docente ha premuto il pulsante principale: cosa fa dipende dalla fase
function avanti(ws) {
  const fase = partita.faseAttuale();

  if (fase === 'attesa') {
    const domande = archivio.leggi();
    if (domande.length === 0) {
      return manda(ws, { type: 'errore', testo: 'Non ci sono domande: aggiungine almeno una' });
    }
    if (partita.elencoGiocatori().length === 0) {
      return manda(ws, { type: 'errore', testo: 'Nessuno studente in sala' });
    }
    partita.avvia(domande);
    prossimaDomanda();
  } else if (fase === 'domanda') {
    chiudiDomanda();          // il docente chiude la domanda prima del tempo
  } else if (fase === 'risultato') {
    prossimaDomanda();
  }
}

function ricomincia() {
  clearTimeout(timer);
  cambiaFase(partita.ricomincia());
  mandaGiocatori();
}

// ---------------------------------------------------------------------
// Server WebSocket
// ---------------------------------------------------------------------

function avviaWebSocket(server) {
  // [WS] creo il server WebSocket agganciato al server HTTP di Express
  ws_server = new Server({ server });

  // [WS] evento 'connection': scatta ogni volta che un browser si collega;
  // ws è il socket di quel client
  ws_server.on('connection', (ws) => {
    quale++;
    ws.id = quale;
    ws.docente = false;
    ws.nome = null;
    console.log('New client connected! id = ' + ws.id);

    // [WS] evento 'message': arriva una stringa, la trasformo in oggetto.
    // Se non è JSON valido la ignoro (try/catch come in esercizio_3).
    ws.on('message', function (message) {
      let arriva;
      try {
        arriva = JSON.parse(message);
      } catch {
        return;
      }

      if (arriva.type === 'docente') {
        ws.docente = true;
        console.log('Il client ' + ws.id + ' è il docente');
        manda(ws, ultimoMessaggio);
        manda(ws, { type: 'giocatori', giocatori: partita.elencoGiocatori() });
        return;
      }

      if (arriva.type === 'entra') {
        if (ws.nome !== null) return;   // è già entrato
        const esito = partita.entra(arriva.nome);
        if (esito.errore) {
          return manda(ws, { type: 'errore', testo: esito.errore });
        }
        ws.nome = esito.nome;
        console.log('Il client ' + ws.id + ' è entrato come ' + ws.nome);
        manda(ws, { type: 'entrato', nome: ws.nome });
        manda(ws, ultimoMessaggio);
        mandaGiocatori();
        return;
      }

      if (arriva.type === 'risposta') {
        if (!partita.rispondi(ws.nome, arriva.scelta)) return;
        broadcast(partita.contaRisposte());
        // hanno risposto tutti: inutile aspettare la fine del tempo
        if (partita.hannoRispostoTutti()) chiudiDomanda();
        return;
      }

      // i comandi che seguono sono riservati alla pagina del docente
      if (!ws.docente) return;

      if (arriva.type === 'avanti') avanti(ws);
      if (arriva.type === 'ricomincia') ricomincia();
    });

    // [WS] evento 'close': il client ha chiuso la pagina o ha perso la connessione
    ws.on('close', () => {
      console.log('Client has disconnected! id = ' + ws.id);
      if (ws.nome !== null) {
        partita.esce(ws.nome);
        mandaGiocatori();
        // chi è rimasto potrebbe aver già risposto tutto
        if (partita.faseAttuale() === 'domanda') {
          broadcast(partita.contaRisposte());
          if (partita.hannoRispostoTutti()) chiudiDomanda();
        }
      }
    });
  });
}

// [NODE] esporto solo la funzione che avvia il server: il resto resta privato
module.exports = avviaWebSocket;
