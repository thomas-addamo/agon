// =====================================================================
//  moduli/archivio.js — i quiz salvati nel file quiz.json
//
//  Ogni quiz:
//    { id, nome, autore, tempo, creato, domande: [ ... ] }
//  autore = nome utente del docente che l'ha creato (solo lui lo modifica)
//  tempo  = secondi per rispondere a ogni domanda (10, 20 o 30)
//
//  Ogni domanda ha la stessa forma, sia a risposta multipla sia vero/falso:
//    { tipo: 'multipla' | 'vf', testo, risposte: [...], corretta }
//  Il vero/falso è una domanda con le risposte ['Vero', 'Falso'],
//  così il resto del programma tratta i due tipi nello stesso modo.
// =====================================================================

// [NODE] fs (file system) e path fanno parte di Node, non vanno installati
const fs = require('fs');
const path = require('path');

// [NODE] path.join costruisce il percorso del file in modo corretto su ogni sistema
const FILE = path.join(__dirname, '..', 'quiz.json');

const TEMPI = [10, 20, 30];

// [NODE] readFileSync legge il file come testo, JSON.parse lo trasforma in array
function leggi() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

// [NODE] writeFileSync sovrascrive il file: i quiz restano dopo un riavvio.
// Gli argomenti null, 2 di JSON.stringify servono solo a tenere il file leggibile.
function salva(elenco) {
  fs.writeFileSync(FILE, JSON.stringify(elenco, null, 2));
}

function trova(id) {
  return leggi().find((q) => q.id === id) || null;
}

// ---------------------------------------------------------------------
// Controllo dei dati che arrivano dal docente
// ---------------------------------------------------------------------

// Una domanda. Restituisce { domanda } oppure { errore }.
function controllaDomanda(dati) {
  const testo = typeof dati.testo === 'string' ? dati.testo.trim() : '';
  if (testo === '') {
    return { errore: 'manca il testo' };
  }

  let risposte;
  if (dati.tipo === 'vf') {
    risposte = ['Vero', 'Falso'];
  } else if (dati.tipo === 'multipla') {
    if (!Array.isArray(dati.risposte) || dati.risposte.length !== 4) {
      return { errore: 'servono 4 risposte' };
    }
    risposte = dati.risposte.map((r) => String(r).trim());
    if (risposte.some((r) => r === '')) {
      return { errore: 'compila tutte e 4 le risposte' };
    }
  } else {
    return { errore: 'tipo di domanda non valido' };
  }

  const corretta = Number(dati.corretta);
  if (!Number.isInteger(corretta) || corretta < 0 || corretta >= risposte.length) {
    return { errore: 'scegli la risposta giusta' };
  }

  return { domanda: { tipo: dati.tipo, testo: testo, risposte: risposte, corretta: corretta } };
}

// Un quiz intero: nome, tempo e almeno una domanda. Restituisce { quiz } oppure { errore }.
function controllaQuiz(dati) {
  const nome = typeof dati.nome === 'string' ? dati.nome.trim().slice(0, 60) : '';
  if (nome === '') {
    return { errore: 'Dai un nome al quiz' };
  }

  const tempo = Number(dati.tempo);
  if (!TEMPI.includes(tempo)) {
    return { errore: 'Il tempo deve essere 10, 20 o 30 secondi' };
  }

  if (!Array.isArray(dati.domande) || dati.domande.length === 0) {
    return { errore: 'Aggiungi almeno una domanda' };
  }

  const domande = [];
  for (let i = 0; i < dati.domande.length; i++) {
    const esito = controllaDomanda(dati.domande[i]);
    if (esito.errore) {
      return { errore: 'Domanda ' + (i + 1) + ': ' + esito.errore };
    }
    domande.push(esito.domanda);
  }

  return { quiz: { nome: nome, tempo: tempo, domande: domande } };
}

// ---------------------------------------------------------------------
// Operazioni sull'archivio
// ---------------------------------------------------------------------

// Nuovo quiz del docente "autore". Restituisce { quiz } oppure { errore }.
function aggiungi(dati, autore) {
  const esito = controllaQuiz(dati);
  if (esito.errore) return esito;

  const elenco = leggi();
  // il nuovo id è il più grande già usato + 1
  const id = elenco.length > 0 ? Math.max(...elenco.map((q) => q.id)) + 1 : 1;
  const quiz = { id: id, nome: esito.quiz.nome, autore: autore, tempo: esito.quiz.tempo, creato: new Date().toISOString(), domande: esito.quiz.domande };

  elenco.push(quiz);
  salva(elenco);
  return { quiz: quiz };
}

// Modifica un quiz: solo il suo autore può farlo.
// Restituisce { quiz } oppure { errore, codice } con il codice HTTP da usare.
function modifica(id, dati, utente) {
  const elenco = leggi();
  const quiz = elenco.find((q) => q.id === id);
  if (!quiz) return { errore: 'Quiz non trovato', codice: 404 };
  if (quiz.autore !== utente) return { errore: 'Puoi modificare solo i tuoi quiz', codice: 403 };

  const esito = controllaQuiz(dati);
  if (esito.errore) return { errore: esito.errore, codice: 400 };

  quiz.nome = esito.quiz.nome;
  quiz.tempo = esito.quiz.tempo;
  quiz.domande = esito.quiz.domande;
  salva(elenco);
  return { quiz: quiz };
}

// Elimina un quiz: solo il suo autore può farlo.
// Restituisce null se è andato tutto bene, altrimenti { errore, codice }.
function elimina(id, utente) {
  const elenco = leggi();
  const quiz = elenco.find((q) => q.id === id);
  if (!quiz) return { errore: 'Quiz non trovato', codice: 404 };
  if (quiz.autore !== utente) return { errore: 'Puoi eliminare solo i tuoi quiz', codice: 403 };

  salva(elenco.filter((q) => q.id !== id));
  return null;
}

// [NODE] module.exports: le funzioni che gli altri file possono usare con require
module.exports = { leggi, trova, aggiungi, modifica, elimina };
