// Pagina del docente: mostra la sala, le domande sul proiettore e la classifica.

const VISTE = ['v-attesa', 'v-domanda', 'v-classifica'];

const conn = collega({
  apertura: (ws) => {
    $('scollegato').classList.add('nascosto');
    conn.manda({ tipo: 'host' });
  },
  messaggio: (msg) => {
    if (msg.tipo === 'stato') disegna(msg);
    if (msg.tipo === 'sostituito') {
      document.body.innerHTML = '<main class="pagina"><p>Il quiz è stato aperto in un\'altra scheda.</p></main>';
    }
  },
  chiusura: () => $('scollegato').classList.remove('nascosto'),
});

$('b-avvia').onclick = () => conn.manda({ tipo: 'avanti' });
$('b-avanti').onclick = () => conn.manda({ tipo: 'avanti' });
$('b-prossima').onclick = () => conn.manda({ tipo: 'avanti' });
$('b-ricomincia').onclick = () => {
  if (confirm('Ricominciare da capo? I punti vengono azzerati.')) conn.manda({ tipo: 'ricomincia' });
};

function disegna(s) {
  $('avanzamento').textContent = s.indice >= 0 ? `Domanda ${s.indice + 1} di ${s.totale}` : `${s.totale} domande`;

  if (s.fase === 'attesa') {
    mostra('v-attesa', VISTE);
    $('indirizzo').textContent = s.indirizzi[0] || location.origin;
    $('n-giocatori').textContent = s.giocatori.length;
    const lista = $('lista-nomi');
    lista.replaceChildren(...s.giocatori.map((g) => el('li', '', g.nome)));
    $('b-avvia').disabled = s.giocatori.length === 0;
    return;
  }

  if (s.fase === 'domanda' || s.fase === 'soluzione') {
    mostra('v-domanda', VISTE);
    $('testo-domanda').textContent = s.domanda.testo;
    const collegati = s.giocatori.filter((g) => g.connesso).length;
    $('risposte-date').textContent = `${s.risposteDate} / ${collegati} risposte`;

    const box = $('risposte');
    box.replaceChildren(...s.domanda.risposte.map((r, i) => {
      const b = el('div', 'risposta');
      b.dataset.i = i;
      b.append(el('span', 'lettera', LETTERE[i]), el('span', '', r));
      if (s.fase === 'soluzione') {
        b.append(el('span', 'conteggio', s.distribuzione[i]));
        b.classList.add(i === s.corretta ? 'giusta' : 'spenta');
      }
      return b;
    }));

    if (s.fase === 'domanda') {
      avviaConto(s.rimanenti, s.domanda.tempo * 1000, $('secondi'), $('barra'));
      $('b-avanti').textContent = 'Chiudi la domanda';
    } else {
      fermaConto();
      $('secondi').textContent = '0';
      $('barra').style.transform = 'scaleX(0)';
      $('b-avanti').textContent = 'Mostra la classifica';
    }
    return;
  }

  // classifica o fine
  mostra('v-classifica', VISTE);
  fermaConto();
  const fine = s.fase === 'fine';
  $('titolo-classifica').textContent = fine ? 'Classifica finale' : 'Classifica';
  $('b-prossima').classList.toggle('nascosto', fine);
  $('b-prossima').textContent = s.indice + 1 < s.totale ? 'Prossima domanda' : 'Fine del quiz';
  $('classifica').replaceChildren(...s.giocatori.slice(0, fine ? 10 : 5).map((g) => {
    const li = el('li', g.connesso ? '' : 'offline');
    li.append(el('span', 'pos', g.posizione), el('span', '', g.nome), el('span', 'punti', g.punti));
    return li;
  }));
}
