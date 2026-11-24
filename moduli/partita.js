// =====================================================================
//  moduli/partita.js — le partite in corso
//
//  Ogni volta che un docente avvia un quiz nasce una PARTITA, con un PIN
//  di 6 cifre che gli studenti scrivono insieme al nome. Più partite
//  possono andare avanti nello stesso momento, ognuna con il suo PIN.
//
//  Una partita è un semplice oggetto:
//    { pin, nome, domande, tempo, fase, indice, inizio, giocatori,
//      timer, ultimoMessaggio }
//  Tutte le funzioni qui ricevono la partita come primo argomento.
//
//  Qui ci sono solo dati e regole del gioco: questo file non sa nulla
//  di WebSocket. Le funzioni che cambiano fase restituiscono il messaggio
//  da mandare ai client, e lo spedisce moduli/websocket.js.
//
//  Fasi:  'attesa' → 'domanda' → 'risultato' → 'domanda' → ... → 'fine'
// =====================================================================

const PUNTI_BASE = 100;    // punti per una risposta giusta...
const PUNTI_SECONDO = 10;  // ...più 10 per ogni secondo rimasto

// tutte le partite in corso: PIN → partita
const partite = {};

// ---------------------------------------------------------------------
// Creare, trovare e chiudere le partite
// ---------------------------------------------------------------------

// PIN casuale di 6 cifre, diverso da quelli già in uso
function nuovoPin() {
  let pin;
  // do...while: genero un PIN almeno una volta e ripeto finché ne esce uno
  // non ancora usato (partite[pin] è undefined se il PIN è libero).
  // Math.random() * 900000 va da 0 a 899999: +100000 dà sempre 6 cifre (100000-999999).
  // Il PIN è una stringa perché è la chiave dell'oggetto "partite".
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (partite[pin]);
  return pin;
}

// Nuova partita a partire da un quiz salvato
function crea(quiz) {
  const partita = {
    pin: nuovoPin(),
    nome: quiz.nome,
    domande: quiz.domande,
    tempo: quiz.tempo,
    fase: 'attesa',
    indice: -1,          // posizione della domanda in corso
    inizio: 0,           // Date.now() del momento in cui è partita la domanda
    giocatori: [],       // { nome, punti, collegato, scelta, guadagno }
    timer: null,         // il setTimeout che chiude la domanda (lo usa websocket.js)
    ultimoMessaggio: { type: 'attesa' },  // per chi entra a partita iniziata
  };
  partite[partita.pin] = partita;
  return partita;
}

// La partita con quel PIN, oppure null (il PIN può arrivare con spazi).
// La regex /\s/g trova tutti gli spazi (\s = spazio, g = tutti, non solo il primo)
// e replace li toglie: "482 913" diventa "482913".
function trova(pin) {
  return partite[String(pin).replace(/\s/g, '')] || null;
}

function chiudi(partita) {
  clearTimeout(partita.timer);
  delete partite[partita.pin];
}

// ---------------------------------------------------------------------
// Giocatori
// ---------------------------------------------------------------------

function trovaGiocatore(partita, nome) {
  return partita.giocatori.find((g) => g.nome === nome);
}

function collegati(partita) {
  return partita.giocatori.filter((g) => g.collegato);
}

// Uno studente entra con il suo nome. Se il nome esiste ma lo studente
// si era disconnesso (per esempio ha ricaricato la pagina) rientra con i suoi punti.
// Restituisce { nome } oppure { errore }.
function entra(partita, nome) {
  nome = typeof nome === 'string' ? nome.trim().slice(0, 20) : '';
  if (nome === '') {
    return { errore: 'Scrivi il tuo nome' };
  }

  const giocatore = trovaGiocatore(partita, nome);
  if (giocatore && giocatore.collegato) {
    return { errore: 'Questo nome è già usato, scegline un altro' };
  }
  if (giocatore) {
    giocatore.collegato = true;
  } else {
    partita.giocatori.push({ nome: nome, punti: 0, collegato: true, scelta: null, guadagno: 0 });
  }
  return { nome: nome };
}

// Lo studente si è disconnesso: in sala d'attesa lo tolgo dall'elenco,
// a partita iniziata lo tengo (con i suoi punti) per farlo rientrare.
function esce(partita, nome) {
  if (partita.fase === 'attesa') {
    partita.giocatori = partita.giocatori.filter((g) => g.nome !== nome);
  } else {
    const giocatore = trovaGiocatore(partita, nome);
    if (giocatore) giocatore.collegato = false;
  }
}

