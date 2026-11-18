// Agon — quiz live in classe con WebSocket
// Stesse basi degli esempi ws_socket_00..07: Express serve le pagine,
// ws gira sullo stesso server HTTP e i messaggi sono oggetti JSON.

const express = require('express');
const os = require('os');
const path = require('path');
const { Server } = require('ws');

const PORTA = process.env.PORT || 3000;
const DOMANDE = require('./domande.json');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/host', (req, res) => res.sendFile('host.html', { root: path.join(__dirname, 'public') }));

const server = app.listen(PORTA, () => {
  console.log(`Agon in ascolto sulla porta ${PORTA}`);
  console.log(`Docente:   http://localhost:${PORTA}/host`);
  for (const ip of indirizziLan()) console.log(`Studenti:  http://${ip}:${PORTA}`);
});

const ws_server = new Server({ server });

// ---------- stato della partita ----------

// fasi: 'attesa' (lobby) -> 'domanda' -> 'soluzione' -> 'classifica' -> ... -> 'fine'
let fase = 'attesa';
let indice = -1;          // domanda corrente
let inizioDomanda = 0;    // Date.now() quando è partita la domanda
let timer = null;
let host = null;          // socket del docente
let prossimoId = 0;
const giocatori = new Map(); // id -> { id, nome, punti, ws, risposta, tempoRisposta, guadagno }

function domandaCorrente() {
  return DOMANDE[indice];
}

function msRimanenti() {
  const d = domandaCorrente();
  return Math.max(0, d.tempo * 1000 - (Date.now() - inizioDomanda));
}

function classifica() {
  return [...giocatori.values()]
    .sort((a, b) => b.punti - a.punti)
    .map((g, i) => ({ posizione: i + 1, nome: g.nome, punti: g.punti, connesso: g.ws !== null }));
}

function hannoRispostoTutti() {
  const collegati = [...giocatori.values()].filter((g) => g.ws !== null);
  return collegati.length > 0 && collegati.every((g) => g.risposta !== null);
}

function nomeValido(nome) {
  return typeof nome === 'string' && nome.trim().length > 0;
}

function pulisciNome(nome) {
  return nome.trim().replace(/\s+/g, ' ').slice(0, 20);
}

function indirizziLan() {
  const ip = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family === 'IPv4' && !i.internal) ip.push(i.address);
    }
  }
  return ip;
}

// ---------- invio dello stato ----------

