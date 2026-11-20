// =====================================================================
//  moduli/websocket.js — le partite dal vivo con il modulo ws
//
//  Tutti i messaggi sono oggetti JSON con un campo "type".
//  Ogni client ricorda in ws.pin la partita in cui si trova: i messaggi
//  di una partita arrivano solo ai client con lo stesso PIN.
//
//  Dal client al server:
//    { type: 'crea', token, quiz }       il docente avvia il quiz con quell'id
//    { type: 'entra', pin, nome }        uno studente entra in una partita
//    { type: 'risposta', scelta }        uno studente risponde (indice 0..3)
//    { type: 'avanti' }                  (docente) avvia / chiudi domanda / prossima
//    { type: 'ricomincia' }              (docente) torna alla sala d'attesa
//
//  Dal server ai client:
//    creata, entrato, errore, non-autorizzato, giocatori, attesa,
//    domanda, risposte, risultato, fine, chiusa
// =====================================================================

// [WS] dal modulo ws prendo la classe Server, come negli esercizi in classe
const { Server } = require('ws');
const archivio = require('./archivio');
const partite = require('./partita');
const utenti = require('./utenti');

let ws_server;
let quale = 0;        // contatore per dare un id a ogni client (come ws_socket_04)

// [WS] broadcast: trasformo l'oggetto in stringa JSON una volta sola
// e lo mando a tutti i client collegati (ws_server.clients)...
// ...ma solo a quelli che sono nella stessa partita
function broadcast(partita, msg) {
  const data = JSON.stringify(msg);
  ws_server.clients.forEach((client) => {
    if (client.pin === partita.pin) client.send(data);
  });
}

// [WS] invio a un solo client
function manda(ws, msg) {
  ws.send(JSON.stringify(msg));
}

// Manda a tutta la partita un cambio di fase e se lo ricorda per chi entra dopo
function cambiaFase(partita, msg) {
  partita.ultimoMessaggio = msg;
  broadcast(partita, msg);
}

function mandaGiocatori(partita) {
  broadcast(partita, { type: 'giocatori', giocatori: partite.elencoGiocatori(partita) });
}

// ---------------------------------------------------------------------
// Svolgimento della partita
// ---------------------------------------------------------------------

function prossimaDomanda(partita) {
  const msg = partite.prossimaDomanda(partita);
  cambiaFase(partita, msg);
  if (msg.type === 'domanda') {
    broadcast(partita, partite.contaRisposte(partita));
    // la domanda si chiude da sola quando finisce il tempo
    partita.timer = setTimeout(() => chiudiDomanda(partita), msg.tempo * 1000);
  }
}

function chiudiDomanda(partita) {
  clearTimeout(partita.timer);
  cambiaFase(partita, partite.chiudiDomanda(partita));
}

// Il docente ha premuto il pulsante principale: cosa fa dipende dalla fase
function avanti(ws, partita) {
  if (partita.fase === 'attesa') {
    if (partite.elencoGiocatori(partita).length === 0) {
      return manda(ws, { type: 'errore', testo: 'Nessuno studente in sala' });
    }
    partite.avvia(partita);
    prossimaDomanda(partita);
  } else if (partita.fase === 'domanda') {
    chiudiDomanda(partita);          // il docente chiude la domanda prima del tempo
  } else if (partita.fase === 'risultato') {
    prossimaDomanda(partita);
  }
}

function ricomincia(partita) {
  clearTimeout(partita.timer);
  cambiaFase(partita, partite.ricomincia(partita));
  mandaGiocatori(partita);
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
    ws.pin = null;        // la partita in cui si trova
    ws.docente = false;   // true se ha creato la partita
    ws.nome = null;       // nome dello studente
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

      // il docente avvia un quiz: nasce una partita con un PIN nuovo
      if (arriva.type === 'crea') {
        if (ws.pin !== null) return;   // ha già una partita
        const utente = utenti.utenteDaToken(arriva.token);
        if (utente === null) {
          return manda(ws, { type: 'non-autorizzato' });
        }
        const quiz = archivio.trova(Number(arriva.quiz));
        if (!quiz) {
          return manda(ws, { type: 'errore', testo: 'Questo quiz non esiste più' });
        }
        const partita = partite.crea(quiz);
        ws.docente = true;
        ws.pin = partita.pin;
        console.log('Il docente ' + utente + ' ha avviato "' + quiz.nome + '" con PIN ' + partita.pin);
        manda(ws, { type: 'creata', pin: partita.pin, nome: quiz.nome, domande: quiz.domande.length });
        manda(ws, partita.ultimoMessaggio);
        mandaGiocatori(partita);
        return;
      }

      // uno studente entra con PIN e nome
      if (arriva.type === 'entra') {
        if (ws.nome !== null) return;   // è già entrato
        const partita = partite.trova(arriva.pin);
        if (!partita) {
          return manda(ws, { type: 'errore', testo: 'Nessuna partita con questo PIN' });
        }
        const esito = partite.entra(partita, arriva.nome);
        if (esito.errore) {
          return manda(ws, { type: 'errore', testo: esito.errore });
        }
        ws.pin = partita.pin;
        ws.nome = esito.nome;
        console.log('Il client ' + ws.id + ' è entrato come ' + ws.nome + ' nella partita ' + ws.pin);
        manda(ws, { type: 'entrato', nome: ws.nome, quiz: partita.nome });
        manda(ws, partita.ultimoMessaggio);
        mandaGiocatori(partita);
        return;
      }

      // tutti gli altri messaggi riguardano la partita in cui si trova il client
      const partita = partite.trova(ws.pin);
      if (!partita) return;

      if (arriva.type === 'risposta' && ws.nome !== null) {
        if (!partite.rispondi(partita, ws.nome, arriva.scelta)) return;
        broadcast(partita, partite.contaRisposte(partita));
        // hanno risposto tutti: inutile aspettare la fine del tempo
        if (partite.hannoRispostoTutti(partita)) chiudiDomanda(partita);
        return;
      }

      // i comandi che seguono sono riservati al docente della partita
      if (!ws.docente) return;

      if (arriva.type === 'avanti') avanti(ws, partita);
      if (arriva.type === 'ricomincia') ricomincia(partita);
    });

    // [WS] evento 'close': il client ha chiuso la pagina o ha perso la connessione
    ws.on('close', () => {
      console.log('Client has disconnected! id = ' + ws.id);
      const partita = partite.trova(ws.pin);
      if (!partita) return;

      // se esce il docente la partita finisce per tutti
      if (ws.docente) {
        console.log('Partita ' + partita.pin + ' chiusa');
        broadcast(partita, { type: 'chiusa' });
        partite.chiudi(partita);
        return;
      }

      if (ws.nome !== null) {
        partite.esce(partita, ws.nome);
        mandaGiocatori(partita);
        // chi è rimasto potrebbe aver già risposto tutto
        if (partita.fase === 'domanda') {
          broadcast(partita, partite.contaRisposte(partita));
          if (partite.hannoRispostoTutti(partita)) chiudiDomanda(partita);
        }
      }
    });
  });
}

// [NODE] esporto solo la funzione che avvia il server: il resto resta privato
module.exports = avviaWebSocket;
