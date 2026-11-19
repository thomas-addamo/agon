// =====================================================================
//  rotte/domande.js — API REST per gestire le domande
//
//  In server.js questo Router è montato su /domande, quindi:
//    GET    /domande      → elenco delle domande
//    POST   /domande      → aggiunge una domanda (dati JSON nel corpo)
//    DELETE /domande/:id  → elimina la domanda con quell'id
//
//  Le domande si gestiscono con HTTP, il quiz dal vivo con WebSocket.
//  Tutte le rotte sono riservate ai docenti che hanno fatto il login.
// =====================================================================

const express = require('express');
const archivio = require('../moduli/archivio');
const utenti = require('../moduli/utenti');

// [EXPRESS] express.Router() crea un gruppo di rotte da montare nell'app
const router = express.Router();

// [EXPRESS] router.use applica il middleware a TUTTE le rotte di questo Router:
// senza login non si possono né leggere (contengono le risposte giuste!)
// né modificare le domande
router.use(utenti.richiediLogin);

// [EXPRESS] rotta GET: res.json converte l'array in JSON e lo manda al browser
router.get('/', (req, res) => {
  res.json(archivio.leggi());
});

// [EXPRESS] rotta POST: i dati arrivano in req.body grazie a express.json()
router.post('/', (req, res) => {
  const esito = archivio.aggiungi(req.body);

  if (esito.errore) {
    // [EXPRESS] res.status imposta il codice HTTP: 400 = dati non validi
    return res.status(400).json({ errore: esito.errore });
  }
  // 201 = creato
  res.status(201).json(esito.domanda);
});

// [EXPRESS] rotta con parametro: il valore di :id si legge in req.params.id
// (è sempre una stringa, quindi lo converto in numero)
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!archivio.elimina(id)) {
    // 404 = non trovato
    return res.status(404).json({ errore: 'Domanda non trovata' });
  }
  res.json({ eliminata: id });
});

module.exports = router;
