// =====================================================================
//  public/effetti.js — animazioni e interazioni condivise dalle pagine
//
//  Le animazioni semplici (entrate, pressioni, battito del timer) sono
//  tutte nel CSS. Qui ci sono solo quelle che hanno bisogno di JavaScript:
//    ripeti(el, classe)        fa ripartire un'animazione CSS
//    scuoti(el)                scuote un elemento (errore)
//    vibra(schema)             vibrazione del telefono, se c'è
//    contaSu(el, da, a, ...)   numero che sale fino al valore finale
//    coriandoli(quanti)        pioggia di coriandoli nei colori delle risposte
//    disegnaClassifica(...)    classifica con le righe che scorrono al nuovo posto
//    disegnaPodio(...)         podio dei primi tre che sale dal basso
//    puntiACapo(testo)         dove può andare a capo il testo di una risposta
//
//  Se il sistema chiede "riduci movimento" gli effetti si spengono.
// =====================================================================

// [JS] matchMedia legge le preferenze del sistema operativo
const movimentoRidotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Un'animazione CSS parte solo quando la classe viene aggiunta: per farla
// ripartire tolgo la classe, forzo il browser a ricalcolare (offsetWidth)
// e la rimetto.
function ripeti(el, classe) {
  el.classList.remove(classe);
  void el.offsetWidth;
  el.classList.add(classe);
}

function scuoti(el) {
  ripeti(el, 'scuoti');
  vibra(80);
}

// [JS] navigator.vibrate esiste solo su alcuni telefoni (Android): se manca non faccio nulla
function vibra(schema) {
  if (navigator.vibrate) navigator.vibrate(schema);
}

// Le risposte possono essere codice senza spazi (ws_server.clients.forEach(...)):
// dopo . ( , = aggiungo uno spazio invisibile (​), così il browser va a capo
// lì invece che a metà di una parola. Con una regex li aggiungo tutti in un colpo.
function puntiACapo(testo) {
  return testo.replace(/([.(,=])/g, '$1​');
}

// Fa salire il numero mostrato da "da" ad "a" in "durata" millisecondi.
// requestAnimationFrame chiama la funzione a ogni fotogramma (circa 60 al secondo).
function contaSu(el, da, a, durata = 800, prefisso = '') {
  if (movimentoRidotto || da === a) {
    el.textContent = prefisso + a;
    return;
  }
  const inizio = performance.now();
  function passo(adesso) {
    // t va da 0 (inizio) a 1 (fine): quanta parte dell'animazione è passata
    const t = Math.min(1, (adesso - inizio) / durata);
    const morbido = 1 - Math.pow(1 - t, 3);          // rallenta verso la fine
    // passo chiama di nuovo sé stessa al fotogramma dopo, finché t non arriva a 1
    el.textContent = prefisso + Math.round(da + (a - da) * morbido);
    if (t < 1) requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
}

// Coriandoli disegnati su un <canvas> sopra la pagina, che poi si toglie da solo
function coriandoli(quanti = 140) {
  if (movimentoRidotto) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'coriandoli';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // i colori li leggo dalle variabili CSS del design system
  const stile = getComputedStyle(document.documentElement);
  const colori = ['--risposta-a', '--risposta-b', '--risposta-c', '--risposta-d', '--podio']
    .map((nome) => stile.getPropertyValue(nome).trim());

  const pezzi = [];
  for (let i = 0; i < quanti; i++) {
    pezzi.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.3,
      y: canvas.height * 0.35,
      vx: (Math.random() - 0.5) * 14,                // velocità orizzontale
      vy: -Math.random() * 14 - 4,                   // spinta verso l'alto
      giro: Math.random() * Math.PI,
      vgiro: (Math.random() - 0.5) * 0.3,
      lato: 6 + Math.random() * 8,
      colore: colori[i % colori.length],
    });
  }

  const inizio = performance.now();
  function fotogramma(adesso) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pezzi.forEach((p) => {
      p.vy += 0.35;            // gravità
      p.vx *= 0.99;            // attrito dell'aria
      p.x += p.vx;
      p.y += p.vy;
      p.giro += p.vgiro;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.fillStyle = p.colore;
      ctx.fillRect(-p.lato / 2, -p.lato / 4, p.lato, p.lato / 2);
      ctx.restore();
    });
    if (adesso - inizio < 3000) requestAnimationFrame(fotogramma);
    else canvas.remove();
  }
  requestAnimationFrame(fotogramma);
}

