// =====================================================================
//  public/sessione.js — il login del docente, condiviso dalle pagine
//  /docente, /editor e /conduci
//
//  Il token arriva dalla pagina di login ed è salvato nel browser
//  (localStorage). Senza token si torna al login.
//
//  ATTENZIONE: questo file va caricato PRIMA dello script della pagina.
//  token, api() e vaiAlLogin() sono dichiarati qui ma usati là: i file
//  caricati con <script src> nella stessa pagina condividono le variabili.
// =====================================================================

const token = localStorage.getItem('agon-token');
if (!token) location.href = '/login';

function vaiAlLogin() {
  localStorage.removeItem('agon-token');
  localStorage.removeItem('agon-docente');
  location.href = '/login';
}

// [JS] fetch verso le API protette: aggiungo sempre il token nell'intestazione
// Authorization. Se il server risponde 401 il token non vale più (per esempio
// il server è stato riavviato) e torno al login.
async function api(indirizzo, opzioni = {}) {
  // Object.assign unisce due oggetti: il token più le intestazioni passate dalla
  // pagina (per esempio Content-Type per le POST), senza perdere nessuna delle due
  opzioni.headers = Object.assign({ Authorization: token }, opzioni.headers);
  const risposta = await fetch(indirizzo, opzioni);
  if (risposta.status === 401) vaiAlLogin();
  return risposta;
}

// nome del docente e pulsante "Esci" nella barra in alto
// (lo script è in fondo alla pagina, quindi la barra esiste già)
document.getElementById('nome-docente').textContent = localStorage.getItem('agon-docente');
document.getElementById('esci').addEventListener('click', async () => {
  await fetch('/utenti/logout', { method: 'POST', headers: { Authorization: token } });
  vaiAlLogin();
});
