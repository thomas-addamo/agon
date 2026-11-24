// =====================================================================
//  moduli/utenti.js — registrazione e login dei docenti
//
//  I docenti sono salvati in docenti.json, IN CHIARO (progetto didattico,
//  nessuna cifratura delle password):
//    { utente, password, registrato, accessi: [data, data, ...] }
//  "accessi" contiene la data e l'ora di ogni login riuscito.
//
//  Dopo il login il server crea un "token": una stringa casuale che il
//  browser conserva e rimanda a ogni richiesta per dimostrare chi è.
//  I token stanno solo in memoria: se il server si riavvia bisogna
//  rifare il login.
// =====================================================================

const fs = require('fs');
const path = require('path');
// [NODE] crypto fa parte di Node: randomUUID genera una stringa casuale unica
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'docenti.json');

// [NODE] fs.existsSync controlla se il file c'è; se manca (per esempio se è
// stato cancellato) lo creo vuoto all'avvio
if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, '[]');
}

// token → nome utente dei docenti collegati, per esempio
//   { '3f2a9c...': 'thomas.addamo', '8b1e04...': 'daniele.porcaro' }
// È un oggetto in memoria, NON un file: per questo i login si perdono a ogni riavvio.
const sessioni = {};

function leggi() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function salva(docenti) {
  fs.writeFileSync(FILE, JSON.stringify(docenti, null, 2));
}

// Se arriva qualcosa che non è una stringa (es. un numero o niente) restituisce '',
// altrimenti toglie gli spazi all'inizio e alla fine (vale anche per la password)
function pulisci(testo) {
  return typeof testo === 'string' ? testo.trim() : '';
}

// Nuovo docente. Restituisce { utente } oppure { errore }.
function registra(utente, password) {
  utente = pulisci(utente);
  password = pulisci(password);
  if (utente === '' || password === '') {
    return { errore: 'Scrivi nome utente e password' };
  }

  const docenti = leggi();
  if (docenti.some((d) => d.utente === utente)) {
    return { errore: 'Nome utente già registrato' };
  }

  // [JS] new Date().toISOString() → data e ora in formato standard
  docenti.push({ utente: utente, password: password, registrato: new Date().toISOString(), accessi: [] });
  salva(docenti);
  return { utente: utente };
}

// Login: se nome e password corrispondono registra l'accesso e crea un token.
// Restituisce { utente, token } oppure { errore }.
function login(utente, password) {
  utente = pulisci(utente);
  password = pulisci(password);

  const docenti = leggi();
  const docente = docenti.find((d) => d.utente === utente && d.password === password);
  if (!docente) {
    return { errore: 'Nome utente o password sbagliati' };
  }

  // find restituisce proprio l'oggetto dentro l'array "docenti" (non una copia):
  // aggiungendo l'accesso a "docente" cambia anche "docenti", che poi salvo
  docente.accessi.push(new Date().toISOString());
  salva(docenti);

  const token = crypto.randomUUID();
  sessioni[token] = utente;
  return { utente: utente, token: token };
}

function logout(token) {
  delete sessioni[token];
}

// Restituisce il nome del docente a cui appartiene il token, oppure null.
// Se il token è sbagliato o manca, sessioni[token] è undefined e "|| null" lo trasforma in null
function utenteDaToken(token) {
  return sessioni[token] || null;
}

// [EXPRESS] middleware che protegge le rotte: legge il token dall'intestazione
// Authorization della richiesta. Se è valido salva il nome in req.utente e
// passa avanti con next(), altrimenti risponde 401 (non autorizzato).
function richiediLogin(req, res, next) {
  const utente = utenteDaToken(req.get('Authorization'));
  if (utente === null) {
    return res.status(401).json({ errore: 'Devi fare il login' });
  }
  // req è un oggetto: aggiungo "utente", così le rotte che vengono dopo
  // (per esempio in rotte/quiz.js) sanno chi sta facendo la richiesta
  req.utente = utente;
  next();
}

module.exports = { registra, login, logout, utenteDaToken, richiediLogin };
