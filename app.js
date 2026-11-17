'use strict';
/* Diario Alimentare – PWA senza dipendenze. Dati in localStorage ('dieta.v1'). */

const KEY = 'dieta.v1';
const VERSIONE = '1.0.1';
const PASTI = [
  { id: 'col', nome: 'Colazione', ico: '☕', h: 5 },
  { id: 'spu', nome: 'Spuntino', ico: '🍎', h: 10 },
  { id: 'pra', nome: 'Pranzo', ico: '🍝', h: 12 },
  { id: 'mer', nome: 'Merenda', ico: '🥪', h: 15 },
  { id: 'cen', nome: 'Cena', ico: '🍽️', h: 18 }
];
const ATTIVITA = [
  [1.2, 'Sedentario: lavoro seduto, poco movimento'],
  [1.375, 'Leggero: 1-3 allenamenti a settimana'],
  [1.55, 'Moderato: 3-5 allenamenti a settimana'],
  [1.725, 'Intenso: 6-7 allenamenti a settimana'],
  [1.9, 'Molto intenso: lavoro fisico e sport']
];
const RITMI = [[0.25, '0,25 kg a settimana (graduale)'], [0.5, '0,5 kg a settimana (consigliato)'], [0.75, '0,75 kg a settimana'], [1, '1 kg a settimana (impegnativo)']];
const OFF = 'https://world.openfoodfacts.org';
const OFF_IT = 'https://it.openfoodfacts.org';
const CAMPI = 'code,product_name,product_name_it,generic_name_it,brands,nutriments,serving_quantity';

/* ---------- utilità ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const r1 = n => Math.round(n * 10) / 10;
const f0 = n => Math.round(n).toLocaleString('it-IT');
const f1 = n => r1(n).toLocaleString('it-IT');
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const z2 = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
const oggi = () => iso(new Date());
const dt = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const piuGiorni = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
const giorniTra = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MM = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const dataBreve = s => { const d = dt(s); return `${GG[d.getDay()]} ${d.getDate()} ${MM[d.getMonth()]}`; };
const dataLunga = s => { const d = dt(s); return `${d.getDate()} ${MM[d.getMonth()]} ${d.getFullYear()}`; };
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const scala = (t, f) => ({ kcal: t.kcal * f, p: t.p * f, c: t.c * f, g: t.g * f });
const arrot = t => ({ kcal: r1(t.kcal), p: r1(t.p), c: r1(t.c), g: r1(t.g) });
const nomePasto = id => PASTI.find(p => p.id === id)?.nome || id;
function pastoAdesso() { const h = new Date().getHours(); let r = 'cen'; if (h < 5) return 'cen'; for (const p of PASTI) if (h >= p.h) r = p.id; return r; }

/* ---------- stato ---------- */
function nuovo() {
  return {
    v: 1,
    profilo: { configurato: false, sesso: 'M', eta: '', altezza: '', attivita: 1.375, obiettivo: '', ritmo: 0.5, fabbManuale: '', protKg: 1.6, grassiPct: 30, acqua: 2000 },
    pesi: [], alimenti: [], ricette: [], diario: {}, recenti: [], ultimeQ: {}, preferiti: []
  };
}
function carica() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v) { const n = nuovo(); for (const k in n) if (s[k] === undefined) s[k] = n[k]; s.profilo = Object.assign(n.profilo, s.profilo); return s; }
  } catch (e) { }
  return nuovo();
}
let S = carica();
function salva() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Errore nel salvataggio: memoria piena?'); } }

const BASE = ALIMENTI_BASE.map((a, i) => ({ id: 'b' + i, nome: a[0], cat: a[1], kcal: a[2], p: a[3], c: a[4], g: a[5], porz: a[6] || 0, porzNome: a[7] || 'porzione', fonte: 'base' }));
const BASE_MAP = Object.fromEntries(BASE.map(a => [a.id, a]));
const alimento = id => BASE_MAP[id] || S.alimenti.find(a => a.id === id) || null;
const ricetta = id => S.ricette.find(r => r.id === id) || null;
const isPref = id => S.preferiti.includes(id);

function calcRicetta(r) {
  const t = { kcal: 0, p: 0, c: 0, g: 0 }; let crudo = 0;
  for (const ing of r.ingredienti) {
    const a = alimento(ing.id) || ing.k100 && { ...ing.k100 };
    crudo += num(ing.q);
    if (!a) continue;
    const f = num(ing.q) / 100; t.kcal += a.kcal * f; t.p += a.p * f; t.c += a.c * f; t.g += a.g * f;
  }
  const peso = num(r.pesoCotto) || crudo, porz = Math.max(1, num(r.porzioni) || 1);
  return { tot: t, crudo, peso, porz, per100: peso ? scala(t, 100 / peso) : scala(t, 0), perPorz: scala(t, 1 / porz), gPorz: peso / porz };
}
function voceDa(id) {
  if (id[0] === 'r') {
    const r = ricetta(id); if (!r) return null; const k = calcRicetta(r);
    return { tipo: 'ric', id, nome: r.nome, brand: 'Ricetta', ...k.per100, porz: Math.round(k.gPorz), porzNome: 'porzione', fonte: 'ric' };
  }
  const a = alimento(id); return a ? { tipo: 'al', ...a } : null;
}

/* ---------- calcoli ---------- */
const giorno = d => S.diario[d] || { voci: [], acqua: 0 };
const giornoW = d => S.diario[d] || (S.diario[d] = { voci: [], acqua: 0 });
const totali = voci => voci.reduce((t, v) => ({ kcal: t.kcal + v.kcal, p: t.p + (v.p || 0), c: t.c + (v.c || 0), g: t.g + (v.g || 0) }), { kcal: 0, p: 0, c: 0, g: 0 });
const pesiOrd = () => [...S.pesi].sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
function pesoAttuale() { const p = pesiOrd(); return p.length ? p[p.length - 1].kg : null; }

function piano(P = S.profilo, w = pesoAttuale()) {
  const eta = num(P.eta), alt = num(P.altezza);
  if (!w || !eta || !alt) return null;
  const bmr = 10 * w + 6.25 * alt - 5 * eta + (P.sesso === 'F' ? -161 : 5);
  const tdeeCalc = bmr * num(P.attivita), man = num(P.fabbManuale), tdee = man || tdeeCalc;
  const ob = num(P.obiettivo);
  const dir = !ob || Math.abs(ob - w) < 0.3 ? 0 : (ob < w ? -1 : 1);
  const note = [];
  let delta = dir * num(P.ritmo) * 7700 / 7;
  if (dir < 0 && -delta > tdee * 0.25) { delta = -tdee * 0.25; note.push('Il deficit è stato limitato al 25% del fabbisogno, oltre è difficile da sostenere e si rischia di perdere massa muscolare.'); }
  if (dir > 0 && delta > 500) { delta = 500; note.push('Il surplus è stato limitato a 500 kcal al giorno.'); }
  const minK = P.sesso === 'F' ? 1200 : 1500;
  let target = tdee + delta;
  if (dir < 0 && target < minK) { target = Math.min(minK, tdee); note.push(`L'obiettivo non scende sotto ${minK} kcal, la soglia minima indicativa senza controllo medico.`); }
  target = Math.round(target / 10) * 10; delta = target - tdee;
  const kgRif = dir < 0 ? ob : w;
  const prot = Math.round(num(P.protKg) * kgRif);
  const grassi = Math.round(target * num(P.grassiPct) / 100 / 9);
  const carbo = Math.max(0, Math.round((target - prot * 4 - grassi * 9) / 4));
  const kgSett = delta * 7 / 7700;
  let settimane = null, arrivo = null;
  if (dir && Math.abs(kgSett) > 0.01) { settimane = Math.abs(ob - w) / Math.abs(kgSett); arrivo = piuGiorni(oggi(), Math.ceil(settimane * 7)); }
  const h = alt / 100, bmi = w / (h * h), bmiOb = ob ? ob / (h * h) : null;
  if (bmiOb && bmiOb < 18.5) note.push('Il peso obiettivo corrisponde a un IMC sotto 18,5 (sottopeso): valuta un obiettivo diverso.');
  return { w, bmr, tdee, tdeeCalc, man: !!man, ob, dir, delta, target, prot, grassi, carbo, kgSett, settimane, arrivo, bmi, bmiOb, note };
}
function mediaMobile(arr) {
  return arr.map(p => { const da = piuGiorni(p.d, -6); const f = arr.filter(x => x.d >= da && x.d <= p.d); return { d: p.d, kg: f.reduce((s, x) => s + x.kg, 0) / f.length }; });
}
function ritmoReale(arr) {
  const da = piuGiorni(oggi(), -28), a = arr.filter(p => p.d >= da);
  if (a.length < 3) return null;
  const xs = a.map(p => giorniTra(a[0].d, p.d)), ys = a.map(p => p.kg);
  if (xs[xs.length - 1] < 10) return null;
  const n = a.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
  let nu = 0, de = 0; xs.forEach((x, i) => { nu += (x - mx) * (ys[i] - my); de += (x - mx) ** 2; });
  return de ? nu / de * 7 : null;
}
function serie() {
  let d = oggi(), n = 0;
  if (!giorno(d).voci.length) d = piuGiorni(d, -1);
  while (giorno(d).voci.length) { n++; d = piuGiorni(d, -1); }
  return n;
}