function manda(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

// Il docente vede tutto, compresa la risposta giusta.
function statoHost() {
  const d = domandaCorrente();
  const stato = {
    tipo: 'stato',
    fase,
    indice,
    totale: DOMANDE.length,
    giocatori: classifica(),
    indirizzi: indirizziLan().map((ip) => `http://${ip}:${PORTA}`),
  };
  if (d && fase !== 'attesa') {
    stato.domanda = { testo: d.testo, risposte: d.risposte, tempo: d.tempo };
    stato.rimanenti = msRimanenti();
    stato.risposteDate = [...giocatori.values()].filter((g) => g.risposta !== null).length;
  }
  if (fase === 'soluzione') {
    stato.corretta = d.corretta;
    stato.distribuzione = d.risposte.map((_, i) =>
      [...giocatori.values()].filter((g) => g.risposta === i).length);
  }
  return stato;
}

// Lo studente vede solo quello che gli serve: niente risposta giusta finché la domanda è aperta.
function statoGiocatore(g) {
  const d = domandaCorrente();
  const pos = classifica().findIndex((c) => c.nome === g.nome) + 1;
  const stato = {
    tipo: 'stato',
    fase,
    indice,
    totale: DOMANDE.length,
    io: { id: g.id, nome: g.nome, punti: g.punti, posizione: pos },
    numeroGiocatori: giocatori.size,
  };
  if (d && fase === 'domanda') {
    stato.domanda = { testo: d.testo, risposte: d.risposte, tempo: d.tempo };
    stato.rimanenti = msRimanenti();
    stato.risposta = g.risposta;
  }
  if (fase === 'soluzione' || fase === 'classifica') {
    stato.esito = {
      risposta: g.risposta,
      giusta: g.risposta === d.corretta,
      corretta: d.risposte[d.corretta],
      guadagno: g.guadagno,
    };
  }
  if (fase === 'fine') stato.podio = classifica().slice(0, 3);
  return stato;
}

function aggiornaTutti() {
  manda(host, statoHost());
  for (const g of giocatori.values()) manda(g.ws, statoGiocatore(g));
}

// ---------- svolgimento ----------

function avviaDomanda(i) {
  indice = i;
  fase = 'domanda';
  inizioDomanda = Date.now();
  for (const g of giocatori.values()) {
    g.risposta = null;
    g.tempoRisposta = null;
    g.guadagno = 0;
  }
  clearTimeout(timer);
  timer = setTimeout(chiudiDomanda, domandaCorrente().tempo * 1000);
  aggiornaTutti();
}

function chiudiDomanda() {
  if (fase !== 'domanda') return;
  clearTimeout(timer);
  const d = domandaCorrente();
  for (const g of giocatori.values()) {
    if (g.risposta === d.corretta) {
      // da 1000 punti (risposta immediata) a 500 (allo scadere)
      g.guadagno = Math.round(1000 * (1 - g.tempoRisposta / (d.tempo * 1000) / 2));
      g.punti += g.guadagno;
    }
  }
  fase = 'soluzione';
  aggiornaTutti();
}

function avanti() {
  if (fase === 'attesa') {
    if (giocatori.size === 0) return;
    avviaDomanda(0);
  } else if (fase === 'domanda') {
    chiudiDomanda(); // il docente può chiudere prima dello scadere
  } else if (fase === 'soluzione') {
    fase = 'classifica';
    aggiornaTutti();
  } else if (fase === 'classifica') {
    if (indice + 1 < DOMANDE.length) avviaDomanda(indice + 1);
    else {
      fase = 'fine';
      aggiornaTutti();
    }
  }
}

function ricomincia() {
  clearTimeout(timer);
  fase = 'attesa';
  indice = -1;
  for (const [id, g] of giocatori) {
    if (g.ws === null) giocatori.delete(id);
    else {
      g.punti = 0;
      g.risposta = null;
      g.guadagno = 0;
    }
  }
  aggiornaTutti();
}

// ---------- connessioni ----------

ws_server.on('connection', (ws) => {
  console.log('Nuovo client collegato');
  let giocatore = null; // se questo socket è uno studente

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.tipo) {
      case 'host':
        if (host && host !== ws) manda(host, { tipo: 'sostituito' });
        host = ws;
        manda(host, statoHost());
        break;

      case 'entra': {
        // rientro dopo un refresh: l'id è salvato nel browser dello studente
        const vecchio = giocatori.get(msg.id);
        if (vecchio && vecchio.ws === null) {
          vecchio.ws = ws;
          giocatore = vecchio;
          aggiornaTutti();
          break;
        }
        if (!nomeValido(msg.nome)) return manda(ws, { tipo: 'errore', testo: 'Scrivi un nome.' });
        const nome = pulisciNome(msg.nome);
        const preso = [...giocatori.values()].some((g) => g.nome.toLowerCase() === nome.toLowerCase());
        if (preso) return manda(ws, { tipo: 'errore', testo: 'Questo nome è già preso.' });
        if (fase !== 'attesa') return manda(ws, { tipo: 'errore', testo: 'La partita è già iniziata.' });

        prossimoId++;
        giocatore = { id: `g${prossimoId}-${Date.now().toString(36)}`, nome, punti: 0, ws, risposta: null, tempoRisposta: null, guadagno: 0 };
        giocatori.set(giocatore.id, giocatore);
        console.log(`Entra ${nome}`);
        aggiornaTutti();
        break;
      }

      case 'risposta': {
        if (!giocatore || fase !== 'domanda' || giocatore.risposta !== null) return;
        const scelta = Number(msg.scelta);
        if (!Number.isInteger(scelta) || scelta < 0 || scelta >= domandaCorrente().risposte.length) return;
        giocatore.risposta = scelta;
        giocatore.tempoRisposta = Date.now() - inizioDomanda;
        if (hannoRispostoTutti()) chiudiDomanda();
        else aggiornaTutti();
        break;
      }

      // comandi riservati al docente
      case 'avanti':
        if (ws === host) avanti();
        break;
      case 'ricomincia':
        if (ws === host) ricomincia();
        break;
    }
  });

  ws.on('close', () => {
    console.log('Client scollegato');
    if (ws === host) host = null;
    if (giocatore) {
      if (fase === 'attesa') giocatori.delete(giocatore.id);
      else giocatore.ws = null; // resta in classifica, può rientrare
      if (fase === 'domanda' && hannoRispostoTutti()) chiudiDomanda();
      else aggiornaTutti();
    }
  });
});
