(() => {
'use strict';

const CHAPTERS = window.CHAPTERS || [];
const KEY = 'carl-lernt-v1';
const INTERVALS = [0, 1, 3, 7, 14];
const MASTERED_BOX = 3;
const DAY = 864e5;
const SESSION_SIZE = 10;
const EXAM_SIZE = 30;
const EXAM_MIN = 30;
const GOAL = 20;
const SUBJECTS = { VWL: 'Volkswirtschaftslehre', BWL: 'Betriebswirtschaftslehre' };

const ALL = CHAPTERS.flatMap(c => c.questions.map(q => ({ ...q, ch: c.id, subject: c.subject })));
const app = document.getElementById('app');

// ---------- Zustand ----------
function freshState() { return { q: {}, log: {}, exams: [], hintDismissed: false }; }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.q) return Object.assign(freshState(), s);
  } catch (e) { /* ignore */ }
  return freshState();
}
let state = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }

const pad = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function status(id) {
  const e = state.q[id];
  if (!e) return 'new';
  if (e.box >= MASTERED_BOX) return 'mastered';
  if (e.box === 0) return 'wrong';
  return 'review';
}

function record(id, correct) {
  const now = Date.now();
  const e = state.q[id] || { box: 0, ok: 0, bad: 0, due: 0, last: 0, fresh: true };
  if (correct) {
    e.ok++;
    if (e.fresh) { e.box = 1; e.due = now + INTERVALS[1] * DAY; }
    else if (e.due <= now) { e.box = Math.min(e.box + 1, INTERVALS.length - 1); e.due = now + INTERVALS[e.box] * DAY; }
  } else {
    e.bad++;
    e.box = 0;
    e.due = now;
  }
  delete e.fresh;
  e.last = now;
  state.q[id] = e;
  const k = dayKey();
  const l = state.log[k] || { a: 0, c: 0 };
  l.a++;
  if (correct) l.c++;
  state.log[k] = l;
  save();
}

function counts(qs) {
  const c = { mastered: 0, review: 0, wrong: 0, new: 0, total: qs.length };
  for (const q of qs) c[status(q.id)]++;
  return c;
}
const pct = c => (c.total ? Math.round(100 * c.mastered / c.total) : 0);
const overallPct = () => pct(counts(ALL));