// ---------------------------------------------------------------------
// Classifica animata
// ---------------------------------------------------------------------

// Ricorda posizione e punti di ogni nome della classifica precedente,
// così la nuova può far scorrere le righe e far salire i punti.
let classificaPrecedente = {};

function dimenticaClassifica() {
  classificaPrecedente = {};
}

// lista: l'elemento <ol class="classifica">; classifica: array dal server;
// mioNome (facoltativo): la riga da evidenziare con .io
function disegnaClassifica(lista, classifica, mioNome) {
  lista.innerHTML = '';
  const righe = classifica.map((g, i) => {
    const riga = document.createElement('li');
    riga.innerHTML = '<span class="nome"></span><span class="guadagno"></span><span class="punti"></span>';
    riga.children[0].textContent = g.nome;   // textContent: il nome non viene letto come HTML
    riga.children[1].textContent = g.guadagno > 0 ? '+' + g.guadagno : '';
    if (g.nome === mioNome) riga.classList.add('io');
    riga.style.setProperty('--i', i);         // ritardo a cascata, usato dal CSS
    lista.appendChild(riga);

    // prima = com'era questo giocatore nella classifica precedente
    // (undefined se è la prima classifica o se è appena entrato)
    const prima = classificaPrecedente[g.nome];
    contaSu(riga.children[2], prima ? prima.punti : 0, g.punti, 900);
    if (!prima) riga.classList.add('nuova');
    // { riga, prima, i } è un modo breve per scrivere { riga: riga, prima: prima, i: i }
    return { riga, prima, i };
  });

  // Le righe che c'erano già partono dalla vecchia posizione e scorrono
  // fino alla nuova (Web Animations API: element.animate)
  if (!movimentoRidotto) {
    righe.forEach(({ riga, prima, i }) => {
      if (!prima || prima.posizione === i) return;
      // la riga è già al posto nuovo: la sposto indietro di "salto" pixel (dove era
      // prima) e la faccio tornare a zero. Chi sale da 3° a 1° parte 2 righe più in
      // basso; +8 è lo spazio tra le righe (gap della lista nel CSS)
      const salto = (prima.posizione - i) * (riga.offsetHeight + 8);
      riga.animate(
        [{ transform: 'translateY(' + salto + 'px)' }, { transform: 'none' }],
        { duration: 700, easing: 'cubic-bezier(.2, .8, .2, 1)', delay: 150 }
      );
    });
  }

  classificaPrecedente = {};
  classifica.forEach((g, i) => (classificaPrecedente[g.nome] = { posizione: i, punti: g.punti }));
}

// Podio dei primi tre: l'ordine dei gradini è 2° 1° 3°, come alle gare
function disegnaPodio(contenitore, classifica) {
  contenitore.innerHTML = '';
  [1, 0, 2].forEach((posizione) => {
    const g = classifica[posizione];
    if (!g) return;
    const gradino = document.createElement('div');
    gradino.className = 'gradino p' + (posizione + 1);
    gradino.innerHTML = '<span class="nome"></span><span class="punti"></span><div class="blocco"></div>';
    gradino.querySelector('.nome').textContent = g.nome;
    gradino.querySelector('.punti').textContent = g.punti + ' punti';
    gradino.querySelector('.blocco').textContent = posizione + 1;
    contenitore.appendChild(gradino);
  });
  // i coriandoli partono quando sale il primo gradino
  setTimeout(() => coriandoli(180), 1100);
}
