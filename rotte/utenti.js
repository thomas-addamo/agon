// =====================================================================
//  rotte/utenti.js — registrazione, login e logout dei docenti
//
//  In server.js questo Router è montato su /utenti, quindi:
//    POST /utenti/registrazione  → { utente, password }  crea un docente
//    POST /utenti/login          → { utente, password }  restituisce il token
//    POST /utenti/logout         → (token nell'intestazione Authorization)
// =====================================================================

const express = require('express');
const utenti = require('../moduli/utenti');

const router = express.Router();

router.post('/registrazione', (req, res) => {
  const esito = utenti.registra(req.body.utente, req.body.password);
  if (esito.errore) {
    return res.status(400).json({ errore: esito.errore });
  }
  res.status(201).json(esito);
});

router.post('/login', (req, res) => {
  const esito = utenti.login(req.body.utente, req.body.password);
  if (esito.errore) {
    // 401 = credenziali non valide
    return res.status(401).json({ errore: esito.errore });
  }
  console.log('Login del docente ' + esito.utente);
  res.json(esito);
});

// [EXPRESS] il middleware richiediLogin viene eseguito prima della rotta:
// se il token non è valido la rotta non parte nemmeno
router.post('/logout', utenti.richiediLogin, (req, res) => {
  utenti.logout(req.get('Authorization'));
  console.log('Logout del docente ' + req.utente);
  res.json({ uscito: req.utente });
});

module.exports = router;