function streak() {
  let n = 0;
  const d = new Date();
  if (!(state.log[dayKey(d)] && state.log[dayKey(d)].a)) d.setDate(d.getDate() - 1);
  while (state.log[dayKey(d)] && state.log[dayKey(d)].a) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- Helfer ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function render(view, keepScroll) {
  app.replaceChildren(view);
  if (!keepScroll) window.scrollTo(0, 0);
}

function segBar(c, thick) {
  const w = n => (c.total ? (100 * n / c.total) : 0) + '%';
  return h('div', { class: 'bar' + (thick ? ' thick' : '') },
    h('i', { class: 'g', style: 'width:' + w(c.mastered) }),
    h('i', { class: 'a', style: 'width:' + w(c.review) }),
    h('i', { class: 'r', style: 'width:' + w(c.wrong) }));
}

function progressBar(f) {
  return h('div', { class: 'bar' }, h('i', { class: 'p', style: `width:${Math.round(100 * f)}%` }));
}

const correctText = q => (q.type === 'mc' ? q.options[q.answer] : (q.answer ? 'Richtig' : 'Falsch'));

function present(item) {
  if (item.opts) return;
  const q = item.q;
  item.opts = q.type === 'mc'
    ? shuffle(q.options.map((t, i) => ({ t, c: i === q.answer })))
    : [{ t: 'Richtig', c: q.answer === true }, { t: 'Falsch', c: q.answer === false }];
}

// ---------- Auswahl ----------
function pick(pool, n, mode, ordered) {
  const now = Date.now();
  if (mode === 'wrong') return shuffle(pool.filter(q => status(q.id) === 'wrong')).slice(0, n);
  const wrong = [], due = [], fresh = [], rest = [];
  for (const q of pool) {
    const e = state.q[q.id];
    if (!e) fresh.push(q);
    else if (e.box === 0) wrong.push(q);
    else if (e.due <= now) due.push(q);
    else rest.push(q);
  }
  return [...shuffle(wrong), ...shuffle(due), ...(ordered ? fresh : shuffle(fresh)), ...shuffle(rest)].slice(0, n);
}

// ---------- Home ----------
let S = null;

function home() {
  clearInterval(S && S.timer);
  S = null;
  const now = Date.now();
  const all = counts(ALL);
  const today = (state.log[dayKey()] || { a: 0 }).a;
  const dueCount = ALL.filter(q => { const e = state.q[q.id]; return e && e.due <= now; }).length;
  const st = streak();
  const view = h('div', {});

  view.append(h('div', { class: 'top' },
    h('div', {}, h('h1', {}, 'Hohenheim Wiwi App'), h('p', { class: 'sub' }, 'Wirtschaftswissenschaften · 1. Semester'))));

  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios && !navigator.standalone && !state.hintDismissed && location.protocol.startsWith('http')) {
    view.append(h('div', { class: 'card tip' },
      h('p', {}, h('b', {}, 'Tipp: '), 'In Safari auf das Teilen-Symbol tippen und "Zum Home-Bildschirm" wählen. Dann startet die App wie eine normale App und funktioniert auch offline im Zug.'),
      h('button', { class: 'btn-ghost', onclick: () => { state.hintDismissed = true; save(); home(); } }, 'Verstanden')));
  }

  view.append(h('div', { class: 'card' }, h('div', { class: 'row' },
    h('div', { class: 'ring' + (today >= GOAL ? ' done' : ''), style: `--p:${Math.min(100, 100 * today / GOAL)}` }, h('span', {}, today >= GOAL ? 'OK' : String(today))),
    h('div', { class: 'grow' },
      h('h3', {}, today >= GOAL ? 'Tagesziel erreicht' : `Heute ${today} von ${GOAL} Fragen`),
      h('p', { class: 'sub' }, st > 0 ? `${st} ${st === 1 ? 'Tag' : 'Tage'} in Folge gelernt` : 'Starte heute eine neue Serie'))
  )));

  const subjBlocks = [...new Set(CHAPTERS.map(c => c.subject))].map(s => {
    const c = counts(ALL.filter(q => q.subject === s));
    return h('div', { class: 'subj' },
      h('div', { class: 'head' }, h('span', {}, SUBJECTS[s] || s), h('b', {}, pct(c) + ' %')),
      segBar(c));
  });
  view.append(h('div', { class: 'card' },
    h('div', { class: 'row' },
      h('div', { class: 'grow' }, h('p', { class: 'sub' }, 'Gesamtfortschritt'), h('div', { class: 'big' }, String(pct(all)), h('small', {}, ' %'))),
      h('div', { class: 'right sub' }, `${all.mastered} von ${all.total}`, h('br'), 'Fragen gemeistert')),
    h('div', { style: 'margin-top:12px' }, segBar(all, true)),
    subjBlocks,
    h('div', { class: 'legend' },
      h('span', {}, h('i', { class: 'dot g' }), 'gemeistert ', h('b', {}, all.mastered)),
      h('span', {}, h('i', { class: 'dot a' }), 'in Wiederholung ', h('b', {}, all.review)),
      h('span', {}, h('i', { class: 'dot r' }), 'falsch ', h('b', {}, all.wrong)),
      h('span', {}, h('i', { class: 'dot' }), 'neu ', h('b', {}, all.new)))));

  view.append(h('div', { class: 'btn-row' },
    h('button', { class: 'btn-primary', onclick: () => startLearn(ALL) },
      'Weiterlernen',
      h('small', {}, dueCount + all.new === 0 ? 'Alles auf dem neuesten Stand · Übungsrunde' : `${SESSION_SIZE} Fragen · ${dueCount} fällig · ${all.new} neu`)),
    h('button', { class: 'btn-wide', disabled: all.wrong === 0, onclick: () => startLearn(ALL, { mode: 'wrong' }) },
      h('span', {}, 'Nur meine Fehler üben', h('small', {}, all.wrong ? `${all.wrong} Fragen zum Aufarbeiten` : 'Noch keine Fehler offen')),
      h('span', { class: all.wrong ? 'chip' : '' }, String(all.wrong))),
    h('button', { class: 'btn-wide', onclick: startExam },
      h('span', {}, 'Prüfungsmodus', h('small', {}, `${EXAM_SIZE} Fragen · ${EXAM_MIN} Minuten · wie in der Klausur`)),
      h('span', {}, '›'))));

  for (const s of [...new Set(CHAPTERS.map(c => c.subject))]) {
    view.append(h('h2', {}, SUBJECTS[s] || s));
    for (const ch of CHAPTERS.filter(c => c.subject === s)) {
      const qs = ALL.filter(q => q.ch === ch.id);
      const c = counts(qs);
      view.append(h('div', { class: 'card chapter', onclick: () => startLearn(qs, { ordered: true }) },
        h('div', { class: 'head' }, h('span', { class: 'title' }, ch.title), h('span', { class: 'pct' }, pct(c) + ' %')),
        segBar(c),
        h('div', { class: 'meta' },
          h('span', {}, c.mastered === c.total ? 'Alles gemeistert' : `${c.mastered}/${c.total} gemeistert · ${c.new} neu`),
          c.wrong ? h('button', { class: 'chip', onclick: ev => { ev.stopPropagation(); startLearn(qs, { mode: 'wrong' }); } }, `${c.wrong} falsch · üben`) : null)));
    }
  }

  view.append(h('h2', {}, 'Letzte 7 Tage'), weekCard());
  if (state.exams.length) {
    view.append(h('h2', {}, 'Prüfungsergebnisse'),
      h('div', { class: 'card' }, state.exams.slice(-3).reverse().map(x =>
        h('div', { class: 'row', style: 'justify-content:space-between;padding:4px 0' },
          h('span', {}, new Date(x.t).toLocaleDateString('de-DE')),
          h('span', {}, `${x.score}/${x.total}`), h('b', {}, Math.round(100 * x.score / x.total) + ' %')))));
  }

  view.append(h('div', { class: 'foot' },
    h('button', { class: 'btn-ghost', onclick: exportData }, 'Fortschritt sichern'),
    h('button', { class: 'btn-ghost', onclick: importData }, 'Wiederherstellen'),
    h('button', { class: 'btn-ghost btn-danger', onclick: resetAll }, 'Zurücksetzen')));

  render(view);
}

