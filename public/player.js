// Pagina dello studente: entra con un nome e risponde dal telefono.

const VISTE = ['v-entra', 'v-attesa', 'v-domanda', 'v-inviata', 'v-esito', 'v-fine'];

// id e nome restano nel browser, così dopo un refresh si rientra nella stessa partita
function leggi(chiave) {
  try { return localStorage.getItem(chiave); } catch { return null; }
}
function salva(chiave, valore) {
  try { localStorage.setItem(chiave, valore); } catch {}
}

let ultimaDomanda = -1;

const conn = collega({
  apertura: () => {
    $('scollegato').classList.add('nascosto');
    const id = leggi('agon-id');
    const nome = leggi('agon-nome');
    if (id || nome) conn.manda({ tipo: 'entra', id, nome });
    else mostra('v-entra', VISTE);
  },
  messaggio: (msg) => {
    if (msg.tipo === 'errore') {
      mostra('v-entra', VISTE);
      $('nome').value = leggi('agon-nome') || '';
      $('errore').textContent = msg.testo;
    }
    if (msg.tipo === 'stato') disegna(msg);
  },
  chiusura: () => $('scollegato').classList.remove('nascosto'),
});

$('form-entra').onsubmit = (e) => {
  e.preventDefault();
  const nome = $('nome').value.trim();
  if (!nome) return;
  $('errore').textContent = '';
  salva('agon-nome', nome);
  conn.manda({ tipo: 'entra', nome });
};

function disegna(s) {
  salva('agon-id', s.io.id);
  salva('agon-nome', s.io.nome);
  $('chi').textContent = `${s.io.nome} · ${s.io.punti} pt`;

  if (s.fase === 'attesa') {
    ultimaDomanda = -1;
    mostra('v-attesa', VISTE);
    $('attesa-info').textContent = `Siete in ${s.numeroGiocatori}. Aspetta che il docente faccia partire il quiz.`;
    return;
  }

  if (s.fase === 'domanda') {
    if (s.risposta !== null) {
      mostra('v-inviata', VISTE);
      fermaConto();
      return;
    }
    mostra('v-domanda', VISTE);
    $('numero-domanda').textContent = `Domanda ${s.indice + 1} di ${s.totale}`;
    $('testo-domanda').textContent = s.domanda.testo;
    avviaConto(s.rimanenti, s.domanda.tempo * 1000, $('secondi'), $('barra'));
    // ridisegna i bottoni solo quando cambia domanda, così un tocco non si perde
    if (ultimaDomanda !== s.indice) {
      ultimaDomanda = s.indice;
      $('risposte').replaceChildren(...s.domanda.risposte.map((r, i) => {
        const b = el('button', 'risposta');
        b.dataset.i = i;
        b.append(el('span', 'lettera', LETTERE[i]), el('span', '', r));
        b.onclick = () => {
          conn.manda({ tipo: 'risposta', scelta: i });
          mostra('v-inviata', VISTE);
          fermaConto();
        };
        return b;
      }));
    }
    return;
  }

  fermaConto();

  if (s.fase === 'soluzione' || s.fase === 'classifica') {
    mostra('v-esito', VISTE);
    const e = s.esito;
    if (e.risposta === null) {
      $('esito-icona').textContent = '⌛';
      $('esito-titolo').textContent = 'Tempo scaduto';
      $('esito-titolo').className = 'ko';
    } else if (e.giusta) {
      $('esito-icona').textContent = '🎉';
      $('esito-titolo').textContent = 'Giusto!';
      $('esito-titolo').className = 'ok';
    } else {
      $('esito-icona').textContent = '✗';
      $('esito-titolo').textContent = 'Sbagliato';
      $('esito-titolo').className = 'ko';
    }
    $('esito-dettaglio').textContent = e.giusta ? '' : `La risposta giusta era: ${e.corretta}`;
    $('esito-punti').textContent = `+${e.guadagno} punti · sei ${s.io.posizione}°`;
    return;
  }

  if (s.fase === 'fine') {
    mostra('v-fine', VISTE);
    $('fine-posizione').textContent = `Posizione ${s.io.posizione} su ${s.numeroGiocatori}`;
    $('fine-punti').textContent = `${s.io.punti} punti`;
  }
}
