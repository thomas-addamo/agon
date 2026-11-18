// Funzioni usate sia dalla pagina del docente sia da quella dello studente.

const LETTERE = ['A', 'B', 'C', 'D'];

const $ = (id) => document.getElementById(id);

function mostra(idVista, tutteLeViste) {
  for (const v of tutteLeViste) $(v).classList.toggle('nascosto', v !== idVista);
}

// Crea un elemento con testo sicuro (textContent, mai innerHTML con i nomi degli studenti).
function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
}

// Collega il WebSocket e si ricollega da solo se cade.
function collega({ apertura, messaggio, chiusura }) {
  let ws;
  function apri() {
    ws = new WebSocket(location.origin.replace(/^http/, 'ws'));
    ws.onopen = () => apertura(ws);
    ws.onmessage = (event) => messaggio(JSON.parse(event.data));
    ws.onclose = () => {
      chiusura();
      setTimeout(apri, 1000);
    };
  }
  apri();
  return {
    manda: (obj) => ws && ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(obj)),
  };
}

// Conto alla rovescia: il server manda i millisecondi rimasti, il browser li conta da sé.
let fineConto = 0;
let durataConto = 1;
let giroConto = null;
function avviaConto(rimanenti, totale, secondiEl, barraEl) {
  fineConto = Date.now() + rimanenti;
  durataConto = totale;
  cancelAnimationFrame(giroConto);
  const giro = () => {
    const resto = Math.max(0, fineConto - Date.now());
    secondiEl.textContent = Math.ceil(resto / 1000);
    barraEl.style.transform = `scaleX(${resto / durataConto})`;
    if (resto > 0) giroConto = requestAnimationFrame(giro);
  };
  giro();
}
function fermaConto() {
  cancelAnimationFrame(giroConto);
}