function weekCard() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ d, l: state.log[dayKey(d)] || { a: 0, c: 0 }, today: i === 0 });
  }
  const max = Math.max(GOAL, ...days.map(x => x.l.a));
  const sumA = days.reduce((s, x) => s + x.l.a, 0);
  const sumC = days.reduce((s, x) => s + x.l.c, 0);
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return h('div', { class: 'card' },
    h('div', { class: 'week' }, days.map(x =>
      h('div', { class: 'col' + (x.today ? ' today' : '') },
        h('span', { class: 'num' }, x.l.a ? String(x.l.a) : ''),
        h('div', { class: 'stack', style: 'height:' + Math.round(60 * x.l.a / max) + 'px' },
          h('i', { class: 'g', style: `height:${x.l.a ? 100 * x.l.c / x.l.a : 0}%` }),
          h('i', { class: 'r', style: `height:${x.l.a ? 100 * (x.l.a - x.l.c) / x.l.a : 0}%` })),
        h('span', { class: 'lbl' }, wd[x.d.getDay()])))),
    h('p', { class: 'sub', style: 'margin-top:10px' },
      sumA ? `${sumA} Fragen beantwortet, ${Math.round(100 * sumC / sumA)} % richtig` : 'Noch keine Fragen beantwortet'));
}

// ---------- Lernrunde ----------
function startLearn(pool, opts = {}) {
  const picked = pick(pool, SESSION_SIZE, opts.mode, opts.ordered);
  if (!picked.length) return;
  const now = Date.now();
  S = {
    kind: 'learn', pool, opts,
    items: picked.map(q => ({ q, retry: false })),
    idx: 0, first: picked.length, ok: 0, wrongQs: [], locked: false,
    before: overallPct(),
    practice: picked.every(q => { const e = state.q[q.id]; return e && e.box > 0 && e.due > now; })
  };
  showQuestion();
}

