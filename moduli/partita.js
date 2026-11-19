// =====================================================================
//  moduli/partita.js — lo stato della partita
//
//  Qui ci sono solo dati e regole del gioco: questo file non sa nulla
//  di WebSocket. Le funzioni che cambiano fase restituiscono il messaggio
//  da mandare ai client, e lo spedisce moduli/websocket.js.
//
//  Fasi:  'attesa' → 'domanda' → 'risultato' → 'domanda' → ... → 'fine'
// =====================================================================

const TEMPO = 20;          // secondi per rispondere a ogni domanda
const PUNTI_BASE = 100;    // punti per una risposta giusta...
const PUNTI_SECONDO = 10;  // ...più 10 per ogni secondo rimasto

let fase = 'attesa';
let domande = [];      // copia delle domande, presa quando parte il quiz
let indice = -1;       // posizione della domanda in corso
let inizio = 0;        // Date.now() del momento in cui è partita la domanda

// ogni giocatore: { nome, punti, collegato, scelta, guadagno }
//   scelta   = indice della risposta data (null se non ha ancora risposto)
//   guadagno = punti presi con l'ultima domanda
let giocatori = [];

function faseAttuale() {
  return fase;
}

function trova(nome) {
  return giocatori.find((g) => g.nome === nome);
}

function collegati() {
  return giocatori.filter((g) => g.collegato);
}

// ---------------------------------------------------------------------
// Giocatori
// ---------------------------------------------------------------------

// Uno studente entra con il suo nome. Se il nome esiste ma lo studente
// si era disconnesso (per esempio ha ricaricato la pagina) rientra con i suoi punti.
// Restituisce { nome } oppure { errore }.
function entra(nome) {
  nome = typeof nome === 'string' ? nome.trim().slice(0, 20) : '';
  if (nome === '') {
    return { errore: 'Scrivi il tuo nome' };
  }

  const giocatore = trova(nome);
  if (giocatore && giocatore.collegato) {
    return { errore: 'Questo nome è già usato, scegline un altro' };
  }
  if (giocatore) {
    giocatore.collegato = true;
  } else {
    giocatori.push({ nome: nome, punti: 0, collegato: true, scelta: null, guadagno: 0 });
  }
  return { nome: nome };
}

// Lo studente si è disconnesso: in sala d'attesa lo tolgo dall'elenco,
// a partita iniziata lo tengo (con i suoi punti) per farlo rientrare.
function esce(nome) {
  if (fase === 'attesa') {
    giocatori = giocatori.filter((g) => g.nome !== nome);
  } else {
    const giocatore = trova(nome);
    if (giocatore) giocatore.collegato = false;
  }
}

// Elenco per la sala d'attesa e per il docente
function elencoGiocatori() {
  return giocatori.map((g) => ({ nome: g.nome, collegato: g.collegato }));
}

// ---------------------------------------------------------------------
// Partita
// ---------------------------------------------------------------------

// Prepara una nuova partita con le domande ricevute e azzera i punti
function avvia(elencoDomande) {
  domande = elencoDomande;
  indice = -1;
  giocatori.forEach((g) => (g.punti = 0));
}

// Passa alla domanda successiva. Restituisce il messaggio 'domanda',
// oppure il messaggio 'fine' se le domande sono finite.
function prossimaDomanda() {
  indice++;
  if (indice >= domande.length) {
    fase = 'fine';
    return { type: 'fine', classifica: classifica() };
  }

  fase = 'domanda';
  inizio = Date.now();
  giocatori.forEach((g) => {
    g.scelta = null;
    g.guadagno = 0;
  });

  const d = domande[indice];
  // ATTENZIONE: non mando il campo "corretta", altrimenti gli studenti
  // potrebbero leggerlo dagli strumenti per sviluppatori del browser
  return {
    type: 'domanda',
    numero: indice + 1,
    totale: domande.length,
    tipo: d.tipo,
    testo: d.testo,
    risposte: d.risposte,
    tempo: TEMPO,
  };
}

// Registra la risposta di uno studente. Restituisce true se è stata accettata.
function rispondi(nome, scelta) {
  const giocatore = trova(nome);
  if (fase !== 'domanda' || !giocatore || giocatore.scelta !== null) {
    return false;
  }
  if (!Number.isInteger(scelta) || scelta < 0 || scelta >= domande[indice].risposte.length) {
    return false;
  }

  giocatore.scelta = scelta;
  if (scelta === domande[indice].corretta) {
    const secondiPassati = Math.floor((Date.now() - inizio) / 1000);
    const secondiRimasti = Math.max(0, TEMPO - secondiPassati);
    giocatore.guadagno = PUNTI_BASE + secondiRimasti * PUNTI_SECONDO;
    giocatore.punti += giocatore.guadagno;
  }
  return true;
}

// Quanti studenti collegati hanno già risposto
function contaRisposte() {
  const presenti = collegati();
  return {
    type: 'risposte',
    date: presenti.filter((g) => g.scelta !== null).length,
    totale: presenti.length,
  };
}

function hannoRispostoTutti() {
  const conto = contaRisposte();
  return conto.totale > 0 && conto.date === conto.totale;
}

// Chiude la domanda: restituisce il messaggio con la risposta giusta e la classifica
function chiudiDomanda() {
  fase = 'risultato';
  return {
    type: 'risultato',
    corretta: domande[indice].corretta,
    ultima: indice === domande.length - 1,
    classifica: classifica(),
  };
}

// Classifica in ordine di punti. Uso una copia ([...]) per non riordinare l'array originale.
function classifica() {
  return [...giocatori]
    .sort((a, b) => b.punti - a.punti)
    .map((g) => ({ nome: g.nome, punti: g.punti, guadagno: g.guadagno }));
}

// Torna alla sala d'attesa: restano solo gli studenti ancora collegati, con 0 punti
function ricomincia() {
  fase = 'attesa';
  indice = -1;
  giocatori = collegati();
  giocatori.forEach((g) => {
    g.punti = 0;
    g.scelta = null;
    g.guadagno = 0;
  });
  return { type: 'attesa' };
}

module.exports = {
  faseAttuale,
  entra,
  esce,
  elencoGiocatori,
  avvia,
  prossimaDomanda,
  rispondi,
  contaRisposte,
  hannoRispostoTutti,
  chiudiDomanda,
  ricomincia,
};
