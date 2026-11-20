// =====================================================================
//  rotte/quiz.js — API REST per gestire i quiz
//
//  In server.js questo Router è montato su /quiz, quindi:
//    GET    /quiz       → elenco dei quiz (senza le domande)
//    GET    /quiz/:id   → un quiz completo, con le domande
//    POST   /quiz       → crea un quiz { nome, tempo, domande }
//    PUT    /quiz/:id   → modifica un quiz (solo il suo autore)
//    DELETE /quiz/:id   → elimina un quiz (solo il suo autore)
//
//  I quiz si gestiscono con HTTP, le partite dal vivo con WebSocket.
//  Tutte le rotte sono riservate ai docenti che hanno fatto il login.
// =====================================================================

const express = require('express');
const archivio = require('../moduli/archivio');
const utenti = require('../moduli/utenti');

// [EXPRESS] express.Router() crea un gruppo di rotte da montare nell'app
const router = express.Router();

// [EXPRESS] router.use applica il middleware a TUTTE le rotte di questo Router:
// senza login non si possono né leggere (contengono le risposte giuste!)
// né modificare i quiz. Dopo questo middleware req.utente è il docente.
router.use(utenti.richiediLogin);

// [EXPRESS] rotta GET: res.json converte l'array in JSON e lo manda al browser.
// Per l'elenco basta un riassunto: con map tolgo le domande e lascio quante sono.
router.get('/', (req, res) => {
  const elenco = archivio.leggi().map((q) => ({
    id: q.id,
    nome: q.nome,
    autore: q.autore,
    tempo: q.tempo,
    numeroDomande: q.domande.length,
    mio: q.autore === req.utente,
  }));
  res.json(elenco);
});

// [EXPRESS] rotta con parametro: il valore di :id si legge in req.params.id
// (è sempre una stringa, quindi lo converto in numero)
router.get('/:id', (req, res) => {
  const quiz = archivio.trova(Number(req.params.id));
  if (!quiz) {
    return res.status(404).json({ errore: 'Quiz non trovato' });
  }
  res.json(quiz);
});

// [EXPRESS] rotta POST: i dati arrivano in req.body grazie a express.json()
router.post('/', (req, res) => {
  const esito = archivio.aggiungi(req.body, req.utente);
  if (esito.errore) {
    // [EXPRESS] res.status imposta il codice HTTP: 400 = dati non validi
    return res.status(400).json({ errore: esito.errore });
  }
  // 201 = creato
  res.status(201).json(esito.quiz);
});

// [EXPRESS] rotta PUT: sostituisce un quiz esistente con i dati nuovi
router.put('/:id', (req, res) => {
  const esito = archivio.modifica(Number(req.params.id), req.body, req.utente);
  if (esito.errore) {
    // 403 = vietato (non è il tuo quiz), 404 = non esiste, 400 = dati non validi
    return res.status(esito.codice).json({ errore: esito.errore });
  }
  res.json(esito.quiz);
});

router.delete('/:id', (req, res) => {
  const errore = archivio.elimina(Number(req.params.id), req.utente);
  if (errore) {
    return res.status(errore.codice).json({ errore: errore.errore });
  }
  res.json({ eliminato: Number(req.params.id) });
});

module.exports = router;