/* ---------- interfaccia: modali ---------- */
const pila = []; let guardia = false;
function modal(html, { cls = '', onClose } = {}) {
  const el = document.createElement('div');
  el.className = 'modal ' + cls;
  el.innerHTML = `<div class="modal-box">${html}</div>`;
  el.addEventListener('click', e => { if (e.target === el) chiudi(); });
  document.body.appendChild(el);
  pila.push({ el, onClose });
  document.body.classList.add('noscroll');
  if (!guardia) { history.pushState({ m: 1 }, ''); guardia = true; }
  return el.querySelector('.modal-box');
}
function chiudi() {
  const m = pila.pop(); if (!m) return;
  m.el.remove(); m.onClose?.();
  if (!pila.length) document.body.classList.remove('noscroll');
}
function chiudiFino(n) { while (pila.length > n) chiudi(); }
window.addEventListener('popstate', () => {
  guardia = false;
  if (pila.length) { chiudi(); if (pila.length) { history.pushState({ m: 1 }, ''); guardia = true; } }
});
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600); }
function conferma(testo, ok, etichetta = 'Conferma', pericolo = true) {
  modal(`<h3>${esc(testo)}</h3><div class="btns"><button data-act="chiudi">Annulla</button><button class="${pericolo ? 'danger' : 'primary'}" id="cfOk">${esc(etichetta)}</button></div>`);
  $('#cfOk').onclick = () => { chiudi(); ok(); };
}

/* ---------- viste ---------- */
let vista = 'oggi', giornoSel = oggi(), filtroAl = 'tutti', qAl = '';
const TITOLI = { oggi: 'Diario', alimenti: 'Alimenti', ricette: 'Ricette', progressi: 'Progressi', altro: 'Altro' };
function render() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === vista));
  $('#titolo').textContent = TITOLI[vista];
  const y = window.scrollY;
  $('#main').innerHTML = { oggi: vOggi, alimenti: vAlimenti, ricette: vRicette, progressi: vProgressi, altro: vAltro }[vista]();
  window.scrollTo(0, y);
}

function anello(pct, col) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(pct, 1));
  return `<svg viewBox="0 0 120 120" class="ring"><circle cx="60" cy="60" r="${r}" class="rbg"/><circle cx="60" cy="60" r="${r}" class="rfg" style="stroke:${col}" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/></svg>`;
}
function barra(lab, val, tgt, col) {
  const pct = tgt ? Math.min(100, val / tgt * 100) : 0;
  return `<div class="mb"><span class="ml">${lab}</span><div class="bar"><i style="width:${pct}%;background:${col}"></i></div><span class="mv">${f0(val)}${tgt ? '/' + f0(tgt) : ''} g</span></div>`;
}
function riepilogo(T, pl, d) {
  if (!pl) {
    return `<div class="card riep"><div class="ringwrap">${anello(0, 'var(--ok)')}<div class="ringtxt"><b>${f0(T.kcal)}</b><span>kcal</span></div></div>
    <div class="rdx">${barra('Proteine', T.p, 0, 'var(--p)')}${barra('Carboidrati', T.c, 0, 'var(--c)')}${barra('Grassi', T.g, 0, 'var(--g)')}</div></div>`;
  }
  const pct = T.kcal / pl.target, resto = pl.target - T.kcal;
  let col = 'var(--ok)', stato;
  if (!T.kcal) stato = `Obiettivo di oggi: <b>${f0(pl.target)} kcal</b>`;
  else if (pct < 0.9) stato = `Restano <b>${f0(resto)} kcal</b>`;
  else if (pct <= 1) { col = 'var(--quasi)'; stato = `Ci sei quasi: restano <b>${f0(resto)} kcal</b>`; }
  else if (pct <= 1.1) { col = 'var(--warn)'; stato = `Sopra l'obiettivo di <b>${f0(-resto)} kcal</b>`; }
  else { col = 'var(--bad)'; stato = `Sopra l'obiettivo di <b>${f0(-resto)} kcal</b>`; }
  const bil = pl.tdee - T.kcal;
  const bilTxt = !T.kcal ? '' : bil >= 0
    ? `Deficit sul fabbisogno: <b>${f0(bil)}</b> kcal${pl.dir < 0 ? ` (previsto ${f0(-pl.delta)})` : ''}`
    : `Surplus sul fabbisogno: <b>${f0(-bil)}</b> kcal`;
  return `<div class="card riep"><div class="ringwrap">${anello(pct, col)}<div class="ringtxt"><b>${f0(T.kcal)}</b><span>di ${f0(pl.target)} kcal</span></div></div>
  <div class="rdx"><div class="stato" style="color:${col}">${stato}</div>${bilTxt ? `<div class="bil">${bilTxt}</div>` : ''}
  ${barra('Proteine', T.p, pl.prot, 'var(--p)')}${barra('Carboidrati', T.c, pl.carbo, 'var(--c)')}${barra('Grassi', T.g, pl.grassi, 'var(--g)')}</div></div>`;
}
function vOggi() {
  const d = giornoSel, G = giorno(d), T = totali(G.voci), pl = piano();
  const ieri = giorno(piuGiorni(d, -1));
  let h = `<div class="datanav"><button data-act="giorno" data-n="-1" aria-label="Giorno precedente">‹</button><button class="dlab" data-act="giornoOggi">${d === oggi() ? 'Oggi · ' : d === piuGiorni(oggi(), -1) ? 'Ieri · ' : ''}${dataBreve(d)}</button><button data-act="giorno" data-n="1" aria-label="Giorno successivo">›</button></div>`;
  if (!pl) h += `<div class="card banner"><b>Imposta il tuo profilo</b><p>Con peso, altezza, età e attività calcolo il fabbisogno, il deficit giusto e l'obiettivo di calorie del giorno.</p><button class="primary" data-act="profilo">Imposta il profilo</button></div>`;
  h += riepilogo(T, pl, d);
  for (const P of PASTI) {
    const voci = G.voci.filter(v => v.pasto === P.id), t = totali(voci);
    const daIeri = !voci.length && ieri.voci.some(v => v.pasto === P.id);
    h += `<section class="card pasto"><div class="ph"><span>${P.ico} <b>${P.nome}</b></span><span class="kc">${voci.length ? f0(t.kcal) + ' kcal' : ''}</span></div>` +
      voci.map(v => `<div class="voce" data-act="modVoce" data-id="${v.id}"><div class="vt"><div class="vn">${esc(v.nome)}</div><div class="vs">${v.q ? f0(v.q) + ' g' : 'inserimento rapido'}${v.brand ? ' · ' + esc(v.brand) : ''}</div></div><div class="vk">${f0(v.kcal)}</div></div>`).join('') +
      `<div class="pazioni"><button class="add" data-act="aggiungi" data-p="${P.id}">＋ Aggiungi</button>${daIeri ? `<button class="lnk" data-act="copiaIeri" data-p="${P.id}">Copia da ieri</button>` : ''}</div></section>`;
  }
  const ob = num(S.profilo.acqua) || 2000, bic = Math.ceil(ob / 250), fatti = Math.round((G.acqua || 0) / 250);
  h += `<section class="card acqua"><div class="ph"><span>💧 <b>Acqua</b></span><span class="kc">${f1((G.acqua || 0) / 1000)} / ${f1(ob / 1000)} L</span></div>
    <div class="bicchieri">${Array.from({ length: Math.max(bic, fatti) }, (_, i) => `<span class="${i < fatti ? 'pieno' : ''}">●</span>`).join('')}</div>
    <div class="pazioni"><button data-act="acqua" data-n="-250">− 250 ml</button><button class="add" data-act="acqua" data-n="250">＋ 250 ml</button></div></section>`;
  return h;
}

