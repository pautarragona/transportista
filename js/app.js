/* Transportista — app de estudio del título de transportista (mercancías).
 * Vanilla JS, sin build. Progreso en localStorage + Supabase (si hay sesión).
 * Decisiones de diseño basadas en investigación: ver claude/investigacion-ux.md en el proyecto.
 */
(() => {
  "use strict";

  const CFG = window.TP_CONFIG || {};
  const DAY = 864e5;
  const MASTER_IVL = 14;          // días de intervalo para considerar "dominada"
  const CASO_WEIGHT = 5;          // un caso práctico cuenta como 5 respuestas para el objetivo diario
  const MIN_TO_GOAL = { 10: 25, 20: 50, 30: 75, 45: 110 };
  const WHEN = [
    ["manana", "Al despertarme"], ["trayecto", "En el trayecto"], ["mediodia", "Al mediodía"],
    ["tarde", "Por la tarde"], ["cena", "Después de cenar"],
  ];

  // ---------- utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const fmt = (n) => Number(n).toLocaleString("es-ES");
  const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const endOfDay = (t = Date.now()) => startOfDay(t) + DAY - 1;
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const fmtDate = (t, o = { weekday: "short", day: "numeric", month: "short" }) => new Date(t).toLocaleDateString("es-ES", o);
  const reduceMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LETTERS = "ABCDEFGH";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("localStorage", e); } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  function toast(msg, ms = 2800) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
  }
  function modal(html, onMount) {
    const m = $("#modal");
    m.innerHTML = `<div class="panel stack" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false;
    m.onclick = (e) => { if (e.target === m && !m.dataset.locked) closeModal(); };
    onMount && onMount(m);
  }
  function closeModal() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; delete m.dataset.locked; }

  // ---------- iconos (trazo 24px) ----------
  const P = {
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none"/>',
    list: '<path d="M4 5h16M4 12h16M4 19h10"/>',
    x: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.5 4 2.8 4 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    case: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  const icon = (k, cls = "") => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[k] || ""}</svg>`;

  // Materias: nombre corto + icono propio; el color va por CSS ([data-m]). Señalización coherente en toda la web.
  const MAT = {
    A: { short: "Civil", ico: '<path d="M12 3v18M6 21h12M4 7h16"/><path d="M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>' },
    B: { short: "Mercantil", ico: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>' },
    C: { short: "Laboral", ico: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>' },
    D: { short: "Fiscal", ico: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.6a4.2 4.2 0 1 0 0 6.8M7.5 11h6.5M7.5 13.5h6.5"/>' },
    E: { short: "Gestión", ico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
    F: { short: "Mercados", ico: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>' },
    G: { short: "Técnica", ico: '<rect x="2" y="7" width="12" height="9" rx="1.5"/><path d="M14 10h4l3 3.5V16h-7z"/><circle cx="6.5" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>' },
    H: { short: "Seg. vial", ico: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>' },
  };
  const matIcon = (m) => `<svg viewBox="0 0 24 24" aria-hidden="true">${MAT[m]?.ico || ""}</svg>`;
  const matBadge = (m, sm) => `<span class="mat${sm ? " sm" : ""}" data-m="${m}">${matIcon(m)}</span>`;
  const mchip = (m, label) => `<span class="mchip" data-m="${m}">${matBadge(m, true)}${esc(label || MAT[m]?.short || m)}</span>`;

  // Mascota: camión redondeado con cara (diseño emocional). Solo fuera de las preguntas (evitar "detalles seductores").
  function mascot(mood = "happy", w = 96) {
    const mouth = mood === "wow"
      ? '<ellipse cx="89" cy="45" rx="3" ry="3.6" fill="#2b3542"/>'
      : mood === "calm" ? '<path d="M85 44.5h8" stroke="#2b3542" stroke-width="2.4" stroke-linecap="round"/>'
      : '<path d="M84 43q5 4.6 10 0" stroke="#2b3542" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    return `<svg class="mascot" width="${w}" viewBox="0 0 120 76" aria-hidden="true">
      <rect x="4" y="14" width="62" height="44" rx="9" fill="#1a5fb4"/><rect x="11" y="24" width="48" height="6" rx="3" fill="#fff" opacity=".22"/><rect x="11" y="35" width="32" height="6" rx="3" fill="#fff" opacity=".22"/>
      <path d="M64 22h26c6 0 9.5 2 12.6 7l9.4 15.4c1.4 2.4 2 4.3 2 7.2V58H64z" fill="#f6b60f"/>
      <path d="M71 28h18c3 0 4.8 1 6.3 3.4L102 43H71z" fill="#fff"/>
      <circle cx="81" cy="36.5" r="3.2" fill="#2b3542"/><circle cx="93" cy="36.5" r="3.2" fill="#2b3542"/>
      <circle cx="82" cy="35.4" r="1" fill="#fff"/><circle cx="94" cy="35.4" r="1" fill="#fff"/>
      ${mouth}<circle cx="77" cy="43" r="2.2" fill="#ff9f7f" opacity=".75"/><circle cx="98.5" cy="43" r="2.2" fill="#ff9f7f" opacity=".75"/>
      <rect x="107" y="50" width="7" height="4" rx="2" fill="#fff3b0"/>
      <circle cx="22" cy="61" r="9.5" fill="#2b3542"/><circle cx="22" cy="61" r="3.6" fill="#c5ced8"/>
      <circle cx="92" cy="61" r="9.5" fill="#2b3542"/><circle cx="92" cy="61" r="3.6" fill="#c5ced8"/>
    </svg>`;
  }

  function confetti() {
    if (reduceMotion()) return;
    const c = document.createElement("canvas");
    c.id = "confetti"; c.width = innerWidth; c.height = innerHeight;
    document.body.appendChild(c);
    const ctx = c.getContext("2d");
    const cols = ["#f6b60f", "#1a5fb4", "#12804f", "#ffffff", "#c25e12"];
    const ps = Array.from({ length: 90 }, () => ({
      x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .35,
      vx: (Math.random() - .5) * 11, vy: -Math.random() * 11 - 4, r: Math.random() * Math.PI,
      s: 5 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0],
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of ps) { p.vy += .32; p.x += p.vx; p.y += p.vy; p.r += .15; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
      if (t - t0 < 1800) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  // ---------- estado ----------
  const S = {
    bank: null,          // {version, materias, temas, q}
    Q: [],               // preguntas test [{id, m, t, text, opts, sol, norma}]
    C: [],               // casos prácticos (id = "C" + código)
    casosP: null,
    normas: {},          // base de la norma -> url oficial
    byId: new Map(),
    scope: "guest",
    user: null,
    progress: {},
    log: [],             // [ts, qid, correct(0/1)]
    exams: [],
    settings: {},
    queue: [],
    sb: null,
    community: null,
  };
  const K = (name) => `tp:v1:${S.scope}:${name}`;
  const DEFAULTS = { onboarded: false, minutes: 20, when: "", newPerDay: 30, autoNew: true, newCasosPerDay: 3, newOrder: "temas", examDate: "", materias: "ABCDEFGH", casosMode: "guiado", celebrated: "" };
  function loadLocal() {
    S.progress = store.get(K("progress"), {});
    S.log = store.get(K("log"), []);
    S.exams = store.get(K("exams"), []);
    S.queue = store.get(K("queue"), []);
    S.settings = Object.assign({}, DEFAULTS, store.get(K("settings"), {}));
    // quien ya usaba la versión anterior no necesita la bienvenida
    if (!S.settings.onboarded && Object.keys(S.progress).length > 20) S.settings.onboarded = true;
  }
  let saveT = null;
  function saveLocal() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const cutoff = Date.now() - 400 * DAY;
      if (S.log.length > 60000 || (S.log[0] && S.log[0][0] < cutoff)) S.log = S.log.filter((r) => r[0] >= cutoff).slice(-60000);
      store.set(K("progress"), S.progress);
      store.set(K("log"), S.log);
      store.set(K("exams"), S.exams);
      store.set(K("queue"), S.queue);
      store.set(K("settings"), S.settings);
    }, 150);
  }
  const dailyGoal = () => MIN_TO_GOAL[S.settings.minutes] || 50;
  const daysToExam = () => (S.settings.examDate ? Math.ceil((Date.parse(S.settings.examDate + "T09:30") - startOfDay()) / DAY) : null);

  // ---------- repetición espaciada (SM-2 simplificado, consciente de la fecha del examen) ----------
  // grade: 0 = fallo, 1 = difícil, 2 = bien, 3 = fácil
  function blankCard() { return { reps: 0, lapses: 0, ease: 2.5, ivl: 0, due: 0, seen: 0, correct: 0, last_correct: null, last_at: 0, flagged: false }; }
  function card(id) { return S.progress[id] || blankCard(); }
  function isDue(c, now = Date.now()) { return c.seen > 0 && c.due <= endOfDay(now); }
  function schedule(c0, grade, now = Date.now()) {
    const c = Object.assign(blankCard(), c0);
    c.seen += 1;
    c.last_at = now;
    c.last_correct = grade > 0;
    if (grade > 0) c.correct += 1;
    if (grade === 0) {
      if (c.reps > 0 || c.ivl > 0) c.lapses += 1;
      c.reps = 0;
      c.ease = Math.max(1.3, c.ease - 0.2);
      c.ivl = 0;
      c.due = now + 10 * 60 * 1000;
      return c;
    }
    const early = c0 && c0.seen > 0 && c0.ivl >= 1 && c0.due > endOfDay(now);
    if (early) return c; // repaso anticipado acertado: no alarga el intervalo
    let ivl;
    if (c.reps === 0) ivl = grade === 3 ? 3 : 1;
    else if (c.reps === 1) ivl = grade === 1 ? 2 : grade === 2 ? 3 : 6;
    else {
      if (grade === 1) { ivl = Math.max(c.ivl * 1.2, c.ivl + 1); c.ease = Math.max(1.3, c.ease - 0.15); }
      else if (grade === 2) ivl = c.ivl * c.ease;
      else { ivl = c.ivl * c.ease * 1.3; c.ease += 0.15; }
    }
    if (ivl > 3) ivl *= 0.95 + Math.random() * 0.1;
    // Cepeda et al. 2008: el hueco óptimo es una fracción del tiempo hasta el examen → que todo se repase antes del examen
    const dte = daysToExam();
    if (dte && dte > 0) ivl = Math.min(ivl, Math.max(1, Math.round(dte * 0.4)));
    c.ivl = Math.min(365, Math.round(ivl * 10) / 10);
    c.reps += 1;
    c.due = startOfDay(now) + Math.round(c.ivl) * DAY + 4 * 3600 * 1000;
    return c;
  }
  function status(c) {
    if (!c || !c.seen) return "new";
    if (c.ivl >= MASTER_IVL && c.last_correct) return "master";
    if (c.last_correct === false) return "wrong";
    return "learn";
  }
  function recordAnswer(id, chosen, grade, mode) {
    const now = Date.now();
    const correct = grade > 0;
    const c = schedule(S.progress[id], grade, now);
    if (S.progress[id]) c.flagged = S.progress[id].flagged;
    S.progress[id] = c;
    S.log.push([now, id, correct ? 1 : 0]);
    if (S.user) {
      S.queue.push({ t: "p", qid: id });
      S.queue.push({ t: "a", row: { qid: id, chosen, correct, mode, created_at: new Date(now).toISOString() } });
      scheduleFlush();
    }
    saveLocal();
    return c;
  }
  function regrade(id, grade) {
    const prev = regrade.prev;
    if (!prev || prev.id !== id) return;
    const c = schedule(prev.card, grade, prev.now);
    c.flagged = S.progress[id]?.flagged || false;
    S.progress[id] = c;
    if (S.user) { S.queue.push({ t: "p", qid: id }); scheduleFlush(); }
    saveLocal();
  }
  function toggleFlag(id) {
    const c = Object.assign(blankCard(), S.progress[id]);
    c.flagged = !c.flagged;
    S.progress[id] = c;
    if (S.user) { S.queue.push({ t: "p", qid: id }); scheduleFlush(); }
    saveLocal();
    return c.flagged;
  }

  // ---------- Supabase ----------
  function initSupabase() {
    if (!CFG.supabaseUrl || !CFG.supabaseKey || !window.supabase) return;
    try {
      S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    } catch (e) { console.warn(e); S.sb = null; }
  }
  const progressRow = (qid) => {
    const c = S.progress[qid];
    return {
      user_id: S.user.id, qid, reps: c.reps, lapses: c.lapses, ease: c.ease, ivl: c.ivl,
      due: c.due ? new Date(c.due).toISOString() : null, seen: c.seen, correct: c.correct,
      last_correct: c.last_correct, last_at: c.last_at ? new Date(c.last_at).toISOString() : null, flagged: !!c.flagged,
    };
  };
  let flushT = null, flushing = false;
  function scheduleFlush(delay = 1500) { clearTimeout(flushT); flushT = setTimeout(flush, delay); renderAccount(); }
  async function flush() {
    if (!S.sb || !S.user || flushing || !S.queue.length) return;
    flushing = true;
    const batch = S.queue.slice(0, 600);
    try {
      const pids = [...new Set(batch.filter((o) => o.t === "p").map((o) => o.qid))].filter((q) => S.progress[q]);
      const ans = batch.filter((o) => o.t === "a").map((o) => ({ ...o.row, user_id: S.user.id }));
      const exs = batch.filter((o) => o.t === "e").map((o) => ({ ...o.row, user_id: S.user.id }));
      if (pids.length) { const { error } = await S.sb.from("progress").upsert(pids.map(progressRow), { onConflict: "user_id,qid" }); if (error) throw error; }
      if (ans.length) { const { error } = await S.sb.from("answers").insert(ans); if (error) throw error; }
      if (exs.length) { const { error } = await S.sb.from("exams").insert(exs); if (error) throw error; }
      S.queue.splice(0, batch.length);
      saveLocal();
    } catch (e) {
      console.warn("sync", e);
      flushing = false; renderAccount();
      clearTimeout(flushT); flushT = setTimeout(flush, 20000);
      return;
    }
    flushing = false;
    renderAccount();
    if (S.queue.length) scheduleFlush(200);
  }
  async function fetchAll(table, cols, filter) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = S.sb.from(table).select(cols).range(from, from + 999);
      if (filter) q = filter(q);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  async function pullRemote() {
    const [prog, ans, exams] = await Promise.all([
      fetchAll("progress", "*"),
      fetchAll("answers", "qid,correct,created_at", (q) => q.gte("created_at", new Date(Date.now() - 400 * DAY).toISOString()).order("created_at")),
      fetchAll("exams", "*", (q) => q.order("created_at")),
    ]);
    const P = {};
    for (const r of prog) {
      P[r.qid] = { reps: r.reps, lapses: r.lapses, ease: r.ease, ivl: r.ivl, due: r.due ? Date.parse(r.due) : 0, seen: r.seen, correct: r.correct, last_correct: r.last_correct, last_at: r.last_at ? Date.parse(r.last_at) : 0, flagged: r.flagged };
    }
    return { P, log: ans.map((a) => [Date.parse(a.created_at), a.qid, a.correct ? 1 : 0]), exams: exams.map(examFromRow) };
  }
  const examFromRow = (r) => ({ kind: r.kind, total: r.total, correct: r.correct, wrong: r.wrong, blank: r.blank, score: r.score, duration_s: r.duration_s, per_materia: r.per_materia, at: Date.parse(r.created_at) });
  const examToRow = (e) => ({ kind: e.kind, total: e.total, correct: e.correct, wrong: e.wrong, blank: e.blank, score: e.score, duration_s: e.duration_s, per_materia: e.per_materia, created_at: new Date(e.at).toISOString() });

  async function onSignedIn(user) {
    if (S.user && S.user.id === user.id) return;
    // progreso hecho sin cuenta en este navegador
    const guest = { progress: store.get("tp:v1:guest:progress", {}), log: store.get("tp:v1:guest:log", []), exams: store.get("tp:v1:guest:exams", []), settings: store.get("tp:v1:guest:settings", null) };
    S.user = user;
    S.scope = user.id;
    loadLocal();
    renderAccount();
    try {
      const remote = await pullRemote();
      // fusionar: gana la tarjeta repasada más recientemente
      const merged = Object.assign({}, remote.P);
      for (const src of [S.progress, guest.progress]) {
        for (const [qid, c] of Object.entries(src)) {
          if (!merged[qid] || (c.last_at || 0) > (merged[qid].last_at || 0)) { merged[qid] = c; S.queue.push({ t: "p", qid }); }
        }
      }
      S.progress = merged;
      const seenLog = new Set(remote.log.map((r) => r[0] + r[1]));
      const lastRemote = remote.log.length ? remote.log[remote.log.length - 1][0] : 0;
      const localNew = S.log.filter((r) => r[0] > lastRemote && !seenLog.has(r[0] + r[1])); // de este dispositivo, aún sin subir
      const extraLog = guest.log.filter((r) => !seenLog.has(r[0] + r[1]));
      for (const r of extraLog) S.queue.push({ t: "a", row: { qid: r[1], chosen: null, correct: !!r[2], mode: "import", created_at: new Date(r[0]).toISOString() } });
      S.log = remote.log.concat(localNew, extraLog).sort((a, b) => a[0] - b[0]);
      const localEx = S.exams.filter((e) => !remote.exams.some((x) => Math.abs(x.at - e.at) < 1000));
      const extraEx = guest.exams.filter((e) => !remote.exams.some((x) => Math.abs(x.at - e.at) < 1000));
      for (const e of extraEx) S.queue.push({ t: "e", row: examToRow(e) });
      S.exams = remote.exams.concat(localEx, extraEx).sort((a, b) => a.at - b.at);
      if (guest.settings && !store.get(K("settings"), null)) S.settings = Object.assign(S.settings, guest.settings);
      if (Object.keys(guest.progress).length || guest.log.length) {
        ["progress", "log", "exams", "queue"].forEach((k) => store.del("tp:v1:guest:" + k));
        toast("Tu progreso sin cuenta se ha añadido a tu cuenta");
      }
      saveLocal();
      scheduleFlush(300);
    } catch (e) {
      console.warn(e);
      toast("No se pudo sincronizar ahora; se guardará en este dispositivo y se subirá luego.");
    }
    route();
  }
  function onSignedOut() {
    S.user = null; S.scope = "guest"; loadLocal(); renderAccount(); route();
  }

  function renderAccount() {
    const el = $("#account");
    if (!S.sb) { el.innerHTML = ""; return; }
    if (!S.user) { el.innerHTML = `<button class="btn small" id="btn-login">Entrar</button>`; $("#btn-login").onclick = openLogin; return; }
    const pending = S.queue.length;
    el.innerHTML = `<span class="sync-dot ${pending ? "pending" : ""}" title="${pending ? pending + " cambios pendientes de subir" : "Sincronizado"}"></span>
      <span class="who hide-sm">${esc(S.user.email || "Cuenta")}</span>
      <button class="btn small" id="btn-acc">Cuenta</button>`;
    $("#btn-acc").onclick = openAccount;
  }
  function openLogin(mode = "login") {
    const isSignup = mode === "signup";
    modal(`
      <div class="row"><h2 style="margin:0">${isSignup ? "Crear cuenta" : "Entrar"}</h2><span class="spacer"></span><button class="btn ghost small" data-x>✕</button></div>
      <p class="muted small">Con cuenta tu progreso se guarda en la nube y se sincroniza entre móvil y ordenador. Sin cuenta se guarda solo en este navegador.</p>
      ${CFG.googleLogin ? `<button class="btn block" id="g-login"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continuar con Google</button><p class="tiny" style="text-align:center;margin:0">o con email</p>` : ""}
      <form id="f-login" class="stack">
        <div class="field"><label for="f-email">Email</label><input class="input" id="f-email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="f-pass">Contraseña</label><input class="input" id="f-pass" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" minlength="6" required></div>
        <button class="btn go block" type="submit">${isSignup ? "Crear cuenta" : "Entrar"}</button>
        <p class="small muted" id="f-msg" style="margin:0"></p>
      </form>
      <p class="small" style="margin:0">${isSignup ? `¿Ya tienes cuenta? <a href="#" data-mode="login">Entrar</a>` : `¿No tienes cuenta? <a href="#" data-mode="signup">Crear una gratis</a> · <a href="#" data-reset>¿Olvidaste la contraseña?</a>`}</p>`,
      (m) => {
        $("[data-x]", m).onclick = closeModal;
        $$("[data-mode]", m).forEach((a) => (a.onclick = (e) => { e.preventDefault(); openLogin(a.dataset.mode); }));
        const g = $("#g-login", m);
        if (g) g.onclick = () => S.sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
        const reset = $("[data-reset]", m);
        if (reset) reset.onclick = async (e) => {
          e.preventDefault();
          const email = $("#f-email", m).value.trim();
          if (!email) { $("#f-msg", m).textContent = "Escribe tu email arriba y vuelve a pulsar."; return; }
          const { error } = await S.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
          $("#f-msg", m).textContent = error ? "Error: " + error.message : "Te hemos enviado un email para cambiar la contraseña.";
        };
        $("#f-login", m).onsubmit = async (e) => {
          e.preventDefault();
          const email = $("#f-email", m).value.trim(), password = $("#f-pass", m).value;
          const msg = $("#f-msg", m);
          msg.textContent = "Un momento…";
          const { data, error } = isSignup
            ? await S.sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
            : await S.sb.auth.signInWithPassword({ email, password });
          if (error) { msg.textContent = traduceAuth(error.message); return; }
          if (isSignup && !data.session) { msg.textContent = "Cuenta creada. Revisa tu email para confirmarla y luego entra."; return; }
          closeModal();
          toast(isSignup ? "¡Cuenta creada!" : "Sesión iniciada");
        };
        setTimeout(() => $("#f-email", m)?.focus(), 50);
      });
  }
  function traduceAuth(m) {
    if (/Invalid login/i.test(m)) return "Email o contraseña incorrectos.";
    if (/already registered/i.test(m)) return "Ese email ya tiene cuenta. Entra con él.";
    if (/Email not confirmed/i.test(m)) return "Confirma tu email (revisa la bandeja de entrada) antes de entrar.";
    if (/at least 6/i.test(m)) return "La contraseña debe tener al menos 6 caracteres.";
    if (/rate limit/i.test(m)) return "Demasiados intentos. Prueba en unos minutos.";
    return "Error: " + m;
  }
  function openAccount() {
    modal(`
      <div class="row"><h2 style="margin:0">Tu cuenta</h2><span class="spacer"></span><button class="btn ghost small" data-x>✕</button></div>
      <p class="muted">${esc(S.user.email)}</p>
      <p class="small">${S.queue.length ? `${S.queue.length} cambios pendientes de subir.` : "Todo sincronizado ✓"}</p>
      <div class="field"><label>Nueva contraseña</label><div class="row"><input class="input" id="np" type="password" minlength="6" style="flex:1"><button class="btn small" id="np-b">Cambiar</button></div></div>
      <div class="row"><button class="btn" id="sync-now">Sincronizar ahora</button><span class="spacer"></span><button class="btn" id="logout">Cerrar sesión</button></div>`,
      (m) => {
        $("[data-x]", m).onclick = closeModal;
        $("#sync-now", m).onclick = () => { flush(); closeModal(); toast("Sincronizando…"); };
        $("#np-b", m).onclick = async () => {
          const { error } = await S.sb.auth.updateUser({ password: $("#np", m).value });
          toast(error ? traduceAuth(error.message) : "Contraseña cambiada");
        };
        $("#logout", m).onclick = async () => { await flush(); await S.sb.auth.signOut(); closeModal(); toast("Sesión cerrada"); };
      });
  }


  // ---------- datos ----------
  async function loadBank() {
    const res = await fetch(CFG.dataUrl || "data/questions.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("No se pudo cargar el banco de preguntas (" + res.status + ")");
    const b = await res.json();
    S.bank = b;
    S.Q = b.q.map(([id, text, opts, sol, norma]) => ({ id, m: id[1], t: id.slice(1, 4), text, opts, sol, norma }));
    S.byId = new Map(S.Q.map((q) => [q.id, q]));
    const v = b.version || "";
    $("#bank-version").textContent = v.length === 6 ? `Versión del banco: ${v.slice(0, 2)}/${v.slice(2, 4)}/20${v.slice(4)}.` : "";
    fetch((CFG.dataUrl || "data/questions.json").replace("questions.json", "normas.json"), { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : {})).then((n) => (S.normas = n || {})).catch(() => {});
  }
  function ensureCasos() {
    if (!S.casosP) {
      S.casosP = fetch((CFG.dataUrl || "data/questions.json").replace("questions.json", "casos.json"), { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : { q: [] }))
        .then((b) => {
          S.C = b.q.map(([code, text, opts, sol, norma, nota]) => ({ id: "C" + code, code, m: code[1], t: code.slice(1, 4), text, opts, sol, norma, nota, caso: true }));
          S.C.forEach((q) => S.byId.set(q.id, q));
        })
        .catch(() => { S.C = []; });
    }
    return S.casosP;
  }
  const mOf = (id) => (id[0] === "C" ? id[2] : id[1]);
  const codeOf = (q) => q.code || q.id;
  const allItems = () => S.Q.concat(S.C);
  const materiaName = (m) => S.bank.materias[m] || m;
  const temaNum = (t) => String(parseInt(t.slice(1), 10));
  const temasOf = (m) => Object.keys(S.bank.temas).filter((t) => t[0] === m);
  const inMaterias = (q) => S.settings.materias.includes(q.m);

  // ---------- métricas ----------
  function countsFor(list) {
    const r = { total: list.length, new: 0, learn: 0, wrong: 0, master: 0, seen: 0, due: 0 };
    const now = Date.now();
    for (const q of list) {
      const c = S.progress[q.id];
      r[status(c)]++;
      if (c && c.seen) r.seen++;
      if (c && isDue(c, now)) r.due++;
    }
    return r;
  }
  function barHTML(c) {
    const t = c.total || 1;
    return `<div class="bar" role="img" aria-label="${c.master} dominadas, ${c.learn} aprendiendo, ${c.wrong} falladas, ${c.new} sin ver"><i class="m" style="width:${(100 * c.master) / t}%"></i><i class="l" style="width:${(100 * c.learn) / t}%"></i><i class="w" style="width:${(100 * c.wrong) / t}%"></i></div>`;
  }
  function newToday(casos = false) {
    const s = startOfDay();
    const before = new Set(), first = new Set();
    let n = 0;
    for (const [ts, id] of S.log) {
      if ((id[0] === "C") !== casos) continue;
      if (ts < s) before.add(id);
      else if (!before.has(id) && !first.has(id)) { first.add(id); n++; }
    }
    return n;
  }
  function doneToday() {
    const s = startOfDay();
    let n = 0;
    for (const [ts, id] of S.log) if (ts >= s) n += id[0] === "C" ? CASO_WEIGHT : 1;
    return n;
  }
  function streak() {
    const days = new Set(S.log.map((r) => dayKey(r[0])));
    let n = 0, t = Date.now();
    if (!days.has(dayKey(t))) t -= DAY;
    while (days.has(dayKey(t))) { n++; t -= DAY; }
    return n;
  }
  const unseenTest = () => S.Q.filter((q) => inMaterias(q) && !card(q.id).seen).length;
  function neededPerDay() {
    // nuevas al día necesarias para verlo todo una semana antes del examen
    const dte = daysToExam();
    return dte && dte > 8 ? Math.ceil(unseenTest() / (dte - 7)) : null;
  }
  function newPerDay() {
    // automático: lo necesario para llegar al examen, pero sin pasar de lo que cabe en el tiempo elegido
    const s = S.settings;
    if (!s.autoNew) return s.newPerDay;
    const cap = Math.round(dailyGoal() * 0.6);
    const need = neededPerDay();
    return need ? Math.max(8, Math.min(need, cap)) : Math.max(10, Math.round(dailyGoal() * 0.45));
  }
  function dueList() {
    const now = Date.now();
    return S.Q.filter((q) => inMaterias(q) && isDue(card(q.id), now)).sort((a, b) => card(a.id).due - card(b.id).due);
  }
  function newList() {
    const l = S.Q.filter((q) => inMaterias(q) && !card(q.id).seen);
    if (S.settings.newOrder === "aleatorio") return shuffle(l);
    if (S.settings.newOrder === "mezcla") {
      const by = {}; l.forEach((q) => (by[q.m] = by[q.m] || []).push(q));
      const out = []; const keys = Object.keys(by);
      while (out.length < l.length) for (const k of keys) if (by[k].length) out.push(by[k].shift());
      return out;
    }
    return l;
  }
  function estimateScore() {
    let sum = 0;
    for (const q of S.Q) {
      const c = S.progress[q.id];
      sum += !c || !c.seen ? 0.35 : c.last_correct ? 0.72 + 0.25 * Math.min(1, c.ivl / 21) : 0.3;
    }
    const mp = sum / S.Q.length;
    return Math.max(0, Math.round(200 * (mp - (1 - mp) / 3)));
  }
  function mastery(list = S.Q) {
    const c = countsFor(list);
    return (c.master + 0.5 * c.learn + 0.25 * c.wrong) / (c.total || 1);
  }

  // ---------- feedback elaborado ----------
  // 1) enlace al artículo exacto de la norma (BOE / EUR-Lex)
  function lawHTML(norma) {
    if (!norma) return "";
    const parts = norma.split("REFERENCIA DOCTRINAL")[0].split(";").map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    const chips = parts.map((p) => {
      const base = p.split(/,\s*(?:art|anexo|anejo|disp|tercera|primera|segunda|cuarta|quinta|pre[áa]mbulo)/i)[0].trim().replace(/[ .,]+$/, "");
      const am = p.match(/art(?:[íi]culo)?s?\.?\s*(\d+)(?:\s*(bis|ter|quater))?/i);
      const label = esc(base + (am ? `, art. ${am[1]}${am[2] ? " " + am[2] : ""}` : ""));
      if (seen.has(label)) return "";
      seen.add(label);
      let url = S.normas[base];
      if (url && am) url += url.includes("eur-lex") ? `#art_${am[1]}` : url.includes("act.php") ? `#a${am[1]}${am[2] ? am[2].toLowerCase() : ""}` : "";
      return url ? `<a href="${esc(url)}" target="_blank" rel="noopener" title="Leer en el texto oficial">${icon("book")}${label}</a>` : `<span>${label}</span>`;
    }).join("");
    return `<div class="law">${chips}</div>`;
  }
  // 2) diferencias entre tu respuesta y la correcta (palabras que cambian)
  function wordDiff(a, b) {
    const ta = a.split(/(\s+)/), tb = b.split(/(\s+)/);
    const wa = ta.filter((x, i) => i % 2 === 0), wb = tb.filter((x, i) => i % 2 === 0);
    const key = (w) => norm(w).replace(/[^\p{L}\p{N}%€]/gu, "");
    const n = wa.length, m = wb.length;
    if (n * m > 40000) return null;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = key(wa[i]) === key(wb[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    if (dp[0][0] < 0.35 * Math.max(n, m) || dp[0][0] === Math.max(n, m)) return null; // muy distintas o iguales: no resaltar
    const inA = new Array(n).fill(false), inB = new Array(m).fill(false);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (key(wa[i]) === key(wb[j])) { inA[i] = inB[j] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    const render = (toks, keep) => { let k = 0; return toks.map((t, idx) => (idx % 2 ? esc(t) : keep[k++] || !t.trim() ? esc(t) : `<mark class="d">${esc(t)}</mark>`)).join(""); };
    return [render(ta, inA), render(tb, inB)];
  }
  // 3) aviso de trampa típica
  function trapHint(q, chosen) {
    const t = q.text;
    const neg = t.match(/\b(incorrect[ao]s?|fals[ao]s?|excepto|salvo)\b/i) || t.match(/\bNO\b/) ||
      t.match(/\bno (?:es|son|está|están|se|podrá|podrán|puede|pueden|tiene|tienen|será|serán|constituye|corresponde|debe|deberá|existe|incluye|requiere|necesita)\b/i);
    if (neg) return `La pregunta dice «<b>${esc(neg[0])}</b>». Fíjate bien en qué te piden: muchas preguntas buscan la opción que no se cumple o una excepción.`;
    const todas = /todas (las anteriores |ellas )?son (correctas|ciertas|verdaderas)/i;
    if (todas.test(q.opts[chosen] || "")) return "Cuidado con «Todas son correctas»: basta con que una de las otras opciones sea falsa para descartarla.";
    if (todas.test(q.opts[q.sol] || "")) return "Aquí varias opciones eran ciertas a la vez. Antes de elegir una, comprueba si las demás también lo son.";
    const nums = (s) => (s.match(/\d+(?:[.,]\d+)?/g) || []).join(" ");
    if (nums(q.opts[chosen]) && nums(q.opts[q.sol]) && nums(q.opts[chosen]) !== nums(q.opts[q.sol])) return "Las opciones se diferencian en las cifras. Merece la pena memorizar el número exacto (plazos, importes, porcentajes).";
    return "";
  }
  // 4) casos prácticos: separar las sub-respuestas A), B), C)…
  function parseSubs(text) {
    const out = [];
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-H])\)\s*(.*)$/);
      if (m) out.push({ k: m[1], t: m[2].trim() });
      else if (out.length && line.trim()) out[out.length - 1].t += " " + line.trim();
    }
    return out;
  }
  function casoInfo(q) {
    if (q._info !== undefined) return q._info;
    const subs = q.opts.map(parseSubs);
    const ks = subs[0].map((s) => s.k).join("");
    const ok = ks.length >= 2 && subs.every((s) => s.map((x) => x.k).join("") === ks);
    if (!ok) return (q._info = null);
    const keys = ks.split("");
    const variants = keys.map((_, i) => { const seen = new Map(); subs.forEach((s) => { const k = norm(s[i].t); if (!seen.has(k)) seen.set(k, s[i].t); }); return [...seen.entries()].map(([k, t]) => ({ k, t })); });
    const ask = q.text.slice(Math.max(0, q.text.search(/Responda a la/i)));
    const qs = (ask.match(/¿[^?]+\?/g) || []).map((s) => s.trim());
    return (q._info = { keys, subs, variants, questions: qs.length === keys.length ? qs : null });
  }
  function casoBreakdown(q, chosenIdx) {
    const info = casoInfo(q);
    if (!info) return "";
    const right = info.subs[q.sol];
    const mine = chosenIdx != null && chosenIdx >= 0 ? info.subs[chosenIdx] : null;
    return `<table class="parts">${info.keys.map((k, i) => {
      const ok = mine ? norm(mine[i].t) === norm(right[i].t) : null;
      return `<tr><td>${k})</td><td>${info.questions ? `<span class="tiny">${esc(info.questions[i])}</span><br>` : ""}${esc(right[i].t)}${mine && !ok ? `<br><span class="x">✗ Tú: ${esc(mine[i].t)}</span>` : ""}</td><td>${ok == null ? "" : ok ? '<span class="v">✓</span>' : '<span class="x">✗</span>'}</td></tr>`;
    }).join("")}</table>`;
  }
  function casoHTML(t) {
    const h = esc(t);
    const i = h.search(/Responda a la/i);
    return i > 0 ? h.slice(0, i).trimEnd() + `<span class="ask">${h.slice(i)}</span>` : h;
  }

  // ---------- hoja inferior ----------
  function showSheet(kind, html) {
    hideSheet();
    const d = document.createElement("div");
    d.className = `sheet ${kind}`;
    d.setAttribute("role", "status");
    d.setAttribute("aria-live", "polite");
    d.innerHTML = `<div class="sheet-in">${html}</div>`;
    document.body.appendChild(d);
    document.body.classList.add("has-sheet");
    document.body.style.setProperty("--sheet-h", d.offsetHeight + 24 + "px");
    return d;
  }
  function revealAbove(el) {
    const sh = $(".sheet");
    if (!el || !sh) return;
    const r = el.getBoundingClientRect(), limit = innerHeight - sh.offsetHeight - 12;
    if (r.bottom > limit) window.scrollBy({ top: r.bottom - limit, behavior: reduceMotion() ? "auto" : "smooth" });
  }
  function hideSheet() { $$(".sheet").forEach((s) => s.remove()); document.body.classList.remove("has-sheet"); }
  const verdict = (ok, title) => `<div class="verdict"><span class="ic">${icon(ok ? "check" : "cross")}</span>${title}</div>`;

  // ---------- router ----------
  const routes = {};
  let cleanup = null;
  function route() {
    if (!S.bank) return;
    if (cleanup) { cleanup(); cleanup = null; }
    hideSheet();
    const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
    const params = new URLSearchParams(qs || "");
    const parts = path.split("/");
    const name = parts[0] || "home";
    document.body.classList.toggle("focus", name === "estudiar" || (name === "examen" && parts[1] === "run"));
    (routes[name] || routes.home)(params, parts.slice(1));
    $$(".tabbar a, .topnav a").forEach((a) => {
      const h = a.getAttribute("href").replace(/^#\/?/, "") || "home";
      a.classList.toggle("active", h === name);
      if (h === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
  }
  const app = () => $("#app");

  // ---------- BIENVENIDA (3 pasos) ----------
  function nextMondays() {
    const out = [];
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    for (const w of [3, 5, 7, 9, 12, 16]) { const x = new Date(d); x.setDate(d.getDate() + 7 * (w - 1)); out.push(x); }
    return out;
  }
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function openOnboarding(step = 0) {
    const s = S.settings;
    const steps = [
      () => `
        ${mascot("happy", 110)}
        <h2 style="text-align:center">¿Cuándo es tu examen?</h2>
        <p class="muted small" style="text-align:center">En Cataluña el examen es por ordenador y lo puedes hacer cualquier <b>lunes</b> (9:30–13:30), eligiendo día y sede. Con la fecha te repartimos el temario.</p>
        <div class="pick">${nextMondays().map((d) => `<button data-date="${isoDate(d)}" class="${s.examDate === isoDate(d) ? "on" : ""}">${fmtDate(d, { day: "numeric", month: "short" })}<small>en ${Math.round((d - startOfDay()) / DAY / 7)} semanas</small></button>`).join("")}</div>
        <div class="field"><label for="ob-date">Otra fecha</label><input class="input" type="date" id="ob-date" value="${esc(s.examDate)}"></div>
        <div class="row"><button class="btn ghost" data-skip>Aún no lo sé</button><span class="spacer"></span><button class="btn go" data-next>Siguiente</button></div>`,
      () => `
        <h2>¿Cuánto tiempo al día?</h2>
        <p class="muted small">Mejor poco cada día que mucho de golpe: repartir el estudio es de las técnicas que más funcionan.</p>
        <div class="pick">${Object.entries(MIN_TO_GOAL).map(([m, g]) => `<button data-min="${m}" class="${+s.minutes === +m ? "on" : ""}">${m} min<small>≈ ${g} preguntas</small></button>`).join("")}</div>
        <div class="row"><button class="btn ghost" data-back>Atrás</button><span class="spacer"></span><button class="btn go" data-next>Siguiente</button></div>`,
      () => `
        <h2>¿En qué momento del día?</h2>
        <p class="muted small">Decidir de antemano <b>cuándo</b> vas a estudiar hace mucho más probable que lo hagas.</p>
        <div class="pick">${WHEN.map(([k, l]) => `<button data-when="${k}" class="${s.when === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="row"><button class="btn ghost" data-back>Atrás</button><span class="spacer"></span><button class="btn go" data-next>Empezar</button></div>`,
    ];
    modal(steps[step](), (m) => {
      m.dataset.locked = "1";
      $$("[data-date]", m).forEach((b) => (b.onclick = () => { s.examDate = b.dataset.date; $("#ob-date", m).value = s.examDate; $$("[data-date]", m).forEach((x) => x.classList.toggle("on", x === b)); }));
      $("#ob-date", m) && ($("#ob-date", m).onchange = (e) => { s.examDate = e.target.value; $$("[data-date]", m).forEach((x) => x.classList.toggle("on", x.dataset.date === s.examDate)); });
      $$("[data-min]", m).forEach((b) => (b.onclick = () => { s.minutes = +b.dataset.min; $$("[data-min]", m).forEach((x) => x.classList.toggle("on", x === b)); }));
      $$("[data-when]", m).forEach((b) => (b.onclick = () => { s.when = b.dataset.when; $$("[data-when]", m).forEach((x) => x.classList.toggle("on", x === b)); }));
      $("[data-skip]", m) && ($("[data-skip]", m).onclick = () => { s.examDate = ""; openOnboarding(1); });
      $("[data-back]", m) && ($("[data-back]", m).onclick = () => openOnboarding(step - 1));
      $("[data-next]", m).onclick = () => {
        if (step < steps.length - 1) return openOnboarding(step + 1);
        s.onboarded = true; s.autoNew = true; saveLocal(); closeModal();
        location.hash = "#/estudiar?modo=hoy&n=10&primera=1";
      };
    });
  }

  // ---------- HOY (inicio) ----------
  routes.home = () => {
    if (!S.settings.onboarded) { renderHome(); return openOnboarding(0); }
    renderHome();
  };
  function renderHome() {
    const s = S.settings;
    const due = dueList().length;
    const nt = newToday();
    const npd = newPerDay();
    const unseen = unseenTest();
    const newAvail = Math.min(Math.max(0, npd - nt), unseen);
    const goal = dailyGoal(), done = doneToday();
    const ringP = Math.min(1, done / goal);
    const dte = daysToExam();
    const m = mastery();
    const fails = allItems().filter((q) => { const c = S.progress[q.id]; return c && (c.last_correct === false || c.lapses >= 2); }).length;
    const flagged = allItems().filter((q) => S.progress[q.id]?.flagged).length;
    const weekAgo = Date.now() - 7 * DAY;
    const weekLog = S.log.filter((r) => r[0] >= weekAgo);
    const finish = unseen ? startOfDay() + Math.ceil(unseen / Math.max(1, npd)) * DAY : null;
    const whenLabel = (WHEN.find((w) => w[0] === s.when) || [])[1];
    const C = 2 * Math.PI * 40;
    app().innerHTML = `
      <div class="stack">
        ${!S.user && S.sb ? `<div class="banner"><span>Sin cuenta, tu progreso solo se guarda en este navegador.</span><button class="btn small blue" id="b-login">Crear cuenta</button></div>` : ""}
        <section class="road-card" aria-label="Tu progreso hacia el examen">
          <p class="lead">${dte != null ? (dte > 0 ? `Examen el ${fmtDate(Date.parse(s.examDate), { weekday: "long", day: "numeric", month: "long" })}` : dte === 0 ? "¡Hoy es el examen! Mucha suerte" : "La fecha del examen ya pasó") : "Tu camino hacia el título"}</p>
          <div class="big">${Math.round(m * 100)} %<small>del temario recorrido</small></div>
          <div class="road">
            <div class="lane"></div><div class="done" style="width:calc((100% - 34px) * ${m.toFixed(3)})"></div>
            <div class="truck" style="left:calc(39px + (100% - 112px) * ${m.toFixed(3)})">${mascot(m > 0.5 ? "happy" : "calm", 78)}</div>
            <div class="flag" title="Examen"><svg viewBox="0 0 32 40" aria-hidden="true"><path d="M5 2v38" stroke="#c9d4e0" stroke-width="2.5"/><path d="M6 3h22v15H6z" fill="#fff"/><path d="M6 3h5.5v5H6zM17 3h5.5v5H17zM11.5 8H17v5h-5.5zM22.5 8H28v5h-5.5zM6 13h5.5v5H6zM17 13h5.5v5H17z" fill="#2b3542"/></svg>${dte != null && dte > 0 ? `${dte} d` : "Meta"}</div>
            <div class="posts"><span>0</span><span>25 %</span><span>50 %</span><span>75 %</span><span>100 %</span></div>
          </div>
          <div class="road-meta"><span><b>${streak()}</b> ${streak() === 1 ? "día" : "días"} de racha</span><span>Nota estimada <b>${estimateScore()}</b>/200</span>${finish ? `<span>Verás todo el banco el <b>${fmtDate(finish, { day: "numeric", month: "short" })}</b></span>` : `<span><b>Banco completo</b> visto</span>`}</div>
        </section>

        <section class="panel">
          <div class="today">
            <div class="ring ${ringP >= 1 ? "full" : ""}" role="img" aria-label="Hoy ${done} de ${goal}">
              <svg viewBox="0 0 92 92"><circle class="bg" cx="46" cy="46" r="40" fill="none" stroke-width="10"/><circle class="fg" cx="46" cy="46" r="40" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - ringP)}"/></svg>
              <div class="lbl"><div><b>${done}</b><span>de ${goal}</span></div></div>
            </div>
            <div>
              <h2>${ringP >= 1 ? "Objetivo de hoy cumplido" : "Hoy toca"}</h2>
              <div class="counts"><span><b>${due}</b> para repasar</span><span><b>${newAvail}</b> nuevas</span></div>
              <div class="row">
                <a class="btn go lg" href="#/estudiar?modo=hoy">${icon("play")}${due + newAvail ? "Empezar" : "Practicar más"}</a>
                <a class="btn" href="#/estudiar?modo=hoy&n=10">${icon("bolt")}10 rápidas</a>
              </div>
            </div>
          </div>
          <div class="plan">${icon("pin")}<span>${whenLabel ? `Tu plan: <b>${whenLabel.toLowerCase()}</b>, ${s.minutes} min.` : `Tu plan: ${s.minutes} min al día.`} ${planNote(npd)}</span><span class="spacer"></span><button class="btn ghost small" id="b-settings">Cambiar</button></div>
        </section>

        <div class="section-title"><h2>Practicar</h2></div>
        <nav class="list two" aria-label="Modos de práctica">
          <a class="item" href="#/temas"><span class="ico">${icon("list")}</span><span><b>Por temas</b><small>8 materias, 48 temas</small></span><span class="end">${icon("chev")}</span></a>
          <a class="item" href="#/casos"><span class="ico">${icon("case")}</span><span><b>Casos prácticos</b><small id="casos-sub">La segunda parte del examen</small></span><span class="end">${icon("chev")}</span></a>
          <a class="item" href="#/estudiar?modo=fallos"><span class="ico">${icon("x")}</span><span><b>Mis fallos</b><small>Lo que más te cuesta</small></span><span class="end">${fails}${icon("chev")}</span></a>
          <a class="item" href="#/examen"><span class="ico">${icon("clock")}</span><span><b>Simulacro</b><small>Como el real, con tiempo</small></span><span class="end">${icon("chev")}</span></a>
          <a class="item" href="#/semana"><span class="ico">${icon("cal")}</span><span><b>Recap semanal</b><small>${weekLog.length} respuestas en 7 días</small></span><span class="end">${icon("chev")}</span></a>
          <a class="item" href="#/comunidad"><span class="ico">${icon("users")}</span><span><b>Lo que más falla la gente</b><small>Las trampas más comunes</small></span><span class="end">${icon("chev")}</span></a>
          <a class="item" href="#/estudiar?modo=marcadas"><span class="ico">${icon("star")}</span><span><b>Marcadas</b><small>Las que guardaste</small></span><span class="end">${flagged}${icon("chev")}</span></a>
          <a class="item" href="#/buscar"><span class="ico">${icon("search")}</span><span><b>Buscar</b><small>Por palabra, norma o código</small></span><span class="end">${icon("chev")}</span></a>
        </nav>

        <div class="section-title"><h2>Materias</h2><span class="tiny">${fmt(S.Q.length)} preguntas</span></div>
        <div class="list">
          ${"ABCDEFGH".split("").map((mm) => { const qs = S.Q.filter((q) => q.m === mm); const c = countsFor(qs);
            return `<a class="item" href="#/temas?m=${mm}">${matBadge(mm)}<span><b>${esc(materiaName(mm))}</b>${barHTML(c)}</span><span class="end">${pct(c.seen, c.total)} %</span></a>`; }).join("")}
        </div>
        <div class="legend" style="margin:4px 2px"><span><i style="background:var(--ok)"></i>Dominadas</span><span><i style="background:var(--amber)"></i>Aprendiendo</span><span><i style="background:var(--bad)"></i>Falladas</span><span><i style="background:var(--sunk)"></i>Sin ver</span></div>
      </div>`;
    $("#b-login") && ($("#b-login").onclick = () => openLogin("signup"));
    $("#b-settings").onclick = openSettings;
    ensureCasos().then(() => {
      const el = $("#casos-sub"); if (!el || !S.C.length) return;
      const k = countsFor(S.C);
      el.textContent = k.due ? `${k.due} para repasar hoy` : `${pct(k.seen, k.total)} % de ${k.total} casos vistos`;
    });
  }

  function planNote(npd) {
    const need = neededPerDay();
    if (!need) return `${npd} preguntas nuevas al día.`;
    if (need <= npd) return `${npd} nuevas al día: llegarás al examen con todo el banco visto.`;
    const mins = Math.ceil((need / 0.6) / 2.5 / 5) * 5;
    return `<b>Ojo:</b> para ver todo antes del examen harían falta ${need} nuevas al día (unos ${mins} min). Sube el tiempo o elige una fecha más tarde.`;
  }
  function openSettings() {
    const s = S.settings;
    modal(`
      <div class="row"><h2 style="margin:0">Tu plan de estudio</h2><span class="spacer"></span><button class="btn ghost small" data-x aria-label="Cerrar">✕</button></div>
      <div class="field"><label for="s-date">Fecha del examen (un lunes)</label><input class="input" type="date" id="s-date" value="${esc(s.examDate)}"></div>
      <div class="field"><label>Minutos al día</label><div class="pick">${Object.entries(MIN_TO_GOAL).map(([m, g]) => `<button data-min="${m}" class="${+s.minutes === +m ? "on" : ""}">${m} min<small>≈ ${g}</small></button>`).join("")}</div></div>
      <div class="field"><label>Momento del día</label><div class="pick">${WHEN.map(([k, l]) => `<button data-when="${k}" class="${s.when === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      <div class="field"><label for="s-new">Preguntas nuevas al día</label>
        <label class="row small" style="font-weight:500"><input type="checkbox" id="s-auto" ${s.autoNew ? "checked" : ""}> Calcularlo según mi fecha de examen</label>
        <input class="input" type="number" min="0" max="500" id="s-new" value="${s.autoNew ? newPerDay() : s.newPerDay}" ${s.autoNew ? "disabled" : ""}></div>
      <div class="field"><label>Orden de las nuevas</label>
        <div class="seg" id="s-order">${[["temas", "Por temas"], ["mezcla", "Mezclar materias"], ["aleatorio", "Aleatorio"]].map(([k, l]) => `<button data-k="${k}" class="${s.newOrder === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="tiny">Recomendado: por temas para aprender, y los repasos ya salen mezclados.</span></div>
      <div class="field"><label>Materias del repaso diario</label>
        <div class="checks">${"ABCDEFGH".split("").map((m) => `<label title="${esc(materiaName(m))}"><input type="checkbox" value="${m}" ${s.materias.includes(m) ? "checked" : ""}> ${m} ${esc(MAT[m].short)}</label>`).join("")}</div></div>
      <button class="btn go block" id="s-save">Guardar</button>`,
      (m) => {
        let order = s.newOrder, minutes = s.minutes, when = s.when;
        $("[data-x]", m).onclick = closeModal;
        $$("#s-order button", m).forEach((b) => (b.onclick = () => { order = b.dataset.k; $$("#s-order button", m).forEach((x) => x.classList.toggle("on", x === b)); }));
        $$("[data-min]", m).forEach((b) => (b.onclick = () => { minutes = +b.dataset.min; $$("[data-min]", m).forEach((x) => x.classList.toggle("on", x === b)); }));
        $$("[data-when]", m).forEach((b) => (b.onclick = () => { when = b.dataset.when; $$("[data-when]", m).forEach((x) => x.classList.toggle("on", x === b)); }));
        $("#s-auto", m).onchange = (e) => ($("#s-new", m).disabled = e.target.checked);
        $("#s-save", m).onclick = () => {
          s.examDate = $("#s-date", m).value;
          s.minutes = minutes; s.when = when; s.newOrder = order;
          s.autoNew = $("#s-auto", m).checked;
          if (!s.autoNew) s.newPerDay = Math.max(0, Math.min(500, parseInt($("#s-new", m).value, 10) || 0));
          s.materias = $$(".checks input:checked", m).map((i) => i.value).join("") || "ABCDEFGH";
          saveLocal(); closeModal(); route(); toast("Plan guardado");
        };
      });
  }

  // ---------- TEMAS ----------
  routes.temas = (p) => {
    const open = p.get("m") || sessionStorage.getItem("tp-open");
    app().innerHTML = `
      <div class="stack">
        <div><h1>Temas</h1><p class="muted">Las 8 materias del examen. Como el Ministerio no pone título a los temas, cada uno lleva el nombre de la norma que más se pregunta.</p></div>
        ${"ABCDEFGH".split("").map((m) => {
          const qs = S.Q.filter((q) => q.m === m);
          const c = countsFor(qs);
          return `<details class="panel materia" ${m === open ? "open" : ""} data-mm="${m}">
            <summary>${matBadge(m)}<b>${esc(materiaName(m))}</b><span class="pc">${pct(c.seen, c.total)} %</span>
              <span class="meta">${fmt(c.total)} preguntas, ${c.master} dominadas${c.due ? `, <b>${c.due} para repasar</b>` : ""}</span><span></span>${barHTML(c)}</summary>
            <div class="mat-actions"><a class="btn go small" href="#/estudiar?modo=materia&m=${m}">Estudiar la materia</a><a class="btn small" href="#/estudiar?modo=materia&m=${m}&orden=aleatorio">En orden aleatorio</a><a class="btn small" href="#/examen/run?n=50&min=30&m=${m}">Simulacro de 50</a></div>
            <div>${temasOf(m).map((t) => {
              const tq = qs.filter((q) => q.t === t);
              const tc = countsFor(tq);
              return `<div class="tema"><div class="t">Tema ${temaNum(t)} <span class="tiny">${tc.total} preguntas, ${pct(tc.seen, tc.total)} % visto</span></div>
                <a class="btn small" href="#/estudiar?modo=tema&t=${t}">Estudiar</a>
                <div class="src">${esc(S.bank.temas[t] || "")}</div>${barHTML(tc)}</div>`;
            }).join("")}</div>
          </details>`;
        }).join("")}
      </div>`;
    $$("details.materia").forEach((d) => d.addEventListener("toggle", () => { if (d.open) sessionStorage.setItem("tp-open", d.dataset.mm); }));
    if (p.get("m")) setTimeout(() => $(`details[data-mm="${p.get("m")}"]`)?.scrollIntoView({ block: "start" }), 0);
  };

  // ---------- SESIÓN DE ESTUDIO ----------
  function buildSession(p) {
    const modo = p.get("modo") || "hoy";
    const now = Date.now();
    let list = [], title = "", empty = "";
    const pendingFirst = (qs) => {
      const rank = (q) => { const c = card(q.id); if (c.seen && (c.last_correct === false || isDue(c, now))) return 0; if (!c.seen) return 1; return 2; };
      return qs.map((q, i) => [rank(q), i, q]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
    };
    if (modo === "hoy") {
      title = "Repaso de hoy";
      list = dueList().concat(newList().slice(0, Math.max(0, newPerDay() - newToday())));
      if (!list.length) { list = newList().slice(0, 20); title = "Práctica extra"; }
      if (!list.length) list = shuffle(S.Q.slice()).slice(0, 20);
    } else if (modo === "tema") {
      const t = p.get("t");
      title = `${MAT[t[0]].short}, tema ${temaNum(t)}`;
      list = S.Q.filter((q) => q.t === t);
      list = p.get("orden") === "aleatorio" ? shuffle(list) : pendingFirst(list);
    } else if (modo === "materia") {
      const m = p.get("m");
      title = materiaName(m);
      list = S.Q.filter((q) => q.m === m);
      list = p.get("orden") === "aleatorio" ? shuffle(list) : pendingFirst(list);
    } else if (modo === "casos") {
      const m = p.get("m");
      if (m) {
        title = `Casos de ${MAT[m].short}`;
        list = S.C.filter((q) => q.m === m);
        list = p.get("orden") === "aleatorio" ? shuffle(list) : pendingFirst(list);
      } else {
        title = "Casos de hoy";
        const due = S.C.filter((q) => isDue(card(q.id), now)).sort((a, b) => card(a.id).due - card(b.id).due);
        const fresh = shuffle(S.C.filter((q) => !card(q.id).seen)).slice(0, Math.max(0, S.settings.newCasosPerDay - newToday(true)));
        list = due.concat(fresh);
        if (!list.length) { list = shuffle(S.C.slice()).slice(0, 3); title = "Casos extra"; }
      }
    } else if (modo === "fallos") {
      title = "Mis fallos";
      list = allItems().filter((q) => { const c = S.progress[q.id]; return c && (c.last_correct === false || c.lapses >= 2); })
        .sort((a, b) => { const A = card(a.id), B = card(b.id); return (A.last_correct === false ? 0 : 1) - (B.last_correct === false ? 0 : 1) || B.lapses - A.lapses || (A.correct / A.seen) - (B.correct / B.seen); });
      empty = "No tienes fallos pendientes. Buen trabajo.";
    } else if (modo === "marcadas") {
      title = "Marcadas";
      list = allItems().filter((q) => S.progress[q.id]?.flagged);
      empty = "Aún no has marcado ninguna. Usa «Marcar» en una pregunta para guardarla aquí.";
    } else if (modo === "semana") {
      title = "Fallos de la semana";
      list = weekFailIds().map((id) => S.byId.get(id)).filter(Boolean);
      empty = "Esta semana no has fallado nada.";
    } else if (modo === "comunidad") {
      title = "Las que más falla la gente";
      list = (S.community || []).slice(0, 50).map((r) => S.byId.get(r.qid)).filter(Boolean);
      empty = "Todavía no hay datos suficientes.";
    } else if (modo === "lista") {
      title = p.get("titulo") || "Repaso";
      list = (p.get("ids") || "").split(",").map((id) => S.byId.get(id)).filter(Boolean);
    }
    const lim = parseInt(p.get("n"), 10);
    if (lim > 0) list = list.slice(0, lim);
    return { modo, title, list, empty };
  }
  function weekFailIds() {
    const weekAgo = Date.now() - 7 * DAY;
    const cnt = new Map();
    for (const [ts, id, ok] of S.log) if (ts >= weekAgo && !ok) cnt.set(id, (cnt.get(id) || 0) + 1);
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }

  routes.estudiar = async (p) => {
    if (["casos", "fallos", "marcadas", "semana", "comunidad", "lista"].includes(p.get("modo"))) {
      if (!S.C.length) app().innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
      await ensureCasos();
    }
    const sess = buildSession(p);
    if (!sess.list.length) {
      app().innerHTML = `<div class="panel done-card">${mascot("happy", 120)}<h2>${esc(sess.title)}</h2><p class="muted">${esc(sess.empty || "No hay preguntas aquí.")}</p><a class="btn go" href="#/">Volver a Hoy</a></div>`;
      return;
    }
    const queue = sess.list.map((q) => q.id);
    const total = queue.length;
    let done = 0, right = 0, wrong = 0;
    const failedIds = new Set();
    let state = null;
    const goalBefore = doneToday();

    const head = () => `<div class="qhead"><a class="btn ghost small" href="#/" aria-label="Salir de la sesión">✕</a><div class="roadbar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${Math.min(done, total)}"><i style="width:${Math.min(100, (100 * done) / Math.max(total, 1))}%"></i></div><span class="tiny num">${queue.length + (state && !state.answered ? 1 : 0)} quedan</span></div>`;
    const chips = (q, c) => {
      const tag = !c.seen ? `<span class="chip">Nueva</span>` : c.last_correct === false ? `<span class="chip bad">Fallada antes</span>` : status(c) === "master" ? `<span class="chip ok">Dominada</span>` : `<span class="chip warn">Repaso</span>`;
      return `${mchip(q.m)}<span class="chip">${q.caso ? "Caso práctico" : "Tema " + temaNum(q.t)}</span>${tag}<span class="code">${codeOf(q)}</span>`;
    };
    const tools = (q, c) => `<div class="qtools"><button class="btn ghost small" id="b-flag">${icon("star")}${c.flagged ? "Marcada" : "Marcar"}</button><button class="btn ghost small" id="b-report">${icon("warn")}Reportar error</button></div>`;
    const bindTools = (q) => {
      $("#b-flag").onclick = () => { const f = toggleFlag(q.id); $("#b-flag").innerHTML = icon("star") + (f ? "Marcada" : "Marcar"); };
      $("#b-report").onclick = () => openReport(q);
    };

    function next() {
      hideSheet();
      if (!queue.length) return finish();
      const id = queue.shift();
      state = { id, answered: false };
      const q = S.byId.get(id);
      if (q.caso && S.settings.casosMode === "guiado" && casoInfo(q)) renderGuided(); else renderQ();
      $("#app").focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    function modeSwitch(q) {
      if (!q.caso || !casoInfo(q)) return "";
      return `<div class="row" style="margin-bottom:12px"><div class="seg" role="group" aria-label="Modo de los casos"><button data-cm="guiado" class="${S.settings.casosMode === "guiado" ? "on" : ""}">Guiado por partes</button><button data-cm="examen" class="${S.settings.casosMode !== "guiado" ? "on" : ""}">8 opciones (examen)</button></div></div>`;
    }
    function bindModeSwitch() {
      $$("[data-cm]").forEach((b) => (b.onclick = () => { if (state.answered) return; S.settings.casosMode = b.dataset.cm; saveLocal(); const q = S.byId.get(state.id); if (S.settings.casosMode === "guiado") renderGuided(); else renderQ(); }));
    }

    // --- pregunta normal (y caso en modo examen) ---
    function renderQ() {
      const q = S.byId.get(state.id);
      const c = card(q.id);
      app().innerHTML = `${head()}${modeSwitch(q)}
        <article class="qcard">
          <div class="qmeta">${chips(q, c)}</div>
          <div class="qtext ${q.caso ? "caso" : ""}" id="qtext">${q.caso ? casoHTML(q.text) : esc(q.text)}</div>
          <div class="opts" role="group" aria-labelledby="qtext">${q.opts.map((o, i) => `<button class="opt" data-i="${i}"><span class="l">${LETTERS[i]}</span><span class="t">${esc(o)}</span></button>`).join("")}</div>
          ${tools(q, c)}
        </article>
        <p class="tiny kbd-hint" style="text-align:center;margin-top:10px">Teclado: ${q.opts.length > 4 ? "A–H o 1–8" : "A–D o 1–4"} para responder, Intro para seguir</p>`;
      $$(".opt").forEach((b) => (b.onclick = () => answer(parseInt(b.dataset.i, 10))));
      bindTools(q); bindModeSwitch();
    }
    function answer(i) {
      if (state.answered) return;
      const q = S.byId.get(state.id);
      const ok = i === q.sol;
      state.answered = true; state.chosen = i; state.correct = ok;
      regrade.prev = { id: q.id, card: S.progress[q.id] ? { ...S.progress[q.id] } : null, now: Date.now() };
      recordAnswer(q.id, i, ok ? 2 : 0, q.caso ? "casos" : sess.modo);
      afterAnswer(q, ok);
      $$(".opt").forEach((b) => {
        const k = parseInt(b.dataset.i, 10);
        b.disabled = true;
        if (k === q.sol) { b.classList.add("correct"); b.querySelector(".l").innerHTML = "✓"; b.setAttribute("aria-label", `Correcta: ${q.opts[k]}`); }
        else if (k === i) { b.classList.add("wrong"); b.querySelector(".l").innerHTML = "✗"; b.setAttribute("aria-label", `Tu respuesta, incorrecta: ${q.opts[k]}`); }
        else b.classList.add("dim");
      });
      if (!ok && !q.caso) {
        const d = wordDiff(q.opts[i], q.opts[q.sol]);
        if (d) { $(`.opt[data-i="${i}"] .t`).innerHTML = d[0]; $(`.opt[data-i="${q.sol}"] .t`).innerHTML = d[1]; }
      }
      const trap = !ok && !q.caso ? trapHint(q, i) : "";
      const sheet = showSheet(ok ? "ok" : "bad", `
        ${verdict(ok, ok ? pick(["¡Correcto!", "¡Bien!", "¡Eso es!", "Correcto"]) : `La buena es la ${LETTERS[q.sol]}`)}
        <div class="sheet-scroll">
          ${!ok && !q.caso && wordDiff(q.opts[i], q.opts[q.sol]) ? `<p class="why">Resaltado: lo que cambia entre tu respuesta y la correcta.</p>` : ""}
          ${trap ? `<div class="trap">${icon("warn")}<span>${trap}</span></div>` : ""}
          ${q.caso ? casoBreakdown(q, i) : ""}
          ${q.nota ? `<p class="why"><span class="lbl">Nota:</span> ${esc(q.nota)}</p>` : ""}
          ${lawHTML(q.norma)}
          ${!ok ? `<p class="tiny" style="margin:0">Volverá a salir dentro de unas preguntas.</p>` : ""}
        </div>
        ${gradeButtons(ok)}`);
      bindGrade(sheet);
      revealAbove($(`.opt[data-i="${Math.max(i, q.sol)}"]`));
    }
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const gradeButtons = (ok) => ok
      ? `<div class="grade"><button class="btn" data-g="1">Difícil<small>dudé</small></button><button class="btn go" data-g="2">Continuar <span class="kbd">Intro</span><small>la sabía</small></button><button class="btn" data-g="3">Fácil<small>muy fácil</small></button></div>`
      : `<div class="grade one"><button class="btn go lg" data-g="0">Continuar <span class="kbd">Intro</span></button></div>`;
    function bindGrade(sheet) {
      $$("[data-g]", sheet).forEach((b) => (b.onclick = () => go(parseInt(b.dataset.g, 10))));
      $("[data-g='2'], [data-g='0']", sheet)?.focus({ preventScroll: true });
    }
    function afterAnswer(q, ok) {
      done++;
      if (ok) right++; else { wrong++; failedIds.add(q.id); queue.splice(Math.min(4, queue.length), 0, q.id); }
      const goal = dailyGoal();
      if (doneToday() >= goal && S.settings.celebrated !== dayKey(Date.now())) {
        S.settings.celebrated = dayKey(Date.now()); saveLocal();
        setTimeout(() => { confetti(); toast(`¡Objetivo de hoy cumplido! ${streak()} días de racha.`); }, 250);
      }
      const bar = $(".roadbar i"); if (bar) bar.style.width = Math.min(100, (100 * done) / Math.max(total, 1)) + "%";
    }
    function go(g) {
      if (state.correct && g !== 2) regrade(state.id, g);
      next();
    }

    // --- caso práctico guiado: cada sub-pregunta por separado ---
    function renderGuided() {
      const q = S.byId.get(state.id);
      const c = card(q.id);
      const info = casoInfo(q);
      state.part = state.part || 0;
      state.picks = state.picks || [];
      while (info.variants[state.part].length === 1 && !state.picks[state.part]) {
        state.picks[state.part] = { v: 0, ok: true, t: info.variants[state.part][0].k, auto: true };
        if (state.part === info.keys.length - 1) break;
        state.part++;
      }
      const k = state.part;
      const dots = info.keys.map((_, i) => `<i class="${i < k ? (state.picks[i].ok ? "ok" : "bad") : i === k ? "cur" : ""}"></i>`).join("");
      const vars = info.variants[k];
      const picked = state.picks[k];
      app().innerHTML = `${head()}${modeSwitch(q)}
        <article class="qcard">
          <div class="qmeta">${chips(q, c)}</div>
          <div class="qtext caso" id="qtext">${casoHTML(q.text)}</div>
          <div class="guided">
            <div class="row" style="margin-bottom:.3rem"><span class="step">Parte ${info.keys[k]} de ${info.keys.length}</span><span class="dots" aria-hidden="true">${dots}</span></div>
            ${info.questions ? `<div class="subq">${esc(info.questions[k])}</div>` : `<div class="subq">Elige la respuesta correcta para el apartado ${info.keys[k]}</div>`}
            <div class="opts">${vars.map((v, i) => `<button class="opt" data-v="${i}"><span class="l">${i + 1}</span><span class="t">${esc(v.t)}</span></button>`).join("")}</div>
            <div id="part-after"></div>
          </div>
          ${tools(q, c)}
        </article>`;
      bindTools(q); bindModeSwitch();
      if (picked) markPart(picked.v);
      $$(".opt[data-v]").forEach((b) => (b.onclick = () => choosePart(parseInt(b.dataset.v, 10))));
      if (picked && picked.auto && k === info.keys.length - 1) finishCaso();
      if (k > 0 && !picked) $(".guided")?.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
    }
    function markPart(v) {
      const q = S.byId.get(state.id);
      const info = casoInfo(q);
      const k = state.part;
      const right = norm(info.subs[q.sol][k].t);
      $$(".opt[data-v]").forEach((b) => {
        const i = parseInt(b.dataset.v, 10);
        b.disabled = true;
        if (info.variants[k][i].k === right) { b.classList.add("correct"); b.querySelector(".l").innerHTML = "✓"; }
        else if (i === v) { b.classList.add("wrong"); b.querySelector(".l").innerHTML = "✗"; }
        else b.classList.add("dim");
      });
    }
    function choosePart(v) {
      const q = S.byId.get(state.id);
      const info = casoInfo(q);
      const k = state.part;
      if (state.picks[k]) return;
      const ok = info.variants[k][v].k === norm(info.subs[q.sol][k].t);
      state.picks[k] = { v, ok, t: info.variants[k][v].k };
      markPart(v);
      const last = k === info.keys.length - 1;
      if (!last) {
        const s = showSheet(ok ? "ok" : "bad", `${verdict(ok, ok ? `Apartado ${info.keys[k]} correcto` : `Apartado ${info.keys[k]}: no es esa`)}<div class="grade one"><button class="btn go lg" id="b-part">Siguiente apartado <span class="kbd">Intro</span></button></div>`);
        $("#b-part", s).onclick = () => { state.part++; state.partWait = false; hideSheet(); renderGuided(); };
        $("#b-part", s).focus({ preventScroll: true });
        state.partWait = true;
        revealAbove($(".opt.correct"));
        return;
      }
      finishCaso();
    }
    function finishCaso() {
      // último apartado: evaluar el caso entero
      if (state.answered) return;
      const q = S.byId.get(state.id);
      const info = casoInfo(q);
      state.partWait = false;
      const allOk = state.picks.every((x) => x.ok);
      const chosenOpt = info.subs.findIndex((s) => s.every((x, i) => norm(x.t) === state.picks[i].t));
      state.answered = true; state.correct = allOk; state.chosen = chosenOpt;
      regrade.prev = { id: q.id, card: S.progress[q.id] ? { ...S.progress[q.id] } : null, now: Date.now() };
      recordAnswer(q.id, chosenOpt >= 0 ? chosenOpt : null, allOk ? 2 : 0, "casos-guiado");
      afterAnswer(q, allOk);
      const nOk = state.picks.filter((x) => x.ok).length;
      const s = showSheet(allOk ? "ok" : "bad", `
        ${verdict(allOk, allOk ? "¡Caso resuelto!" : `${nOk} de ${info.keys.length} apartados bien`)}
        <div class="sheet-scroll">
          <p class="why">En el examen la respuesta correcta sería la <b>opción ${LETTERS[q.sol]}</b> de las 8.${!allOk ? " En el examen basta un apartado mal para fallar el caso entero." : ""}</p>
          ${casoBreakdown(q, chosenOpt >= 0 ? chosenOpt : null)}
          ${q.nota ? `<p class="why"><span class="lbl">Nota:</span> ${esc(q.nota)}</p>` : ""}
          ${lawHTML(q.norma)}
        </div>
        ${gradeButtons(allOk)}`);
      bindGrade(s);
      revealAbove($(".guided .opt.correct"));
    }

    function finish() {
      hideSheet();
      document.body.classList.remove("focus");
      const acc = pct(right, right + wrong);
      const first = p.get("primera");
      app().innerHTML = `
        <div class="panel done-card stack">
          ${mascot(acc >= 70 ? "wow" : "happy", 130)}
          <p class="muted" style="margin:0">${esc(sess.title)}</p>
          <div class="big">${acc} %</div>
          <p class="muted">${right} aciertos y ${wrong} fallos en ${total} ${total === 1 ? "pregunta" : "preguntas"}.</p>
          ${first ? `<p>Así funciona: cada pregunta vuelve justo cuando estás a punto de olvidarla. Las que falles vuelven antes.</p>` : ""}
          <div class="row" style="justify-content:center">
            ${failedIds.size ? `<a class="btn" href="#/estudiar?modo=lista&titulo=${encodeURIComponent("Fallos de la sesión")}&ids=${[...failedIds].join(",")}">Repasar los ${failedIds.size} fallos</a>` : ""}
            ${first ? `<a class="btn go" href="#/estudiar?modo=hoy">Seguir con el repaso de hoy</a>` : `<a class="btn go" href="#/">Volver a Hoy</a>`}
          </div>
          ${S.user ? `<p class="tiny">Progreso guardado en tu cuenta.</p>` : S.sb ? `<p class="tiny">Progreso guardado en este navegador. <a href="#" id="b-l">Crea una cuenta</a> para no perderlo.</p>` : ""}
        </div>`;
      $("#b-l") && ($("#b-l").onclick = (e) => { e.preventDefault(); openLogin("signup"); });
    }
    const onKey = (e) => {
      if (!state || $("#modal").hidden === false) return;
      if (e.target.matches("input, textarea")) return;
      const q = S.byId.get(state.id);
      const k = e.key.toUpperCase();
      if (state.partWait) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#b-part")?.click(); } return; }
      if (!state.answered) {
        const guided = $$(".opt[data-v]:not([disabled])");
        if (guided.length) { const n = parseInt(e.key, 10); if (n >= 1 && n <= guided.length) { e.preventDefault(); guided[n - 1].click(); } return; }
        let i = "ABCDEFGH".indexOf(k);
        if (i < 0 && /^[1-8]$/.test(k)) i = parseInt(k, 10) - 1;
        if (i >= 0 && i < q.opts.length) { e.preventDefault(); answer(i); }
      } else {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(state.correct ? 2 : 0); }
        else if (state.correct && ["1", "2", "3"].includes(e.key)) { e.preventDefault(); go(parseInt(e.key, 10)); }
      }
    };
    document.addEventListener("keydown", onKey);
    cleanup = () => { document.removeEventListener("keydown", onKey); hideSheet(); };
    next();
  };

  function openReport(q) {
    modal(`
      <div class="row"><h2 style="margin:0">Reportar un error</h2><span class="spacer"></span><button class="btn ghost small" data-x aria-label="Cerrar">✕</button></div>
      <p class="small muted">${q.caso ? "Caso" : "Pregunta"} ${codeOf(q)}. ¿Qué está mal? Por ejemplo: la respuesta, una norma derogada o una errata.</p>
      <textarea class="input" id="r-msg" rows="4" maxlength="1000"></textarea>
      <button class="btn go block" id="r-send">Enviar reporte</button>`,
      (m) => {
        $("[data-x]", m).onclick = closeModal;
        $("#r-send", m).onclick = async () => {
          const message = $("#r-msg", m).value.trim();
          if (!message) return;
          if (!S.user) { toast("Entra con tu cuenta para enviar reportes."); return; }
          const { error } = await S.sb.from("reports").insert({ qid: q.id, message });
          closeModal(); toast(error ? "No se ha podido enviar. Inténtalo más tarde." : "Reporte enviado. Gracias.");
        };
      });
  }

  // ---------- RECAP SEMANAL ----------
  routes.semana = async () => {
    await ensureCasos();
    const now = Date.now();
    const w = (from, to) => S.log.filter((r) => r[0] >= from && r[0] < to);
    const cur = w(now - 7 * DAY, now + 1), prev = w(now - 14 * DAY, now - 7 * DAY);
    const acc = (l) => pct(l.filter((r) => r[2]).length, l.length);
    const days = new Set(cur.map((r) => dayKey(r[0]))).size;
    const failIds = weekFailIds();
    const byM = {};
    for (const [, id, ok] of cur) { const m = mOf(id); byM[m] = byM[m] || [0, 0]; byM[m][0]++; if (ok) byM[m][1]++; }
    const before = new Set(S.log.filter((r) => r[0] < now - 7 * DAY).map((r) => r[1]));
    const newSeen = new Set(cur.filter((r) => !before.has(r[1])).map((r) => r[1]));
    const delta = (a, b) => (b ? (a >= b ? `<span class="chip ok">+${a - b}</span>` : `<span class="chip bad">${a - b}</span>`) : "");
    app().innerHTML = `
      <div class="stack">
        <div><h1>Tu semana</h1><p class="muted">Los últimos 7 días comparados con la semana anterior.</p></div>
        <div class="kpis">
          <div class="kpi"><b>${cur.length}</b><span>respuestas ${delta(cur.length, prev.length)}</span></div>
          <div class="kpi"><b>${acc(cur)} %</b><span>de acierto${prev.length ? ` (antes ${acc(prev)} %)` : ""}</span></div>
          <div class="kpi"><b>${days}/7</b><span>días estudiados</span></div>
          <div class="kpi"><b>${newSeen.size}</b><span>preguntas nuevas</span></div>
        </div>
        <section class="panel">
          <div class="row"><h2 style="margin:0">Fallos de la semana</h2><span class="spacer"></span>${failIds.length ? `<a class="btn go small" href="#/estudiar?modo=semana">Repasar los ${failIds.length}</a>` : ""}</div>
          ${failIds.length ? `<div>${failIds.slice(0, 15).map((id) => qItem(S.byId.get(id))).join("")}</div>${failIds.length > 15 ? `<p class="tiny">Y ${failIds.length - 15} más.</p>` : ""}` : `<div class="empty">${mascot("happy", 90)}<p>Sin fallos esta semana.</p></div>`}
        </section>
        <section class="panel"><h2>Por materia</h2>
          <table class="table"><tr><th>Materia</th><th class="r">Respuestas</th><th class="r">Acierto</th></tr>
          ${"ABCDEFGH".split("").map((m) => byM[m] ? `<tr><td>${mchip(m, materiaName(m))}</td><td class="r">${byM[m][0]}</td><td class="r">${pct(byM[m][1], byM[m][0])} %</td></tr>` : "").join("") || `<tr><td colspan="3" class="muted">Sin actividad esta semana.</td></tr>`}
          </table></section>
      </div>`;
  };
  function qItem(q, extra = "") {
    if (!q) return "";
    const txt = q.caso && q.text.length > 320 ? q.text.slice(0, 320) + "…" : q.text;
    return `<div class="qitem"><div class="row">${mchip(q.m)}<span class="tiny">${q.caso ? "Caso " : ""}${codeOf(q)}</span>${extra}</div><div class="q pre">${esc(txt)}</div><div class="a pre">✓ ${LETTERS[q.sol]}) ${esc(q.opts[q.sol])}</div></div>`;
  }

  // ---------- COMUNIDAD ----------
  routes.comunidad = async () => {
    app().innerHTML = `<div class="stack"><div><h1>Lo que más falla la gente</h1><p class="muted">Porcentaje de fallo en el <b>primer intento</b> de cada estudiante. Datos anónimos y agregados.</p></div><div id="com" class="panel"><div class="loading"><div class="spinner"></div></div></div></div>`;
    if (!S.sb) { $("#com").innerHTML = `<p class="empty">Las estadísticas de la comunidad necesitan conexión.</p>`; return; }
    await ensureCasos();
    try {
      const [{ data: rows, error }, { data: sum }] = await Promise.all([S.sb.rpc("community_stats", { min_attempts: 3 }), S.sb.rpc("community_summary")]);
      if (error) throw error;
      S.community = (rows || []).sort((a, b) => b.fail_rate - a.fail_rate || b.attempts - a.attempts);
      const top = S.community.slice(0, 100);
      const byM = {};
      for (const r of S.community) { const m = mOf(r.qid); byM[m] = byM[m] || [0, 0]; byM[m][0] += Number(r.attempts); byM[m][1] += Number(r.fails); }
      $("#com").outerHTML = `
        <div class="kpis"><div class="kpi"><b>${fmt(sum?.users || 0)}</b><span>estudiantes</span></div><div class="kpi"><b>${fmt(sum?.answers || 0)}</b><span>respuestas</span></div><div class="kpi"><b>${fmt(sum?.answers_7d || 0)}</b><span>esta semana</span></div><div class="kpi"><b>${fmt(sum?.exams || 0)}</b><span>simulacros</span></div></div>
        ${Object.keys(byM).length ? `<section class="panel"><h2>Materias más difíciles</h2><table class="table"><tr><th>Materia</th><th class="r">Fallo</th></tr>${Object.entries(byM).sort((a, b) => b[1][1] / b[1][0] - a[1][1] / a[1][0]).map(([m, [a, f]]) => `<tr><td>${mchip(m, materiaName(m))}</td><td class="r">${pct(f, a)} %</td></tr>`).join("")}</table></section>` : ""}
        <section class="panel">
          <div class="row"><h2 style="margin:0">Las preguntas más falladas</h2><span class="spacer"></span>${top.length ? `<a class="btn go small" href="#/estudiar?modo=comunidad">Practicar las ${Math.min(50, top.length)} peores</a>` : ""}</div>
          ${top.length ? top.map((r) => { const q = S.byId.get(r.qid); return q ? qItem(q, `<span class="chip bad">Falla el ${Math.round(r.fail_rate * 100)} %</span>${r.top_wrong != null && q.opts[r.top_wrong] ? `<span class="tiny">Trampa más elegida: ${LETTERS[r.top_wrong]}</span>` : ""}`) : ""; }).join("")
            : `<div class="empty">${mascot("calm", 90)}<p>Aún no hay datos suficientes: hace falta que al menos 3 personas respondan la misma pregunta. Comparte la web con otros estudiantes.</p></div>`}
        </section>`;
    } catch (e) {
      console.warn(e);
      $("#com").innerHTML = `<p class="empty">No se han podido cargar las estadísticas. Comprueba tu conexión y vuelve a entrar.</p>`;
    }
  };

  // ---------- BUSCAR ----------
  routes.buscar = (p) => {
    ensureCasos().then(() => $("#q") && $("#q").dispatchEvent(new Event("input")));
    app().innerHTML = `
      <div class="stack">
        <h1>Buscar</h1>
        <input class="input" id="q" type="search" placeholder="Ej.: tacógrafo, CMR, Ley 16/1987, 1E05012" value="${esc(p.get("q") || "")}" aria-label="Buscar en el banco">
        <div id="res" class="panel"></div>
      </div>`;
    const run = () => {
      const raw = $("#q").value.trim();
      const term = norm(raw);
      const res = $("#res");
      if (term.length < 2) { res.innerHTML = `<p class="empty">Escribe al menos 2 letras. Se busca en preguntas, respuestas, normas y códigos.</p>`; return; }
      const words = term.split(/\s+/);
      const hits = [];
      for (const q of allItems()) {
        const hay = q._n || (q._n = norm(codeOf(q) + " " + q.text + " " + q.opts.join(" ") + " " + q.norma));
        if (words.every((w) => hay.includes(w))) { hits.push(q); if (hits.length >= 60) break; }
      }
      const hl = (s) => { let h = esc(s); for (const w of raw.split(/\s+/).filter((x) => x.length > 1)) h = h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>"); return h; };
      res.innerHTML = hits.length ? `<p class="tiny">${hits.length >= 60 ? "Primeros 60 resultados" : hits.length + " resultados"}</p>` + hits.map((q) => `<div class="qitem search-hit"><div class="row">${mchip(q.m)}<span class="tiny">${q.caso ? "Caso " : ""}${codeOf(q)}</span></div><div class="q pre">${hl(q.text)}</div>${q.opts.map((o, i) => `<div class="pre ${i === q.sol ? "a" : "small muted"}">${i === q.sol ? "✓" : "·"} ${LETTERS[i]}) ${hl(o)}</div>`).join("")}${lawHTML(q.norma)}</div>`).join("")
        : `<p class="empty">Sin resultados. Prueba con otra palabra.</p>`;
    };
    let t; $("#q").oninput = () => { clearTimeout(t); t = setTimeout(run, 150); };
    run();
    setTimeout(() => $("#q")?.focus(), 50);
  };

  // ---------- SIMULACRO ----------
  function examMenu(p) {
    const last = S.exams.filter((e) => e.kind !== "casos").slice(-5).reverse();
    app().innerHTML = `
      <div class="stack">
        <div><h1>Simulacro</h1><p class="muted">Como el examen real por ordenador: 4 opciones por pregunta, cada acierto suma 1, cada fallo resta 1/3 y en blanco no cuenta. Practicar con tiempo te ayuda a rendir con los nervios del día del examen.</p></div>
        ${[[200, 120, "Examen completo", "Lo mismo que el día del examen"], [100, 60, "Medio examen", "La mitad, al mismo ritmo"], [50, 30, "Simulacro corto", "Para un rato libre"]].map(([n, min, t, d]) =>
          `<button class="choice" data-n="${n}" data-min="${min}"><span class="n">${n}<small>preguntas</small></span><span><b>${t}</b><small>${min} minutos. ${d}.</small></span></button>`).join("")}
        <a class="choice" href="#/examen/run?tipo=casos&n=4&min=120"><span class="n">4<small>casos</small></span><span><b>Casos prácticos</b><small>120 minutos. La segunda parte del examen.</small></span></a>
        <section class="panel"><h3>Por materia (50 preguntas, 30 minutos)</h3><div class="row">${"ABCDEFGH".split("").map((x) => `<a class="btn small" href="#/examen/run?n=50&min=30&m=${x}">${matBadge(x, true)}${esc(MAT[x].short)}</a>`).join("")}</div></section>
        <label class="row small"><input type="checkbox" id="x-unseen"> Priorizar preguntas que aún no he visto</label>
        ${last.length ? `<section class="panel"><h2>Tus últimos simulacros</h2><table class="table"><tr><th>Fecha</th><th class="r">Preguntas</th><th class="r">Nota</th><th class="r">Resultado</th></tr>
          ${last.map((e) => `<tr><td>${fmtDate(e.at, { day: "numeric", month: "short" })}</td><td class="r">${e.total}</td><td class="r">${e.score.toFixed(1)}</td><td class="r"><span class="chip ${e.score / e.total >= 0.5 ? "ok" : "bad"}">${pct(e.score, e.total)} %</span></td></tr>`).join("")}</table></section>` : ""}
      </div>`;
    $$("[data-n]").forEach((b) => (b.onclick = () => { location.hash = `#/examen/run?n=${b.dataset.n}&min=${b.dataset.min}${$("#x-unseen").checked ? "&unseen=1" : ""}`; }));
  }
  routes.examen = (p, sub) => {
    if (sub[0] !== "run") return examMenu(p);
    if (p.get("tipo") !== "casos") return runExam(p);
    app().innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
    ensureCasos().then(() => (S.C.length ? runExam(p) : (app().innerHTML = `<p class="empty">Los casos prácticos no están disponibles ahora mismo.</p>`)));
  };
  function pickExam(n, m, preferUnseen) {
    const pool = m ? S.Q.filter((q) => q.m === m) : S.Q;
    const pickN = (qs, k) => {
      if (!preferUnseen) return shuffle(qs.slice()).slice(0, k);
      const un = shuffle(qs.filter((q) => !card(q.id).seen)), se = shuffle(qs.filter((q) => card(q.id).seen));
      return un.concat(se).slice(0, k);
    };
    if (m) return shuffle(pickN(pool, n));
    const by = {}; pool.forEach((q) => (by[q.m] = by[q.m] || []).push(q));
    const quota = Object.keys(by).map((k) => { const x = (n * by[k].length) / pool.length; return [k, Math.floor(x), x - Math.floor(x)]; });
    let rest = n - quota.reduce((s, x) => s + x[1], 0);
    quota.sort((a, b) => b[2] - a[2]).forEach((x) => { if (rest > 0) { x[1]++; rest--; } });
    const out = [];
    quota.sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, c]) => out.push(...pickN(by[k], c)));
    return out;
  }
  function pickCasos(n, m) {
    if (m) return shuffle(S.C.filter((q) => q.m === m)).slice(0, n);
    const by = {}; S.C.forEach((q) => (by[q.m] = by[q.m] || []).push(q));
    const keys = Object.keys(by), out = [];
    while (out.length < n && keys.length) {
      const tot = keys.reduce((a, k) => a + by[k].length, 0);
      let x = Math.random() * tot, k = keys[0];
      for (const kk of keys) { x -= by[kk].length; if (x <= 0) { k = kk; break; } }
      out.push(by[k][Math.floor(Math.random() * by[k].length)]);
      keys.splice(keys.indexOf(k), 1);
    }
    return out.sort((a, b) => a.m.localeCompare(b.m));
  }

  function runExam(p) {
    const casos = p.get("tipo") === "casos";
    const unit = casos ? 50 : 1;
    const n = Math.min(200, parseInt(p.get("n"), 10) || (casos ? 4 : 200));
    const minutes = parseInt(p.get("min"), 10) || 120;
    const m = p.get("m");
    const qs = casos ? pickCasos(n, m) : pickExam(n, m, p.get("unseen") === "1");
    const what = casos ? "Caso" : "Pregunta";
    const ans = new Array(qs.length).fill(null);
    const flags = new Set();
    let cur = 0, finished = false;
    const t0 = Date.now(), tEnd = t0 + minutes * 60000;
    let timerI = null;

    function render() {
      const q = qs[cur];
      app().innerHTML = `
        <div class="exam-head"><span class="timer" id="timer" aria-live="off"></span><span class="tiny">${ans.filter((a) => a != null).length} de ${qs.length} respondidas</span><span class="spacer"></span><button class="btn small" id="x-grid">Índice</button><button class="btn go small" id="x-end">Entregar</button></div>
        <article class="qcard">
          <div class="qmeta">${mchip(q.m)}<span class="chip">${what} ${cur + 1} de ${qs.length}</span><span class="spacer"></span><button class="btn ghost small" id="x-flag">${icon("star")}${flags.has(cur) ? "Para revisar" : "Marcar para revisar"}</button></div>
          <div class="qtext ${casos ? "caso" : ""}">${casos ? casoHTML(q.text) : esc(q.text)}</div>
          <div class="opts">${q.opts.map((o, i) => `<button class="opt ${ans[cur] === i ? "picked" : ""}" data-i="${i}" aria-pressed="${ans[cur] === i}"><span class="l">${LETTERS[i]}</span><span class="t">${esc(o)}</span></button>`).join("")}</div>
          <div class="row" style="margin-top:16px"><button class="btn" id="x-prev" ${cur === 0 ? "disabled" : ""}>Anterior</button>${ans[cur] != null ? `<button class="btn ghost small" id="x-clear">Dejar en blanco</button>` : ""}<span class="spacer"></span><button class="btn blue" id="x-next">${cur === qs.length - 1 ? "Revisar y entregar" : "Siguiente"}</button></div>
        </article>
        <div id="grid-wrap" class="panel" style="margin-top:12px" hidden><div class="navgrid">${qs.map((_, i) => `<button data-j="${i}" class="${ans[i] != null ? "ans" : ""} ${flags.has(i) ? "flag" : ""} ${i === cur ? "cur" : ""}" aria-label="${what} ${i + 1}${ans[i] != null ? ", respondida" : ""}">${i + 1}</button>`).join("")}</div></div>`;
      tick();
      $$(".opt").forEach((b) => (b.onclick = () => { const i = parseInt(b.dataset.i, 10); ans[cur] = ans[cur] === i ? null : i; if (ans[cur] != null && cur < qs.length - 1) cur++; render(); }));
      $("#x-prev").onclick = () => { cur--; render(); };
      $("#x-next").onclick = () => { if (cur < qs.length - 1) { cur++; render(); } else confirmEnd(); };
      $("#x-clear") && ($("#x-clear").onclick = () => { ans[cur] = null; render(); });
      $("#x-flag").onclick = () => { flags.has(cur) ? flags.delete(cur) : flags.add(cur); render(); };
      $("#x-grid").onclick = () => { const g = $("#grid-wrap"); g.hidden = !g.hidden; sessionStorage.setItem("tp-grid", g.hidden ? "" : "1"); };
      if (sessionStorage.getItem("tp-grid")) $("#grid-wrap").hidden = false;
      $$("[data-j]").forEach((b) => (b.onclick = () => { cur = parseInt(b.dataset.j, 10); render(); }));
      $("#x-end").onclick = confirmEnd;
      window.scrollTo(0, 0);
    }
    function tick() {
      const left = Math.max(0, tEnd - Date.now());
      const el = $("#timer");
      if (el) { const s = Math.ceil(left / 1000); el.textContent = `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; el.classList.toggle("low", left < 5 * 60000); }
      if (left <= 0 && !finished) { toast("Se acabó el tiempo. Examen entregado."); finish(); }
    }
    function confirmEnd() {
      const blank = ans.filter((a) => a == null).length;
      modal(`<h2>¿Entregar el examen?</h2><p class="muted">${blank ? `Te quedan ${blank} ${casos ? "casos" : "preguntas"} en blanco${flags.size ? ` y ${flags.size} marcadas para revisar` : ""}.` : "Has respondido todo."}</p>
        <div class="row"><button class="btn" data-x>Seguir con el examen</button><span class="spacer"></span><button class="btn go" id="x-ok">Entregar</button></div>`,
        (mm) => { $("[data-x]", mm).onclick = closeModal; $("#x-ok", mm).onclick = () => { closeModal(); finish(); }; });
    }
    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(timerI);
      document.body.classList.remove("focus");
      let correct = 0, wrong = 0, blank = 0;
      const perM = {};
      qs.forEach((q, i) => {
        const pm = (perM[q.m] = perM[q.m] || { t: 0, c: 0, w: 0 });
        pm.t++;
        if (ans[i] == null) { blank++; return; }
        const ok = ans[i] === q.sol;
        ok ? (correct++, pm.c++) : (wrong++, pm.w++);
        recordAnswer(q.id, ans[i], ok ? 2 : 0, "exam");
      });
      const score = (correct - wrong / 3) * unit;
      const total = qs.length * unit;
      const e = { kind: casos ? "casos" : "test", total, correct, wrong, blank, score: Math.round(score * 100) / 100, duration_s: Math.round((Date.now() - t0) / 1000), per_materia: perM, at: Date.now() };
      S.exams.push(e);
      if (S.user) { S.queue.push({ t: "e", row: examToRow(e) }); scheduleFlush(300); }
      saveLocal();
      const pass = score >= total / 2;
      if (pass) setTimeout(confetti, 300);
      const wrongIds = qs.filter((q, i) => ans[i] != null && ans[i] !== q.sol).map((q) => q.id);
      app().innerHTML = `
        <div class="stack">
          <section class="panel" style="text-align:center">
            ${mascot(pass ? "wow" : "calm", 110)}
            <p class="muted" style="margin:0">${casos ? "Casos prácticos" : "Simulacro"}${m ? ` de ${esc(materiaName(m))}` : ""}</p>
            <div class="score-big" style="color:${pass ? "var(--ok)" : "var(--bad)"}">${score.toFixed(1)}<span style="font-size:1.3rem;color:var(--ink-3)"> / ${total}</span></div>
            <p><span class="chip ${pass ? "ok" : "bad"}">${icon(pass ? "check" : "cross")}${pass ? (casos ? "Aprobarías la parte práctica" : "Aprobarías el test") : "Por debajo del 50 %"}</span></p>
            <p class="muted small">${correct} aciertos, ${wrong} fallos (−${((wrong / 3) * unit).toFixed(1)}), ${blank} en blanco. ${Math.round(e.duration_s / 60)} minutos.</p>
            ${casos && qs.length === 4 ? `<p class="small">Con ${score.toFixed(1)} aquí, para el aprobado total (240 de 400) necesitarías ${Math.max(100, 240 - score).toFixed(1)} en el test.</p>` : ""}
            ${!casos && qs.length === 200 ? `<p class="small">${score >= 140 ? "Con esta nota aprobarías aunque sacaras el mínimo (100) en los casos." : `Para aprobar con el mínimo en los casos (100) necesitas 140 en el test: te faltan ${(140 - score).toFixed(1)}.`}</p>` : ""}
            <div class="row" style="justify-content:center">${wrongIds.length ? `<a class="btn" href="#/estudiar?modo=lista&titulo=${encodeURIComponent("Fallos del simulacro")}&ids=${wrongIds.join(",")}">Repasar los ${wrongIds.length} fallos</a>` : ""}<a class="btn go" href="${casos ? "#/casos" : "#/examen"}">Otro simulacro</a></div>
          </section>
          <section class="panel"><h2>Por materia</h2><table class="table"><tr><th>Materia</th><th class="r">Aciertos</th><th class="r">Fallos</th><th class="r">Nota</th></tr>
            ${Object.entries(perM).map(([k, v]) => { const s = v.c - v.w / 3; return `<tr><td>${mchip(k)}</td><td class="r">${v.c}/${v.t}</td><td class="r">${v.w}</td><td class="r"><span class="chip ${s / v.t >= 0.5 ? "ok" : "bad"}">${pct(s, v.t)} %</span></td></tr>`; }).join("")}</table></section>
          <section class="panel"><h2>Corrección</h2><div class="navgrid" style="margin-bottom:12px">${qs.map((q, i) => `<button class="${ans[i] == null ? "" : ans[i] === q.sol ? "ok" : "bad"}" data-r="${i}">${i + 1}</button>`).join("")}</div>
            <div class="seg" id="rev-f" style="margin-bottom:8px"><button class="on" data-f="bad">Fallos</button><button data-f="blank">En blanco</button><button data-f="all">Todas</button></div>
            <div id="rev">${reviewList("bad")}</div></section>
        </div>`;
      function reviewList(f) {
        return qs.map((q, i) => {
          const st = ans[i] == null ? "blank" : ans[i] === q.sol ? "ok" : "bad";
          if (f !== "all" && f !== st) return "";
          return `<div class="qitem" id="r${i}"><div class="row">${mchip(q.m)}<span class="tiny">${i + 1}. ${codeOf(q)}</span></div><div class="q pre">${esc(q.text)}</div>${st === "bad" ? `<div class="w pre">✗ Tu respuesta: ${LETTERS[ans[i]]}) ${esc(q.opts[ans[i]])}</div>` : st === "blank" ? `<div class="small muted">En blanco</div>` : ""}<div class="a pre">✓ ${LETTERS[q.sol]}) ${esc(q.opts[q.sol])}</div>${casos && st === "bad" ? casoBreakdown(q, ans[i]) : ""}${lawHTML(q.norma)}</div>`;
        }).join("") || `<p class="empty">Nada por aquí.</p>`;
      }
      $$("#rev-f button").forEach((b) => (b.onclick = () => { $$("#rev-f button").forEach((x) => x.classList.toggle("on", x === b)); $("#rev").innerHTML = reviewList(b.dataset.f); }));
      $$("[data-r]").forEach((b) => (b.onclick = () => { $$("#rev-f button").forEach((x) => x.classList.toggle("on", x.dataset.f === "all")); $("#rev").innerHTML = reviewList("all"); $("#r" + b.dataset.r)?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" }); }));
    }
    const onKey = (e) => {
      if (finished || !$("#modal").hidden || e.target.matches("input, textarea")) return;
      const k = e.key.toUpperCase();
      const nOpts = qs[cur].opts.length;
      let i = "ABCDEFGH".slice(0, nOpts).indexOf(k);
      if (i < 0 && /^[1-8]$/.test(k) && parseInt(k, 10) <= nOpts) i = parseInt(k, 10) - 1;
      if (i >= 0) { e.preventDefault(); $$(".opt")[i]?.click(); }
      else if (e.key === "ArrowRight" && cur < qs.length - 1) { cur++; render(); }
      else if (e.key === "ArrowLeft" && cur > 0) { cur--; render(); }
    };
    const beforeUnload = (e) => { if (!finished) { e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", beforeUnload);
    timerI = setInterval(tick, 1000);
    cleanup = () => { clearInterval(timerI); document.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", beforeUnload); };
    render();
  }

  // ---------- CASOS PRÁCTICOS ----------
  routes.casos = async () => {
    app().innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
    await ensureCasos();
    if (!S.C.length) { app().innerHTML = `<div class="panel empty"><h2>Casos prácticos</h2><p>No se han podido cargar. Comprueba tu conexión y vuelve a entrar.</p></div>`; return; }
    const c = countsFor(S.C);
    const nt = newToday(true);
    const newLeft = Math.min(Math.max(0, S.settings.newCasosPerDay - nt), c.new);
    const last = S.exams.filter((e) => e.kind === "casos").slice(-5).reverse();
    app().innerHTML = `
      <div class="stack">
        <div><h1>Casos prácticos</h1><p class="muted">La segunda parte del examen: <b>4 casos</b>, cada uno con <b>8 respuestas</b> que combinan varios apartados (A, B, C…). Acierto +50, fallo −16,7. Necesitas al menos 100 de 200, y 240 entre las dos partes.</p></div>
        <section class="panel">
          <div class="today">
            ${mascot("happy", 92)}
            <div>
              <h2>Casos de hoy</h2>
              <div class="counts"><span><b>${c.due}</b> para repasar</span><span><b>${newLeft}</b> nuevos</span><span><b>${c.total}</b> en total</span></div>
              <div class="row"><a class="btn go lg" href="#/estudiar?modo=casos">${icon("play")}Empezar</a><a class="btn" href="#/examen/run?tipo=casos&n=4&min=120">${icon("clock")}Simulacro de 4</a></div>
            </div>
          </div>
          <div class="plan">${icon("bolt")}<span><b>Cómo practicarlos:</b> en modo <b>guiado</b> resuelves cada apartado por separado, como harías en el examen. Cuando los domines, cambia a <b>8 opciones</b> para practicar el formato real.</span></div>
        </section>
        <div class="section-title"><h2>Por materia</h2><span class="tiny">${pct(c.seen, c.total)} % visto</span></div>
        <div class="list">
          ${"ABCDEFGH".split("").map((m) => { const qs = S.C.filter((q) => q.m === m); if (!qs.length) return ""; const k = countsFor(qs);
            return `<a class="item" href="#/estudiar?modo=casos&m=${m}">${matBadge(m)}<span><b>${esc(materiaName(m))}</b>${barHTML(k)}</span><span class="end">${k.seen}/${k.total}</span></a>`; }).join("")}
        </div>
        ${last.length ? `<section class="panel"><h2>Tus simulacros de casos</h2><table class="table"><tr><th>Fecha</th><th class="r">Nota</th><th class="r">Resultado</th></tr>${last.map((e) => `<tr><td>${fmtDate(e.at, { day: "numeric", month: "short" })}</td><td class="r">${e.score.toFixed(1)} de ${e.total}</td><td class="r"><span class="chip ${e.score / e.total >= 0.5 ? "ok" : "bad"}">${pct(e.score, e.total)} %</span></td></tr>`).join("")}</table></section>` : ""}
      </div>`;
  };

  // ---------- PROGRESO ----------
  routes.stats = async () => {
    await ensureCasos();
    const all = countsFor(S.Q);
    const totalAns = S.log.length, okAns = S.log.filter((r) => r[2]).length;
    const perDay = new Map();
    S.log.forEach((r) => perDay.set(dayKey(r[0]), (perDay.get(dayKey(r[0])) || 0) + 1));
    const weeks = 18;
    const start = startOfDay() - ((new Date().getDay() + 6) % 7) * DAY - (weeks - 1) * 7 * DAY;
    let heat = "";
    for (let d = 0; d < weeks * 7; d++) {
      const t = start + d * DAY;
      const v = t > Date.now() ? -1 : perDay.get(dayKey(t)) || 0;
      const lvl = v <= 0 ? "" : v < 20 ? "h1" : v < 60 ? "h2" : v < 150 ? "h3" : "h4";
      heat += `<i class="${lvl}" title="${fmtDate(t, { day: "numeric", month: "short" })}: ${Math.max(0, v)}" ${v < 0 ? 'style="visibility:hidden"' : ""}></i>`;
    }
    const fc = [];
    for (let i = 0; i < 7; i++) {
      const a = i === 0 ? -Infinity : startOfDay() + i * DAY, b = endOfDay(startOfDay() + i * DAY);
      fc.push(allItems().reduce((s, q) => { const c = S.progress[q.id]; return s + (c && c.seen && c.due >= a && c.due <= b ? 1 : 0); }, 0));
    }
    const fmax = Math.max(1, ...fc);
    const est = estimateScore();
    const ck = countsFor(S.C);
    app().innerHTML = `
      <div class="stack">
        <h1>Tu progreso</h1>
        <div class="kpis">
          <div class="kpi"><b style="color:${est >= 140 ? "var(--ok)" : est >= 100 ? "#a67800" : "var(--bad)"}">${est}</b><span>nota estimada del test (de 200)</span></div>
          <div class="kpi"><b>${pct(all.seen, all.total)} %</b><span>del test visto (${fmt(all.seen)})</span></div>
          <div class="kpi"><b>${fmt(all.master)}</b><span>preguntas dominadas</span></div>
          <div class="kpi"><b>${pct(okAns, totalAns)} %</b><span>de acierto global</span></div>
          <div class="kpi"><b>${ck.seen}/${ck.total}</b><span>casos vistos</span></div>
          <div class="kpi"><b>${streak()}</b><span>días de racha</span></div>
        </div>
        <section class="panel"><h2>Actividad</h2><div class="heat">${heat}</div><p class="tiny" style="margin:.4rem 0 0">Últimas ${weeks} semanas. ${fmt(totalAns)} respuestas en total.</p></section>
        <section class="panel"><h2>Repasos de los próximos días</h2><div class="forecast">${fc.map((v, i) => `<div><span>${v}</span><i style="height:${(70 * v) / fmax}px"></i><span>${i === 0 ? "Hoy" : fmtDate(startOfDay() + i * DAY, { weekday: "short" })}</span></div>`).join("")}</div></section>
        <section class="panel"><h2>Por materia</h2>
          <table class="table"><tr><th>Materia</th><th style="width:34%">Progreso</th><th class="r">Visto</th><th class="r">Acierto</th></tr>
          ${"ABCDEFGH".split("").map((m) => {
            const qs = S.Q.filter((q) => q.m === m); const c = countsFor(qs);
            let s = 0, ok = 0; for (const q of qs) { const k = S.progress[q.id]; if (k) { s += k.seen; ok += k.correct; } }
            return `<tr><td><a href="#/temas?m=${m}" style="text-decoration:none">${mchip(m)}</a></td><td>${barHTML(c)}</td><td class="r">${pct(c.seen, c.total)} %</td><td class="r">${s ? pct(ok, s) + " %" : "–"}</td></tr>`;
          }).join("")}</table>
          <div class="legend" style="margin-top:.6rem"><span><i style="background:var(--ok)"></i>Dominadas (repaso cada ${MASTER_IVL}+ días)</span><span><i style="background:var(--amber)"></i>Aprendiendo</span><span><i style="background:var(--bad)"></i>Falladas</span></div>
        </section>
        <section class="panel"><h2>Simulacros</h2>${S.exams.length ? `<table class="table"><tr><th>Fecha</th><th>Tipo</th><th class="r">Nota</th><th class="r">Resultado</th></tr>${S.exams.slice().reverse().slice(0, 20).map((e) => `<tr><td>${fmtDate(e.at, { day: "numeric", month: "short" })}</td><td>${e.kind === "casos" ? "Casos" : e.total + " preguntas"}</td><td class="r">${e.score.toFixed(1)} de ${e.total}</td><td class="r"><span class="chip ${e.score / e.total >= 0.5 ? "ok" : "bad"}">${pct(e.score, e.total)} %</span></td></tr>`).join("")}</table>` : `<p class="empty">Aún no has hecho ningún simulacro. <a href="#/examen">Hacer el primero</a></p>`}</section>
        <p class="tiny">La nota estimada supone que respondes todo y usa tu historial: las dominadas cuentan como casi seguras, las falladas como un 30 % y las no vistas como un 35 %.</p>
      </div>`;
  };

  routes.cuenta = () => { renderHome(); if (S.user) openAccount(); else if (S.sb) openLogin(); };

  // ---------- arranque ----------
  async function boot() {
    initSupabase();
    loadLocal();
    renderAccount();
    try {
      await loadBank();
    } catch (e) {
      app().innerHTML = `<div class="panel empty"><h2>No se ha podido cargar</h2><p>${esc(e.message)}. Comprueba tu conexión.</p><button class="btn go" onclick="location.reload()">Volver a intentarlo</button></div>`;
      return;
    }
    window.addEventListener("hashchange", route);
    if (S.sb) {
      S.sb.auth.onAuthStateChange((ev, session) => {
        if (session?.user) onSignedIn(session.user);
        else if (ev === "SIGNED_OUT") onSignedOut();
        if (ev === "PASSWORD_RECOVERY") setTimeout(openAccount, 300);
      });
      try { const { data } = await S.sb.auth.getSession(); if (data?.session?.user) await onSignedIn(data.session.user); } catch (e) { console.warn(e); }
    }
    route();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    window.addEventListener("online", () => flush());
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  window.TP = { S, schedule, status, wordDiff, casoInfo, trapHint }; // para depurar desde la consola
  boot();
})();
