// =====================================================================
//  moduli/archivio.js — le domande salvate nel file domande.json
//
//  Ogni domanda ha la stessa forma, sia a risposta multipla sia vero/falso:
//    { id, tipo: 'multipla' | 'vf', testo, risposte: [...], corretta }
//  Il vero/falso è una domanda con le risposte ['Vero', 'Falso'],
//  così il resto del programma tratta i due tipi nello stesso modo.
// =====================================================================

// [NODE] fs (file system) e path fanno parte di Node, non vanno installati
const fs = require('fs');
const path = require('path');

// [NODE] path.join costruisce il percorso del file in modo corretto su ogni sistema
const FILE = path.join(__dirname, '..', 'domande.json');

// [NODE] readFileSync legge il file come testo, JSON.parse lo trasforma in array
function leggi() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

// [NODE] writeFileSync sovrascrive il file: le domande restano dopo un riavvio.
// Gli argomenti null, 2 di JSON.stringify servono solo a tenere il file leggibile.
function salva(domande) {
  fs.writeFileSync(FILE, JSON.stringify(domande, null, 2));
}

// Controlla i dati arrivati dal docente e, se vanno bene, salva la domanda.
// Restituisce { domanda } oppure { errore } con il motivo.
function aggiungi(dati) {
  const testo = typeof dati.testo === 'string' ? dati.testo.trim() : '';
  if (testo === '') {
    return { errore: 'Scrivi il testo della domanda' };
  }

  let risposte;
  if (dati.tipo === 'vf') {
    risposte = ['Vero', 'Falso'];
  } else if (dati.tipo === 'multipla') {
    if (!Array.isArray(dati.risposte) || dati.risposte.length !== 4) {
      return { errore: 'Servono 4 risposte' };
    }
    risposte = dati.risposte.map((r) => String(r).trim());
    if (risposte.some((r) => r === '')) {
      return { errore: 'Compila tutte e 4 le risposte' };
    }
  } else {
    return { errore: 'Tipo di domanda non valido' };
  }

  const corretta = Number(dati.corretta);
  if (!Number.isInteger(corretta) || corretta < 0 || corretta >= risposte.length) {
    return { errore: 'Scegli la risposta giusta' };
  }

  const domande = leggi();
  // il nuovo id è il più grande già usato + 1
  const id = domande.length > 0 ? Math.max(...domande.map((d) => d.id)) + 1 : 1;
  const domanda = { id: id, tipo: dati.tipo, testo: testo, risposte: risposte, corretta: corretta };

  domande.push(domanda);
  salva(domande);
  return { domanda: domanda };
}

// Elimina la domanda con quell'id. Restituisce false se non esiste.
function elimina(id) {
  const domande = leggi();
  const rimaste = domande.filter((d) => d.id !== id);
  if (rimaste.length === domande.length) {
    return false;
  }
  salva(rimaste);
  return true;
}

// [NODE] module.exports: le funzioni che gli altri file possono usare con require
module.exports = { leggi, aggiungi, elimina };