function showQuestion() {
  const it = S.items[S.idx];
  present(it);
  S.locked = false;
  const q = it.q;
  const chTitle = (CHAPTERS.find(c => c.id === q.ch) || {}).title || '';
  const optsEl = h('div', { class: 'opts' + (q.type === 'tf' ? ' tfrow' : '') });
  const btns = it.opts.map((o, i) => {
    const b = h('button', { class: 'opt', onclick: () => answer(i) },
      q.type === 'mc' ? h('span', { class: 'k' }, 'ABCD'[i]) : null, o.t);
    optsEl.append(b);
    return b;
  });
  const slot = h('div', {});

  function answer(i) {
    if (S.locked) return;
    S.locked = true;
    const correct = it.opts[i].c;
    btns.forEach((b, k) => {
      if (it.opts[k].c) b.classList.add('ok');
      else if (k === i) b.classList.add('bad');
    });
    if (!it.retry) {
      record(q.id, correct);
      if (correct) S.ok++;
      else { S.wrongQs.push(q); S.items.push({ q, retry: true }); }
    }
    slot.append(
      h('div', { class: 'feedback ' + (correct ? 'ok' : 'bad') },
        h('div', { class: 'h' }, correct ? 'Richtig!' : 'Leider falsch.'),
        h('p', {}, q.explanation),
        q.slide ? h('p', { class: 'src' }, 'Quelle: ' + q.slide) : null,
        !correct && !it.retry ? h('p', { class: 'src' }, 'Die Frage kommt am Ende dieser Runde noch einmal.') : null),
      h('button', { class: 'btn-primary next', onclick: () => { S.idx++; S.idx >= S.items.length ? showResult() : showQuestion(); } },
        S.idx + 1 >= S.items.length ? 'Ergebnis ansehen' : 'Weiter'));
    slot.lastChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  render(h('div', {},
    h('div', { class: 'q-top' },
      h('button', { class: 'x', 'aria-label': 'Beenden', onclick: home }, '×'),
      progressBar(S.idx / S.items.length),
      h('span', { class: 'sub' }, `${S.idx + 1}/${S.items.length}`)),
    h('div', { class: 'card' },
      h('span', { class: 'tag' + (it.retry ? ' retry' : '') }, it.retry ? 'Nochmal versuchen' : chTitle),
      h('div', { class: 'question' }, q.q),
      optsEl, slot)));
}

function showResult() {
  const after = overallPct();
  const ratio = S.ok / S.first;
  const msg = ratio >= .9 ? 'Stark!' : ratio >= .7 ? 'Gut gemacht.' : ratio >= .5 ? 'Solide. Die falschen kommen bald wieder.' : 'Dranbleiben. Genau dafür ist die Wiederholung da.';
  const view = h('div', {},
    h('div', { class: 'card result-score' },
      h('div', { class: 'big' }, `${S.ok}/${S.first}`),
      h('p', { class: 'sub' }, 'beim ersten Versuch richtig'),
      h('h3', { style: 'margin-top:10px' }, msg),
      h('p', { class: 'sub', style: 'margin-top:6px' },
        S.practice ? 'Übungsrunde: Fragen, die noch nicht zur Wiederholung fällig waren, verändern den Fortschritt nicht.'
          : `Gesamtfortschritt: ${after} %` + (after > S.before ? ` (+${after - S.before})` : ''))));

  if (S.wrongQs.length) {
    view.append(h('h2', {}, 'Zum Nachlesen'),
      h('div', { class: 'card' }, S.wrongQs.map(q =>
        h('div', { class: 'wrong-item' },
          h('div', {}, q.q),
          h('div', { class: 'a' }, 'Richtig: ' + correctText(q)),
          h('div', { class: 'e' }, q.explanation)))));
  }

  const hasWrong = counts(ALL).wrong > 0;
  view.append(h('div', { class: 'btn-row' },
    h('button', { class: 'btn-primary', onclick: () => startLearn(S.pool, S.opts) }, 'Nächste Runde'),
    hasWrong ? h('button', { onclick: () => startLearn(ALL, { mode: 'wrong' }) }, 'Meine Fehler üben') : null,
    h('button', { onclick: home }, 'Zur Übersicht')));
  render(view);
}

// ---------- Prüfungsmodus ----------
function startExam() {
  const mc = shuffle(ALL.filter(q => q.type === 'mc')).slice(0, EXAM_SIZE);
  S = {
    kind: 'exam',
    items: mc.map(q => ({ q, retry: false, sel: null })),
    idx: 0, start: Date.now(), end: Date.now() + EXAM_MIN * 60000, timerEl: null
  };
  S.items.forEach(present);
  S.timer = setInterval(tick, 1000);
  showExam();
}

function tick() {
  if (!S || S.kind !== 'exam') return;
  const left = Math.max(0, Math.round((S.end - Date.now()) / 1000));
  if (S.timerEl) {
    S.timerEl.textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
    S.timerEl.classList.toggle('low', left <= 300);
  }
  if (left <= 0) finishExam();
}

function showExam(keep) {
  const it = S.items[S.idx];
  const last = S.idx === S.items.length - 1;
  const answered = S.items.filter(x => x.sel != null).length;
  S.timerEl = h('span', { class: 'timer' }, '');
  render(h('div', {},
    h('div', { class: 'q-top' },
      h('button', { class: 'x', 'aria-label': 'Abbrechen', onclick: () => { if (confirm('Prüfung abbrechen? Die Antworten werden nicht gewertet.')) home(); } }, '×'),
      progressBar(answered / S.items.length),
      S.timerEl),
    h('div', { class: 'card' },
      h('span', { class: 'tag' }, `Frage ${S.idx + 1} von ${S.items.length} · ${answered} beantwortet`),
      h('div', { class: 'question' }, it.q.q),
      h('div', { class: 'opts' }, it.opts.map((o, i) =>
        h('button', { class: 'opt' + (it.sel === i ? ' sel' : ''), onclick: () => { it.sel = i; showExam(true); } },
          h('span', { class: 'k' }, 'ABCD'[i]), o.t)))),
    h('div', { class: 'nav' },
      h('button', { disabled: S.idx === 0, onclick: () => { S.idx--; showExam(); } }, 'Zurück'),
      last
        ? h('button', { class: 'btn-primary', onclick: () => {
            const open = S.items.length - answered;
            if (!open || confirm(`${open} Fragen sind unbeantwortet. Trotzdem abgeben?`)) finishExam();
          } }, 'Abgeben')
        : h('button', { onclick: () => { S.idx++; showExam(); } }, 'Weiter'))), keep);
  tick();
}

function finishExam() {
  if (!S || S.kind !== 'exam') return;
  clearInterval(S.timer);
  const used = Math.min(EXAM_MIN * 60, Math.round((Date.now() - S.start) / 1000));
  let score = 0;
  const missed = [];
  for (const it of S.items) {
    const ok = it.sel != null && it.opts[it.sel].c;
    if (ok) score++; else missed.push(it);
    if (it.sel != null) record(it.q.id, ok);
  }
  const total = S.items.length;
  state.exams.push({ t: Date.now(), score, total });
  save();
  const p = Math.round(100 * score / total);
  const view = h('div', {},
    h('div', { class: 'card result-score' },
      h('div', { class: 'big' }, String(p), h('small', {}, ' %')),
      h('p', { class: 'sub' }, `${score} von ${total} richtig · Zeit ${Math.floor(used / 60)}:${pad(used % 60)} min`),
      h('p', { class: 'sub', style: 'margin-top:8px' }, 'Falsche Antworten landen in "Meine Fehler" und kommen in den Wiederholungsrunden wieder.')));
  if (missed.length) {
    view.append(h('h2', {}, 'Zum Nachlesen'),
      h('div', { class: 'card' }, missed.map(it =>
        h('div', { class: 'wrong-item' },
          h('div', {}, it.q.q),
          it.sel != null ? h('div', { class: 'you' }, 'Deine Antwort: ' + it.opts[it.sel].t) : h('div', { class: 'you' }, 'Nicht beantwortet'),
          h('div', { class: 'a' }, 'Richtig: ' + correctText(it.q)),
          h('div', { class: 'e' }, it.q.explanation)))));
  }
  view.append(h('div', { class: 'btn-row' },
    counts(ALL).wrong ? h('button', { class: 'btn-primary', onclick: () => startLearn(ALL, { mode: 'wrong' }) }, 'Meine Fehler üben') : null,
    h('button', { onclick: home }, 'Zur Übersicht')));
  S = null;
  render(view);
}

// ---------- Sichern / Zurücksetzen ----------
function exportData() {
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(
      () => alert('Sicherungscode in die Zwischenablage kopiert. Füge ihn z. B. in eine Notiz ein.'),
      () => prompt('Sicherungscode (kopieren):', code));
  } else {
    prompt('Sicherungscode (kopieren):', code);
  }
}

function importData() {
  const code = prompt('Sicherungscode einfügen:');
  if (!code) return;
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!s || !s.q) throw new Error('bad');
    if (!confirm('Aktuellen Fortschritt durch die Sicherung ersetzen?')) return;
    state = Object.assign(freshState(), s);
    save();
    home();
  } catch (e) {
    alert('Der Code ist ungültig.');
  }
}

function resetAll() {
  if (!confirm('Wirklich den gesamten Fortschritt löschen?')) return;
  state = freshState();
  save();
  home();
}

// ---------- Start ----------
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
home();
})();
