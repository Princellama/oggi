/* Oggi · /italian — Eric's Italian with his teacher. Plain JS, no build step.
   Two modes: Eric's page (/italian) and the teacher's PIN page (/italian/teacher).
   The word index lives in Notion (Italian Words); everything from it is rendered with textContent. */
(function () {
  "use strict";

  // ---------------- helpers ----------------
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "value") el.value = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const ext = (a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };
  const safeUrl = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : null);
  const claude = (prompt) => "https://claude.ai/new?q=" + encodeURIComponent(prompt);
  const pad = (n) => String(n).padStart(2, "0");
  const dayOf = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  const today = () => dayOf(Date.now());
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return dayOf(d); };
  const fmtDay = (iso) => new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const clock = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem("italian." + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("italian." + k, JSON.stringify(v)); } catch {} },
  };
  const TEACHER = location.pathname.startsWith("/italian/teacher");
  const BASE = TEACHER ? "/api/italian/t" : "/api/italian";
  async function api(method, path, body, raw) {
    const opt = { method, credentials: "same-origin" };
    if (raw) { opt.headers = { "Content-Type": raw.type }; opt.body = raw.body; }
    else if (body) { opt.headers = { "Content-Type": "application/json" }; opt.body = JSON.stringify({ d: today(), ...body }); }
    const r = await fetch(path + (method === "GET" ? "?d=" + today() : ""), opt);
    if (r.status === 401) {
      if (TEACHER) { showPin(); throw new Error("pin"); }
      location.href = "/"; throw new Error("signin");
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `failed (${r.status})`);
    return j;
  }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2800);
  }
  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } };

  // ---------------- state ----------------
  let D = { words: [], lessons: [], assignments: [], events: [], teacherPin: false };
  let loadErr = "";
  const byId = new Map();
  let reading = store.get("reader") || "";   // the last text in the reader, kept on this device
  let filter = { q: "", status: "", sort: store.get("sort") || "recent" };
  let openWord = null;
  let tab = "";
  let group = store.get("group") || "all";
  let calMonth = today().slice(0, 7);
  let calPick = today();
  const OWNER_TABS = [["oggi", "Oggi"], ["parole", "Parole"], ["leggi", "Leggi"], ["compiti", "Compiti"], ["calendario", "Calendario"]];
  const TEACHER_TABS = [["compiti", "Compiti"], ["parole", "Parole"], ["calendario", "Calendario"]];
  const tabs = () => (TEACHER ? TEACHER_TABS : OWNER_TABS);

  // ---------------- lessons: Preply on Wednesday night and Sunday morning ----------------
  const sessionFor = (iso) => { const wd = new Date(iso + "T12:00:00").getDay(); return wd === 3 ? "Wednesday night" : wd === 0 ? "Sunday morning" : "Extra"; };
  const eventsOn = (iso) => D.events.filter((e) => dayOf(e.start) === iso);
  const teacherName = () => { const e = D.events.find((x) => / - /.test(x.title)); return e ? e.title.split(" - ").slice(1).join(" - ").trim() : "your teacher"; };
  function nextLesson() {
    const now = Date.now() - 50 * 60000;
    const ev = D.events.filter((e) => Date.parse(e.start) >= now).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (ev) return { day: dayOf(ev.start), time: clock(ev.start), session: sessionFor(dayOf(ev.start)), isToday: dayOf(ev.start) === today() };
    const t = today();
    for (let i = 0; i < 8; i++) { const d = addDays(t, i); const s = sessionFor(d); if (s !== "Extra") return { day: d, session: s, isToday: i === 0 }; }
    return null;
  }
  const isLessonDay = (iso) => eventsOn(iso).length > 0 || sessionFor(iso) !== "Extra";
  const todaysLesson = () => D.lessons.find((l) => (l.date || "").slice(0, 10) === today() && l.session !== "Self-study") || null;
  async function ensureLesson() {
    let L = todaysLesson();
    if (L) return L;
    const t = today();
    L = await api("POST", "/api/italian/lesson", { session: sessionFor(t), name: "Lesson · " + fmtDay(t) });
    D.lessons.unshift(L);
    return L;
  }

  // ---------------- the matcher ----------------
  // Every word is indexed by its own spelling and each of its Forms, as a run of tokens, so
  // "mangio" finds mangiare and "in bocca al lupo" is matched as one phrase before its words.
  const TOKEN = /[\p{L}\p{M}]+/gu;
  const norm = (s) => s.normalize("NFC").toLowerCase();
  const bare = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  let IDX = null;
  function buildIndex() {
    const exact = new Map(), loose = new Map();
    let maxN = 1;
    const rank = (w) => (w.type === "Phrase" || w.type === "Expression" ? 1 : 0);
    for (const w of D.words) {
      const forms = [w.italian, ...String(w.forms || "").split(/[,;\n]/)].map((f) => f.trim()).filter(Boolean);
      for (const f of forms) {
        const toks = f.match(TOKEN);
        if (!toks) continue;
        maxN = Math.max(maxN, toks.length);
        const k = toks.map(norm).join(" "), kb = toks.map(bare).join(" ");
        if (!exact.has(k) || (f === w.italian && rank(w) >= rank(exact.get(k)))) exact.set(k, w);
        if (!loose.has(kb)) loose.set(kb, w);
      }
    }
    IDX = { exact, loose, maxN: Math.min(maxN, 8) };
  }
  function analyse(text) {
    if (!IDX) buildIndex();
    const toks = [];
    for (const m of text.matchAll(TOKEN)) toks.push({ s: m.index, e: m.index + m[0].length, t: m[0] });
    const out = [];
    let pos = 0, i = 0;
    const joinable = (a, b) => /^[\s'’\-]*$/.test(text.slice(a.e, b.s)) && b.s - a.e <= 3;
    while (i < toks.length) {
      let hit = null, n = Math.min(IDX.maxN, toks.length - i);
      for (; n >= 1; n--) {
        let ok = true;
        for (let j = i; j < i + n - 1; j++) if (!joinable(toks[j], toks[j + 1])) { ok = false; break; }
        if (!ok) continue;
        const run = toks.slice(i, i + n);
        hit = IDX.exact.get(run.map((x) => norm(x.t)).join(" ")) || IDX.loose.get(run.map((x) => bare(x.t)).join(" "));
        if (hit) break;
      }
      const a = toks[i], b = toks[i + Math.max(n, 1) - 1];
      if (a.s > pos) out.push({ t: text.slice(pos, a.s) });
      if (hit) { out.push({ t: text.slice(a.s, b.e), w: hit }); pos = b.e; i += n; }
      else { out.push({ t: a.t, unknown: true }); pos = a.e; i += 1; }
    }
    if (pos < text.length) out.push({ t: text.slice(pos) });
    return out;
  }
  // Render Italian text with the known words underlined; returns {known, total, distinct}.
  function renderItalian(el, text, addable) {
    const runs = analyse(text), frag = document.createDocumentFragment();
    let known = 0, total = 0;
    const distinct = new Set();
    for (const r of runs) {
      if (r.w) {
        const n = (r.t.match(TOKEN) || []).length; known += n; total += n; distinct.add(r.w.id);
        frag.append(h("span", { class: "it-w s-" + (r.w.status || "New").toLowerCase(), "data-id": r.w.id, tabindex: "0", text: r.t }));
      } else if (r.unknown) { total += 1; frag.append(addable ? h("span", { class: "it-u", text: r.t }) : document.createTextNode(r.t)); }
      else frag.append(document.createTextNode(r.t));
    }
    el.replaceChildren(frag);
    return { known, total, distinct };
  }

  // ---------------- tooltip ----------------
  const tip = () => $("#tip");
  let tipFor = null;
  function showTip(el) {
    const w = byId.get(el.dataset.id);
    if (!w) return;
    tipFor = el;
    const parts = (w.parts || []).map((i) => byId.get(i)).filter(Boolean);
    const phrases = (w.phrases || []).map((i) => byId.get(i)).filter(Boolean);
    const t = tip();
    t.replaceChildren(...[
      h("div", { class: "tt-head" }, h("b", { text: w.italian }), w.type ? h("span", { class: "tt-type", text: w.type.toLowerCase() }) : null),
      h("p", { class: "tt-en" + (w.english ? "" : " pending"), text: w.english || "Meaning coming — Claude fills it in." }),
      w.example ? h("p", { class: "tt-ex", text: w.example }) : null,
      w.note ? h("p", { class: "tt-note", text: w.note }) : null,
      phrases.length ? h("p", { class: "tt-links", text: "In: " + phrases.map((x) => x.italian).join(" · ") }) : null,
      parts.length ? h("p", { class: "tt-links", text: "Words: " + parts.map((x) => x.italian).join(" · ") }) : null,
      h("p", { class: "tt-meta", text: `Seen ${w.times || 0}× · since ${w.first ? fmtDay(w.first) : "—"} · ${w.status}` })].filter(Boolean));
    t.hidden = false;
    const r = el.getBoundingClientRect(), tw = Math.min(320, window.innerWidth - 24);
    t.style.width = tw + "px";
    t.style.left = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 12) + "px";
    const below = r.bottom + 8, th = t.offsetHeight;
    t.style.top = (below + th > window.innerHeight - 8 && r.top - th - 8 > 8 ? r.top - th - 8 : below) + "px";
  }
  function hideTip() { tip().hidden = true; tipFor = null; }
  document.addEventListener("mouseover", (e) => { const el = e.target.closest(".it-w"); if (el) showTip(el); else if (tipFor && !e.target.closest("#tip")) hideTip(); });
  document.addEventListener("focusin", (e) => { const el = e.target.closest(".it-w"); if (el) showTip(el); });
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".it-w");
    if (el && !el.closest(".it-list")) { if (tipFor === el && matchMedia("(hover: none)").matches) hideTip(); else showTip(el); return; }
    const u = e.target.closest(".it-u");
    if (u) { offerAdd(u); return; }
    if (!e.target.closest("#tip") && !e.target.closest(".it-addpop")) { hideTip(); closeAddPop(); }
  });
  window.addEventListener("scroll", () => { if (tipFor) hideTip(); closeAddPop(); }, { passive: true });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { hideTip(); closeAddPop(); } });

  let addPop = null;
  function closeAddPop() { if (addPop) { addPop.remove(); addPop = null; } }
  function offerAdd(el) {
    closeAddPop();
    const word = el.textContent;
    const b = h("button", { class: "btn", type: "button", text: `Add “${word}”` });
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { await addWord(word, ""); closeAddPop(); paintReader(); } catch { b.disabled = false; toast("Couldn't add it. Try again."); }
    });
    addPop = h("div", { class: "it-addpop" }, b);
    document.body.append(addPop);
    const r = el.getBoundingClientRect();
    addPop.style.left = Math.min(Math.max(12, r.left), window.innerWidth - 200) + "px";
    addPop.style.top = r.bottom + 6 + "px";
  }

  // ---------------- writes ----------------
  async function addWord(italian, english) {
    let L = null;
    if (!TEACHER) L = isLessonDay(today()) ? await ensureLesson().catch(() => null) : todaysLesson();
    const r = await api("POST", TEACHER ? "/api/italian/t/word" : "/api/italian/word", { italian, english, lessonId: L ? L.id : null });
    const i = D.words.findIndex((w) => w.id === r.word.id);
    if (i >= 0) D.words.splice(i, 1);
    D.words.unshift(r.word);
    if (L && !L.words.includes(r.word.id)) L.words.push(r.word.id);
    reindex();
    toast(r.existed ? (r.counted ? `“${r.word.italian}” again — seen ${r.word.times}×` : `“${r.word.italian}” is already counted today`) : `Added “${r.word.italian}”`);
    return r;
  }
  async function setStatus(w, status) {
    w.status = status; reindex(); paintList(); paintCloud();
    try { Object.assign(w, await api("PATCH", "/api/italian/word/" + w.id, { status })); } catch { toast("Couldn't save. Try again."); }
  }
  async function saveAssign(a, f) {
    const r = await api("PATCH", (TEACHER ? "/api/italian/t/assign/" : "/api/italian/assign/") + a.id, f);
    Object.assign(a, r);
    return a;
  }
  function reindex() { byId.clear(); for (const w of D.words) byId.set(w.id, w); IDX = null; }

  // ---------------- top: tabs ----------------
  function topNav() {
    const nl = nextLesson();
    $("#next").textContent = nl ? (nl.isToday ? "Lesson today" + (nl.time ? " · " + nl.time : "") : "Next lesson · " + fmtDay(nl.day) + (nl.time ? ", " + nl.time : "")) : "";
    const due = TEACHER ? D.assignments.filter((a) => a.status === "Submitted").length : D.assignments.filter((a) => a.status === "Assigned" && a.kind !== "Request").length;
    return h("nav", { class: "it-tabs", "aria-label": "Sections" }, ...tabs().map(([k, label]) =>
      h("a", { href: "#" + k, class: "it-tab", "aria-current": tab === k ? "page" : null }, label, k === "compiti" && due ? h("span", { class: "it-badge", text: String(due) }) : null)));
  }
  function header() {
    const words = D.words.filter((w) => w.type !== "Phrase" && w.type !== "Expression").length, phrases = D.words.length - words;
    const weekAgo = addDays(today(), -6);
    const week = D.words.filter((w) => (w.first || "") >= weekAgo).length;
    return h("section", { class: "it-hero" },
      h("h1", { class: "it-title head", text: TEACHER ? "Eric's Italian" : "Italiano" }),
      h("p", { class: "it-sub quiet", text: TEACHER
        ? "Give Eric assignments and reading, correct his writing, and see the words he's learned. Everything you add here shows on his page."
        : `With ${teacherName()} on Preply, Wednesday nights and Sunday mornings. Every word you meet goes in the index and counts once a day.` }),
      h("div", { class: "it-stats" }, stat(words, "words"), stat(phrases, "phrases"), stat(week, "new this week"), stat(streak(), "day streak")));
  }
  const stat = (n, label) => h("div", { class: "it-stat" }, h("b", { text: String(n) }), h("span", { text: label }));

  // ---------------- Oggi: today's lesson ----------------
  function quickAdd() {
    const L = todaysLesson(), lessonDay = isLessonDay(today());
    const it = h("input", { class: "it-in", type: "text", placeholder: "parola o frase", autocomplete: "off", autocapitalize: "none", spellcheck: "false", lang: "it", "aria-label": "Italian word or phrase" });
    const en = h("input", { class: "it-in en", type: "text", placeholder: "meaning (optional)", autocomplete: "off", "aria-label": "Meaning" });
    const go = h("button", { class: "btn", type: "submit", text: "Add" });
    const recent = h("div", { class: "it-recent" });
    const paintRecent = () => {
      const todayWords = D.words.filter((w) => w.last === today()).slice(0, 40);
      recent.replaceChildren(...todayWords.map((w) => h("span", { class: "it-chip it-w s-" + w.status.toLowerCase(), "data-id": w.id, tabindex: "0", text: w.italian + (w.times > 1 ? " ×" + w.times : "") })));
    };
    paintRecent();
    const form = h("form", { class: "it-add", onsubmit: async (e) => {
      e.preventDefault();
      const v = it.value.trim();
      if (!v) return;
      go.disabled = true;
      const had = !!todaysLesson();
      try {
        await addWord(v, en.value.trim()); it.value = ""; en.value = "";
        if (!TEACHER && !had && todaysLesson()) { render(); const box = $(".it-add .it-in"); if (box) box.focus(); return; }
        paintRecent(); it.focus(); refreshClaude();
      } catch { toast("Couldn't add it. Try again."); }
      go.disabled = false;
    } }, it, en, go);
    if (TEACHER) return h("section", { class: "it-sec" }, h("h2", { class: "sec", text: "Add a word for Eric" }),
      h("p", { class: "quiet it-help", text: "It goes straight into his index; if he already has it, it counts again." }), form, recent);
    const note = h("textarea", { class: "it-note", placeholder: "What did we talk about? (a line or two)", rows: "2" });
    if (L) {
      note.value = L.note || "";
      note.addEventListener("blur", async () => { if (note.value === (L.note || "")) return; L.note = note.value; try { await api("PATCH", "/api/italian/lesson/" + L.id, { note: note.value }); toast("Saved"); } catch { toast("Couldn't save the note."); } });
    }
    const n = L ? (L.words || []).length : 0;
    return h("section", { class: "it-sec" },
      h("div", { class: "it-head" }, h("h2", { class: "sec", text: lessonDay ? "Today's lesson" : "Add a word" }),
        L ? h("span", { class: "quiet", text: L.session + " · " + n + (n === 1 ? " word" : " words") }) : null),
      h("p", { class: "quiet it-help", text: lessonDay
        ? "Type each word or phrase as it comes up. A word you already have counts again; Claude fills in meanings and forms after the lesson."
        : "Met a word outside the lesson? It goes in the index the same way." }),
      form, recent, L ? note : null);
  }
  function dueNow() {
    const list = D.assignments.filter((a) => a.status === "Assigned" && a.kind !== "Request").slice(0, 5);
    if (!list.length) return null;
    return h("section", { class: "it-sec" },
      h("div", { class: "it-head" }, h("h2", { class: "sec", text: "To do" }), h("a", { class: "textlink", href: "#compiti", text: "All assignments" })),
      h("ul", { class: "it-todo" }, ...list.map((a) => h("li", {},
        h("a", { href: "#compiti", class: "it-todo-a", onclick: () => { openAssign = a.id; } },
          h("span", { class: "it-kind k-" + a.kind.toLowerCase(), text: a.kind === "Text" ? "Reading" : a.kind }),
          h("b", { text: a.title }), h("span", { class: "quiet", text: (a.from === "Teacher" ? "from " + teacherName() : "from Claude") + (a.due ? " · due " + fmtDay(a.due) : "") }))))));
  }
  function selfStudy() {
    const mins = [10, 15, 20, 30, 45, 60];
    const note = h("input", { class: "it-in en", type: "text", placeholder: "what you did (optional)", "aria-label": "What you studied" });
    const todayRow = D.lessons.find((l) => (l.date || "").slice(0, 10) === today() && l.session === "Self-study");
    return h("section", { class: "it-sec" },
      h("div", { class: "it-head" }, h("h2", { class: "sec", text: "Studied on your own?" }), todayRow ? h("span", { class: "quiet", text: (todayRow.minutes || 0) + " min today" }) : null),
      h("div", { class: "it-mins" }, ...mins.map((m) => h("button", { class: "btn ghost", type: "button", text: m + " min", onclick: async (e) => {
        await busy(e.currentTarget, async () => {
          try {
            const L = await api("POST", "/api/italian/lesson", { session: "Self-study", minutes: m, note: note.value.trim(), name: "Self-study · " + fmtDay(today()) });
            const i = D.lessons.findIndex((x) => x.id === L.id); if (i >= 0) D.lessons[i] = L; else D.lessons.unshift(L);
            toast(`Logged ${m} minutes. Bravo!`); render();
          } catch { toast("Couldn't log it. Try again."); }
        });
      } })), note));
  }

  // ---------------- Leggi: the reader ----------------
  let readerOut, readerStats, readerBox;
  function reader() {
    readerBox = h("textarea", { class: "it-text", rows: "6", lang: "it", placeholder: "Incolla un testo… paste any Italian text, or upload a PDF", spellcheck: "false" });
    readerBox.value = reading;
    readerOut = h("div", { class: "it-read", lang: "it" });
    readerStats = h("p", { class: "it-rstats quiet" });
    const file = h("input", { type: "file", accept: "application/pdf,.pdf,text/plain,.txt", hidden: true });
    file.addEventListener("change", async () => {
      const f = file.files[0]; file.value = "";
      if (!f) return;
      try {
        if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
          toast("Reading the PDF…");
          const r = await api("POST", "/api/italian/pdf", null, { type: "application/pdf", body: f });
          readerBox.value = r.text || "";
          if (!r.text) toast("That PDF has no text in it (a scan?).");
        } else readerBox.value = await f.text();
        reading = readerBox.value; store.set("reader", reading.slice(0, 50000)); paintReader();
      } catch (e) { toast("Couldn't read that file."); }
    });
    let t = null;
    readerBox.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { reading = readerBox.value; store.set("reader", reading.slice(0, 50000)); paintReader(); }, 350); });
    const wrote = h("button", { class: "btn ghost", type: "button", text: "I wrote this — count my words" });
    wrote.addEventListener("click", () => busy(wrote, async () => {
      const ids = [...new Set(analyse(readerBox.value).filter((x) => x.w).map((x) => x.w.id))];
      if (!ids.length) { toast("No words from your index in there yet."); return; }
      try {
        const rows = await api("POST", "/api/italian/seen", { ids });
        for (const r of rows) { const w = byId.get(r.id); if (w) Object.assign(w, r); }
        toast(`Counted ${ids.length} word${ids.length === 1 ? "" : "s"} for today`);
      } catch { toast("Couldn't count them. Try again."); }
    }));
    const send = h("button", { class: "btn ghost", type: "button", text: `Send to ${teacherName()} to correct` });
    send.addEventListener("click", () => busy(send, async () => {
      const body = readerBox.value.trim();
      if (!body) { toast("Write something first."); return; }
      try {
        const a = await api("POST", "/api/italian/assign", { kind: "Writing", body, title: "Writing · " + fmtDay(today()) });
        D.assignments.unshift(a); toast("Sent. It shows on the teacher's page for correcting.");
      } catch { toast("Couldn't send it. Try again."); }
    }));
    const clear = h("button", { class: "textlink it-linkbtn", type: "button", text: "Clear" });
    clear.addEventListener("click", () => { readerBox.value = ""; reading = ""; store.set("reader", ""); paintReader(); });
    const up = h("button", { class: "btn ghost", type: "button", text: "Upload PDF or text" });
    up.addEventListener("click", () => file.click());
    paintReader();
    const texts = D.assignments.filter((a) => a.kind === "Text" && a.status !== "Archived");
    return h("div", {},
      h("section", { class: "it-sec first" },
        h("div", { class: "it-head" }, h("h2", { class: "sec", text: "Reader" }), legend()),
        h("p", { class: "quiet it-help", text: "Words you already have are underlined: hover or tap one for its meaning. Tap a plain word to add it." }),
        readerBox, h("div", { class: "it-tools" }, up, wrote, send, clear, file), readerStats, readerOut),
      texts.length ? h("section", { class: "it-sec" }, h("h2", { class: "sec", text: "Reading from " + teacherName() + " and Claude" }),
        h("ul", { class: "it-todo" }, ...texts.map((a) => h("li", {}, h("button", { class: "it-todo-a it-linkbtn", type: "button", onclick: () => { readerBox.value = a.body; reading = a.body; store.set("reader", reading); paintReader(); window.scrollTo({ top: 0, behavior: "smooth" }); } },
          h("span", { class: "it-kind k-text", text: a.from === "Teacher" ? teacherName() : a.from }), h("b", { text: a.title }), h("span", { class: "quiet", text: "Open in the reader" })))))) : null);
  }
  const legend = () => h("span", { class: "it-legend" }, h("i", { class: "s-new" }, "new"), h("i", { class: "s-learning" }, "learning"), h("i", { class: "s-known" }, "known"));
  function paintReader() {
    if (!readerOut) return;
    const text = (readerBox ? readerBox.value : reading).slice(0, 60000);
    hideTip();
    if (!text.trim()) { readerOut.replaceChildren(); readerOut.hidden = true; readerStats.textContent = ""; return; }
    readerOut.hidden = false;
    const { known, total, distinct } = renderItalian(readerOut, text, true);
    readerStats.textContent = total ? `${known} of ${total} words are ones you know (${Math.round((known / total) * 100)}%) · ${distinct.size} different entries from your index` : "";
  }

  // ---------------- Parole: the cloud and the list ----------------
  const TYPE_ORDER = ["Verb", "Noun", "Adjective", "Adverb", "Phrase", "Expression", "Word", "—"];
  const TYPE_LABEL = { Verb: "Verbi · verbs", Noun: "Nomi · nouns", Adjective: "Aggettivi · adjectives", Adverb: "Avverbi · adverbs", Phrase: "Frasi · phrases", Expression: "Espressioni · expressions", Word: "Altre parole · other", "—": "Not sorted yet" };
  const STATUS_LABEL = { New: "Nuove · new", Learning: "Sto imparando · learning", Known: "Le so · known" };
  const hash = (s) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };
  const weekOf = (iso) => { const d = new Date(iso.slice(0, 10) + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayOf(d); };
  let cloudEl, cloudSearch, cloudEls = new Map();
  function groupsFor(mode) {
    const ws = [...D.words].sort((a, b) => hash(a.key || a.italian) - hash(b.key || b.italian));
    if (mode === "type") return TYPE_ORDER.map((t) => [TYPE_LABEL[t], ws.filter((w) => (w.type || "—") === t)]).filter((g) => g[1].length);
    if (mode === "status") return ["New", "Learning", "Known"].map((s) => [STATUS_LABEL[s], ws.filter((w) => w.status === s)]).filter((g) => g[1].length);
    if (mode === "week") {
      const m = new Map();
      for (const w of ws) { const k = w.first ? weekOf(w.first) : "—"; if (!m.has(k)) m.set(k, []); m.get(k).push(w); }
      return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, l]) => [k === "—" ? "Undated" : "Week of " + fmtDay(k), l]);
    }
    return [["", ws]];
  }
  function cloud() {
    const max = Math.max(1, ...D.words.map((w) => w.times || 0));
    cloudEls = new Map();
    for (const w of D.words) {
      const size = 14 + Math.round((Math.log((w.times || 0) + 1) / Math.log(max + 1)) * 30);
      cloudEls.set(w.id, h("span", { class: "it-cw it-w s-" + w.status.toLowerCase(), "data-id": w.id, tabindex: "0", lang: "it", style: `font-size:${size}px`, text: w.italian }));
    }
    cloudEl = h("div", { class: "it-cloud", "aria-label": "Your words, sized by how often you've seen them" });
    cloudSearch = h("input", { class: "it-in", type: "search", placeholder: "Cerca… search a word", lang: "it", "aria-label": "Search the cloud" });
    cloudSearch.addEventListener("input", () => searchCloud(cloudSearch.value));
    const modes = [["all", "All"], ["type", "By type"], ["status", "By status"], ["week", "By week"]];
    const seg = h("div", { class: "it-seg", role: "group", "aria-label": "Arrange words" }, ...modes.map(([k, label]) =>
      h("button", { type: "button", class: "it-segb", "aria-pressed": String(group === k), text: label, onclick: (e) => {
        group = k; store.set("group", k);
        for (const b of seg.children) b.setAttribute("aria-pressed", String(b === e.currentTarget));
        paintCloud(true);
      } })));
    paintCloud(false);
    return h("section", { class: "it-sec first" },
      h("div", { class: "it-head" }, h("h2", { class: "sec", text: "Le tue parole" }), legend()),
      h("p", { class: "quiet it-help", text: "The more you've used a word, the bigger it is. Arrange them by type, status or week; tap a word for its meaning." }),
      h("div", { class: "it-filters" }, cloudSearch, seg), cloudEl);
  }
  // Move the same word elements into new groups and glide them there (FLIP).
  function paintCloud(animate) {
    if (!cloudEl) return;
    for (const w of D.words) { const el = cloudEls.get(w.id); if (el) el.className = "it-cw it-w s-" + w.status.toLowerCase(); }
    const before = new Map();
    if (animate) for (const [id, el] of cloudEls) before.set(id, el.getBoundingClientRect());
    const groups = groupsFor(group);
    cloudEl.replaceChildren(...groups.map(([label, ws]) => h("div", { class: "it-cg" },
      label ? h("p", { class: "it-cgl", text: label + " · " + ws.length }) : null,
      h("div", { class: "it-cgw" }, ...ws.map((w) => cloudEls.get(w.id)).filter(Boolean)))));
    if (!D.words.length) cloudEl.append(h("p", { class: "quiet", text: "Your words will gather here as you add them." }));
    if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const [id, el] of cloudEls) {
        const a = before.get(id), b = el.getBoundingClientRect();
        if (!a) continue;
        const dx = a.left - b.left, dy = a.top - b.top;
        if (!dx && !dy) continue;
        el.style.transition = "none"; el.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        let k = 0;
        for (const el of cloudEls.values()) { el.style.transition = `transform 700ms cubic-bezier(.2,.8,.2,1) ${Math.min(k++ * 4, 300)}ms`; el.style.transform = ""; }
      }));
    }
    if (cloudSearch && cloudSearch.value) searchCloud(cloudSearch.value);
  }
  function searchCloud(q) {
    const s = bare(q.trim());
    let first = null;
    for (const w of D.words) {
      const el = cloudEls.get(w.id);
      if (!el) continue;
      const hit = !s || bare(w.italian + " " + w.english + " " + w.forms).includes(s);
      el.classList.toggle("dim", !!s && !hit);
      el.classList.toggle("hit", !!s && hit);
      if (s && hit && !first) first = el;
    }
    if (first) first.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  let listEl;
  function wordList() {
    const q = h("input", { class: "it-in", type: "search", placeholder: "Search Italian or English", value: filter.q, lang: "it", "aria-label": "Search words" });
    q.addEventListener("input", () => { filter.q = q.value; paintList(); });
    const st = h("select", { class: "it-sel", "aria-label": "Status" }, ...["", "New", "Learning", "Known"].map((v) => h("option", { value: v, text: v || "All" })));
    st.value = filter.status; st.addEventListener("change", () => { filter.status = st.value; paintList(); });
    const so = h("select", { class: "it-sel", "aria-label": "Sort" }, h("option", { value: "recent", text: "Recent" }), h("option", { value: "most", text: "Most seen" }), h("option", { value: "az", text: "A–Z" }));
    so.value = filter.sort; so.addEventListener("change", () => { filter.sort = so.value; store.set("sort", so.value); paintList(); });
    listEl = h("ul", { class: "it-list" });
    paintList();
    return h("section", { class: "it-sec" },
      h("div", { class: "it-head" }, h("h2", { class: "sec", text: "All words" }), h("span", { class: "quiet", text: D.words.length + " in the index" })),
      h("div", { class: "it-filters" }, q, st, so), listEl);
  }
  function paintList() {
    if (!listEl) return;
    const q = bare(filter.q.trim());
    let list = D.words.filter((w) => (!filter.status || w.status === filter.status) && (!q || bare(w.italian + " " + w.english + " " + w.forms).includes(q)));
    if (filter.sort === "most") list.sort((a, b) => (b.times || 0) - (a.times || 0));
    else if (filter.sort === "az") list.sort((a, b) => a.italian.localeCompare(b.italian, "it"));
    else list.sort((a, b) => (b.last || "").localeCompare(a.last || "") || (b.first || "").localeCompare(a.first || ""));
    listEl.replaceChildren(...list.slice(0, 400).map(wordRow));
    if (!list.length) listEl.append(h("li", { class: "quiet it-empty", text: D.words.length ? "No match." : "No words yet." }));
  }
  const NEXT = { New: "Learning", Learning: "Known", Known: "New" };
  function wordRow(w) {
    const open = openWord === w.id;
    const status = TEACHER ? h("span", { class: "it-status s-" + w.status.toLowerCase(), text: w.status })
      : h("button", { class: "it-status s-" + w.status.toLowerCase(), type: "button", title: "Tap to change", text: w.status, onclick: (e) => { e.stopPropagation(); setStatus(w, NEXT[w.status] || "New"); } });
    const row = h("li", { class: "it-row" + (open ? " open" : "") },
      h("div", { class: "it-rtop" },
        h("button", { class: "it-word", type: "button", "aria-expanded": String(open), onclick: () => { openWord = open ? null : w.id; paintList(); } },
          h("b", { lang: "it", text: w.italian }), h("span", { class: "it-en" + (w.english ? "" : " pending"), text: w.english || "meaning coming" })),
        w.type ? h("span", { class: "it-type", text: w.type }) : null,
        h("span", { class: "it-times", title: "Days seen", text: "×" + (w.times || 0) }), status));
    if (open) {
      const parts = (w.parts || []).map((i) => byId.get(i)).filter(Boolean), phrases = (w.phrases || []).map((i) => byId.get(i)).filter(Boolean);
      const lessons = (w.lessons || []).map((i) => D.lessons.find((l) => l.id === i)).filter(Boolean);
      const link = (x) => h("button", { class: "it-mini", type: "button", text: x.italian, onclick: () => { openWord = x.id; paintList(); } });
      const url = TEACHER ? null : safeUrl(w.url);
      row.append(h("div", { class: "it-detail" },
        w.forms ? h("p", {}, h("span", { class: "k", text: "Forms" }), h("span", { lang: "it", text: w.forms })) : null,
        w.example ? h("p", {}, h("span", { class: "k", text: "Example" }), h("span", { text: w.example })) : null,
        w.note ? h("p", {}, h("span", { class: "k", text: "Note" }), h("span", { text: w.note })) : null,
        phrases.length ? h("p", {}, h("span", { class: "k", text: "In phrases" }), ...phrases.map(link)) : null,
        parts.length ? h("p", {}, h("span", { class: "k", text: "Words in it" }), ...parts.map(link)) : null,
        h("p", {}, h("span", { class: "k", text: "Seen" }), h("span", { text: `${w.times || 0} day${w.times === 1 ? "" : "s"} · first ${w.first ? fmtDay(w.first) : "—"} · last ${w.last ? fmtDay(w.last) : "—"}` + (lessons.length ? " · lessons: " + lessons.map((l) => fmtDay(l.date)).join(", ") : "") })),
        url ? ext(h("a", { class: "textlink", href: url, text: "Open in Notion" })) : null));
    }
    return row;
  }

  // ---------------- Compiti: assignments, quizzes, writing, Claude ----------------
  let openAssign = null;
  const KIND_LABEL = { Assignment: "Assignment", Quiz: "Quiz", Text: "Reading", Writing: "Writing", Request: "Request" };
  function parseQuiz(s) { try { const q = JSON.parse(s); return q && Array.isArray(q.questions) && q.questions.length ? q : null; } catch { return null; } }
  function assignCard(a) {
    const open = openAssign === a.id;
    const fromLabel = a.from === "Teacher" ? (TEACHER ? "You" : teacherName()) : a.from === "Claude" ? "Claude" : "Eric";
    const head = h("button", { class: "it-acard-h", type: "button", "aria-expanded": String(open), onclick: () => { openAssign = open ? null : a.id; render(); } },
      h("span", { class: "it-kind k-" + (a.kind || "").toLowerCase(), text: KIND_LABEL[a.kind] || a.kind }),
      h("b", { text: a.title }),
      h("span", { class: "quiet", text: [fromLabel, a.due ? "due " + fmtDay(a.due) : "", a.status, a.score != null ? a.score + "%" : ""].filter(Boolean).join(" · ") }));
    const card = h("li", { class: "it-acard" + (open ? " open" : "") + " st-" + (a.status || "").toLowerCase() }, head);
    if (!open) return card;
    const body = h("div", { class: "it-abody" });
    if (TEACHER) body.append(...teacherAssignBody(a));
    else body.append(...ownerAssignBody(a));
    card.append(body);
    return card;
  }
  function itText(text, cls) { const el = h("div", { class: "it-atext " + (cls || ""), lang: "it" }); renderItalian(el, text, false); return el; }
  function ownerAssignBody(a) {
    const out = [];
    if (a.kind === "Quiz") { const q = parseQuiz(a.quiz); out.push(a.body ? h("p", { class: "it-lnote", text: a.body }) : null, q ? quizView(a, q) : h("p", { class: "it-err", text: "This quiz couldn't be read. Ask Claude to remake it." })); return out.filter(Boolean); }
    if (a.kind === "Request") {
      out.push(h("p", { class: "it-lnote", text: a.body }), h("p", { class: "quiet", text: a.status === "Queued" ? "Waiting for the next Italian brief." : "Made: see the new item from Claude." }));
      if (a.status === "Queued") out.push(h("button", { class: "textlink it-linkbtn", type: "button", text: "Cancel request", onclick: async () => { await saveAssign(a, { status: "Archived" }); render(); } }));
      return out;
    }
    if (a.body) out.push(a.kind === "Writing" ? h("p", { class: "it-atext", lang: "it", text: a.body }) : itText(a.body));
    if (a.kind === "Text") {
      out.push(h("div", { class: "it-tools" },
        h("button", { class: "btn ghost", type: "button", text: "Open in the reader", onclick: () => { reading = a.body; store.set("reader", reading); location.hash = "#leggi"; } }),
        a.status !== "Done" ? h("button", { class: "btn ghost", type: "button", text: "I've read it", onclick: async (e) => busy(e.currentTarget, async () => { await saveAssign(a, { status: "Done" }); toast("Bene!"); render(); }) }) : null));
    }
    if (a.kind === "Assignment") {
      const ans = h("textarea", { class: "it-text", rows: "5", lang: "it", placeholder: "La tua risposta… your answer", spellcheck: "false" });
      ans.value = a.answer || "";
      const save = async (status) => { await saveAssign(a, status ? { answer: ans.value, status } : { answer: ans.value }); };
      ans.addEventListener("blur", () => { if (ans.value !== (a.answer || "")) save().catch(() => toast("Couldn't save.")); });
      const done = a.status === "Submitted" || a.status === "Reviewed";
      out.push(h("p", { class: "it-k", text: "Your answer" }), ans,
        h("div", { class: "it-tools" }, done ? h("span", { class: "quiet", text: a.status === "Reviewed" ? "Reviewed by " + fromLabelOf(a) : "Sent — waiting for feedback" })
          : h("button", { class: "btn", type: "button", text: a.from === "Teacher" ? `Send to ${teacherName()}` : "Done", onclick: (e) => busy(e.currentTarget, async () => {
            if (!ans.value.trim()) { toast("Write your answer first."); return; }
            await save(a.from === "Teacher" ? "Submitted" : "Done"); toast("Sent!"); render();
          }) })));
    }
    if (a.correction) out.push(h("p", { class: "it-k", text: "Corrected by " + teacherName() }), itText(a.correction, "corr"));
    if (a.feedback) out.push(h("p", { class: "it-k", text: "Feedback" }), h("p", { class: "it-feedback", text: a.feedback }));
    if (a.status !== "Archived") out.push(h("button", { class: "textlink it-linkbtn it-arch", type: "button", text: "Archive", onclick: async () => { await saveAssign(a, { status: "Archived" }); render(); } }));
    return out;
  }
  const fromLabelOf = (a) => (a.from === "Teacher" ? teacherName() : "Claude");
  function quizView(a, q) {
    const prev = (() => { try { return JSON.parse(a.answer || "null"); } catch { return null; } })();
    const picks = Array.isArray(prev) ? prev.slice() : [];
    const checked = a.status === "Done" && Array.isArray(prev);
    const box = h("ol", { class: "it-quiz" });
    const items = q.questions.map((qq, i) => {
      const li = h("li", {}, h("p", { class: "it-q", lang: "it", text: qq.q }));
      if (Array.isArray(qq.options) && qq.options.length) {
        const opts = h("div", { class: "it-opts" }, ...qq.options.map((o, j) => h("button", { type: "button", class: "it-opt", "aria-pressed": String(picks[i] === j), lang: "it", text: o, onclick: (e) => {
          if (li.dataset.checked) return;
          picks[i] = j; for (const b of opts.children) b.setAttribute("aria-pressed", String(b === e.currentTarget));
        } })));
        li.append(opts);
      } else {
        const inp = h("input", { class: "it-in", type: "text", lang: "it", autocapitalize: "none", spellcheck: "false", placeholder: "scrivi la risposta", value: typeof picks[i] === "string" ? picks[i] : "" });
        inp.addEventListener("input", () => { picks[i] = inp.value; });
        li.append(inp);
      }
      return li;
    });
    box.append(...items);
    const mark = () => {
      let right = 0;
      q.questions.forEach((qq, i) => {
        const li = items[i]; li.dataset.checked = "1";
        const ok = Array.isArray(qq.options) ? picks[i] === qq.answer : bare(String(picks[i] || "")).replace(/[^\p{L}\p{N} ]/gu, "").trim() === bare(String(qq.answer)).replace(/[^\p{L}\p{N} ]/gu, "").trim();
        if (ok) right++;
        li.classList.add(ok ? "ok" : "no");
        if (Array.isArray(qq.options)) [...li.querySelectorAll(".it-opt")].forEach((b, j) => { if (j === qq.answer) b.classList.add("right"); });
        li.append(h("p", { class: "it-explain", text: (ok ? "✓ " : "✗ " + (Array.isArray(qq.options) ? "" : "Answer: " + qq.answer + ". ")) + (qq.explain || "") }));
      });
      return Math.round((right / q.questions.length) * 100);
    };
    const btn = h("button", { class: "btn", type: "button", text: checked ? "Try again" : "Check my answers" });
    const result = h("p", { class: "it-score" });
    btn.addEventListener("click", () => busy(btn, async () => {
      if (btn.textContent === "Try again") { picks.length = 0; await saveAssign(a, { status: "Assigned", answer: "" }); render(); return; }
      const score = mark();
      result.textContent = `${score}% · ${score >= 80 ? "Ottimo!" : score >= 50 ? "Bene, quasi!" : "Ancora un po'."}`;
      btn.textContent = "Try again";
      try { await saveAssign(a, { answer: JSON.stringify(picks), score, status: "Done" }); } catch { toast("Couldn't save the score."); }
    }));
    if (checked) setTimeout(() => { const s = mark(); result.textContent = `${a.score ?? s}%`; }, 0);
    return h("div", {}, box, h("div", { class: "it-tools" }, btn, result));
  }
  function askClaude() {
    const kinds = [["Quiz", "A quiz"], ["Assignment", "An assignment"], ["Text", "A reading text"], ["Other", "Something else"]];
    const sel = h("select", { class: "it-sel", "aria-label": "What to make" }, ...kinds.map(([k, l]) => h("option", { value: k, text: l })));
    const ta = h("textarea", { class: "it-note", rows: "2", placeholder: "e.g. a 10-question quiz on this week's verbs · a short dialogue at a restaurant using my learning words" });
    const go = h("button", { class: "btn", type: "button", text: "Ask Claude" });
    go.addEventListener("click", () => busy(go, async () => {
      const body = ta.value.trim() || ({ Quiz: "A quiz on my recent words", Assignment: "An assignment using my recent words", Text: "A short reading text using my learning words", Other: "" })[sel.value];
      if (!body) { toast("Say what you'd like."); return; }
      try {
        const a = await api("POST", "/api/italian/assign", { kind: "Request", title: sel.options[sel.selectedIndex].text + ": " + body.slice(0, 70), body: `[${sel.value}] ${body}` });
        D.assignments.unshift(a); ta.value = ""; toast("Queued for your next Italian brief"); render();
      } catch { toast("Couldn't queue it. Try again."); }
    }));
    const queued = D.assignments.filter((a) => a.kind === "Request" && a.status === "Queued").length;
    return h("section", { class: "it-sec" },
      h("div", { class: "it-head" }, h("h2", { class: "sec", text: "Ask Claude" }), queued ? h("span", { class: "quiet", text: queued + " queued" }) : null),
      h("p", { class: "quiet it-help", text: "Ask for a quiz, an assignment or a reading text. Claude makes it from your own words the next time you run the Italian brief, and it shows up here." }),
      h("div", { class: "it-ask" }, sel, ta, go),
      h("div", { class: "it-tools" }, ext(h("a", { class: "btn ghost", href: claude(briefPrompt()), text: "Run the Italian brief now" }))));
  }
  const briefPrompt = () => "/italian-lesson italian brief — run my Italian brief: make everything queued in Italian Assignments (Kind Request, Status Queued) from my word index, fill in any Italian Words marked Needs Claude, pull any unprocessed lesson from Plaud, and tell me what to practise before my next lesson.";
  function teacherAccess() {
    const on = !!D.teacherPin;
    const pin = h("input", { class: "it-in", type: "password", inputmode: "numeric", autocomplete: "new-password", placeholder: on ? "new 6–8 digit PIN" : "6–8 digit PIN", maxlength: "8", "aria-label": "Teacher PIN" });
    const set = h("button", { class: "btn", type: "button", text: on ? "Change PIN" : "Turn on" });
    set.addEventListener("click", () => busy(set, async () => {
      if (!/^\d{6,8}$/.test(pin.value)) { toast("Use 6 to 8 digits."); return; }
      try { await api("POST", "/api/italian/teacher-pin", { pin: pin.value }); D.teacherPin = true; toast("Teacher PIN set"); render(); } catch (e) { toast(e.message); }
    }));
    const off = on ? h("button", { class: "textlink it-linkbtn", type: "button", text: "Turn off teacher access", onclick: async () => { await api("POST", "/api/italian/teacher-pin", { off: true }); D.teacherPin = false; toast("Teacher access off"); render(); } }) : null;
    const link = location.origin + "/italian/teacher";
    return h("section", { class: "it-sec" },
      h("div", { class: "it-head" }, h("h2", { class: "sec", text: "Teacher access" }), h("span", { class: "quiet", text: on ? "On" : "Off" })),
      h("p", { class: "quiet it-help", text: `Give ${teacherName()} the link and the PIN. They see only this Italian page: your words, your lessons, and what they assign or correct, nothing else in Oggi. Changing the PIN signs them out.` }),
      on ? h("p", { class: "it-linkline" }, h("code", { text: link }), h("button", { class: "textlink it-linkbtn", type: "button", text: "Copy link", onclick: () => navigator.clipboard.writeText(link).then(() => toast("Link copied"), () => toast(link)) })) : null,
      h("div", { class: "it-add" }, pin, set), off);
  }
  function compiti() {
    const live = D.assignments.filter((a) => a.status !== "Archived" && (!TEACHER || a.kind !== "Request"));
    const todo = live.filter((a) => (TEACHER ? a.status === "Submitted" : a.status === "Assigned" && a.kind !== "Request"));
    const rest = live.filter((a) => !todo.includes(a) && (TEACHER || a.kind !== "Request"));
    const requests = TEACHER ? [] : live.filter((a) => a.kind === "Request");
    const list = (arr) => h("ul", { class: "it-alist" }, ...arr.map(assignCard));
    const out = [];
    if (TEACHER) out.push(teacherCompose());
    out.push(h("section", { class: "it-sec" + (TEACHER ? "" : " first") },
      h("h2", { class: "sec", text: TEACHER ? "From Eric — to review" : "To do" }),
      todo.length ? list(todo) : h("p", { class: "quiet", text: TEACHER ? "Nothing waiting for you." : "Nothing to do right now. Ask Claude for a quiz below." })));
    if (!TEACHER) out.push(askClaude());
    if (requests.length) out.push(h("section", { class: "it-sec" }, h("h2", { class: "sec", text: "Your requests to Claude" }), list(requests)));
    if (rest.length) out.push(h("section", { class: "it-sec" }, h("h2", { class: "sec", text: TEACHER ? "Assignments, reading and writing" : "Done and sent" }), list(rest)));
    if (!TEACHER) out.push(teacherAccess());
    return out;
  }
  // The teacher's side
  function teacherCompose() {
    const kind = h("select", { class: "it-sel", "aria-label": "Kind" }, h("option", { value: "Assignment", text: "Assignment" }), h("option", { value: "Text", text: "Reading text" }));
    const title = h("input", { class: "it-in", type: "text", placeholder: "Title", "aria-label": "Title" });
    const due = h("input", { class: "it-sel", type: "date", "aria-label": "Due date" });
    const body = h("textarea", { class: "it-text", rows: "6", lang: "it", placeholder: "Instructions, or the text for Eric to read", spellcheck: "true" });
    const go = h("button", { class: "btn", type: "button", text: "Give to Eric" });
    go.addEventListener("click", () => busy(go, async () => {
      if (!title.value.trim() || !body.value.trim()) { toast("Add a title and the text."); return; }
      try {
        const a = await api("POST", "/api/italian/t/assign", { kind: kind.value, title: title.value.trim(), body: body.value, due: due.value || null });
        D.assignments.unshift(a); toast("Sent to Eric"); render();
      } catch (e) { toast("Couldn't send it. " + e.message); }
    }));
    return h("section", { class: "it-sec first" },
      h("h2", { class: "sec", text: "Give Eric something" }),
      h("div", { class: "it-compose" }, h("div", { class: "it-filters" }, kind, title, due), body, h("div", { class: "it-tools" }, go)));
  }
  function teacherAssignBody(a) {
    const out = [];
    if (a.from === "Teacher") {
      const title = h("input", { class: "it-in", type: "text", value: a.title, "aria-label": "Title" });
      const body = h("textarea", { class: "it-text", rows: "6", lang: "it" }); body.value = a.body;
      const due = h("input", { class: "it-sel", type: "date", value: a.due ? a.due.slice(0, 10) : "", "aria-label": "Due date" });
      out.push(h("p", { class: "it-k", text: "Edit" }), h("div", { class: "it-filters" }, title, due), body,
        h("div", { class: "it-tools" }, h("button", { class: "btn ghost", type: "button", text: "Save changes", onclick: (e) => busy(e.currentTarget, async () => { await saveAssign(a, { title: title.value, body: body.value, due: due.value || null }); toast("Saved"); render(); }) })));
    } else if (a.kind === "Quiz") {
      const q = parseQuiz(a.quiz);
      out.push(h("p", { class: "quiet", text: `Quiz from Claude, ${q ? q.questions.length : 0} questions` + (a.score != null ? ` · Eric scored ${a.score}%` : "") }));
    }
    const answer = a.kind === "Writing" ? a.body : a.answer;
    if (answer) {
      out.push(h("p", { class: "it-k", text: a.kind === "Writing" ? "Eric wrote" : "Eric's answer" }), h("p", { class: "it-atext", lang: "it", text: answer }));
      const corr = h("textarea", { class: "it-text", rows: "5", lang: "it", spellcheck: "true" }); corr.value = a.correction || answer;
      const fb = h("textarea", { class: "it-note", rows: "3", placeholder: "Feedback for Eric" }); fb.value = a.feedback || "";
      out.push(h("p", { class: "it-k", text: "Your correction (edit his text)" }), corr, h("p", { class: "it-k", text: "Feedback" }), fb,
        h("div", { class: "it-tools" }, h("button", { class: "btn", type: "button", text: "Send back to Eric", onclick: (e) => busy(e.currentTarget, async () => {
          await saveAssign(a, { correction: corr.value === answer ? "" : corr.value, feedback: fb.value, status: "Reviewed" }); toast("Sent back"); render();
        }) })));
    } else if (a.kind === "Assignment") out.push(h("p", { class: "quiet", text: "Eric hasn't answered yet." }));
    if (a.from === "Teacher" && a.status !== "Archived") out.push(h("button", { class: "textlink it-linkbtn it-arch", type: "button", text: "Archive", onclick: async () => { await saveAssign(a, { status: "Archived" }); render(); } }));
    return out;
  }

  // ---------------- Calendario ----------------
  function activityByDay() {
    const m = new Map();
    const add = (d, k, v) => { if (!d) return; d = d.slice(0, 10); if (!m.has(d)) m.set(d, { preply: [], lesson: null, self: null, done: [], words: 0 }); const x = m.get(d); if (Array.isArray(x[k])) x[k].push(v); else if (k === "words") x.words += 1; else x[k] = v; };
    for (const e of D.events) add(dayOf(e.start), "preply", e);
    for (const l of D.lessons) add(l.date, l.session === "Self-study" ? "self" : "lesson", l);
    for (const a of D.assignments) if (a.doneOn && a.kind !== "Request") add(a.doneOn, "done", a);
    for (const w of D.words) add(w.first, "words", w);
    return m;
  }
  function streak() {
    const m = activityByDay();
    const active = (d) => { const x = m.get(d); if (!x) return false; const pastPreply = x.preply.some((e) => Date.parse(e.end || e.start) < Date.now()); return !!(x.lesson || x.self || x.done.length || x.words || pastPreply); };
    let d = today(), n = 0;
    if (!active(d)) d = addDays(d, -1);
    while (active(d) && n < 400) { n++; d = addDays(d, -1); }
    return n;
  }
  function calendar() {
    const m = activityByDay();
    const [y, mo] = calMonth.split("-").map(Number);
    const first = new Date(y, mo - 1, 1), startPad = first.getDay(), days = new Date(y, mo, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(h("div", { class: "it-cd pad" }));
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${pad(mo)}-${pad(d)}`, x = m.get(iso);
      const dots = [];
      if (x) {
        if (x.preply.length) dots.push(h("i", { class: "dot preply" + (x.lesson ? " held" : Date.parse(x.preply[0].start) < Date.now() ? " held" : ""), title: "Preply lesson" }));
        else if (x.lesson) dots.push(h("i", { class: "dot preply held", title: "Lesson" }));
        if (x.self) dots.push(h("i", { class: "dot self", title: (x.self.minutes || 0) + " min on your own" }));
        if (x.done.length) dots.push(h("i", { class: "dot done", title: x.done.length + " done" }));
        if (x.words && !x.lesson) dots.push(h("i", { class: "dot words", title: x.words + " new words" }));
      }
      cells.push(h("button", { type: "button", class: "it-cd" + (iso === today() ? " today" : "") + (iso === calPick ? " pick" : ""), "aria-label": fmtDay(iso), onclick: () => { calPick = iso; render(); } },
        h("span", { class: "n", text: String(d) }), x && x.preply.length ? h("span", { class: "t", text: clock(x.preply[0].start) }) : null, h("span", { class: "dots" }, ...dots)));
    }
    const nav = (n) => () => { const d = new Date(y, mo - 1 + n, 1); calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; render(); };
    const x = m.get(calPick);
    const detail = h("div", { class: "it-cdetail" }, h("b", { text: fmtDay(calPick) }));
    if (!x) detail.append(h("p", { class: "quiet", text: "Nothing logged." }));
    else {
      for (const e of x.preply) detail.append(h("p", {}, h("i", { class: "dot preply held" }), `${clock(e.start)} · ${e.title}`));
      if (x.lesson) detail.append(h("p", {}, h("i", { class: "dot preply held" }), `Lesson notes: ${x.lesson.note || "—"} · ${(x.lesson.words || []).length} words`));
      if (x.self) detail.append(h("p", {}, h("i", { class: "dot self" }), `${x.self.minutes || 0} min on your own${x.self.note ? " · " + x.self.note : ""}`));
      for (const a of x.done) detail.append(h("p", {}, h("i", { class: "dot done" }), `${KIND_LABEL[a.kind] || a.kind}: ${a.title}${a.score != null ? " · " + a.score + "%" : ""}`));
      if (x.words) detail.append(h("p", {}, h("i", { class: "dot words" }), `${x.words} new word${x.words === 1 ? "" : "s"}`));
    }
    const monthName = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const monthMin = Object.values(Object.fromEntries([...m.entries()].filter(([d]) => d.startsWith(calMonth)))).reduce((s, v) => s + ((v.self && v.self.minutes) || 0), 0);
    const monthLessons = [...m.entries()].filter(([d, v]) => d.startsWith(calMonth) && (v.lesson || v.preply.some((e) => Date.parse(e.start) < Date.now()))).length;
    return [h("section", { class: "it-sec first" },
      h("div", { class: "it-head" }, h("h2", { class: "sec", text: "Calendario" }),
        h("span", { class: "it-calnav" }, h("button", { class: "it-linkbtn textlink", type: "button", text: "‹", "aria-label": "Previous month", onclick: nav(-1) }), h("b", { text: monthName }), h("button", { class: "it-linkbtn textlink", type: "button", text: "›", "aria-label": "Next month", onclick: nav(1) }))),
      h("p", { class: "quiet it-help", text: `${monthLessons} lesson${monthLessons === 1 ? "" : "s"} · ${monthMin} min on your own this month · ${streak()}-day streak. Preply lessons come from your Google calendar.` }),
      h("div", { class: "it-cal" }, ...["S", "M", "T", "W", "T", "F", "S"].map((d) => h("div", { class: "it-cdh", text: d })), ...cells),
      h("p", { class: "it-calkey quiet" }, h("i", { class: "dot preply" }), "Preply ", h("i", { class: "dot preply held" }), "held ", h("i", { class: "dot self" }), "on your own ", h("i", { class: "dot done" }), "assignment done ", h("i", { class: "dot words" }), "new words"),
      detail),
      TEACHER ? null : selfStudy()].filter(Boolean);
  }

  // ---------------- Claude links ----------------
  let claudeEl;
  function claudeBar() { claudeEl = h("div", { class: "it-claude" }); refreshClaude(); return claudeEl; }
  function refreshClaude() {
    if (!claudeEl) return;
    const need = D.words.filter((w) => w.needsClaude).length;
    const L = D.lessons.find((l) => l.session !== "Self-study");
    const queued = D.assignments.filter((a) => a.kind === "Request" && a.status === "Queued").length;
    const kids = [];
    if (need || queued) kids.push(ext(h("a", { class: "btn", href: claude(briefPrompt()), text: "Run the Italian brief" + (need || queued ? ` (${[need ? need + " word" + (need === 1 ? "" : "s") : "", queued ? queued + " request" + (queued === 1 ? "" : "s") : ""].filter(Boolean).join(", ")})` : "") })));
    if (L && !L.processed) kids.push(ext(h("a", { class: "textlink", href: claude(`/italian-lesson — process my Italian lesson from ${L.date ? L.date.slice(0, 10) : "today"} (${L.session || "lesson"}) from Plaud: find the recording, pull every Italian word and phrase we worked on, add new ones to Italian Words and count the ones I already have (once for the day), link them to the lesson, write the lesson Note, and tick Processed.`), text: "Pull the last lesson's words from Plaud" })));
    claudeEl.replaceChildren(...kids);
    claudeEl.hidden = !kids.length;
  }

  // ---------------- render ----------------
  function lessonsList() {
    const ls = D.lessons.filter((l) => l.session !== "Self-study").slice(0, 12);
    if (!ls.length) return null;
    return h("section", { class: "it-sec" }, h("h2", { class: "sec", text: "Lessons" }),
      h("ul", { class: "it-lessons" }, ...ls.map((l) => {
        const ws = (l.words || []).map((i) => byId.get(i)).filter(Boolean);
        return h("li", {},
          h("div", { class: "it-lhead" }, h("b", { text: fmtDay(l.date || today()) }), h("span", { class: "quiet", text: (l.session || "") + " · " + ws.length + (ws.length === 1 ? " word" : " words") + (l.plaud ? " · Plaud ✓" : "") })),
          l.note ? h("p", { class: "it-lnote", text: l.note }) : null,
          ws.length ? h("div", { class: "it-chips" }, ...ws.map((w) => h("span", { class: "it-chip it-w s-" + w.status.toLowerCase(), "data-id": w.id, tabindex: "0", text: w.italian }))) : null);
      })));
  }
  function render() {
    hideTip(); closeAddPop();
    const main = $("#main");
    if (loadErr) { main.replaceChildren(h("p", { class: "it-err", text: loadErr })); return; }
    readerOut = null; cloudEl = null; listEl = null; claudeEl = null;
    const parts = [header(), topNav()];
    if (tab === "oggi") parts.push(claudeBar(), quickAdd(), dueNow(), selfStudy(), lessonsList());
    else if (tab === "parole") parts.push(TEACHER ? quickAdd() : null, cloud(), wordList());
    else if (tab === "leggi") parts.push(reader());
    else if (tab === "compiti") parts.push(...compiti());
    else if (tab === "calendario") parts.push(...calendar(), TEACHER ? null : lessonsList());
    main.replaceChildren(...parts.filter(Boolean));
  }
  function route() {
    const k = location.hash.slice(1);
    tab = tabs().some(([t]) => t === k) ? k : tabs()[0][0];
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  // ---------------- the teacher's PIN screen ----------------
  function showPin() {
    $("#next").textContent = "";
    const pin = h("input", { class: "it-in it-pin", type: "password", inputmode: "numeric", autocomplete: "current-password", maxlength: "8", placeholder: "PIN", "aria-label": "PIN" });
    const err = h("p", { class: "it-err", role: "alert" });
    const go = h("button", { class: "btn", type: "submit", text: "Enter" });
    const form = h("form", { class: "it-pinform", onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ""; go.disabled = true;
      try {
        const r = await fetch("/auth/italian-teacher", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin.value }), credentials: "same-origin" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { err.textContent = j.error || "That didn't work."; go.disabled = false; return; }
        load();
      } catch { err.textContent = "Couldn't connect."; go.disabled = false; }
    } }, h("h1", { class: "it-title head", text: "Italiano" }), h("p", { class: "quiet", text: "Teacher page for Eric's Italian. Enter the PIN Eric gave you." }), pin, go, err);
    $("#main").replaceChildren(form);
    $(".it-back").hidden = true;
    pin.focus();
  }

  async function load() {
    try { D = { assignments: [], events: [], ...(await api("GET", BASE)) }; loadErr = ""; }
    catch (e) {
      if (e.message === "pin" || e.message === "signin") return;
      loadErr = "Couldn't load the words from Notion. Is the Italian page shared with the oggi integration?";
    }
    if (TEACHER) {
      const back = $(".it-back"); back.hidden = false; back.textContent = "Sign out"; back.href = "#";
      back.onclick = async (e) => { e.preventDefault(); await fetch("/auth/italian-teacher/signout", { method: "POST", credentials: "same-origin" }); showPin(); };
    }
    reindex();
    if (tab) render(); else route();
  }
  // Coming back from a Claude chat: read Notion again so new meanings and quizzes show.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !document.activeElement?.matches("input, textarea")) load(); });
  load();
})();