function rigaVoce(v, act = 'scegli') {
  const k = v.tipo === 'ric' ? `${f0(v.porz ? v.kcal * v.porz / 100 : v.kcal)} kcal/porz.` : `${f0(v.kcal)} kcal`;
  const tag = v.fonte === 'ric' ? '<span class="tag r">ricetta</span>' : v.fonte === 'base' ? '' : v.fonte === 'off' ? '<span class="tag o">OFF</span>' : '<span class="tag m">mio</span>';
  return `<div class="riga" data-act="${act}" data-id="${v.id}"><div class="vt"><div class="vn">${isPref(v.id) ? '★ ' : ''}${esc(v.nome)} ${tag}</div><div class="vs">${esc(v.brand || v.cat || '')}</div></div><div class="vk">${k}<small>${v.tipo === 'ric' ? '' : '/100 g'}</small></div></div>`;
}
function cercaLocale(q, { ricette = true, filtro = 'tutti' } = {}) {
  const parole = norm(q).split(/\s+/).filter(Boolean);
  let lista = [];
  if (ricette && (filtro === 'tutti' || filtro === 'pref')) lista.push(...S.ricette.map(r => voceDa(r.id)));
  if (filtro !== 'base') lista.push(...S.alimenti.map(a => ({ tipo: 'al', ...a })));
  if (filtro !== 'miei') lista.push(...BASE.map(a => ({ tipo: 'al', ...a })));
  if (filtro === 'pref') lista = lista.filter(v => isPref(v.id));
  if (!parole.length) return lista;
  const pq = parole[0];
  return lista.map(v => { const n = norm(v.nome), t = n + ' ' + norm(v.brand) + ' ' + norm(v.cat); if (!parole.every(p => t.includes(p))) return null; return { v, s: (n.startsWith(pq) ? 0 : n.split(/[\s'(/,-]+/).some(w => w.startsWith(pq)) ? 1 : 2) +(isPref(v.id) ? 0 : 1) + (v.fonte === 'base' ? 1 : 0) }; })
    .filter(Boolean).sort((a, b) => a.s - b.s || a.v.nome.localeCompare(b.v.nome)).map(x => x.v);
}

function vAlimenti() {
  const F = [['tutti', 'Tutti'], ['miei', 'I miei'], ['pref', 'Preferiti'], ['base', 'Generici']];
  return `<div class="cercabox"><input id="qAl" type="search" placeholder="Cerca tra ${BASE.length + S.alimenti.length} alimenti…" value="${esc(qAl)}" autocomplete="off"></div>
  <div class="chips">${F.map(([k, l]) => `<button class="chip ${filtroAl === k ? 'on' : ''}" data-act="filtroAl" data-f="${k}">${l}</button>`).join('')}</div>
  <div class="pkbtn"><button data-act="scan">📷 Barcode</button><button data-act="online">🌐 Cerca online</button><button data-act="nuovoAl">＋ Nuovo</button></div>
  <div id="online"></div><div id="listaAl" class="card lista">${listaAl()}</div>`;
}
function listaAl() {
  const l = cercaLocale(qAl, { ricette: false, filtro: filtroAl });
  if (!l.length) return `<p class="vuoto">${filtroAl === 'miei' && !qAl ? 'Non hai ancora alimenti tuoi: aggiungili con il barcode, la ricerca online o "Nuovo".' : 'Nessun risultato. Prova "Cerca online".'}</p>`;
  return l.slice(0, 150).map(v => rigaVoce(v, 'apriAl')).join('') + (l.length > 150 ? `<p class="vuoto">Altri ${l.length - 150}: affina la ricerca.</p>` : '');
}

function vRicette() {
  let h = `<div class="pkbtn"><button class="primary" data-act="nuovaRic">＋ Nuova ricetta</button></div>`;
  if (!S.ricette.length) return h + `<div class="card"><p class="vuoto">Una ricetta mette insieme più alimenti con i loro grammi e calcola da sola calorie e macronutrienti, totali, per porzione e per 100 g. Poi la aggiungi al diario come un alimento qualsiasi.</p></div>`;
  return h + [...S.ricette].sort((a, b) => a.nome.localeCompare(b.nome)).map(r => {
    const k = calcRicetta(r);
    return `<div class="card ric" data-act="apriRic" data-id="${r.id}"><div class="ph"><b>${isPref(r.id) ? '★ ' : ''}${esc(r.nome)}</b><span class="kc">${f0(k.perPorz.kcal)} kcal/porz.</span></div>
    <div class="vs">${r.ingredienti.length} ingredienti · ${f0(k.porz)} porz. da ${f0(k.gPorz)} g · ${f0(k.per100.kcal)} kcal/100 g</div>
    <div class="vs">P ${f0(k.perPorz.p)} g · C ${f0(k.perPorz.c)} g · G ${f0(k.perPorz.g)} g a porzione</div></div>`;
  }).join('');
}

function graficoPeso(arr, ob) {
  const da = piuGiorni(oggi(), -90), a = arr.filter(p => p.d >= da);
  if (a.length < 2) return '<p class="nota">Il grafico compare dalla seconda pesata.</p>';
  const W = 340, H = 170, L = 34, R = 8, T = 10, B = 22;
  const mm = mediaMobile(arr).filter(p => p.d >= a[0].d);
  const ys = a.map(p => p.kg); if (ob && Math.abs(ob - Math.min(...ys)) < 6) ys.push(ob);
  let min = Math.floor(Math.min(...ys) - 0.5), max = Math.ceil(Math.max(...ys) + 0.5);
  if (max - min < 2) { max += 1; min -= 1; }
  const t0 = a[0].d, span = Math.max(1, giorniTra(t0, a[a.length - 1].d));
  const X = d => L + (W - L - R) * giorniTra(t0, d) / span, Y = k => T + (H - T - B) * (max - k) / (max - min);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="graf">`;
  const passo = Math.max(1, Math.ceil((max - min) / 4));
  for (let k = min; k <= max; k += passo) s += `<line x1="${L}" x2="${W - R}" y1="${Y(k)}" y2="${Y(k)}" class="gl"/><text x="${L - 4}" y="${Y(k) + 4}" text-anchor="end">${k}</text>`;
  if (ob && ob >= min && ob <= max) s += `<line x1="${L}" x2="${W - R}" y1="${Y(ob)}" y2="${Y(ob)}" class="gob"/><text x="${W - R}" y="${Y(ob) - 4}" text-anchor="end" class="tob">obiettivo</text>`;
  s += `<polyline class="gmm" points="${mm.map(p => `${X(p.d).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(' ')}"/>`;
  s += a.map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="3" class="gp"/>`).join('');
  s += `<text x="${L}" y="${H - 5}">${dataBreve(t0)}</text><text x="${W - R}" y="${H - 5}" text-anchor="end">${dataBreve(a[a.length - 1].d)}</text></svg>`;
  return s + '<p class="nota legenda"><span class="lp">●</span> pesate &nbsp; <span class="lm">━</span> media di 7 giorni</p>';
}
function graficoSettimana(giorni, target) {
  const W = 340, H = 150, L = 6, R = 6, T = 14, B = 22;
  const max = Math.max(target || 0, ...giorni.map(g => g.kcal)) * 1.1 || 1;
  const bw = (W - L - R) / 7;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="graf">`;
  giorni.forEach((g, i) => {
    const h = (H - T - B) * g.kcal / max, x = L + i * bw + bw * 0.18;
    const cl = !g.kcal ? '' : !target ? 'b-ok' : g.kcal > target * 1.1 ? 'b-bad' : g.kcal > target ? 'b-warn' : 'b-ok';
    s += `<rect x="${x.toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="4" class="${cl}"/>`;
    if (g.kcal) s += `<text x="${(x + bw * 0.32).toFixed(1)}" y="${(H - B - h - 3).toFixed(1)}" text-anchor="middle" class="bv">${f0(g.kcal)}</text>`;
    s += `<text x="${(x + bw * 0.32).toFixed(1)}" y="${H - 6}" text-anchor="middle">${GG[dt(g.d).getDay()]}</text>`;
  });
  if (target) { const y = H - B - (H - T - B) * target / max; s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="gob"/>`; }
  return s + '</svg>';
}
function vProgressi() {
  const pl = piano(), arr = pesiOrd(), w = pesoAttuale();
  let h = `<section class="card"><div class="ph"><b>⚖️ Peso</b><span class="kc">${w ? f1(w) + ' kg' : ''}</span></div>
  <div class="row"><input id="pesoIn" inputmode="decimal" placeholder="Peso di oggi (kg)"><button class="primary" data-act="salvaPeso">Salva</button></div>`;
  if (arr.length) {
    const mm = mediaMobile(arr), tr = mm[mm.length - 1].kg, inizio = arr[0].kg, rit = ritmoReale(arr);
    h += `<div class="kpi"><div><b>${f1(tr)}</b><span>media 7 gg</span></div><div><b>${inizio - w >= 0 ? '−' : '+'}${f1(Math.abs(inizio - w))}</b><span>dal ${dataBreve(arr[0].d)}</span></div><div><b>${rit == null ? '–' : (rit > 0 ? '+' : '') + f1(rit)}</b><span>kg/sett. reali</span></div></div>`;
    if (pl && pl.ob && pl.dir) {
      const tot = Math.abs(inizio - pl.ob), fatto = pl.dir < 0 ? inizio - w : w - inizio, pct = tot ? Math.max(0, Math.min(1, fatto / tot)) : 0;
      h += `<div class="obiettivo"><div class="ol"><span>${f1(inizio)} kg</span><span>${Math.round(pct * 100)}%</span><span>🎯 ${f1(pl.ob)} kg</span></div><div class="bar big"><i style="width:${pct * 100}%"></i></div>
      <p class="nota">Mancano <b>${f1(Math.abs(w - pl.ob))} kg</b>. Seguendo il piano (${f1(Math.abs(pl.kgSett))} kg a settimana) ci arrivi intorno al <b>${dataLunga(pl.arrivo)}</b>.${rit != null && pl.dir < 0 ? (rit < -0.05 ? ` Al ritmo reale delle ultime settimane: circa ${Math.ceil(Math.abs(w - pl.ob) / -rit)} settimane.` : ' Nelle ultime settimane il peso non sta scendendo: controlla le porzioni o il fabbisogno impostato.') : ''}</p></div>`;
    } else if (pl && pl.ob && !pl.dir) h += `<p class="nota">🎉 Sei al peso obiettivo: ora l'obiettivo calorico è il mantenimento.</p>`;
    h += graficoPeso(arr, pl?.ob);
  } else h += `<p class="nota">Pesati alla stessa ora, per esempio al mattino a digiuno: la media di 7 giorni toglie le oscillazioni quotidiane.</p>`;
  h += '</section>';

  const giorni = Array.from({ length: 7 }, (_, i) => { const d = piuGiorni(oggi(), i - 6); return { d, kcal: totali(giorno(d).voci).kcal }; });
  const reg = giorni.filter(g => g.kcal > 0 && g.d !== oggi());
  h += `<section class="card"><div class="ph"><b>📅 Ultimi 7 giorni</b><span class="kc">${giorni.filter(g => g.kcal > 0).length}/7 registrati</span></div>${graficoSettimana(giorni, pl?.target)}`;
  if (reg.length) {
    const media = reg.reduce((s, g) => s + g.kcal, 0) / reg.length;
    h += `<div class="kpi"><div><b>${f0(media)}</b><span>media kcal</span></div>`;
    if (pl) {
      const bil = reg.reduce((s, g) => s + (pl.tdee - g.kcal), 0);
      h += `<div><b>${bil >= 0 ? '−' : '+'}${f0(Math.abs(bil))}</b><span>kcal ${bil >= 0 ? 'deficit' : 'surplus'}</span></div><div><b>${bil >= 0 ? '−' : '+'}${f0(Math.abs(bil) / 7.7)} g</b><span>stima peso</span></div>`;
    }
    h += '</div>';
    if (pl) h += `<p class="nota">Media e bilancio contano solo i giorni registrati e già conclusi, oggi escluso (7.700 kcal ≈ 1 kg).</p>`;
  }
  h += `</section><section class="card"><div class="ph"><b>🔥 Costanza</b><span class="kc">${serie()} giorni di fila</span></div><p class="nota">Giorni consecutivi con almeno un pasto registrato.</p></section>`;
  if (arr.length) h += `<section class="card"><div class="ph"><b>Storico pesate</b></div>${[...arr].reverse().slice(0, 30).map(p => `<div class="riga"><div class="vt">${dataBreve(p.d)} ${dt(p.d).getFullYear()}</div><div class="vk">${f1(p.kg)} kg <button class="mini" data-act="delPeso" data-d="${p.d}" aria-label="Elimina">✕</button></div></div>`).join('')}</section>`;
  return h;
}

function vAltro() {
  const P = S.profilo, pl = piano();
  let h = `<section class="card"><div class="ph"><b>👤 Profilo e obiettivo</b><button class="lnk" data-act="profilo">Modifica</button></div>`;
  if (!pl) h += `<p class="nota">Profilo da completare.</p>`;
  else h += calcoloHTML(pl, P);
  h += `</section>
  <section class="card"><div class="ph"><b>💾 Dati</b></div><p class="nota">I dati restano solo su questo telefono. Fai un backup ogni tanto.</p>
  <div class="btncol"><button data-act="backup">Esporta backup (JSON)</button><button data-act="ripristina">Importa backup</button><button data-act="csv">Esporta diario (CSV)</button><button class="danger" data-act="cancella">Cancella tutti i dati</button></div>
  <input type="file" id="fileImp" accept="application/json,.json" hidden></section>
  <section class="card info"><div class="ph"><b>ℹ️ Informazioni</b><span class="kc">v${VERSIONE}</span></div>
  <p>I prodotti online e i codici a barre vengono da <b>Open Food Facts</b>, un database libero e collaborativo (licenza ODbL): i valori possono contenere errori, quindi confrontali con l'etichetta. Gli alimenti generici sono valori medi indicativi.</p>
  <p>Fabbisogno e obiettivi sono stime (formula di Mifflin-St Jeor). Non sostituiscono il parere di un medico o di un nutrizionista, soprattutto in caso di patologie, gravidanza o allattamento.</p></section>`;
  return h;
}
function calcoloHTML(pl, P) {
  const dirTxt = pl.dir < 0 ? 'Dimagrimento' : pl.dir > 0 ? 'Aumento di peso' : 'Mantenimento';
  return `<div class="tab2">
  <div><span>Peso attuale</span><b>${f1(pl.w)} kg</b></div><div><span>Obiettivo</span><b>${pl.ob ? f1(pl.ob) + ' kg' : '–'}</b></div>
  <div><span>IMC attuale</span><b>${f1(pl.bmi)}</b></div><div><span>IMC obiettivo</span><b>${pl.bmiOb ? f1(pl.bmiOb) : '–'}</b></div>
  <div><span>Metabolismo basale</span><b>${f0(pl.bmr)} kcal</b></div><div><span>Fabbisogno ${pl.man ? '(inserito)' : '(stimato)'}</span><b>${f0(pl.tdee)} kcal</b></div>
  <div><span>${dirTxt}</span><b>${pl.delta ? (pl.delta < 0 ? '−' : '+') + f0(Math.abs(pl.delta)) + ' kcal al giorno' : '–'}</b></div><div><span>Obiettivo giornaliero</span><b class="hl">${f0(pl.target)} kcal</b></div>
  <div><span>Proteine</span><b>${pl.prot} g</b></div><div><span>Carboidrati / grassi</span><b>${pl.carbo} g / ${pl.grassi} g</b></div>
  </div>${pl.arrivo ? `<p class="nota">Ritmo: ${f1(Math.abs(pl.kgSett))} kg a settimana, arrivo stimato al ${dataLunga(pl.arrivo)} (circa ${Math.ceil(pl.settimane)} settimane).</p>` : ''}
  ${pl.note.map(n => `<p class="avviso">⚠️ ${esc(n)}</p>`).join('')}`;
}

/* ---------- selettore alimenti (picker) ---------- */
let pk = null;
function apriPicker(o) {
  pk = { ...o, depth: pila.length };
  const diario = o.modo === 'diario';
  modal(`<div class="mh"><h3>${diario ? 'Aggiungi a ' + nomePasto(o.pasto) : 'Aggiungi ingrediente'}</h3><button class="x" data-act="chiudi" aria-label="Chiudi">✕</button></div>
  <input id="qPk" type="search" placeholder="Cerca alimento${diario ? ' o ricetta' : ''}…" autocomplete="off">
  <div class="pkbtn"><button data-act="scan">📷 Barcode</button><button data-act="online">🌐 Online</button>${diario ? '<button data-act="rapido">⚡ Kcal rapide</button>' : ''}<button data-act="nuovoAl">＋ Nuovo</button></div>
  <div id="online"></div><div id="pkLista" class="lista">${pkLista('')}</div>`, { cls: 'sheet', onClose: () => { pk = null; } });
}
function pkLista(q) {
  const ric = pk?.modo === 'diario';
  if (q.trim()) {
    const l = cercaLocale(q, { ricette: ric });
    return l.length ? l.slice(0, 60).map(v => rigaVoce(v)).join('') : '<p class="vuoto">Nessun risultato tra gli alimenti salvati. Prova "Online" o il barcode.</p>';
  }
  const pref = S.preferiti.map(voceDa).filter(v => v && (ric || v.tipo !== 'ric'));
  const rec = S.recenti.filter(id => !S.preferiti.includes(id)).map(voceDa).filter(v => v && (ric || v.tipo !== 'ric')).slice(0, 25);
  let h = '';
  if (pref.length) h += '<h4>Preferiti</h4>' + pref.map(v => rigaVoce(v)).join('');
  if (rec.length) h += '<h4>Recenti</h4>' + rec.map(v => rigaVoce(v)).join('');
  return h || '<p class="vuoto">Scrivi per cercare tra gli alimenti generici e i tuoi, oppure scansiona un codice a barre. Qui compariranno recenti e preferiti.</p>';
}
function scegli(id) {
  if (!pk) return;
  if (pk.modo === 'diario') apriQuantita({ id, pasto: pk.pasto, data: pk.data });
  else apriQuantita({ id, onPick: pk.onPick });
}

/* ---------- quantità ---------- */
let qa = null;
function apriQuantita(o) {
  let base, nome, brand, porz = 0, porzNome = 'porzione', q, id = o.id;
  if (o.voce) { const e = o.voce; id = e.ref; base = e.k100; nome = e.nome; brand = e.brand; q = e.q; porz = e.porz || 0; porzNome = e.porzNome || 'porzione'; }
  else {
    const v = voceDa(o.id); if (!v) { toast('Alimento non trovato'); return; }
    base = { kcal: v.kcal, p: v.p, c: v.c, g: v.g }; nome = v.nome; brand = v.brand; porz = v.porz; porzNome = v.porzNome || 'porzione';
    q = o.q || S.ultimeQ[o.id] || porz || 100;
  }
  qa = { o, base, nome, brand, porz, porzNome, id };
  const chips = [];
  if (porz) chips.push([porz / 2, '½ ' + porzNome], [porz, '1 ' + porzNome], [porz * 2, '2 ' + porzNome]);
  [50, 100, 150, 200].forEach(g => chips.push([g, g + ' g']));
  const diario = !o.onPick;
  modal(`<div class="mh"><h3>${esc(nome)}</h3>${id && !o.voce ? `<button class="x stella" data-act="pref" data-id="${id}">${isPref(id) ? '★' : '☆'}</button>` : ''}</div>
  <div class="vs">${brand ? esc(brand) + ' · ' : ''}${f0(base.kcal)} kcal per 100 g${porz ? ` · 1 ${esc(porzNome)} = ${f0(porz)} g` : ''}</div>
  <label class="lab">Quantità in grammi</label>
  <div class="qrow"><button data-act="qStep" data-n="-10">−</button><input id="qQ" inputmode="decimal" value="${r1(q)}"><button data-act="qStep" data-n="10">＋</button></div>
  <div class="chips">${chips.map(([g, l]) => `<button class="chip" data-act="qSet" data-g="${g}">${esc(l)}</button>`).join('')}</div>
  ${diario ? `<label class="lab">Pasto</label><select id="qPasto">${PASTI.map(p => `<option value="${p.id}" ${p.id === (o.voce ? o.voce.pasto : o.pasto) ? 'selected' : ''}>${p.nome}</option>`).join('')}</select>` : ''}
  <div id="qCalc" class="qcalc"></div>
  <div class="btns">${o.voce ? '<button class="danger" data-act="qElimina">Elimina</button>' : '<button data-act="chiudi">Annulla</button>'}<button class="primary" data-act="qSalva">${o.voce ? 'Salva' : 'Aggiungi'}</button></div>`);
  qCalc();
}
function qCalc() {
  if (!qa) return;
  const q = num($('#qQ')?.value), t = scala(qa.base, q / 100);
  const el = $('#qCalc'); if (!el) return;
  const pl = piano(), d = qa.o.data || giornoSel;
  let extra = '';
  if (pl && !qa.o.onPick) {
    const gia = totali(giorno(d).voci).kcal - (qa.o.voce ? qa.o.voce.kcal : 0), dopo = pl.target - gia - t.kcal;
    extra = `<div class="dopo ${dopo < 0 ? 'neg' : ''}">${dopo >= 0 ? `Dopo questo restano ${f0(dopo)} kcal` : `Supereresti l'obiettivo di ${f0(-dopo)} kcal`}</div>`;
  }
  el.innerHTML = `<div class="big">${f0(t.kcal)} <small>kcal</small></div><div class="mac"><span class="p">P ${f1(t.p)} g</span><span class="c">C ${f1(t.c)} g</span><span class="g">G ${f1(t.g)} g</span></div>${extra}`;
}
function qSalva() {
  const q = num($('#qQ').value); if (q <= 0) { toast('Indica la quantità'); return; }
  const o = qa.o;
  if (o.onPick) { const cb = o.onPick, id = qa.id; chiudiFino(pk ? pk.depth : pila.length - 1); cb(id, q); return; }
  const val = arrot(scala(qa.base, q / 100)), pasto = $('#qPasto').value;
  if (o.voce) { Object.assign(o.voce, { q, pasto, ...val }); salva(); chiudi(); render(); return; }
  const v = voceDa(o.id);
  giornoW(o.data).voci.push({ id: uid('v'), pasto, ref: o.id, tipo: v.tipo, nome: qa.nome, brand: v.tipo === 'ric' ? '' : qa.brand || '', q, k100: arrot(qa.base), porz: qa.porz, porzNome: qa.porzNome, ...val });
  S.ultimeQ[o.id] = q;
  S.recenti = [o.id, ...S.recenti.filter(x => x !== o.id)].slice(0, 40);
  salva(); chiudiFino(pk ? pk.depth : pila.length - 1); render();
  toast(`${qa.nome}: ${f0(val.kcal)} kcal aggiunte a ${nomePasto(pasto)}`);
}

/* ---------- inserimento rapido ---------- */
function apriRapido(o) {
  const e = o.voce;
  modal(`<div class="mh"><h3>Calorie rapide</h3></div>
  <p class="nota">Per quando non sai cosa hai mangiato di preciso, o sei al ristorante.</p>
  <label class="lab">Descrizione</label><input id="rqN" value="${esc(e?.nome || 'Calorie rapide')}">
  <label class="lab">Calorie (kcal)</label><input id="rqK" inputmode="decimal" value="${e ? e.kcal : ''}">
  <div class="grid3"><label>Proteine g<input id="rqP" inputmode="decimal" value="${e?.p || ''}"></label><label>Carboidrati g<input id="rqC" inputmode="decimal" value="${e?.c || ''}"></label><label>Grassi g<input id="rqG" inputmode="decimal" value="${e?.g || ''}"></label></div>
  <label class="lab">Pasto</label><select id="rqPasto">${PASTI.map(p => `<option value="${p.id}" ${p.id === (e ? e.pasto : o.pasto) ? 'selected' : ''}>${p.nome}</option>`).join('')}</select>
  <div class="btns">${e ? '<button class="danger" id="rqDel">Elimina</button>' : '<button data-act="chiudi">Annulla</button>'}<button class="primary" id="rqOk">${e ? 'Salva' : 'Aggiungi'}</button></div>`);
  $('#rqOk').onclick = () => {
    const kcal = num($('#rqK').value); if (kcal <= 0) { toast('Indica le calorie'); return; }
    const val = { nome: $('#rqN').value.trim() || 'Calorie rapide', kcal: r1(kcal), p: r1(num($('#rqP').value)), c: r1(num($('#rqC').value)), g: r1(num($('#rqG').value)), pasto: $('#rqPasto').value };
    if (e) Object.assign(e, val); else giornoW(o.data).voci.push({ id: uid('v'), tipo: 'rap', ref: null, q: 0, brand: '', ...val });
    salva(); chiudiFino(pk ? pk.depth : pila.length - 1); render(); toast('Salvato');
  };
  if (e) $('#rqDel').onclick = () => { eliminaVoce(e.id); chiudi(); };
}
function eliminaVoce(id) {
  const G = giornoW(giornoSel); G.voci = G.voci.filter(v => v.id !== id); salva(); render(); toast('Eliminato');
}

/* ---------- scheda alimento ---------- */
function apriFormAlimento(a, { nota = '', dopo } = {}) {
  const base = a.fonte === 'base', nuovoAl = !a.id;
  const ro = base ? 'readonly' : '';
  const usato = a.id ? S.ricette.filter(r => r.ingredienti.some(i => i.id === a.id)).length : 0;
  modal(`<div class="mh"><h3>${base ? 'Alimento generico' : nuovoAl ? 'Nuovo alimento' : 'Modifica alimento'}</h3>${a.id ? `<button class="x stella" data-act="pref" data-id="${a.id}">${isPref(a.id) ? '★' : '☆'}</button>` : ''}</div>
  ${nota ? `<p class="avviso">${esc(nota)}</p>` : ''}
  <label class="lab">Nome</label><input id="faN" value="${esc(a.nome || '')}" ${ro}>
  <label class="lab">Marca</label><input id="faB" value="${esc(a.brand || '')}" ${ro} placeholder="facoltativa">
  <p class="sez">Valori per 100 g</p>
  <div class="grid2"><label>Calorie (kcal)<input id="faK" inputmode="decimal" value="${a.kcal ?? ''}" ${ro}></label><label>Proteine (g)<input id="faP" inputmode="decimal" value="${a.p ?? ''}" ${ro}></label>
  <label>Carboidrati (g)<input id="faC" inputmode="decimal" value="${a.c ?? ''}" ${ro}></label><label>Grassi (g)<input id="faG" inputmode="decimal" value="${a.g ?? ''}" ${ro}></label></div>
  ${base ? '' : '<button class="lnk" id="faCalc">Calcola le calorie dai macronutrienti</button>'}
  <p class="sez">Porzione tipica (facoltativa)</p>
  <div class="grid2"><label>Grammi<input id="faPg" inputmode="decimal" value="${a.porz || ''}" ${ro}></label><label>Nome<input id="faPn" value="${esc(a.porz ? a.porzNome || 'porzione' : '')}" placeholder="es. fetta, vasetto" ${ro}></label></div>
  ${base ? '' : `<label class="lab">Codice a barre</label><input id="faBc" inputmode="numeric" value="${esc(a.barcode || '')}" placeholder="facoltativo">`}
  ${usato ? `<p class="nota">Usato in ${usato} ricett${usato > 1 ? 'e' : 'a'}: se cambi i valori, cambiano anche le ricette (non i giorni già registrati).</p>` : ''}
  <div class="btns">${base ? '<button id="faCopia">Crea una copia modificabile</button><button class="primary" data-act="chiudi">Chiudi</button>'
      : `${!nuovoAl ? '<button class="danger" id="faDel">Elimina</button>' : '<button data-act="chiudi">Annulla</button>'}<button class="primary" id="faOk">Salva</button>`}</div>`);
  if (base) { $('#faCopia').onclick = () => { chiudi(); apriFormAlimento({ ...a, id: null, fonte: 'mio', nome: a.nome + ' (mio)' }, { dopo }); }; return; }
  $('#faCalc').onclick = () => { $('#faK').value = r1(num($('#faP').value) * 4 + num($('#faC').value) * 4 + num($('#faG').value) * 9); };
  $('#faOk').onclick = () => {
    const nome = $('#faN').value.trim(); if (!nome) { toast('Manca il nome'); return; }
    if ($('#faK').value.trim() === '') { toast('Mancano le calorie per 100 g'); return; }
    const bc = $('#faBc').value.replace(/\D/g, '');
    const doppio = bc && S.alimenti.find(x => x.barcode === bc && x.id !== a.id);
    if (doppio) { toast('Questo codice è già usato da "' + doppio.nome + '"'); return; }
    const pg = num($('#faPg').value);
    const dati = { nome, brand: $('#faB').value.trim(), kcal: r1(num($('#faK').value)), p: r1(num($('#faP').value)), c: r1(num($('#faC').value)), g: r1(num($('#faG').value)), porz: pg, porzNome: pg ? ($('#faPn').value.trim() || 'porzione') : '', barcode: bc };
    let id = a.id;
    if (id) Object.assign(S.alimenti.find(x => x.id === id), dati);
    else { id = uid('a'); S.alimenti.push({ id, fonte: a.fonte === 'off' ? 'off' : 'mio', ...dati }); }
    salva(); chiudi(); render(); toast('Alimento salvato');
    dopo?.(id);
  };
  if (!nuovoAl) $('#faDel').onclick = () => {
    if (usato) { toast('È usato in una ricetta: toglilo prima dalla ricetta'); return; }
    conferma(`Eliminare "${a.nome}"?`, () => {
      S.alimenti = S.alimenti.filter(x => x.id !== a.id); S.preferiti = S.preferiti.filter(x => x !== a.id); S.recenti = S.recenti.filter(x => x !== a.id);
      salva(); chiudi(); render(); toast('Eliminato');
    }, 'Elimina');
  };
}
function dopoAlimento(id) { if (pk) scegli(id); }

/* ---------- Open Food Facts ---------- */
function daOff(p) {
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  if (kcal == null && n['energy_100g'] != null) kcal = n['energy_100g'] / 4.184;
  if (kcal == null || !isFinite(kcal)) return null;
  return {
    nome: (p.product_name_it || p.product_name || p.generic_name_it || '').trim() || 'Prodotto ' + p.code,
    brand: (p.brands || '').split(',')[0].trim(), kcal: r1(kcal), p: r1(num(n.proteins_100g)), c: r1(num(n.carbohydrates_100g)), g: r1(num(n.fat_100g)),
    porz: Math.round(num(p.serving_quantity)) || 0, porzNome: 'porzione', barcode: String(p.code || ''), fonte: 'off'
  };
}
async function fetchT(url, ms = 15000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal }); if (r.status === 404) return { status: 0 }; if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
async function offProdotto(code) {
  const j = await fetchT(`${OFF}/api/v2/product/${code}.json?fields=${CAMPI}`);
  return j.status === 1 && j.product ? daOff(j.product) : null;
}
let offTempi = [], offRis = [];
async function cercaOnline() {
  const inp = $('#qPk') || $('#qAl'), q = (inp?.value || '').trim(), box = $('#online');
  if (q.length < 3) { toast('Scrivi almeno 3 lettere nella ricerca'); inp?.focus(); return; }
  if (!navigator.onLine) { toast('Sei offline'); return; }
  const ora = Date.now(); offTempi = offTempi.filter(t => ora - t < 60000);
  if (offTempi.length >= 8) { toast('Troppe ricerche ravvicinate: riprova tra un minuto'); return; }
  offTempi.push(ora);
  box.innerHTML = '<p class="vuoto">🌐 Cerco su Open Food Facts…</p>';
  try {
    const j = await fetchT(`${OFF_IT}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&sort_by=unique_scans_n&fields=${CAMPI}`, 20000);
    offRis = (j.products || []).map(daOff).filter(Boolean);
    if (!$('#online')) return;
    $('#online').innerHTML = offRis.length
      ? `<h4>Da Open Food Facts</h4><div class="lista">${offRis.map((v, i) => `<div class="riga" data-act="scegliOff" data-i="${i}"><div class="vt"><div class="vn">${esc(v.nome)} <span class="tag o">OFF</span></div><div class="vs">${esc(v.brand)}</div></div><div class="vk">${f0(v.kcal)} kcal<small>/100 g</small></div></div>`).join('')}</div>`
      : '<p class="vuoto">Nessun prodotto trovato online.</p>';
  } catch (e) { if ($('#online')) $('#online').innerHTML = `<p class="vuoto">Ricerca non riuscita (${esc(e.name === 'AbortError' ? 'tempo scaduto' : e.message)}). Riprova tra poco.</p>`; }
}
function salvaDaOff(v) {
  const es = v.barcode && S.alimenti.find(a => a.barcode === v.barcode);
  if (es) return es.id;
  const id = uid('a'); S.alimenti.push({ id, ...v }); salva(); return id;
}

/* ---------- scanner ---------- */
const scan = { stream: null, t: null };
function stopScan() { clearTimeout(scan.t); scan.stream?.getTracks().forEach(t => t.stop()); scan.stream = null; }
async function apriScanner() {
  modal(`<div class="mh"><h3>Codice a barre</h3><button class="x" data-act="chiudi" aria-label="Chiudi">✕</button></div>
  <div class="scanwrap"><video id="scanV" playsinline muted></video><div class="mirino"></div></div>
  <p class="nota" id="scanMsg">Inquadra il codice a barre della confezione.</p>
  <div class="row"><input id="scanCod" inputmode="numeric" placeholder="oppure scrivi il codice"><button class="primary" data-act="scanManuale">Cerca</button></div>`, { onClose: stopScan });
  const msg = t => { const el = $('#scanMsg'); if (el) el.textContent = t; };
  if (!('BarcodeDetector' in window)) { msg('Questo browser non riconosce i codici dalla fotocamera: scrivi il codice qui sotto. Su Android usa Chrome.'); $('.scanwrap').remove(); return; }
  try {
    const sup = await BarcodeDetector.getSupportedFormats();
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'].filter(f => sup.includes(f)) });
    scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const v = $('#scanV'); if (!v) { stopScan(); return; }
    v.srcObject = scan.stream; await v.play();
    const ciclo = async () => {
      if (!scan.stream) return;
      try { const r = await det.detect(v); if (r.length) { navigator.vibrate?.(60); const c = r[0].rawValue; chiudi(); gestisciCodice(c); return; } } catch (e) { }
      scan.t = setTimeout(ciclo, 180);
    };
    ciclo();
  } catch (e) { msg('Fotocamera non disponibile (' + (e.name === 'NotAllowedError' ? 'permesso negato' : e.message) + '). Scrivi il codice qui sotto.'); }
}
async function gestisciCodice(code) {
  code = String(code).replace(/\D/g, '');
  if (code.length < 6) { toast('Codice non valido'); return; }
  const loc = S.alimenti.find(a => a.barcode === code);
  if (loc) { if (pk) scegli(loc.id); else apriFormAlimento(loc); return; }
  toast('Cerco il prodotto ' + code + '…');
  try {
    const p = await offProdotto(code);
    if (p) apriFormAlimento(p, { nota: 'Trovato su Open Food Facts. Controlla i valori con l\'etichetta, poi salva.', dopo: dopoAlimento });
    else apriFormAlimento({ barcode: code, fonte: 'mio' }, { nota: 'Prodotto non presente su Open Food Facts: copia i valori per 100 g dall\'etichetta. La prossima volta lo riconosco subito.', dopo: dopoAlimento });
  } catch (e) {
    apriFormAlimento({ barcode: code, fonte: 'mio' }, { nota: 'Non riesco a contattare Open Food Facts (sei offline?). Inserisci i valori a mano.', dopo: dopoAlimento });
  }
}

/* ---------- ricette ---------- */
let rEd = null;
function apriRicetta(id) {
  const r = id ? JSON.parse(JSON.stringify(ricetta(id))) : { id: null, nome: '', porzioni: 1, pesoCotto: '', ingredienti: [], note: '' };
  rEd = r;
  modal(`<div class="mh"><h3>${id ? 'Modifica ricetta' : 'Nuova ricetta'}</h3>${id ? `<button class="x stella" data-act="pref" data-id="${id}">${isPref(id) ? '★' : '☆'}</button>` : ''}</div>
  <label class="lab">Nome</label><input id="rNome" value="${esc(r.nome)}" placeholder="es. Pasta al pomodoro">
  <div class="grid2"><label>Porzioni<input id="rPorz" inputmode="numeric" value="${r.porzioni}"></label><label>Peso da cotto (g)<input id="rCotto" inputmode="decimal" value="${r.pesoCotto || ''}" placeholder="facoltativo"></label></div>
  <p class="nota">Il peso da cotto serve se pesi la porzione nel piatto: la pasta cuocendo aumenta di peso, l'arrosto cala. Se lo lasci vuoto vale la somma degli ingredienti.</p>
  <p class="sez">Ingredienti (pesati crudi)</p><div id="rIng"></div>
  <button class="add full" data-act="rAddIng">＋ Aggiungi ingrediente</button>
  <div id="rTot" class="rtot"></div>
  <label class="lab">Note</label><textarea id="rNote" rows="2">${esc(r.note || '')}</textarea>
  <div class="btns">${id ? '<button class="danger" data-act="rDel">Elimina</button>' : '<button data-act="chiudi">Annulla</button>'}<button class="primary" data-act="rSalva">Salva</button></div>`, { onClose: () => { rEd = null; } });
  rRender();
}
function rRender() {
  const el = $('#rIng'); if (!el || !rEd) return;
  el.innerHTML = rEd.ingredienti.length ? rEd.ingredienti.map((ing, i) => {
    const a = alimento(ing.id);
    return `<div class="ing"><div class="vt"><div class="vn">${esc(a?.nome || ing.nome)}${a ? '' : ' <span class="tag">non più presente</span>'}</div><div class="vs" id="ingK${i}"></div></div><input class="ingq" data-i="${i}" inputmode="decimal" value="${ing.q}"><span>g</span><button class="mini" data-act="rDelIng" data-i="${i}" aria-label="Togli">✕</button></div>`;
  }).join('') : '<p class="vuoto">Nessun ingrediente.</p>';
  rTot();
}
function rTot() {
  if (!rEd) return;
  rEd.porzioni = Math.max(1, Math.round(num($('#rPorz').value)) || 1);
  rEd.pesoCotto = num($('#rCotto').value) || '';
  rEd.ingredienti.forEach((ing, i) => { const a = alimento(ing.id), el = $('#ingK' + i); if (el) el.textContent = a ? `${f0(a.kcal * num(ing.q) / 100)} kcal` : ''; });
  const k = calcRicetta(rEd);
  $('#rTot').innerHTML = rEd.ingredienti.length ? `<div class="tab2">
  <div><span>Totale</span><b>${f0(k.tot.kcal)} kcal · ${f0(k.peso)} g</b></div><div><span>Per porzione (${f0(k.gPorz)} g)</span><b class="hl">${f0(k.perPorz.kcal)} kcal</b></div>
  <div><span>Per 100 g</span><b>${f0(k.per100.kcal)} kcal</b></div><div><span>Macro a porzione</span><b>P ${f0(k.perPorz.p)} · C ${f0(k.perPorz.c)} · G ${f0(k.perPorz.g)}</b></div></div>` : '';
}

/* ---------- profilo ---------- */
function apriProfilo() {
  const P = S.profilo, w = pesoAttuale();
  const box = modal(`<div class="mh"><h3>Profilo e obiettivo</h3></div>
  <div class="seg"><label><input type="radio" name="pfS" value="M" ${P.sesso !== 'F' ? 'checked' : ''}> Uomo</label><label><input type="radio" name="pfS" value="F" ${P.sesso === 'F' ? 'checked' : ''}> Donna</label></div>
  <div class="grid3"><label>Età<input id="pfE" inputmode="numeric" value="${P.eta}"></label><label>Altezza (cm)<input id="pfA" inputmode="numeric" value="${P.altezza}"></label><label>Peso (kg)<input id="pfW" inputmode="decimal" value="${w ?? ''}"></label></div>
  <label class="lab">Attività fisica</label><select id="pfAt">${ATTIVITA.map(([v, l]) => `<option value="${v}" ${num(P.attivita) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <label class="lab">Fabbisogno calorico (se lo conosci)</label><input id="pfF" inputmode="numeric" value="${P.fabbManuale}" placeholder="vuoto = lo stimo io">
  <p class="sez">Obiettivo</p>
  <div class="grid2"><label>Peso obiettivo (kg)<input id="pfO" inputmode="decimal" value="${P.obiettivo}"></label><label>Ritmo<select id="pfR">${RITMI.map(([v, l]) => `<option value="${v}" ${num(P.ritmo) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
  <details><summary>Macronutrienti e acqua</summary>
  <div class="grid3"><label>Proteine g/kg<input id="pfPk" inputmode="decimal" value="${P.protKg}"></label><label>Grassi %<input id="pfGp" inputmode="numeric" value="${P.grassiPct}"></label><label>Acqua ml<input id="pfAq" inputmode="numeric" value="${P.acqua}"></label></div>
  <p class="nota">Proteine: 1,6-2 g per kg aiutano a mantenere i muscoli in deficit (si usa il peso obiettivo). Grassi: 25-35% delle calorie. I carboidrati sono il resto.</p></details>
  <div id="pfCalc" class="pfcalc"></div>
  <div class="btns"><button data-act="chiudi">Annulla</button><button class="primary" id="pfOk">Salva</button></div>`);
  const leggi = () => ({ ...S.profilo, sesso: document.querySelector('input[name=pfS]:checked').value, eta: num($('#pfE').value) || '', altezza: num($('#pfA').value) || '', attivita: num($('#pfAt').value), fabbManuale: num($('#pfF').value) || '', obiettivo: num($('#pfO').value) || '', ritmo: num($('#pfR').value), protKg: num($('#pfPk').value) || 1.6, grassiPct: num($('#pfGp').value) || 30, acqua: num($('#pfAq').value) || 2000 });
  const agg = () => { const pl = piano(leggi(), num($('#pfW').value)); $('#pfCalc').innerHTML = pl ? calcoloHTML(pl) : '<p class="nota">Inserisci età, altezza e peso per vedere il calcolo.</p>'; };
  box.addEventListener('input', agg); box.addEventListener('change', agg); agg();
  $('#pfOk').onclick = () => {
    const nw = num($('#pfW').value), P2 = leggi();
    if (!P2.eta || !P2.altezza || !nw) { toast('Servono età, altezza e peso'); return; }
    S.profilo = { ...P2, configurato: true };
    if (nw !== w) registraPeso(oggi(), nw);
    salva(); chiudi(); render(); toast('Profilo salvato');
  };
}
function registraPeso(d, kg) { S.pesi = S.pesi.filter(p => p.d !== d); S.pesi.push({ d, kg: r1(kg) }); }

/* ---------- dati ---------- */
function scarica(nome, testo, tipo) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([testo], { type: tipo })); a.download = nome;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csv() {
  const n = v => String(v).replace('.', ','), q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const righe = [['Data', 'Pasto', 'Alimento', 'Marca', 'Grammi', 'Kcal', 'Proteine', 'Carboidrati', 'Grassi'].join(';')];
  Object.keys(S.diario).sort().forEach(d => S.diario[d].voci.forEach(v => righe.push([d, nomePasto(v.pasto), q(v.nome), q(v.brand), n(v.q || ''), n(v.kcal), n(v.p || 0), n(v.c || 0), n(v.g || 0)].join(';'))));
  scarica(`diario-alimentare-${oggi()}.csv`, '﻿' + righe.join('\r\n'), 'text/csv');
}

/* ---------- azioni ---------- */
const AZ = {
  chiudi: () => chiudi(),
  giorno: b => { giornoSel = piuGiorni(giornoSel, +b.dataset.n); render(); },
  giornoOggi: () => { giornoSel = oggi(); render(); },
  profilo: () => apriProfilo(),
  aggiungi: b => apriPicker({ modo: 'diario', pasto: b.dataset.p, data: giornoSel }),
  copiaIeri: b => {
    const p = b.dataset.p, src = giorno(piuGiorni(giornoSel, -1)).voci.filter(v => v.pasto === p);
    const G = giornoW(giornoSel); src.forEach(v => G.voci.push({ ...v, id: uid('v') }));
    salva(); render(); toast(`${src.length} alimenti copiati da ieri`);
  },
  modVoce: b => { const v = giorno(giornoSel).voci.find(x => x.id === b.dataset.id); if (!v) return; v.tipo === 'rap' ? apriRapido({ voce: v }) : apriQuantita({ voce: v }); },
  acqua: b => { const G = giornoW(giornoSel); G.acqua = Math.max(0, (G.acqua || 0) + +b.dataset.n); salva(); render(); },
  scegli: b => scegli(b.dataset.id),
  scegliOff: b => { const v = offRis[+b.dataset.i]; if (!v) return; const id = salvaDaOff(v); if (pk) scegli(id); else { $('#listaAl').innerHTML = listaAl(); toast(`"${v.nome}" aggiunto ai tuoi alimenti`); } },
  apriAl: b => { const a = alimento(b.dataset.id); if (a) apriFormAlimento(a); },
  filtroAl: b => { filtroAl = b.dataset.f; render(); },
  nuovoAl: () => apriFormAlimento({ fonte: 'mio', nome: ($('#qPk')?.value || '').trim() }, { dopo: dopoAlimento }),
  online: () => cercaOnline(),
  scan: () => apriScanner(),
  scanManuale: () => { const c = $('#scanCod').value; chiudi(); gestisciCodice(c); },
  rapido: () => apriRapido({ pasto: pk.pasto, data: pk.data }),
  pref: b => {
    const id = b.dataset.id; S.preferiti = isPref(id) ? S.preferiti.filter(x => x !== id) : [id, ...S.preferiti];
    salva(); b.textContent = isPref(id) ? '★' : '☆'; toast(isPref(id) ? 'Aggiunto ai preferiti' : 'Tolto dai preferiti'); render();
  },
  qStep: b => { const i = $('#qQ'); i.value = r1(Math.max(0, num(i.value) + +b.dataset.n)); qCalc(); },
  qSet: b => { $('#qQ').value = r1(+b.dataset.g); qCalc(); },
  qSalva: () => qSalva(),
  qElimina: () => { const id = qa.o.voce.id; chiudi(); eliminaVoce(id); },
  nuovaRic: () => apriRicetta(null),
  apriRic: b => apriRicetta(b.dataset.id),
  rAddIng: () => apriPicker({ modo: 'ricetta', onPick: (id, q) => { const v = voceDa(id); rEd.ingredienti.push({ id, nome: v.nome, q }); rRender(); } }),
  rDelIng: b => { rEd.ingredienti.splice(+b.dataset.i, 1); rRender(); },
  rSalva: () => {
    rTot(); const nome = $('#rNome').value.trim();
    if (!nome) { toast('Manca il nome'); return; }
    if (!rEd.ingredienti.length) { toast('Aggiungi almeno un ingrediente'); return; }
    rEd.nome = nome; rEd.note = $('#rNote').value.trim();
    rEd.ingredienti.forEach(i => { const a = alimento(i.id); if (a) { i.nome = a.nome; i.k100 = arrot(a); } });
    if (rEd.id) S.ricette = S.ricette.map(r => r.id === rEd.id ? rEd : r); else { rEd.id = uid('r'); S.ricette.push(rEd); }
    salva(); chiudi(); render(); toast('Ricetta salvata');
  },
  rDel: () => { const r = rEd; conferma(`Eliminare la ricetta "${r.nome}"?`, () => { S.ricette = S.ricette.filter(x => x.id !== r.id); S.preferiti = S.preferiti.filter(x => x !== r.id); salva(); chiudi(); render(); toast('Ricetta eliminata'); }, 'Elimina'); },
  salvaPeso: () => { const kg = num($('#pesoIn').value); if (kg < 25 || kg > 350) { toast('Peso non valido'); return; } registraPeso(oggi(), kg); salva(); render(); toast('Peso salvato'); },
  delPeso: b => conferma('Eliminare la pesata del ' + dataBreve(b.dataset.d) + '?', () => { S.pesi = S.pesi.filter(p => p.d !== b.dataset.d); salva(); render(); }, 'Elimina'),
  backup: () => scarica(`diario-alimentare-backup-${oggi()}.json`, JSON.stringify(S), 'application/json'),
  ripristina: () => $('#fileImp').click(),
  csv: () => csv(),
  cancella: () => conferma('Cancellare tutti i dati? Diario, alimenti, ricette e pesate andranno persi.', () => { S = nuovo(); salva(); render(); toast('Dati cancellati'); }, 'Cancella tutto')
};
document.addEventListener('click', e => {
  const n = e.target.closest('#nav button'); if (n) { vista = n.dataset.v; if (vista === 'oggi') giornoSel = giornoSel || oggi(); window.scrollTo(0, 0); render(); return; }
  const b = e.target.closest('[data-act]'); if (b && AZ[b.dataset.act]) { e.preventDefault(); AZ[b.dataset.act](b, e); }
});
let cercaT;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'qAl') { qAl = t.value; clearTimeout(cercaT); cercaT = setTimeout(() => { $('#listaAl').innerHTML = listaAl(); }, 120); }
  else if (t.id === 'qPk') { clearTimeout(cercaT); cercaT = setTimeout(() => { $('#pkLista').innerHTML = pkLista(t.value); }, 120); }
  else if (t.id === 'qQ') qCalc();
  else if (t.classList.contains('ingq')) { rEd.ingredienti[+t.dataset.i].q = num(t.value); rTot(); }
  else if (t.id === 'rPorz' || t.id === 'rCotto') rTot();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'scanCod') AZ.scanManuale();
  else if (e.target.id === 'qQ') qSalva();
  else if (e.target.id === 'pesoIn') AZ.salvaPeso();
  else if ((e.target.id === 'qPk' || e.target.id === 'qAl') && e.target.value.trim().length >= 3) { e.target.blur(); }
});
document.addEventListener('change', e => {
  if (e.target.id !== 'fileImp') return;
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => {
    const d = JSON.parse(t); if (!d || !d.v || !d.diario) throw new Error('formato');
    conferma('Sostituire i dati attuali con quelli del backup?', () => { localStorage.setItem(KEY, JSON.stringify(d)); S = carica(); render(); toast('Backup importato'); }, 'Importa', false);
  }).catch(() => toast('File di backup non valido')).finally(() => { e.target.value = ''; });
});

/* ---------- avvio ---------- */
let ultimoGiorno = oggi();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && oggi() !== ultimoGiorno) { if (giornoSel === ultimoGiorno) giornoSel = oggi(); ultimoGiorno = oggi(); render(); }
});
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
if (navigator.storage?.persist) navigator.storage.persist();
