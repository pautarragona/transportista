/* Transportista — app de estudio del título de transportista (mercancías).
 * Vanilla JS, sin build. Progreso en localStorage + Supabase (si hay sesión).
 */
(() => {
  "use strict";

  const CFG = window.TP_CONFIG || {};
  const DAY = 864e5;
  const MASTER_IVL = 14;          // días de intervalo para considerar "dominada"
  const NEW_PER_DAY_DEFAULT = 40;
  const ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h10"/></svg>',
    x: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.5 4 2.8 4 6"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
    case: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  };

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
  const LETTERS = "ABCDEFGH";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("localStorage", e); } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  function toast(msg, ms = 2600) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
  }
  function modal(html, onMount) {
    const m = $("#modal");
    m.innerHTML = `<div class="card stack">${html}</div>`;
    m.hidden = false;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
    onMount && onMount(m);
  }
  function closeModal() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; }

  // ---------- estado ----------
  const S = {
    bank: null,          // {version, materias, temas, q}
    Q: [],               // [{id, m, t, text, opts, sol, norma}]  preguntas test
    C: [],               // casos prácticos (id = "C" + código)
    casosP: null,
    byId: new Map(),
    scope: "guest",      // "guest" | user id
    user: null,
    progress: {},        // qid -> card
    log: [],             // [ts, qid, correct(0/1)]
    exams: [],
    settings: {},
    queue: [],           // operaciones pendientes de subir
    sb: null,
    community: null,
  };
  const K = (name) => `tp:v1:${S.scope}:${name}`;
  function loadLocal() {
    S.progress = store.get(K("progress"), {});
    S.log = store.get(K("log"), []);
    S.exams = store.get(K("exams"), []);
    S.queue = store.get(K("queue"), []);
    S.settings = Object.assign({ newPerDay: NEW_PER_DAY_DEFAULT, newCasosPerDay: 5, newOrder: "temas", examDate: "", materias: "ABCDEFGH" }, store.get(K("settings"), {}));
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

  // ---------- repetición espaciada (SM-2 simplificado) ----------
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
    if (c.reps === 0) ivl = grade === 1 ? 1 : grade === 2 ? 1 : 3;
    else if (c.reps === 1) ivl = grade === 1 ? 2 : grade === 2 ? 3 : 6;
    else {
      if (grade === 1) { ivl = Math.max(c.ivl * 1.2, c.ivl + 1); c.ease = Math.max(1.3, c.ease - 0.15); }
      else if (grade === 2) ivl = c.ivl * c.ease;
      else { ivl = c.ivl * c.ease * 1.3; c.ease += 0.15; }
    }
    if (ivl > 3) ivl *= 0.95 + Math.random() * 0.1;
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
    // cambia la nota de un acierto (difícil/fácil) recalculando desde el estado previo
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
        <button class="btn primary block" type="submit">${isSignup ? "Crear cuenta" : "Entrar"}</button>
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
    $("#bank-version").textContent = v.length === 6 ? `Versión del banco: ${v.slice(0, 2)}/${v.slice(2, 4)}/20${v.slice(4)}. ${fmt(S.Q.length)} preguntas.` : "";
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
      const s = status(c);
      r[s]++;
      if (c && c.seen) r.seen++;
      if (c && isDue(c, now)) r.due++;
    }
    return r;
  }
  function barHTML(c) {
    const t = c.total || 1;
    return `<div class="bar" title="${c.master} dominadas · ${c.learn} aprendiendo · ${c.wrong} falladas · ${c.new} sin ver"><i class="m" style="width:${(100 * c.master) / t}%"></i><i class="l" style="width:${(100 * c.learn) / t}%"></i><i class="w" style="width:${(100 * c.wrong) / t}%"></i></div>`;
  }
  function newToday(casos = false) {
    const s = startOfDay();
    const firstSeen = new Set();
    let n = 0;
    // primera respuesta de una pregunta hoy = nueva introducida hoy
    const before = new Set();
    for (const [ts, id] of S.log) {
      if ((id[0] === "C") !== casos) continue;
      if (ts < s) before.add(id);
      else if (!before.has(id) && !firstSeen.has(id)) { firstSeen.add(id); n++; }
    }
    return n;
  }
  function streak() {
    const days = new Set(S.log.map((r) => dayKey(r[0])));
    let n = 0, t = Date.now();
    if (!days.has(dayKey(t))) t -= DAY; // si hoy aún no has estudiado, la racha sigue viva
    while (days.has(dayKey(t))) { n++; t -= DAY; }
    return n;
  }
  function dueList() {
    const now = Date.now();
    return S.Q.filter((q) => inMaterias(q) && isDue(card(q.id), now)).sort((a, b) => card(a.id).due - card(b.id).due);
  }
  function newList() {
    const l = S.Q.filter((q) => inMaterias(q) && !card(q.id).seen);
    if (S.settings.newOrder === "aleatorio") return shuffle(l);
    if (S.settings.newOrder === "mezcla") {
      // intercalar materias manteniendo orden dentro de cada una
      const by = {}; l.forEach((q) => (by[q.m] = by[q.m] || []).push(q));
      const out = []; const keys = Object.keys(by);
      while (out.length < l.length) for (const k of keys) if (by[k].length) out.push(by[k].shift());
      return out;
    }
    return l;
  }
  function suggestedNewPerDay() {
    if (!S.settings.examDate) return null;
    const days = Math.max(1, Math.ceil((Date.parse(S.settings.examDate) - Date.now()) / DAY) - 7); // última semana: solo repaso
    const unseen = S.Q.filter((q) => inMaterias(q) && !card(q.id).seen).length;
    return Math.ceil(unseen / days);
  }
  function estimateScore() {
    // probabilidad de acertar cada pregunta y nota esperada (+1 / −1/3) si se contesta todo
    let sum = 0;
    for (const q of S.Q) {
      const c = S.progress[q.id];
      let p;
      if (!c || !c.seen) p = 0.35;
      else if (c.last_correct) p = 0.72 + 0.25 * Math.min(1, c.ivl / 21);
      else p = 0.3;
      sum += p;
    }
    const mp = sum / S.Q.length;
    return Math.max(0, Math.round(200 * (mp - (1 - mp) / 3)));
  }

  // ---------- router ----------
  const routes = {};
  let cleanup = null;
  function route() {
    if (!S.bank) return;
    if (cleanup) { cleanup(); cleanup = null; }
    const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
    const params = new URLSearchParams(qs || "");
    const name = path.split("/")[0] || "home";
    (routes[name] || routes.home)(params, path.split("/").slice(1));
    $$(".tabbar a, .topnav a").forEach((a) => {
      const h = a.getAttribute("href").replace(/^#\/?/, "") || "home";
      a.classList.toggle("active", h === name || (name === "home" && h === ""));
    });
    window.scrollTo(0, 0);
  }
  const app = () => $("#app");

  // ---------- INICIO ----------
  routes.home = () => {
    const due = dueList().length;
    const nt = newToday();
    const newLeft = Math.max(0, S.settings.newPerDay - nt);
    const newAvail = Math.min(newLeft, S.Q.filter((q) => inMaterias(q) && !card(q.id).seen).length);
    const all = countsFor(S.Q);
    const fails = S.Q.filter((q) => { const c = S.progress[q.id]; return c && (c.last_correct === false || c.lapses >= 2); }).length;
    const flagged = S.Q.filter((q) => S.progress[q.id]?.flagged).length;
    const weekAgo = Date.now() - 7 * DAY;
    const weekLog = S.log.filter((r) => r[0] >= weekAgo);
    const weekFails = new Set(weekLog.filter((r) => !r[2]).map((r) => r[1])).size;
    const daysLeft = S.settings.examDate ? Math.ceil((Date.parse(S.settings.examDate) - startOfDay()) / DAY) : null;
    const sug = suggestedNewPerDay();
    app().innerHTML = `
      <div class="stack">
        ${!S.user && S.sb ? `<div class="banner"><span>Estás sin cuenta: tu progreso se guarda solo en este navegador.</span><button class="btn small dark" id="b-login">Crear cuenta / Entrar</button></div>` : ""}
        <section class="card hero">
          <p class="muted small" style="margin:0">${daysLeft != null ? (daysLeft >= 0 ? `Faltan <b style="color:#fff">${daysLeft} días</b> para el examen` : "Fecha de examen pasada") : "Competencia profesional · Mercancías"}</p>
          <h1>Repaso de hoy</h1>
          <div class="hero-stats">
            <div><b>${due}</b><span>para repasar</span></div>
            <div><b>${newAvail}</b><span>nuevas (${nt}/${S.settings.newPerDay} hoy)</span></div>
            <div><b>${streak()}</b><span>días de racha</span></div>
          </div>
          <div class="row">
            <a class="btn primary lg" href="#/estudiar?modo=hoy">${ICONS.play.replace("<svg", '<svg width="18" height="18" fill="currentColor"')} ${due + newAvail ? "Empezar" : "Practicar más"}</a>
            <button class="btn small" id="b-settings" style="background:rgba(255,255,255,.1);border-color:transparent;color:#fff">Ajustes</button>
          </div>
          ${sug && sug > S.settings.newPerDay ? `<p class="small" style="margin:.8rem 0 0;color:#ffd75e">Para ver todo el banco antes del examen necesitas ~${sug} nuevas/día (ahora ${S.settings.newPerDay}).</p>` : ""}
        </section>

        <div class="grid grid-3">
          <a class="card tile" href="#/temas"><div class="ico">${ICONS.list}</div><b>Por temas</b><small>${pct(all.seen, all.total)}% del banco visto</small></a>
          <a class="card tile" href="#/estudiar?modo=fallos"><div class="ico">${ICONS.x}</div><b>Mis fallos</b><small><span class="count">${fails}</span> preguntas</small></a>
          <a class="card tile" href="#/semana"><div class="ico">${ICONS.cal}</div><b>Recap semanal</b><small>${weekLog.length} respuestas · ${weekFails} falladas</small></a>
          <a class="card tile" href="#/examen"><div class="ico">${ICONS.clock}</div><b>Simulacro</b><small>200 preguntas · 2 h · −1/3</small></a>
          <a class="card tile" href="#/comunidad"><div class="ico">${ICONS.users}</div><b>Lo que más falla la gente</b><small>Estadísticas de todos</small></a>
          <a class="card tile" href="#/estudiar?modo=marcadas"><div class="ico">${ICONS.star}</div><b>Marcadas</b><small><span class="count">${flagged}</span> preguntas</small></a>
          <a class="card tile" href="#/buscar"><div class="ico">${ICONS.search}</div><b>Buscar</b><small>Texto, norma o código</small></a>
          <a class="card tile" href="#/stats"><div class="ico">${ICONS.chart}</div><b>Progreso</b><small>Nota estimada: ${estimateScore()}/200</small></a>
          <a class="card tile" href="#/casos"><div class="ico">${ICONS.case}</div><b>Casos prácticos</b><small id="casos-tile">2.ª parte del examen</small></a>
        </div>

        <section class="card">
          <div class="row"><h2 style="margin:0">Banco completo</h2><span class="spacer"></span><span class="tiny">${fmt(all.total)} preguntas</span></div>
          <div style="margin:.7rem 0 .5rem">${barHTML(all)}</div>
          <div class="legend"><span><i style="background:var(--master)"></i>Dominadas ${fmt(all.master)}</span><span><i style="background:var(--learn)"></i>Aprendiendo ${fmt(all.learn)}</span><span><i style="background:var(--bad)"></i>Falladas ${fmt(all.wrong)}</span><span><i style="background:var(--new)"></i>Sin ver ${fmt(all.new)}</span></div>
        </section>
      </div>`;
    $("#b-login") && ($("#b-login").onclick = () => openLogin("signup"));
    $("#b-settings").onclick = openSettings;
    ensureCasos().then(() => {
      const el = $("#casos-tile"); if (!el || !S.C.length) return;
      const k = countsFor(S.C);
      el.innerHTML = `${k.due ? `<span class="count">${k.due}</span> para repasar · ` : ""}${pct(k.seen, k.total)}% de ${fmt(k.total)} vistos`;
    });
  };

  function openSettings() {
    const s = S.settings;
    const sug = suggestedNewPerDay();
    modal(`
      <div class="row"><h2 style="margin:0">Ajustes de estudio</h2><span class="spacer"></span><button class="btn ghost small" data-x>✕</button></div>
      <div class="field"><label>Fecha de tu examen</label><input class="input" type="date" id="s-date" value="${esc(s.examDate)}"></div>
      <div class="field"><label>Preguntas nuevas por día</label><input class="input" type="number" min="0" max="500" id="s-new" value="${s.newPerDay}">
        <span class="tiny" id="s-sug">${sug ? `Sugerido para acabar el banco 1 semana antes del examen: ${sug}/día` : "Pon la fecha del examen y te sugiero cuántas."}</span></div>
      <div class="field"><label>Orden de las nuevas</label>
        <div class="seg" id="s-order">${[["temas", "Por temas"], ["mezcla", "Mezclar materias"], ["aleatorio", "Aleatorio"]].map(([k, l]) => `<button data-k="${k}" class="${s.newOrder === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      <div class="field"><label>Materias incluidas en el repaso diario</label>
        <div class="checks">${"ABCDEFGH".split("").map((m) => `<label title="${esc(materiaName(m))}"><input type="checkbox" value="${m}" ${s.materias.includes(m) ? "checked" : ""}> ${m}</label>`).join("")}</div></div>
      <button class="btn primary block" id="s-save">Guardar</button>`,
      (m) => {
        let order = s.newOrder;
        $("[data-x]", m).onclick = closeModal;
        $$("#s-order button", m).forEach((b) => (b.onclick = () => { order = b.dataset.k; $$("#s-order button", m).forEach((x) => x.classList.toggle("on", x === b)); }));
        $("#s-save", m).onclick = () => {
          s.examDate = $("#s-date", m).value;
          s.newPerDay = Math.max(0, Math.min(500, parseInt($("#s-new", m).value, 10) || 0));
          s.newOrder = order;
          s.materias = $$(".checks input:checked", m).map((i) => i.value).join("") || "ABCDEFGH";
          saveLocal(); closeModal(); route(); toast("Ajustes guardados");
        };
      });
  }

  // ---------- TEMAS ----------
  routes.temas = () => {
    app().innerHTML = `
      <div class="stack">
        <div><h1>Temas</h1><p class="muted small">8 materias del examen. El título de cada tema es la norma más citada en sus preguntas (el Ministerio no publica los títulos).</p></div>
        <div class="legend"><span><i style="background:var(--master)"></i>Dominadas</span><span><i style="background:var(--learn)"></i>Aprendiendo</span><span><i style="background:var(--bad)"></i>Falladas</span><span><i style="background:var(--new)"></i>Sin ver</span></div>
        ${"ABCDEFGH".split("").map((m) => {
          const qs = S.Q.filter((q) => q.m === m);
          const c = countsFor(qs);
          return `<details class="card materia" ${m === sessionStorage.getItem("tp-open") ? "open" : ""} data-m="${m}">
            <summary><span class="letter">${m}</span><b>${esc(materiaName(m))}</b><span class="meta">${pct(c.seen, c.total)}% visto</span>
              <span class="meta">${fmt(c.total)} preguntas · ${c.master} dominadas${c.due ? ` · <b>${c.due} para repasar</b>` : ""}</span><span></span>${barHTML(c)}</summary>
            <div class="row" style="padding:0 16px 12px"><a class="btn small primary" href="#/estudiar?modo=materia&m=${m}">Estudiar materia</a><a class="btn small" href="#/estudiar?modo=materia&m=${m}&orden=aleatorio">Aleatorio</a><a class="btn small" href="#/examen?m=${m}">Simulacro de ${m}</a></div>
            <div class="tema-list">${temasOf(m).map((t) => {
              const tq = qs.filter((q) => q.t === t);
              const tc = countsFor(tq);
              return `<div class="tema"><div class="t">Tema ${temaNum(t)} <span class="tiny">· ${tc.total} preg. · ${pct(tc.seen, tc.total)}% visto</span></div>
                <div class="acts"><a class="btn small" href="#/estudiar?modo=tema&t=${t}">Estudiar</a></div>
                <div class="src">${esc(S.bank.temas[t] || "")}</div>${barHTML(tc)}</div>`;
            }).join("")}</div>
          </details>`;
        }).join("")}
      </div>`;
    $$("details.materia").forEach((d) => d.addEventListener("toggle", () => { if (d.open) sessionStorage.setItem("tp-open", d.dataset.m); }));
  };

  // ---------- SESIÓN DE ESTUDIO ----------
  function buildSession(p) {
    const modo = p.get("modo") || "hoy";
    const now = Date.now();
    let list = [], title = "", empty = "";
    const pendingFirst = (qs) => {
      // primero: falladas y pendientes, luego sin ver, luego el resto
      const rank = (q) => { const c = card(q.id); if (c.seen && (c.last_correct === false || isDue(c, now))) return 0; if (!c.seen) return 1; return 2; };
      return qs.map((q, i) => [rank(q), i, q]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
    };
    if (modo === "hoy") {
      title = "Repaso de hoy";
      const nt = newToday();
      list = dueList().concat(newList().slice(0, Math.max(0, S.settings.newPerDay - nt)));
      if (!list.length) { list = newList().slice(0, 20); title = "Práctica extra"; }
      empty = "¡Lo tienes todo al día! Vuelve mañana o practica por temas.";
    } else if (modo === "tema") {
      const t = p.get("t");
      title = `${t[0]} · Tema ${temaNum(t)}`;
      list = S.Q.filter((q) => q.t === t);
      list = p.get("orden") === "aleatorio" ? shuffle(list) : pendingFirst(list);
    } else if (modo === "materia") {
      const m = p.get("m");
      title = `${m} · ${materiaName(m)}`;
      list = S.Q.filter((q) => q.m === m);
      list = p.get("orden") === "aleatorio" ? shuffle(list) : pendingFirst(list);
    } else if (modo === "casos") {
      const m = p.get("m");
      const now2 = Date.now();
      if (m) {
        title = `Casos prácticos · ${m}`;
        list = S.C.filter((q) => q.m === m);
        list = p.get("orden") === "aleatorio" ? shuffle(list) : pendingFirst(list);
      } else {
        title = "Casos prácticos de hoy";
        const due = S.C.filter((q) => isDue(card(q.id), now2)).sort((a, b) => card(a.id).due - card(b.id).due);
        const fresh = shuffle(S.C.filter((q) => !card(q.id).seen)).slice(0, Math.max(0, S.settings.newCasosPerDay - newToday(true)));
        list = due.concat(fresh);
        empty = "Casos al día. Puedes practicar por materia desde la página de casos.";
      }
    } else if (modo === "fallos") {
      title = "Mis fallos";
      list = allItems().filter((q) => { const c = S.progress[q.id]; return c && (c.last_correct === false || c.lapses >= 2); })
        .sort((a, b) => { const A = card(a.id), B = card(b.id); return (A.last_correct === false ? 0 : 1) - (B.last_correct === false ? 0 : 1) || B.lapses - A.lapses || (A.correct / A.seen) - (B.correct / B.seen); });
      empty = "No tienes fallos pendientes. 💪";
    } else if (modo === "marcadas") {
      title = "Marcadas";
      list = allItems().filter((q) => S.progress[q.id]?.flagged);
      empty = "Aún no has marcado preguntas (usa ☆ al responder).";
    } else if (modo === "semana") {
      title = "Recap semanal";
      list = weekFailIds().map((id) => S.byId.get(id)).filter(Boolean);
      empty = "Esta semana no has fallado nada (o no has estudiado 😉).";
    } else if (modo === "comunidad") {
      title = "Las más falladas por la gente";
      list = (S.community || []).slice(0, 50).map((r) => S.byId.get(r.qid)).filter(Boolean);
      empty = "Aún no hay datos suficientes.";
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
      app().innerHTML = `<div class="card done-card"><h2>${esc(sess.title)}</h2><p class="muted">${esc(sess.empty || "No hay preguntas aquí.")}</p><a class="btn primary" href="#/">Volver al inicio</a></div>`;
      return;
    }
    const queue = sess.list.map((q) => q.id);
    const total = queue.length;
    let done = 0, right = 0, wrong = 0;
    const failedIds = new Set();
    let state = null; // {id, answered, chosen, correct}

    function next() {
      if (!queue.length) return finish();
      const id = queue.shift();
      state = { id, answered: false };
      renderQ();
    }
    function renderQ() {
      const q = S.byId.get(state.id);
      const c = card(q.id);
      const isCaso = !!q.caso;
      const tag = !c.seen ? `<span class="chip">Nueva</span>` : c.last_correct === false ? `<span class="chip bad">Fallada antes</span>` : status(c) === "master" ? `<span class="chip ok">Dominada</span>` : `<span class="chip warn">Repaso</span>`;
      const opts = state.order || (state.order = q.opts.map((_, i) => i)); // orden original (como en el examen)
      app().innerHTML = `
        <div class="quiz-top"><a class="btn ghost small" href="#/" title="Salir">✕</a><div class="bar"><i class="m" style="width:${(100 * done) / Math.max(total, done + queue.length + 1)}%"></i></div><span class="tiny">${queue.length + 1} quedan</span></div>
        <article class="card qcard">
          <div class="qmeta"><span class="chip mat">${q.m}</span><span class="chip">${isCaso ? "Caso práctico" : "Tema " + temaNum(q.t)}</span>${tag}<span class="spacer"></span><span class="tiny">${codeOf(q)}</span></div>
          <div class="qtext ${isCaso ? "caso" : ""}">${isCaso ? casoHTML(q.text) : esc(q.text)}</div>
          <div class="opts">${opts.map((i) => `<button class="opt" data-i="${i}"><span class="l">${LETTERS[i]}</span><span>${esc(q.opts[i])}</span></button>`).join("")}</div>
          <div id="after"></div>
          <div class="qactions"><button class="btn ghost small" id="b-flag" title="Marcar">${c.flagged ? "★ Marcada" : "☆ Marcar"}</button><button class="btn ghost small" id="b-report">⚑ Reportar error</button></div>
        </article>
        <p class="tiny kbd-hint" style="text-align:center;margin-top:10px">Teclado: ${isCaso ? "A–H o 1–8" : "A–D o 1–4"} para responder · Enter para seguir</p>`;
      $$(".opt").forEach((b) => (b.onclick = () => answer(parseInt(b.dataset.i, 10))));
      $("#b-flag").onclick = () => { const f = toggleFlag(q.id); $("#b-flag").textContent = f ? "★ Marcada" : "☆ Marcar"; };
      $("#b-report").onclick = () => openReport(q);
    }
    function answer(i) {
      if (state.answered) return;
      const q = S.byId.get(state.id);
      const ok = i === q.sol;
      state.answered = true; state.chosen = i; state.correct = ok;
      regrade.prev = { id: q.id, card: S.progress[q.id] ? { ...S.progress[q.id] } : null, now: Date.now() };
      recordAnswer(q.id, i, ok ? 2 : 0, sess.modo);
      done++;
      if (ok) right++; else { wrong++; failedIds.add(q.id); queue.splice(Math.min(4, queue.length), 0, q.id); }
      $$(".opt").forEach((b) => {
        const k = parseInt(b.dataset.i, 10);
        b.disabled = true;
        if (k === q.sol) b.classList.add("correct");
        else if (k === i) b.classList.add("wrong");
        else b.classList.add("dim");
      });
      const after = $("#after");
      after.innerHTML = `
        <div class="feedback ${ok ? "ok" : "bad"}"><b>${ok ? "¡Correcto!" : `Incorrecto. La buena es la ${LETTERS[q.sol]}.`}</b>
          ${q.norma ? `<div class="norma">📖 ${esc(q.norma)}</div>` : ""}
          ${q.nota ? `<div class="norma">📝 ${esc(q.nota)}</div>` : ""}
          ${!ok ? `<div class="norma">Volverá a salir en unos minutos.</div>` : ""}</div>
        ${ok ? `<div class="grade">
            <button class="btn" data-g="1">Difícil<small>acerté dudando</small></button>
            <button class="btn primary" data-g="2">Bien <span class="kbd">↵</span><small>siguiente</small></button>
            <button class="btn" data-g="3">Fácil<small>me la sé</small></button></div>`
          : `<div class="grade" style="grid-template-columns:1fr"><button class="btn primary" data-g="0">Continuar <span class="kbd">↵</span></button></div>`}`;
      $$("[data-g]", after).forEach((b) => (b.onclick = () => go(parseInt(b.dataset.g, 10))));
      const r = after.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 70) after.scrollIntoView({ behavior: "smooth", block: "end" });
      $("[data-g='2'], [data-g='0']", after)?.focus({ preventScroll: true });
    }
    function go(g) {
      if (state.correct && g !== 2) regrade(state.id, g);
      next();
    }
    function finish() {
      const acc = pct(right, right + wrong);
      app().innerHTML = `
        <div class="card done-card stack">
          <p class="muted" style="margin:0">${esc(sess.title)}</p>
          <div class="big">${acc}%</div>
          <p class="muted">${right} aciertos · ${wrong} fallos · ${total} preguntas</p>
          <div class="row" style="justify-content:center">
            ${failedIds.size ? `<a class="btn" href="#/estudiar?modo=lista&titulo=${encodeURIComponent("Fallos de la sesión")}&ids=${[...failedIds].join(",")}">Repasar los ${failedIds.size} fallos</a>` : ""}
            <a class="btn primary" href="#/">Volver al inicio</a>
          </div>
          ${S.user ? `<p class="tiny">Progreso guardado en tu cuenta.</p>` : S.sb ? `<p class="tiny">Progreso guardado en este navegador. <a href="#" id="b-l">Crea una cuenta</a> para no perderlo.</p>` : ""}
        </div>`;
      $("#b-l") && ($("#b-l").onclick = (e) => { e.preventDefault(); openLogin("signup"); });
    }
    const onKey = (e) => {
      if (!state || $("#modal").hidden === false) return;
      if (e.target.matches("input, textarea")) return;
      const k = e.key.toUpperCase();
      if (!state.answered) {
        const q = S.byId.get(state.id);
        let i = "ABCDEFGH".indexOf(k);
        if (i < 0 && /^[1-8]$/.test(k)) i = parseInt(k, 10) - 1;
        if (i >= 0 && i < q.opts.length) { e.preventDefault(); answer(i); }
      } else {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(state.correct ? 2 : 0); }
        else if (state.correct && ["1", "2", "3"].includes(e.key)) { e.preventDefault(); go(parseInt(e.key, 10)); }
      }
    };
    document.addEventListener("keydown", onKey);
    cleanup = () => document.removeEventListener("keydown", onKey);
    next();
  };

  function casoHTML(t) {
    // resalta las preguntas finales del caso
    const h = esc(t);
    const i = h.search(/Responda a la/i);
    return i > 0 ? h.slice(0, i) + `<b class="ask">${h.slice(i)}</b>` : h;
  }
  function openReport(q) {
    modal(`
      <div class="row"><h2 style="margin:0">Reportar error</h2><span class="spacer"></span><button class="btn ghost small" data-x>✕</button></div>
      <p class="small muted">${q.caso ? "Caso" : "Pregunta"} ${codeOf(q)}. ¿Qué está mal? (respuesta incorrecta, norma derogada, errata…)</p>
      <textarea class="input" id="r-msg" rows="4" maxlength="1000"></textarea>
      <button class="btn primary block" id="r-send">Enviar</button>`,
      (m) => {
        $("[data-x]", m).onclick = closeModal;
        $("#r-send", m).onclick = async () => {
          const message = $("#r-msg", m).value.trim();
          if (!message) return;
          if (!S.user) { toast("Entra con tu cuenta para reportar."); return; }
          const { error } = await S.sb.from("reports").insert({ qid: q.id, message: message });
          closeModal(); toast(error ? "No se pudo enviar" : "Gracias, reporte enviado");
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
    const newSeen = new Set(); const before = new Set(S.log.filter((r) => r[0] < now - 7 * DAY).map((r) => r[1]));
    cur.forEach((r) => { if (!before.has(r[1])) newSeen.add(r[1]); });
    const delta = (a, b) => (b ? (a >= b ? `<span class="chip ok">+${a - b}</span>` : `<span class="chip bad">${a - b}</span>`) : "");
    app().innerHTML = `
      <div class="stack">
        <div><h1>Recap semanal</h1><p class="muted small">Últimos 7 días comparados con la semana anterior.</p></div>
        <div class="kpis">
          <div class="kpi"><b>${cur.length}</b><span>respuestas ${delta(cur.length, prev.length)}</span></div>
          <div class="kpi"><b>${acc(cur)}%</b><span>acierto ${prev.length ? `(antes ${acc(prev)}%)` : ""}</span></div>
          <div class="kpi"><b>${days}/7</b><span>días estudiados</span></div>
          <div class="kpi"><b>${newSeen.size}</b><span>preguntas nuevas</span></div>
        </div>
        <section class="card">
          <div class="row"><h2 style="margin:0">Fallos de la semana</h2><span class="spacer"></span>${failIds.length ? `<a class="btn primary small" href="#/estudiar?modo=semana">Repasar ${failIds.length}</a>` : ""}</div>
          ${failIds.length ? `<div>${failIds.slice(0, 15).map((id) => qItem(S.byId.get(id))).join("")}</div>${failIds.length > 15 ? `<p class="tiny">…y ${failIds.length - 15} más.</p>` : ""}` : `<p class="empty">Sin fallos esta semana.</p>`}
        </section>
        <section class="card"><h2>Por materia</h2>
          <table class="table"><tr><th>Materia</th><th class="num">Resp.</th><th class="num">Acierto</th></tr>
          ${"ABCDEFGH".split("").map((m) => byM[m] ? `<tr><td>${m} · ${esc(materiaName(m))}</td><td class="num">${byM[m][0]}</td><td class="num">${pct(byM[m][1], byM[m][0])}%</td></tr>` : "").join("") || `<tr><td colspan="3" class="muted">Sin actividad.</td></tr>`}
          </table></section>
      </div>`;
  };
  function qItem(q, extra = "") {
    if (!q) return "";
    const txt = q.caso && q.text.length > 320 ? q.text.slice(0, 320) + "…" : q.text;
    return `<div class="qitem"><div class="tiny">${codeOf(q)} · ${q.m} · ${q.caso ? "Caso práctico" : "Tema " + temaNum(q.t)}${extra}</div><div class="q pre">${esc(txt)}</div><div class="a pre">✓ ${LETTERS[q.sol]}) ${esc(q.opts[q.sol])}</div></div>`;
  }

  // ---------- COMUNIDAD ----------
  routes.comunidad = async () => {
    app().innerHTML = `<div class="stack"><div><h1>Lo que más falla la gente</h1><p class="muted small">Porcentaje de fallo en el <b>primer intento</b> de cada usuario. Datos anónimos y agregados.</p></div><div id="com" class="card"><div class="loading"><div class="spinner"></div></div></div></div>`;
    if (!S.sb) { $("#com").innerHTML = `<p class="empty">Las estadísticas globales necesitan conexión con el servidor.</p>`; return; }
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
        ${Object.keys(byM).length ? `<section class="card"><h2>Materias más difíciles</h2><table class="table"><tr><th>Materia</th><th class="num">Fallo</th></tr>${Object.entries(byM).sort((a, b) => b[1][1] / b[1][0] - a[1][1] / a[1][0]).map(([m, [a, f]]) => `<tr><td>${m} · ${esc(materiaName(m))}</td><td class="num">${pct(f, a)}%</td></tr>`).join("")}</table></section>` : ""}
        <section class="card">
          <div class="row"><h2 style="margin:0">Top preguntas más falladas</h2><span class="spacer"></span>${top.length ? `<a class="btn primary small" href="#/estudiar?modo=comunidad">Estudiar las ${Math.min(50, top.length)} peores</a>` : ""}</div>
          ${top.length ? top.map((r) => { const q = S.byId.get(r.qid); return q ? qItem(q, ` · <b style="color:var(--bad)">${Math.round(r.fail_rate * 100)}% fallan</b> (${r.attempts} intentos)${r.top_wrong != null && q.opts[r.top_wrong] ? ` · la trampa más común: ${LETTERS[r.top_wrong]}` : ""}`) : ""; }).join("")
            : `<p class="empty">Todavía no hay suficientes datos: hacen falta al menos 3 personas respondiendo la misma pregunta. ¡Comparte la web!</p>`}
        </section>`;
    } catch (e) {
      console.warn(e);
      $("#com").innerHTML = `<p class="empty">No se pudieron cargar las estadísticas.</p>`;
    }
  };

  // ---------- BUSCAR ----------
  routes.buscar = (p) => {
    ensureCasos().then(() => $("#q") && $("#q").dispatchEvent(new Event("input")));
    app().innerHTML = `
      <div class="stack">
        <h1>Buscar</h1>
        <input class="input" id="q" placeholder="Ej.: tacógrafo, CMR, 1E05012, Ley 16/1987…" value="${esc(p.get("q") || "")}" autofocus>
        <div id="res" class="card"></div>
      </div>`;
    const run = () => {
      const raw = $("#q").value.trim();
      const term = norm(raw);
      const res = $("#res");
      if (term.length < 2) { res.innerHTML = `<p class="empty">Escribe al menos 2 letras. Busca en preguntas, respuestas, normas y códigos.</p>`; return; }
      const words = term.split(/\s+/);
      const hits = [];
      for (const q of allItems()) {
        const hay = q._n || (q._n = norm(codeOf(q) + " " + q.text + " " + q.opts.join(" ") + " " + q.norma));
        if (words.every((w) => hay.includes(w))) { hits.push(q); if (hits.length >= 60) break; }
      }
      const hl = (s) => { let h = esc(s); for (const w of raw.split(/\s+/).filter((x) => x.length > 1)) h = h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>"); return h; };
      res.innerHTML = hits.length ? `<p class="tiny">${hits.length >= 60 ? "Primeros 60 resultados" : hits.length + " resultados"}</p>` + hits.map((q) => `<div class="qitem search-hit"><div class="tiny">${q.caso ? "Caso " : ""}${codeOf(q)} · ${esc(q.norma)}</div><div class="q pre">${hl(q.text)}</div>${q.opts.map((o, i) => `<div class="pre ${i === q.sol ? "a" : "small muted"}">${i === q.sol ? "✓" : "·"} ${LETTERS[i]}) ${hl(o)}</div>`).join("")}</div>`).join("")
        : `<p class="empty">Sin resultados.</p>`;
    };
    let t; $("#q").oninput = () => { clearTimeout(t); t = setTimeout(run, 150); };
    run();
  };

  // ---------- SIMULACRO ----------
  routes.examen = (p) => {
    const m = p.get("m");
    const last = S.exams.filter((e) => e.kind !== "casos").slice(-5).reverse();
    app().innerHTML = `
      <div class="stack">
        <div><h1>Simulacro de examen</h1><p class="muted small">Como el real: preguntas de 4 opciones, cada acierto suma 1, cada fallo resta 1/3 y en blanco no cuenta. Para aprobar la parte de test necesitas al menos el 50%; y en total (test + casos) al menos el 60%.</p></div>
        <div class="grid grid-2">
          ${[[200, 120, "Completo", "Como el examen real"], [100, 60, "Medio", "La mitad, mismo ritmo"], [50, 30, "Rápido", "Para un rato libre"]].map(([n, min, t, d]) =>
            `<button class="card tile" data-n="${n}" data-min="${min}"><div class="ico">${ICONS.clock}</div><b>${t} · ${n} preguntas</b><small>${min} minutos · ${d}</small></button>`).join("")}
          <div class="card tile"><div class="ico">${ICONS.list}</div><b>Por materia</b><small>50 preguntas · 30 min</small>
            <div class="checks" style="margin-top:.3rem">${"ABCDEFGH".split("").map((x) => `<a class="btn small ${x === m ? "primary" : ""}" href="#/examen/run?n=50&min=30&m=${x}">${x}</a>`).join("")}</div></div>
        </div>
        <label class="row small"><input type="checkbox" id="x-unseen"> Priorizar preguntas que no he visto nunca</label>
        ${last.length ? `<section class="card"><h2>Últimos simulacros</h2><table class="table"><tr><th>Fecha</th><th class="num">Preguntas</th><th class="num">Nota</th><th class="num">%</th></tr>
          ${last.map((e) => `<tr><td>${new Date(e.at).toLocaleDateString("es-ES")}</td><td class="num">${e.total}</td><td class="num">${e.score.toFixed(1)}</td><td class="num"><span class="chip ${e.score / e.total >= 0.5 ? "ok" : "bad"}">${pct(e.score, e.total)}%</span></td></tr>`).join("")}</table></section>` : ""}
      </div>`;
    $$("[data-n]").forEach((b) => (b.onclick = () => { location.hash = `#/examen/run?n=${b.dataset.n}&min=${b.dataset.min}${$("#x-unseen").checked ? "&unseen=1" : ""}`; }));
  };
  const _examenMenu = routes.examen;
  routes.examen = (p, sub) => {
    if (sub[0] !== "run") return _examenMenu(p);
    if (p.get("tipo") !== "casos") return runExam(p);
    app().innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
    ensureCasos().then(() => (S.C.length ? runExam(p) : (app().innerHTML = `<p class="empty">Los casos prácticos no están disponibles.</p>`)));
  };
  function pickCasos(n, m) {
    if (m) return shuffle(S.C.filter((q) => q.m === m)).slice(0, n);
    // n casos de materias distintas, con probabilidad proporcional al nº de casos de cada materia
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

  function pickExam(n, m, preferUnseen) {
    const pool = m ? S.Q.filter((q) => q.m === m) : S.Q;
    const pick = (qs, k) => {
      if (!preferUnseen) return shuffle(qs.slice()).slice(0, k);
      const un = shuffle(qs.filter((q) => !card(q.id).seen)), se = shuffle(qs.filter((q) => card(q.id).seen));
      return un.concat(se).slice(0, k);
    };
    if (m) return shuffle(pick(pool, n));
    // reparto proporcional al peso de cada materia en el banco (restos mayores)
    const by = {}; pool.forEach((q) => (by[q.m] = by[q.m] || []).push(q));
    const keys = Object.keys(by);
    const quota = keys.map((k) => { const x = (n * by[k].length) / pool.length; return [k, Math.floor(x), x - Math.floor(x)]; });
    let rest = n - quota.reduce((s, x) => s + x[1], 0);
    quota.sort((a, b) => b[2] - a[2]).forEach((x) => { if (rest > 0) { x[1]++; rest--; } });
    const out = [];
    quota.sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, c]) => out.push(...pick(by[k], c)));
    return out; // ordenadas por materia, como en el examen
  }

  function runExam(p) {
    const casos = p.get("tipo") === "casos";
    const unit = casos ? 50 : 1; // en casos prácticos cada caso vale 50 puntos
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
        <div class="exam-head"><span class="timer" id="timer"></span><span class="tiny">${ans.filter((a) => a != null).length}/${qs.length} respondidas</span><span class="spacer"></span><button class="btn small" id="x-grid">Índice</button><button class="btn primary small" id="x-end">Entregar</button></div>
        <article class="card qcard">
          <div class="qmeta"><span class="chip mat">${q.m}</span><span class="chip">${what} ${cur + 1} de ${qs.length}</span><span class="spacer"></span><button class="btn ghost small" id="x-flag">${flags.has(cur) ? "★ Revisar" : "☆ Marcar para revisar"}</button></div>
          <div class="qtext ${casos ? "caso" : ""}">${casos ? casoHTML(q.text) : esc(q.text)}</div>
          <div class="opts">${q.opts.map((o, i) => `<button class="opt ${ans[cur] === i ? "picked" : ""}" data-i="${i}"><span class="l">${LETTERS[i]}</span><span>${esc(o)}</span></button>`).join("")}</div>
          <div class="row" style="margin-top:14px"><button class="btn" id="x-prev" ${cur === 0 ? "disabled" : ""}>← Anterior</button>${ans[cur] != null ? `<button class="btn ghost small" id="x-clear">Dejar en blanco</button>` : ""}<span class="spacer"></span><button class="btn dark" id="x-next">${cur === qs.length - 1 ? "Revisar y entregar" : "Siguiente →"}</button></div>
        </article>
        <div id="grid-wrap" class="card" style="margin-top:12px" hidden><div class="navgrid">${qs.map((_, i) => `<button data-j="${i}" class="${ans[i] != null ? "ans" : ""} ${flags.has(i) ? "flag" : ""} ${i === cur ? "cur" : ""}">${i + 1}</button>`).join("")}</div></div>`;
      tick();
      $$(".opt").forEach((b) => (b.onclick = () => { const i = parseInt(b.dataset.i, 10); ans[cur] = ans[cur] === i ? null : i; if (ans[cur] != null && cur < qs.length - 1) { cur++; } render(); }));
      $("#x-prev").onclick = () => { cur--; render(); };
      $("#x-next").onclick = () => { if (cur < qs.length - 1) { cur++; render(); } else confirmEnd(); };
      $("#x-clear") && ($("#x-clear").onclick = () => { ans[cur] = null; render(); });
      $("#x-flag").onclick = () => { flags.has(cur) ? flags.delete(cur) : flags.add(cur); render(); };
      $("#x-grid").onclick = () => { const g = $("#grid-wrap"); g.hidden = !g.hidden; sessionStorage.setItem("tp-grid", g.hidden ? "" : "1"); };
      if (sessionStorage.getItem("tp-grid")) $("#grid-wrap").hidden = false;
      $$("[data-j]").forEach((b) => (b.onclick = () => { cur = parseInt(b.dataset.j, 10); render(); }));
      $("#x-end").onclick = confirmEnd;
    }
    function tick() {
      const left = Math.max(0, tEnd - Date.now());
      const el = $("#timer");
      if (el) { const s = Math.ceil(left / 1000); el.textContent = `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; el.classList.toggle("low", left < 5 * 60000); }
      if (left <= 0 && !finished) { toast("¡Tiempo! Examen entregado."); finish(); }
    }
    function confirmEnd() {
      const blank = ans.filter((a) => a == null).length;
      modal(`<h2>¿Entregar el examen?</h2><p class="muted">${blank ? `Tienes ${blank} ${casos ? "casos" : "preguntas"} en blanco${flags.size ? ` y ${flags.size} marcadas para revisar` : ""}.` : "Has respondido todas."}</p>
        <div class="row"><button class="btn" data-x>Seguir</button><span class="spacer"></span><button class="btn primary" id="x-ok">Entregar</button></div>`,
        (mm) => { $("[data-x]", mm).onclick = closeModal; $("#x-ok", mm).onclick = () => { closeModal(); finish(); }; });
    }
    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(timerI);
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
      const wrongIds = qs.filter((q, i) => ans[i] != null && ans[i] !== q.sol).map((q) => q.id);
      app().innerHTML = `
        <div class="stack">
          <section class="card" style="text-align:center">
            <p class="muted" style="margin:0">Resultado${casos ? " · Casos prácticos" : ""}${m ? ` · Materia ${m}` : ""}</p>
            <div class="score-big" style="color:${pass ? "var(--ok)" : "var(--bad)"}">${score.toFixed(1)}<span style="font-size:1.3rem;color:var(--ink-3)"> / ${total}</span></div>
            <p><span class="chip ${pass ? "ok" : "bad"}">${pass ? (casos ? "Aprobarías la parte práctica" : "Aprobarías el test") : "No llegarías al 50%"}</span></p>
            <p class="muted small">${correct} aciertos · ${wrong} fallos (−${((wrong / 3) * unit).toFixed(1)}) · ${blank} en blanco · ${Math.round(e.duration_s / 60)} min</p>
            ${casos && qs.length === 4 ? `<p class="small">Con ${score.toFixed(1)} aquí, para el aprobado total (240/400) necesitarías ${Math.max(100, 240 - score).toFixed(1)} en el test.</p>` : ""}
            ${!casos && qs.length === 200 ? `<p class="small">Para el aprobado total (240/400) con el mínimo en casos prácticos (100) necesitarías ${score >= 140 ? "✓ ya lo tienes" : `140 en el test (te faltan ${(140 - score).toFixed(1)})`}.</p>` : ""}
            <div class="row" style="justify-content:center">${wrongIds.length ? `<a class="btn" href="#/estudiar?modo=lista&titulo=${encodeURIComponent("Fallos del simulacro")}&ids=${wrongIds.join(",")}">Repasar los ${wrongIds.length} fallos</a>` : ""}<a class="btn primary" href="${casos ? "#/casos" : "#/examen"}">Otro simulacro</a></div>
          </section>
          <section class="card"><h2>Por materia</h2><table class="table"><tr><th>Materia</th><th class="num">Acier.</th><th class="num">Fallos</th><th class="num">Nota</th></tr>
            ${Object.entries(perM).map(([k, v]) => { const s = v.c - v.w / 3; return `<tr><td>${k} · ${esc(materiaName(k))}</td><td class="num">${v.c}/${v.t}</td><td class="num">${v.w}</td><td class="num"><span class="chip ${s / v.t >= 0.5 ? "ok" : "bad"}">${pct(s, v.t)}%</span></td></tr>`; }).join("")}</table></section>
          <section class="card"><h2>Corrección</h2><div class="navgrid" style="margin-bottom:12px">${qs.map((q, i) => `<button class="${ans[i] == null ? "" : ans[i] === q.sol ? "ok" : "bad"}" data-r="${i}">${i + 1}</button>`).join("")}</div>
            <div id="rev">${reviewList("bad")}</div>
            <div class="seg" id="rev-f"><button class="on" data-f="bad">Fallos</button><button data-f="blank">En blanco</button><button data-f="all">Todas</button></div></section>
        </div>`;
      function reviewList(f) {
        return qs.map((q, i) => {
          const st = ans[i] == null ? "blank" : ans[i] === q.sol ? "ok" : "bad";
          if (f !== "all" && f !== st) return "";
          return `<div class="qitem" id="r${i}"><div class="tiny">${i + 1} · ${codeOf(q)} · ${esc(q.norma)}</div><div class="q pre">${esc(q.text)}</div>${st === "bad" ? `<div class="w pre">✗ Tu respuesta: ${LETTERS[ans[i]]}) ${esc(q.opts[ans[i]])}</div>` : st === "blank" ? `<div class="small muted">En blanco</div>` : ""}<div class="a pre">✓ ${LETTERS[q.sol]}) ${esc(q.opts[q.sol])}</div></div>`;
        }).join("") || `<p class="empty">Nada por aquí.</p>`;
      }
      $$("#rev-f button").forEach((b) => (b.onclick = () => { $$("#rev-f button").forEach((x) => x.classList.toggle("on", x === b)); $("#rev").innerHTML = reviewList(b.dataset.f); }));
      $$("[data-r]").forEach((b) => (b.onclick = () => { $$("#rev-f button").forEach((x) => x.classList.toggle("on", x.dataset.f === "all")); $("#rev").innerHTML = reviewList("all"); $("#r" + b.dataset.r)?.scrollIntoView({ behavior: "smooth", block: "center" }); }));
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

  // ---------- PROGRESO ----------
  routes.stats = () => {
    const all = countsFor(S.Q);
    const totalAns = S.log.length, okAns = S.log.filter((r) => r[2]).length;
    const today = S.log.filter((r) => r[0] >= startOfDay()).length;
    // heatmap 18 semanas
    const perDay = new Map();
    S.log.forEach((r) => perDay.set(dayKey(r[0]), (perDay.get(dayKey(r[0])) || 0) + 1));
    const weeks = 18;
    const start = startOfDay() - ((new Date().getDay() + 6) % 7) * DAY - (weeks - 1) * 7 * DAY;
    let heat = "";
    for (let d = 0; d < weeks * 7; d++) {
      const t = start + d * DAY;
      const v = t > Date.now() ? -1 : perDay.get(dayKey(t)) || 0;
      const lvl = v <= 0 ? "" : v < 20 ? "h1" : v < 60 ? "h2" : v < 150 ? "h3" : "h4";
      heat += `<i class="${lvl}" title="${new Date(t).toLocaleDateString("es-ES")}: ${Math.max(0, v)}" ${v < 0 ? 'style="visibility:hidden"' : ""}></i>`;
    }
    // previsión de repasos 7 días
    const fc = [];
    for (let i = 0; i < 7; i++) {
      const a = i === 0 ? -Infinity : startOfDay() + i * DAY, b = endOfDay(startOfDay() + i * DAY);
      fc.push(S.Q.reduce((s, q) => { const c = S.progress[q.id]; return s + (c && c.seen && c.due >= a && c.due <= b ? 1 : 0); }, 0));
    }
    const fmax = Math.max(1, ...fc);
    const est = estimateScore();
    app().innerHTML = `
      <div class="stack">
        <h1>Tu progreso</h1>
        <div class="kpis">
          <div class="kpi"><b>${pct(all.seen, all.total)}%</b><span>banco visto (${fmt(all.seen)})</span></div>
          <div class="kpi"><b>${fmt(all.master)}</b><span>dominadas</span></div>
          <div class="kpi"><b>${pct(okAns, totalAns)}%</b><span>acierto global</span></div>
          <div class="kpi"><b>${today}</b><span>respuestas hoy</span></div>
          <div class="kpi"><b>${streak()}</b><span>días de racha</span></div>
          <div class="kpi"><b style="color:${est >= 140 ? "var(--ok)" : est >= 100 ? "#b07f00" : "var(--bad)"}">${est}</b><span>nota estimada test /200</span></div>
        </div>
        <section class="card"><h2>Actividad</h2><div class="heat">${heat}</div><p class="tiny" style="margin:.4rem 0 0">Últimas ${weeks} semanas · ${fmt(totalAns)} respuestas en total</p></section>
        <section class="card"><h2>Repasos previstos</h2><div class="forecast">${fc.map((v, i) => `<div><span>${v}</span><i style="height:${(70 * v) / fmax}px"></i><span>${i === 0 ? "Hoy" : new Date(startOfDay() + i * DAY).toLocaleDateString("es-ES", { weekday: "short" })}</span></div>`).join("")}</div></section>
        <section class="card"><h2>Por materia</h2>
          <table class="table"><tr><th>Materia</th><th style="width:34%">Progreso</th><th class="num">Visto</th><th class="num">Acierto</th></tr>
          ${"ABCDEFGH".split("").map((m) => {
            const qs = S.Q.filter((q) => q.m === m); const c = countsFor(qs);
            let s = 0, ok = 0; for (const q of qs) { const k = S.progress[q.id]; if (k) { s += k.seen; ok += k.correct; } }
            return `<tr><td><a href="#/estudiar?modo=materia&m=${m}" style="color:inherit;text-decoration:none"><b>${m}</b> <span class="hide-sm">${esc(materiaName(m))}</span></a></td><td>${barHTML(c)}</td><td class="num">${pct(c.seen, c.total)}%</td><td class="num">${s ? pct(ok, s) + "%" : "–"}</td></tr>`;
          }).join("")}</table>
          <div class="legend" style="margin-top:.6rem"><span><i style="background:var(--master)"></i>Dominadas (intervalo ≥ ${MASTER_IVL} días)</span><span><i style="background:var(--learn)"></i>Aprendiendo</span><span><i style="background:var(--bad)"></i>Falladas</span></div>
        </section>
        <section class="card"><h2>Simulacros</h2>${S.exams.length ? `<table class="table"><tr><th>Fecha</th><th>Tipo</th><th class="num">Nota</th><th class="num">%</th></tr>${S.exams.slice().reverse().slice(0, 20).map((e) => `<tr><td>${new Date(e.at).toLocaleDateString("es-ES")}</td><td>${e.kind === "casos" ? "Casos" : e.total + " preg."}</td><td class="num">${e.score.toFixed(1)}/${e.total}</td><td class="num"><span class="chip ${e.score / e.total >= 0.5 ? "ok" : "bad"}">${pct(e.score, e.total)}%</span></td></tr>`).join("")}</table>` : `<p class="empty">Aún no has hecho ningún simulacro. <a href="#/examen">Hacer uno</a></p>`}</section>
        <p class="tiny">La nota estimada supone que contestas todo: preguntas dominadas ≈ 95% de acierto, vistas y acertadas ≈ 72–97%, falladas ≈ 30% y sin ver ≈ 35%.</p>
      </div>`;
  };

  // ---------- CASOS PRÁCTICOS ----------
  routes.casos = async () => {
    app().innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
    await ensureCasos();
    if (!S.C.length) { app().innerHTML = `<div class="card empty"><h2>Casos prácticos</h2><p>No se han podido cargar.</p></div>`; return; }
    const c = countsFor(S.C);
    const nt = newToday(true);
    const newLeft = Math.min(Math.max(0, S.settings.newCasosPerDay - nt), c.new);
    const last = S.exams.filter((e) => e.kind === "casos").slice(-5).reverse();
    app().innerHTML = `
      <div class="stack">
        <div><h1>Casos prácticos</h1><p class="muted small">Segunda parte del examen: <b>4 casos</b> con <b>8 respuestas</b> cada uno (cada respuesta combina varias sub-respuestas). Acierto +50, fallo −16,7, en blanco 0. Máximo 200; necesitas al menos 100, y 240 entre las dos partes.</p></div>
        <section class="card hero">
          <h1>Casos de hoy</h1>
          <div class="hero-stats"><div><b>${c.due}</b><span>para repasar</span></div><div><b>${newLeft}</b><span>nuevos (${nt}/${S.settings.newCasosPerDay} hoy)</span></div><div><b>${fmt(c.total)}</b><span>casos en el banco</span></div></div>
          <div class="row"><a class="btn primary lg" href="#/estudiar?modo=casos">${ICONS.play.replace("<svg", '<svg width="18" height="18" fill="currentColor"')} Empezar</a>
          <a class="btn small" href="#/examen/run?tipo=casos&n=4&min=120" style="background:rgba(255,255,255,.1);border-color:transparent;color:#fff">Simulacro (4 casos · 2 h)</a></div>
        </section>
        <section class="card"><div class="row"><h2 style="margin:0">Por materia</h2><span class="spacer"></span><span class="tiny">${pct(c.seen, c.total)}% visto</span></div>
          <table class="table"><tr><th>Materia</th><th style="width:30%">Progreso</th><th class="num">Casos</th><th></th></tr>
          ${"ABCDEFGH".split("").map((m) => { const qs = S.C.filter((q) => q.m === m); if (!qs.length) return ""; const k = countsFor(qs);
            return `<tr><td><b>${m}</b> <span class="hide-sm">${esc(materiaName(m))}</span></td><td>${barHTML(k)}</td><td class="num">${k.seen}/${k.total}</td><td class="num"><a class="btn small" href="#/estudiar?modo=casos&m=${m}">Estudiar</a></td></tr>`; }).join("")}
          </table></section>
        ${last.length ? `<section class="card"><h2>Últimos simulacros de casos</h2><table class="table"><tr><th>Fecha</th><th class="num">Nota</th><th class="num">%</th></tr>${last.map((e) => `<tr><td>${new Date(e.at).toLocaleDateString("es-ES")}</td><td class="num">${e.score.toFixed(1)} / ${e.total}</td><td class="num"><span class="chip ${e.score / e.total >= 0.5 ? "ok" : "bad"}">${pct(e.score, e.total)}%</span></td></tr>`).join("")}</table></section>` : ""}
        <p class="tiny">Consejo: lee primero las preguntas finales del caso (en negrita) y luego el enunciado; descarta respuestas en cuanto una de sus sub-respuestas sea falsa.</p>
      </div>`;
  };

  routes.cuenta = () => { routes.home(); if (S.user) openAccount(); else if (S.sb) openLogin(); };

  // ---------- arranque ----------
  async function boot() {
    initSupabase();
    loadLocal();
    renderAccount();
    try {
      await loadBank();
    } catch (e) {
      app().innerHTML = `<div class="card empty"><h2>No se pudo cargar</h2><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Reintentar</button></div>`;
      return;
    }
    window.addEventListener("hashchange", route);
    if (S.sb) {
      S.sb.auth.onAuthStateChange((ev, session) => {
        if (session?.user) onSignedIn(session.user);
        else if (ev === "SIGNED_OUT") onSignedOut();
        if (ev === "PASSWORD_RECOVERY") setTimeout(openAccount, 300);
      });
      const { data } = await S.sb.auth.getSession();
      if (data?.session?.user) await onSignedIn(data.session.user);
    }
    route();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    window.addEventListener("online", () => flush());
  }
  window.TP = { S, schedule, status }; // para depurar desde la consola
  boot();
})();