// Elenco per la sala d'attesa e per il docente
function elencoGiocatori(partita) {
  return partita.giocatori.map((g) => ({ nome: g.nome, collegato: g.collegato }));
}

// ---------------------------------------------------------------------
// Svolgimento
// ---------------------------------------------------------------------

// Azzera i punti prima della prima domanda
function avvia(partita) {
  partita.indice = -1;
  partita.giocatori.forEach((g) => (g.punti = 0));
}

// Passa alla domanda successiva. Restituisce il messaggio 'domanda',
// oppure il messaggio 'fine' se le domande sono finite.
function prossimaDomanda(partita) {
  // indice parte da -1 (nessuna domanda): il primo ++ lo porta a 0, la prima domanda
  partita.indice++;
  if (partita.indice >= partita.domande.length) {
    partita.fase = 'fine';
    return { type: 'fine', classifica: classifica(partita) };
  }

  partita.fase = 'domanda';
  partita.inizio = Date.now();
  partita.giocatori.forEach((g) => {
    g.scelta = null;
    g.guadagno = 0;
  });

  const d = partita.domande[partita.indice];
  // ATTENZIONE: non mando il campo "corretta", altrimenti gli studenti
  // potrebbero leggerlo dagli strumenti per sviluppatori del browser
  return {
    type: 'domanda',
    numero: partita.indice + 1,
    totale: partita.domande.length,
    tipo: d.tipo,
    testo: d.testo,
    risposte: d.risposte,
    tempo: partita.tempo,
  };
}

// Registra la risposta di uno studente. Restituisce true se è stata accettata.
function rispondi(partita, nome, scelta) {
  const giocatore = trovaGiocatore(partita, nome);
  // rifiuto la risposta se: non c'è una domanda aperta, il giocatore non esiste,
  // oppure ha già risposto (scelta !== null): si risponde una volta sola
  if (partita.fase !== 'domanda' || !giocatore || giocatore.scelta !== null) {
    return false;
  }
  const domanda = partita.domande[partita.indice];
  // la scelta arriva dal browser, quindi la controllo: deve essere un numero
  // intero tra 0 e il numero di risposte (2 per il vero/falso, 4 per la multipla)
  if (!Number.isInteger(scelta) || scelta < 0 || scelta >= domanda.risposte.length) {
    return false;
  }

  giocatore.scelta = scelta;
  if (scelta === domanda.corretta) {
    // Date.now() è in millisecondi: / 1000 per avere i secondi passati dall'inizio
    // della domanda. Math.max(0, ...) evita punti negativi se si risponde all'ultimo.
    const secondiPassati = Math.floor((Date.now() - partita.inizio) / 1000);
    const secondiRimasti = Math.max(0, partita.tempo - secondiPassati);
    giocatore.guadagno = PUNTI_BASE + secondiRimasti * PUNTI_SECONDO;
    giocatore.punti += giocatore.guadagno;
  }
  return true;
}

// Quanti studenti collegati hanno già risposto
function contaRisposte(partita) {
  const presenti = collegati(partita);
  return {
    type: 'risposte',
    date: presenti.filter((g) => g.scelta !== null).length,
    totale: presenti.length,
  };
}

function hannoRispostoTutti(partita) {
  const conto = contaRisposte(partita);
  return conto.totale > 0 && conto.date === conto.totale;
}

// Chiude la domanda: restituisce il messaggio con la risposta giusta e la classifica
function chiudiDomanda(partita) {
  partita.fase = 'risultato';
  return {
    type: 'risultato',
    corretta: partita.domande[partita.indice].corretta,
    ultima: partita.indice === partita.domande.length - 1,
    classifica: classifica(partita),
  };
}

// Classifica in ordine di punti. Uso una copia ([...]) per non riordinare l'array originale.
function classifica(partita) {
  return [...partita.giocatori]
    .sort((a, b) => b.punti - a.punti)
    .map((g) => ({ nome: g.nome, punti: g.punti, guadagno: g.guadagno }));
}

// Torna alla sala d'attesa: restano solo gli studenti ancora collegati, con 0 punti
function ricomincia(partita) {
  partita.fase = 'attesa';
  partita.indice = -1;
  partita.giocatori = collegati(partita);
  partita.giocatori.forEach((g) => {
    g.punti = 0;
    g.scelta = null;
    g.guadagno = 0;
  });
  return { type: 'attesa' };
}

module.exports = {
  crea,
  trova,
  chiudi,
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
