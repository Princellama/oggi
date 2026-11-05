/* Oggi · /italian — Eric's Italian with his teacher. Plain JS, no build step.
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
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem("italian." + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("italian." + k, JSON.stringify(v)); } catch {} },
  };
  async function api(method, path, body, raw) {
    const opt = { method, credentials: "same-origin" };
    if (raw) { opt.headers = { "Content-Type": raw.type }; opt.body = raw.body; }
    else if (body) { opt.headers = { "Content-Type": "application/json" }; opt.body = JSON.stringify({ d: today(), ...body }); }
    const r = await fetch(path + (method === "GET" ? "?d=" + today() : ""), opt);
    if (r.status === 401) { location.href = "/"; throw new Error("signin"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `failed (${r.status})`);
    return j;
  }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2800);
  }

  // ---------------- state ----------------
  let D = { words: [], lessons: [] };
  let loadErr = "";
  const byId = new Map();
  let reading = store.get("reader") || "";   // the last text in the reader, kept on this device
  let filter = { q: "", status: "", sort: "recent" };
  let openWord = null;

  // ---------------- lesson days: Wednesday night and Sunday morning ----------------
  const sessionFor = (iso) => { const wd = new Date(iso + "T12:00:00").getDay(); return wd === 3 ? "Wednesday night" : wd === 0 ? "Sunday morning" : "Extra"; };
  function nextLesson() {
    const t = today();
    for (let i = 0; i < 8; i++) { const d = addDays(t, i); const s = sessionFor(d); if (s !== "Extra") return { day: d, session: s, isToday: i === 0 }; }
    return null;
  }
  const todaysLesson = () => D.lessons.find((l) => (l.date || "").slice(0, 10) === today()) || null;
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
        // A word's own spelling wins over somebody else's form; otherwise the first one stays.
        if (!exact.has(k) || (f === w.italian && rank(w) >= rank(exact.get(k)))) exact.set(k, w);
        if (!loose.has(kb)) loose.set(kb, w);
      }
    }
    IDX = { exact, loose, maxN: Math.min(maxN, 8) };
  }
  // Split text into plain runs and matched runs [{t, w?, unknown?}].
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
    let left = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 12);
    t.style.left = left + "px";
    const below = r.bottom + 8, th = t.offsetHeight;
    t.style.top = (below + th > window.innerHeight - 8 && r.top - th - 8 > 8 ? r.top - th - 8 : below) + "px";
  }
  function hideTip() { tip().hidden = true; tipFor = null; }
  document.addEventListener("mouseover", (e) => { const el = e.target.closest(".it-w"); if (el) showTip(el); else if (tipFor && !e.target.closest("#tip")) hideTip(); });
  document.addEventListener("focusin", (e) => { const el = e.target.closest(".it-w"); if (el) showTip(el); });
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".it-w");
    if (el) { if (tipFor === el && matchMedia("(hover: none)").matches) hideTip(); else showTip(el); return; }
    const u = e.target.closest(".it-u");
    if (u) { offerAdd(u); return; }
    if (!e.target.closest("#tip") && !e.target.closest(".it-addpop")) { hideTip(); closeAddPop(); }
  });
  window.addEventListener("scroll", () => { if (tipFor) hideTip(); closeAddPop(); }, { passive: true });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { hideTip(); closeAddPop(); } });

  // Tap a word you don't have yet: add it to the index.
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
    const t = today(), lessonDay = sessionFor(t) !== "Extra";
    const L = lessonDay ? await ensureLesson().catch(() => null) : todaysLesson();
    const r = await api("POST", "/api/italian/word", { italian, english, lessonId: L ? L.id : null });
    const i = D.words.findIndex((w) => w.id === r.word.id);
    if (i >= 0) D.words.splice(i, 1);
    D.words.unshift(r.word);
    if (L && !L.words.includes(r.word.id)) L.words.push(r.word.id);
    reindex();
    toast(r.existed ? (r.counted ? `“${r.word.italian}” again — seen ${r.word.times}×` : `“${r.word.italian}” is already counted today`) : `Added “${r.word.italian}”`);
    return r;
  }
  async function setStatus(w, status) {
    w.status = status; reindex(); render();
    try { Object.assign(w, await api("PATCH", "/api/italian/word/" + w.id, { status })); } catch { toast("Couldn't save. Try again."); }
  }
  function reindex() { byId.clear(); for (const w of D.words) byId.set(w.id, w); IDX = null; }

  // ---------------- views ----------------
  function header() {
    const nl = nextLesson();
    $("#next").textContent = nl ? (nl.isToday ? "Lesson today · " + nl.session : "Next lesson · " + fmtDay(nl.day)) : "";
    const words = D.words.filter((w) => w.type !== "Phrase" && w.type !== "Expression").length, phrases = D.words.length - words;
    const weekAgo = addDays(today(), -6);
    const week = D.words.filter((w) => (w.first || "") >= weekAgo).length;
    return h("section", { class: "it-hero" },
      h("h1", { class: "it-title head", text: "Italiano" }),
      h("p", { class: "it-sub quiet", text: "With your teacher, Wednesday nights and Sunday mornings. Every word you meet goes in the index and counts once a day." }),
      h("div", { class: "it-stats" },
        stat(words, "words"), stat(phrases, "phrases"), stat(week, "new this week"), stat(D.lessons.length, "lessons")));
  }
  const stat = (n, label) => h("div", { class: "it-stat" }, h("b", { text: String(n) }), h("span", { text: label }));

  function quickAdd() {
    const L = todaysLesson(), nl = nextLesson(), lessonDay = nl && nl.isToday;
    const it = h("input", { class: "it-in", type: "text", placeholder: "parola o frase", autocomplete: "off", autocapitalize: "none", spellcheck: "false", lang: "it", "aria-label": "Italian word or phrase" });
    const en = h("input", { class: "it-in en", type: "text", placeholder: "meaning (optional)", autocomplete: "off", "aria-label": "Meaning" });
    const go = h("button", { class: "btn", type: "submit", text: "Add" });
    const recent = h("div", { class: "it-recent" });
    const paintRecent = () => {
      const todayWords = D.words.filter((w) => w.last === today()).slice(0, 30);
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
        // The first word on a lesson day starts the lesson row: redraw so its note box shows.
        if (!had && todaysLesson()) { render(); const box = $(".it-add .it-in"); if (box) box.focus(); return; }
        paintRecent(); it.focus(); refreshCounts();
      }
      catch { toast("Couldn't add it. Try again."); }
      go.disabled = false;
    } }, it, en, go);
    const note = h("textarea", { class: "it-note", placeholder: "What did we talk about? (a line or two)", rows: "2" });
    if (L) {
      note.value = L.note || "";
      note.addEventListener("blur", async () => { if (note.value === (L.note || "")) return; L.note = note.value; try { await api("PATCH", "/api/italian/lesson/" + L.id, { note: note.value }); toast("Saved"); } catch { toast("Couldn't save the note."); } });
    }
    return h("section", { class: "it-sec" },
      h("div", { class: "it-head" }, h("h2", { class: "sec", text: lessonDay ? "Today's lesson" : "Add a word" }),
        L ? h("span", { class: "quiet", text: L.session + " · " + (L.words || []).length + ((L.words || []).length === 1 ? " word" : " words") }) : null),
      h("p", { class: "quiet it-help", text: lessonDay
        ? "Type each word or phrase as it comes up. A word you already have counts again; Claude fills in meanings and forms after the lesson."
        : "Met a word outside the lesson? It goes in the index the same way." }),
      form, recent, L ? note : null);
  }

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
    wrote.addEventListener("click", async () => {
      const ids = [...new Set(analyse(readerBox.value).filter((x) => x.w).map((x) => x.w.id))];
      if (!ids.length) { toast("No words from your index in there yet."); return; }
      wrote.disabled = true;
      try {
        const rows = await api("POST", "/api/italian/seen", { ids });
        for (const r of rows) { const w = byId.get(r.id); if (w) Object.assign(w, r); }
        toast(`Counted ${ids.length} word${ids.length === 1 ? "" : "s"} for today`);
        render();
      } catch { toast("Couldn't count them. Try again."); wrote.disabled = false; }
    });
    const clear = h("button", { class: "textlink it-linkbtn", type: "button", text: "Clear" });
    clear.addEventListener("click", () => { readerBox.value = ""; reading = ""; store.set("reader", ""); paintReader(); });
    const up = h("button", { class: "btn ghost", type: "button", text: "Upload PDF or text" });
    up.addEventListener("click", () => file.click());
    paintReader();
    return h("section", { class: "it-sec" },
      h("div", { class: "it-head" }, h("h2", { class: "sec", text: "Reader" }), h("span", { class: "it-legend" },
        h("i", { class: "s-new" }, "new"), h("i", { class: "s-learning" }, "learning"), h("i", { class: "s-known" }, "known"))),
      h("p", { class: "quiet it-help", text: "Words you already have are underlined: hover or tap one for its meaning. Tap a plain word to add it." }),
      readerBox, h("div", { class: "it-tools" }, up, wrote, clear, file), readerStats, readerOut);
  }
  function paintReader() {
    if (!readerOut) return;
    const text = (readerBox ? readerBox.value : reading).slice(0, 60000);
    hideTip();
    if (!text.trim()) { readerOut.replaceChildren(); readerOut.hidden = true; readerStats.textContent = ""; return; }
    readerOut.hidden = false;
    const runs = analyse(text), frag = document.createDocumentFragment();
    let known = 0, total = 0;
    const distinct = new Set();
    for (const r of runs) {
      if (r.w) {
        const n = (r.t.match(TOKEN) || []).length; known += n; total += n; distinct.add(r.w.id);
        frag.append(h("span", { class: "it-w s-" + (r.w.status || "New").toLowerCase(), "data-id": r.w.id, tabindex: "0", text: r.t }));
      } else if (r.unknown) { total += 1; frag.append(h("span", { class: "it-u", text: r.t })); }
      else frag.append(document.createTextNode(r.t));
    }
    readerOut.replaceChildren(frag);
    readerStats.textContent = total ? `${known} of ${total} words are ones you know (${Math.round((known / total) * 100)}%) · ${distinct.size} different entries from your index` : "";
  }

  function topLists() {
    const weekAgo = addDays(today(), -6);
    const fresh = D.words.filter((w) => (w.first || "") >= weekAgo).sort((a, b) => (b.first || "").localeCompare(a.first || ""));
    const most = [...D.words].sort((a, b) => (b.times || 0) - (a.times || 0)).slice(0, 12);
    const chips = (list) => h("div", { class: "it-chips" }, ...list.map((w) => h("span", { class: "it-chip it-w s-" + w.status.toLowerCase(), "data-id": w.id, tabindex: "0" }, w.italian, h("small", { text: " ×" + (w.times || 0) }))));
    return h("section", { class: "it-sec it-two" },
      h("div", {}, h("h2", { class: "sec", text: "New this week" }), fresh.length ? chips(fresh) : h("p", { class: "quiet", text: "Nothing new yet this week." })),
      h("div", {}, h("h2", { class: "sec", text: "Most used" }), most.length ? chips(most) : h("p", { class: "quiet", text: "Your most-used words show here." })));
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
    const q = bare(filter.q.trim());
    let list = D.words.filter((w) => (!filter.status || w.status === filter.status) && (!q || bare(w.italian + " " + w.english + " " + w.forms).includes(q)));
    if (filter.sort === "most") list.sort((a, b) => (b.times || 0) - (a.times || 0));
    else if (filter.sort === "az") list.sort((a, b) => a.italian.localeCompare(b.italian, "it"));
    else list.sort((a, b) => (b.last || "").localeCompare(a.last || "") || (b.first || "").localeCompare(a.first || ""));
    listEl.replaceChildren(...list.slice(0, 400).map(wordRow));
    if (!list.length) listEl.append(h("li", { class: "quiet it-empty", text: D.words.length ? "No match." : "No words yet. Add the first one above." }));
  }
  const NEXT = { New: "Learning", Learning: "Known", Known: "New" };
  function wordRow(w) {
    const open = openWord === w.id;
    const status = h("button", { class: "it-status s-" + w.status.toLowerCase(), type: "button", title: "Tap to change", text: w.status });
    status.addEventListener("click", (e) => { e.stopPropagation(); setStatus(w, NEXT[w.status] || "New"); });
    const row = h("li", { class: "it-row" + (open ? " open" : "") },
      h("div", { class: "it-rtop" },
        h("button", { class: "it-word", type: "button", "aria-expanded": String(open), onclick: () => { openWord = open ? null : w.id; paintList(); } },
          h("b", { lang: "it", text: w.italian }), h("span", { class: "it-en" + (w.english ? "" : " pending"), text: w.english || "meaning coming" })),
        w.type ? h("span", { class: "it-type", text: w.type }) : null,
        h("span", { class: "it-times", title: "Days seen", text: "×" + (w.times || 0) }), status));
    if (open) {
      const parts = (w.parts || []).map((i) => byId.get(i)).filter(Boolean), phrases = (w.phrases || []).map((i) => byId.get(i)).filter(Boolean);
      const lessons = (w.lessons || []).map((i) => D.lessons.find((l) => l.id === i)).filter(Boolean);
      const link = (x) => h("button", { class: "it-mini it-w s-" + x.status.toLowerCase(), "data-id": x.id, type: "button", text: x.italian, onclick: () => { openWord = x.id; paintList(); } });
      const url = safeUrl(w.url);
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

  function lessons() {
    if (!D.lessons.length) return null;
    return h("section", { class: "it-sec" },
      h("h2", { class: "sec", text: "Lessons" }),
      h("ul", { class: "it-lessons" }, ...D.lessons.slice(0, 30).map((l) => {
        const ws = (l.words || []).map((i) => byId.get(i)).filter(Boolean);
        return h("li", {},
          h("div", { class: "it-lhead" }, h("b", { text: fmtDay(l.date || today()) }), h("span", { class: "quiet", text: (l.session || "") + " · " + ws.length + (ws.length === 1 ? " word" : " words") + (l.plaud ? " · Plaud ✓" : "") })),
          l.note ? h("p", { class: "it-lnote", text: l.note }) : null,
          ws.length ? h("div", { class: "it-chips" }, ...ws.map((w) => h("span", { class: "it-chip it-w s-" + w.status.toLowerCase(), "data-id": w.id, tabindex: "0", text: w.italian }))) : null);
      })));
  }

  let countsEl;
  function claudeBar() {
    countsEl = h("div", { class: "it-claude" });
    refreshCounts();
    return countsEl;
  }
  function refreshCounts() {
    if (!countsEl) return;
    const need = D.words.filter((w) => w.needsClaude).length;
    const L = todaysLesson() || D.lessons[0];
    const kids = [];
    if (need) kids.push(ext(h("a", { class: "btn", href: claude(`/italian-lesson — fill in the ${need} Italian Words row${need === 1 ? "" : "s"} marked Needs Claude: English, Type, Forms, an example with English, a short Note, and link each phrase to the words in it (Words in it). Then untick Needs Claude.`), text: `Have Claude fill in ${need} new word${need === 1 ? "" : "s"}` })));
    if (L && !L.processed) kids.push(ext(h("a", { class: "textlink", href: claude(`/italian-lesson — process my Italian lesson from ${L.date ? L.date.slice(0, 10) : "today"} (${L.session || "lesson"}) from Plaud: find the recording, pull every Italian word and phrase we worked on, add new ones to Italian Words and count the ones I already have (once for the day), link them to the lesson, write the lesson Note, and tick Processed.`), text: "Pull this lesson's words from Plaud" })));
    countsEl.replaceChildren(...kids);
    countsEl.hidden = !kids.length;
  }

  function render() {
    hideTip();
    const main = $("#main");
    if (loadErr) { main.replaceChildren(h("p", { class: "it-err", text: loadErr })); return; }
    readerOut = null;
    main.replaceChildren(...[header(), claudeBar(), quickAdd(), reader(), topLists(), wordList(), lessons()].filter(Boolean));
  }

  async function load() {
    filter.sort = store.get("sort") || "recent";
    try { D = await api("GET", "/api/italian"); loadErr = ""; }
    catch (e) { if (e.message !== "signin") loadErr = "Couldn't load your words from Notion. Is the Italian page shared with the oggi integration?"; }
    reindex();
    render();
  }
  // Coming back from a Claude chat: read Notion again so filled-in meanings show.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !document.activeElement?.matches("input, textarea")) load(); });
  load();
})();
