/* Oggi · /flown — Eric's FLOWN focus sessions. Plain JS, no build step.
   Everything from Notion is rendered with textContent, never as markup. */
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
  const NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, text) { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v); if (text != null) el.textContent = text; return el; }
  const ext = (a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };
  const safeUrl = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : null);
  const pad = (n) => String(n).padStart(2, "0");
  const dayOf = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  const today = () => dayOf(Date.now());
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return dayOf(d); };
  const clock = (d) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const hhmm = (d) => { const x = new Date(d); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; };
  const fmtDay = (d) => new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem("flown." + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("flown." + k, JSON.stringify(v)); } catch {} },
  };
  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
    if (r.status === 401) { location.href = "/"; throw new Error("signin"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `failed (${r.status})`);
    return j;
  }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  // a little sound, like the sky's focus timer: rising notes for a celebration
  let audio = null;
  function chime(notes) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      notes.forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.16;
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.62);
      });
    } catch {}
    try { if (navigator.vibrate) navigator.vibrate([90, 60, 90]); } catch {}
  }
  function celebrate(big, line, sub) {
    chime(big ? [523, 659, 784, 1047] : [659, 784, 988]);
    const box = $("#burst"); box.replaceChildren();
    const colors = ["#E7B75C", "#C9A8F2", "#8FB8C9", "#C6613F", "#F4EFE4", "#3F7D4E"];
    const n = big ? 46 : 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, r = (big ? 220 : 140) + Math.random() * 120;
      const dot = h("i");
      dot.style.left = "50%"; dot.style.top = "42%"; dot.style.background = colors[i % colors.length];
      dot.style.setProperty("--dx", Math.cos(a) * r + "px"); dot.style.setProperty("--dy", Math.sin(a) * r + "px");
      dot.style.animationDelay = Math.random() * 0.15 + "s";
      box.append(dot);
    }
    box.append(h("div", { class: "msg" }, line, sub ? h("small", { text: sub }) : null));
    setTimeout(() => box.replaceChildren(), 2600);
  }

  // ---------------- state ----------------
  let F = { sessions: [], members: [] };
  let brief = null;            // today's Oggi brief, for pulling tasks and spotting FLOWN on the calendar
  let fresh = new Set();       // blocks finished this visit, so their stars are born on screen
  const me = () => F.members.find((m) => m.role === "Me");
  const blockEnd = (b) => new Date(Date.parse(b.start) + b.min * 60000);
  const sessionOf = (id) => F.sessions.find((x) => x.id === id);
  const openTasks = () => (brief && brief.items ? brief.items.filter((i) => i.status !== "Closed" && !String(i.key || "").startsWith("r-")) : []);
  const AREA = (it) => it.area || ({ Kahala: "CPA", Kakaako: "Medicare", Home: "Personal" }[it.place] || "");

  async function load() {
    const [f, b] = await Promise.all([api("GET", "/api/flown"), api("GET", "/api/brief").catch(() => null)]);
    F = f; brief = b;
  }

  // ---------------- saving ----------------
  const timers = new Map();
  function save(sess, fields, label) {
    Object.assign(sess, fields);
    return api("PATCH", `/api/flown/session/${sess.id}`, fields).then((upd) => { if (label) label.textContent = "Saved"; return upd; })
      .catch((e) => { if (label) label.textContent = "Not saved"; toast("Couldn't save: " + e.message); });
  }
  function saveSoon(sess, fields, label, ms = 800) {
    Object.assign(sess, fields);
    if (label) label.textContent = "";
    clearTimeout(timers.get(sess.id + Object.keys(fields).join()));
    timers.set(sess.id + Object.keys(fields).join(), setTimeout(() => save(sess, fields, label), ms));
  }
  const saveBlocks = (sess) => save(sess, { blocks: sess.blocks });

  // ---------------- rewards ----------------
  function doneBlocks() {
    const out = [];
    for (const x of F.sessions) for (const b of x.blocks || []) if (b.done) out.push({ sess: x, b, day: dayOf(b.doneAt || b.start || x.start) });
    return out;
  }
  function streak() {
    const days = new Set(doneBlocks().map((d) => d.day));
    let n = 0, d = today();
    if (!days.has(d)) d = addDays(d, -1);           // today not started yet: the streak still stands from yesterday
    while (days.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }
  function weekStats() {
    const from = addDays(today(), -6);
    const wk = doneBlocks().filter((d) => d.day >= from);
    const mins = wk.reduce((a, d) => a + d.b.min, 0), deep = wk.filter((d) => d.b.deep).reduce((a, d) => a + d.b.min, 0);
    return { blocks: wk.length, hours: mins / 60, deep: deep / 60 };
  }
  // The last 14 days left to right. Each session's finished blocks hang together as a small
  // constellation in its day's column; deep-work blocks burn gold. Today's open blocks wait as rings.
  function constellation() {
    const box = document.getElementById("main");
    const W = Math.max(300, Math.min(772, (box && box.clientWidth) || 772)), H = W < 560 ? 170 : 210, days = 14, colW = (W - 40) / days;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Your FLOWN constellation: one star for every focus block finished in the last two weeks." });
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) svg.append(s("circle", { class: "dust" + (i % 6 === 0 ? " tw" : ""), cx: (rnd() * W).toFixed(1), cy: (rnd() * H).toFixed(1), r: (0.3 + rnd() * 0.8).toFixed(2), "fill-opacity": (0.1 + rnd() * 0.35).toFixed(2) }));
    const start = addDays(today(), -(days - 1));
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i), cx = 20 + colW * (i + 0.5);
      if (i % 2 === 1 || d === today()) svg.append(s("text", { class: "day" + (d === today() ? " today-l" : ""), x: cx, y: H - 10 }, d === today() ? "today" : new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" })));
      const sess = F.sessions.filter((x) => dayOf(x.start) === d);
      sess.forEach((x, si) => {
        const bl = (x.blocks || []).filter((b) => b.done || d === today());
        if (!bl.length) return;
        let pseed = 0; for (const c of x.id) pseed = (pseed * 31 + c.charCodeAt(0)) % 9973;
        const pr = () => ((pseed = (pseed * 16807 + 11) % 2147483647) / 2147483647);
        const baseY = 40 + ((si * 61 + pseed % 50) % 100);
        const pts = bl.map((b, j) => ({ b, x: cx + (pr() - 0.5) * colW * 0.8, y: baseY + j * 22 + (pr() - 0.5) * 16 }));
        for (let j = 1; j < pts.length; j++) if (pts[j].b.done && pts[j - 1].b.done) svg.append(s("line", { class: "cl", x1: pts[j - 1].x.toFixed(1), y1: pts[j - 1].y.toFixed(1), x2: pts[j].x.toFixed(1), y2: pts[j].y.toFixed(1) }));
        for (const p of pts) {
          const k = x.id + ":" + p.b.n;
          if (!p.b.done) { svg.append(s("circle", { class: "st open", cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 3.2 })); continue; }
          const c = s("circle", { class: "st" + (p.b.deep ? " deep" : "") + (fresh.has(k) ? " new" : ""), cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: p.b.deep ? 3.4 : 2.4 });
          c.append(s("title", {}, `${fmtDay(x.start)} · ${x.title} · block ${p.b.n}, ${p.b.min} min${p.b.deep ? " deep work" : ""}${p.b.intention ? ": " + p.b.intention : ""}`));
          svg.append(c);
        }
      });
    }
    return svg;
  }
  function rewards() {
    const st = weekStats(), n = streak();
    const box = h("section", { class: "fl-sky", "aria-label": "Rewards" });
    box.append(h("span", { class: "cap", text: "Your constellation · 14 days" }), constellation());
    box.querySelector("svg").style.height = (box.querySelector("svg").viewBox.baseVal.height) + "px";
    const stat = (b, t) => h("div", { class: "fl-stat" }, h("b", { text: b }), h("span", { text: t }));
    box.append(h("div", { class: "fl-stats" },
      stat(String(n), n === 1 ? "day in a row" : "days in a row"),
      stat(String(st.blocks), "blocks this week"),
      stat(st.hours.toFixed(st.hours < 10 ? 1 : 0) + " h", `focus · ${st.deep.toFixed(1)} h deep`)));
    return box;
  }

  // ---------------- a session ----------------
  const TEMPLATES = {
    conditions: { title: "The Conditions", host: "Tim Longhurst", hours: 4, lead: 30, gap: 10, blocks: [[25, false], [45, false], [45, true], [35, false]] },
    morning: { title: "Morning Flow", host: "Tim Longhurst", hours: 2, lead: 15, gap: 10, blocks: [[25, false], [45, true]] },
    single: { title: "Deep work", host: "", hours: 1, lead: 5, gap: 0, blocks: [[50, true]] },
  };
  function layBlocks(startMs, t) {
    let at = startMs + t.lead * 60000;
    return t.blocks.map(([min, deep], i) => { const b = { n: i + 1, min, deep, start: new Date(at).toISOString(), intention: "", items: [], done: false, doneAt: null }; at += (min + t.gap) * 60000; return b; });
  }

  function running() { return store.get("run"); }      // { id, n, end }
  function sessionCard(sess) {
    const now = Date.now(), st = Date.parse(sess.start), en = Date.parse(sess.end || sess.start) || st + 4 * 3600000;
    const live = now >= st - 15 * 60000 && now <= en + 30 * 60000;
    const card = h("article", { class: "fl-card" + (live ? " now" : ""), "data-id": sess.id });
    card.append(h("p", { class: "fl-when" }, live ? h("span", { class: "live", text: now < st ? "Starting soon · " : "Now · " }) : null, `${fmtDay(sess.start)} · ${clock(sess.start)}${sess.end ? " – " + clock(sess.end) : ""}`));
    card.append(h("h2", { class: "fl-stitle", text: sess.title }));
    if (sess.host) card.append(h("p", { class: "fl-host", text: "with " + sess.host }));
    const acts = h("div", { class: "fl-actions" });
    const join = safeUrl(sess.join);
    if (join) acts.append(ext(h("a", { class: "btn", href: join, text: "Join on FLOWN" })));
    acts.append(h("button", { class: "textlink", type: "button", text: "Skip this one", onclick: async () => { await save(sess, { status: "Skipped" }); render(); } }));
    card.append(acts);

    // the ritual: breathe, the word, the spoken intention
    const saved = h("span", { class: "fl-saved" });
    const breath = h("input", { type: "checkbox" }); breath.checked = !!sess.breathwork;
    breath.addEventListener("change", () => save(sess, { breathwork: breath.checked }, saved));
    const word = h("input", { class: "fl-in word", value: sess.word || (me() && me().word) || "", placeholder: "Your word", "aria-label": "Your word for this session", maxlength: 40 });
    word.addEventListener("input", () => saveSoon(sess, { word: word.value.trim() }, saved));
    const intent = h("textarea", { class: "fl-ta", rows: 2, placeholder: "What you'll say when Tim goes round", "aria-label": "Your intention" });
    intent.value = sess.intention || "";
    intent.addEventListener("input", () => saveSoon(sess, { intention: intent.value }, saved));
    card.append(h("div", { class: "fl-ritual" },
      h("div", {}, h("span", { class: "fl-lab", text: "Meditation" }), h("label", { class: "fl-check" }, breath, "Breathwork done")),
      h("div", {}, h("span", { class: "fl-lab", text: "Word" }), word),
      h("div", { class: "full" }, h("span", { class: "fl-lab", text: "Intention" }), intent, saved)));

    // the blocks
    card.append(h("span", { class: "fl-lab", text: "Focus blocks" }));
    const ul = h("ol", { class: "fl-blocks" });
    (sess.blocks || []).forEach((b) => ul.append(blockEl(sess, b)));
    card.append(ul);
    card.append(h("div", { class: "fl-add" },
      h("button", { class: "textlink", type: "button", text: "+ Add a block", onclick: () => {
        const last = sess.blocks[sess.blocks.length - 1];
        const at = last ? blockEnd(last).getTime() + 10 * 60000 : Date.parse(sess.start) + 30 * 60000;
        sess.blocks.push({ n: sess.blocks.length + 1, min: 25, deep: false, start: new Date(at).toISOString(), intention: "", items: [], done: false, doneAt: null });
        saveBlocks(sess); render();
      } })));

    // the end: gratitude, then celebrate
    const close = h("div", { class: "fl-close" });
    const grat = h("textarea", { class: "fl-ta", rows: 2, placeholder: "One thing you're grateful for", "aria-label": "Gratitude" });
    grat.value = sess.gratitude || "";
    const gs = h("span", { class: "fl-saved" });
    grat.addEventListener("input", () => saveSoon(sess, { gratitude: grat.value }, gs));
    const doneN = (sess.blocks || []).filter((b) => b.done).length;
    close.append(h("span", { class: "fl-lab", text: "Gratitude" }), grat, gs);
    if (sess.status === "Done") close.append(h("p", { class: "fl-done-note", text: `Celebrated · ${doneN} of ${sess.blocks.length} blocks.` }));
    close.append(h("div", { class: "fl-actions", style: "margin:12px 0 0" },
      sess.status === "Done"
        ? h("button", { class: "textlink", type: "button", text: "Open it again", onclick: async () => { await save(sess, { status: "Planned" }); render(); } })
        : h("button", { class: "btn", type: "button", text: "Celebrate and close", onclick: async () => {
            await save(sess, { status: "Done", gratitude: grat.value });
            celebrate(true, "Well done, Eric", `${doneN} block${doneN === 1 ? "" : "s"} · ${sess.word || "Kaizen"}`);
            render();
          } })));
    card.append(close);
    return card;
  }

  function blockEl(sess, b) {
    const run = running(), isRun = run && run.id === sess.id && run.n === b.n && !b.done;
    const current = !b.done && sess.blocks.find((x) => !x.done) === b;
    const li = h("li", { class: "fl-block" + (b.deep ? " deep" : "") + (b.done ? " done" : "") + (isRun ? " running" : "") });
    const head = h("div", { class: "fl-bhead" });
    head.append(h("b", { text: `Block ${b.n}` }));
    const mins = h("input", { class: "fl-mins", type: "number", min: 5, max: 180, step: 5, value: String(b.min), "aria-label": `Block ${b.n} minutes` });
    mins.addEventListener("change", () => { b.min = Math.max(5, Math.min(180, Number(mins.value) || b.min)); saveBlocks(sess); render(); });
    head.append(h("span", { class: "fl-time" }, mins, " min"));
    const t = h("input", { type: "time", value: b.start ? hhmm(b.start) : "", "aria-label": `Block ${b.n} start` });
    t.addEventListener("change", () => {
      if (!t.value) return;
      const [hh, mm] = t.value.split(":").map(Number);
      const d = new Date(b.start || sess.start); d.setHours(hh, mm, 0, 0);
      b.start = d.toISOString(); saveBlocks(sess); render();
    });
    head.append(h("span", { class: "fl-time at" }, t, b.start ? "– " + clock(blockEnd(b)) : ""));
    if (b.deep) head.append(h("span", { class: "fl-tag", text: "Deep work" }));
    li.append(head);
    const end = h("div", { class: "fl-bend" });
    if (isRun) end.append(h("span", { class: "fl-clock", "data-end": String(run.end) }));
    if (!b.done) {
      if (!isRun) end.append(h("button", { class: current ? "btn ghost" : "textlink", type: "button", text: "Start", onclick: () => { store.set("run", { id: sess.id, n: b.n, end: Date.now() + b.min * 60000 }); render(); } }));
      end.append(h("button", { class: isRun || current ? "btn" : "textlink", type: "button", text: "Done", onclick: () => finishBlock(sess, b) }));
    } else {
      end.append(h("span", { class: "quiet", text: "✓ " + (b.doneAt ? clock(b.doneAt) : "done") }));
      end.append(h("button", { class: "textlink", type: "button", text: "Undo", onclick: () => { b.done = false; b.doneAt = null; saveBlocks(sess); render(); } }));
    }
    const more = h("span", { class: "fl-more" });
    more.append(h("button", { class: "textlink", type: "button", title: b.deep ? "Make it a regular block" : "Mark it as deep work", text: b.deep ? "Not deep" : "Deep", onclick: () => { b.deep = !b.deep; saveBlocks(sess); render(); } }));
    more.append(h("button", { class: "textlink", type: "button", "aria-label": `Remove block ${b.n}`, text: "Remove", onclick: () => {
      if (!confirmRemove(b)) return;
      sess.blocks = sess.blocks.filter((x) => x !== b); sess.blocks.forEach((x, i) => (x.n = i + 1)); saveBlocks(sess); render();
    } }));
    end.append(more);
    li.append(end);

    const intent = h("input", { class: "fl-in", value: b.intention || "", placeholder: "What this block is for", "aria-label": `Block ${b.n} intention`, maxlength: 400 });
    intent.addEventListener("input", () => { b.intention = intent.value; saveSoon(sess, { blocks: sess.blocks }, null, 900); });
    li.append(intent);

    // tasks pulled in from Oggi
    const tasks = h("div", { class: "fl-tasks" });
    for (const it of b.items || []) {
      const live = brief && brief.items ? brief.items.find((x) => x.id === it.id || (it.key && x.key === it.key)) : null;
      const closed = live && live.status === "Closed";
      const chip = h("span", { class: "fl-task" + (closed ? " closed" : ""), title: it.title }, h("span", { text: it.title }));
      if (b.done && live && !closed) chip.append(h("button", { class: "ok", type: "button", title: "Mark it done in Oggi too", text: "✓ done in Oggi", onclick: async () => {
        try { await api("PATCH", `/api/item/${live.id}`, { status: "Closed", dayId: brief.day && brief.day.id }); live.status = "Closed"; toast("Marked done in Oggi"); render(); } catch (e) { toast("Couldn't: " + e.message); }
      } }));
      chip.append(h("button", { type: "button", "aria-label": "Take it out of this block", text: "×", onclick: () => { b.items = b.items.filter((x) => x !== it); saveBlocks(sess); render(); } }));
      tasks.append(chip);
    }
    if (!b.done) {
      const pull = h("button", { class: "fl-pull", type: "button", text: "+ Pull from Oggi" });
      pull.addEventListener("click", () => { const open = li.querySelector(".fl-pick"); if (open) { open.remove(); return; } li.append(picker(sess, b)); const q = li.querySelector(".fl-pick input"); if (q) q.focus(); });
      tasks.append(pull);
    }
    li.append(tasks);
    return li;
  }
  const confirmRemove = (b) => !(b.intention || (b.items || []).length) || window.confirm(`Remove block ${b.n} and what's in it?`);

  function picker(sess, b) {
    const box = h("div", { class: "fl-pick" });
    const q = h("input", { class: "fl-in", type: "search", placeholder: "Search today's list", "aria-label": "Search Oggi tasks" });
    const ul = h("ul");
    const taken = new Set(sess.blocks.flatMap((x) => (x.items || []).map((i) => i.id)));
    const draw = () => {
      ul.replaceChildren();
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const list = openTasks().filter((it) => !taken.has(it.id)).filter((it) => words.every((w) => `${it.title} ${it.person || ""} ${AREA(it)}`.toLowerCase().includes(w)));
      if (!brief) ul.append(h("li", { class: "quiet", text: "Couldn't load today's list." }));
      else if (!list.length) ul.append(h("li", { class: "quiet", text: "Nothing matches." }));
      for (const it of list.slice(0, 40)) {
        ul.append(h("li", {}, h("button", { type: "button", onclick: () => {
          b.items = (b.items || []).concat({ id: it.id, key: it.key || "", title: it.title });
          if (!b.intention) b.intention = it.title;
          saveBlocks(sess); render();
        } }, h("span", { class: "ar", text: AREA(it) }), h("span", { text: it.title }))));
      }
    };
    q.addEventListener("input", draw);
    box.append(q, ul);
    draw();
    return box;
  }

  async function finishBlock(sess, b) {
    b.done = true; b.doneAt = new Date().toISOString();
    const run = running(); if (run && run.id === sess.id && run.n === b.n) store.set("run", null);
    fresh.add(sess.id + ":" + b.n);
    await saveBlocks(sess);
    const left = sess.blocks.filter((x) => !x.done).length;
    celebrate(false, b.deep ? "Deep work, done" : `Block ${b.n}, done`, left ? `${left} to go · a new star in your sky` : "Every block done · time to celebrate");
    render();
  }

  // ticking clocks for a running block
  setInterval(() => {
    for (const c of document.querySelectorAll(".fl-clock[data-end]")) {
      const left = Number(c.dataset.end) - Date.now();
      if (left <= 0) {
        c.textContent = "Time";
        if (!c.dataset.rang) { c.dataset.rang = "1"; chime([784, 784]); }
        continue;
      }
      c.textContent = `${Math.floor(left / 60000)}:${pad(Math.floor((left % 60000) / 1000))}`;
    }
  }, 500);

  // ---------------- new session ----------------
  function calendarSuggestions() {
    const evs = (brief && brief.day && brief.day.events) || [];
    return evs.filter((e) => /flown/i.test(e.title || "") && !isNaN(Date.parse(e.start)))
      .filter((e) => !F.sessions.some((x) => Math.abs(Date.parse(x.start) - Date.parse(e.start)) < 30 * 60000));
  }
  function newSession() {
    const sec = h("section", { class: "fl-sec" });
    sec.append(h("div", { class: "fl-head" }, h("h2", { class: "sec", text: "Plan a session" })));
    for (const e of calendarSuggestions()) {
      sec.append(h("div", { class: "fl-cal" }, h("span", { text: `On your calendar: ${e.title}, ${clock(e.start)}` }),
        h("button", { class: "btn", type: "button", text: "Add it here", onclick: async () => {
          const tpl = /morning/i.test(e.title) ? TEMPLATES.morning : TEMPLATES.conditions;
          const host = (e.title.match(/·\s*([^·]+)$/) || [])[1];
          const title = (e.title.replace(/^FLOWN\s*[—-]\s*/i, "").replace(/\s*\(.*?\)\s*/g, " ").split("·")[0] || tpl.title).trim();
          await create({ title, host: (host || tpl.host).trim(), start: new Date(e.start).toISOString(), end: e.end ? new Date(e.end).toISOString() : null, blocks: layBlocks(Date.parse(e.start), tpl), word: (me() && me().word) || "" });
        } })));
    }
    const tplSel = h("select", { class: "fl-sel", "aria-label": "Shape" },
      h("option", { value: "conditions", text: "The Conditions · 25, 45, 45 deep, 35" }),
      h("option", { value: "morning", text: "Morning Flow · 25, 45 deep" }),
      h("option", { value: "single", text: "One deep block · 50" }));
    const title = h("input", { class: "fl-in", value: TEMPLATES.conditions.title, "aria-label": "Title" });
    const host = h("input", { class: "fl-in", value: TEMPLATES.conditions.host, "aria-label": "Host" });
    tplSel.addEventListener("change", () => { const t = TEMPLATES[tplSel.value]; title.value = t.title; host.value = t.host; });
    const date = h("input", { class: "fl-in", type: "date", value: today(), "aria-label": "Date" });
    const time = h("input", { class: "fl-in", type: "time", value: "12:00", "aria-label": "Start time" });
    const join = h("input", { class: "fl-in", type: "url", placeholder: "https://flown.com/…", "aria-label": "Join link" });
    const lab = (t, el, c) => h("label", { class: c }, h("span", { class: "fl-lab", text: t }), el);
    sec.append(h("div", { class: "fl-form" },
      lab("Shape", tplSel, "c3"), lab("Title", title, "c3"),
      lab("Host", host, "c2"), lab("Date", date, "c2"), lab("Start", time, "c2"),
      lab("Join link (optional)", join, "c6"),
      h("div", { class: "c6" }, h("button", { class: "btn", type: "button", text: "Add the session", onclick: async () => {
        const t = TEMPLATES[tplSel.value];
        const st = new Date(`${date.value}T${time.value || "12:00"}:00`);
        if (isNaN(st)) { toast("Pick a date and time"); return; }
        await create({ title: title.value.trim() || t.title, host: host.value.trim(), start: st.toISOString(), end: new Date(st.getTime() + t.hours * 3600000).toISOString(), join: join.value.trim() || null, blocks: layBlocks(st.getTime(), t), word: (me() && me().word) || "" });
      } }))));
    return sec;
  }
  async function create(f) {
    try { const x = await api("POST", "/api/flown/session", f); F.sessions.push(x); F.sessions.sort((a, b) => String(a.start).localeCompare(String(b.start))); toast("Session added"); render(); }
    catch (e) { toast("Couldn't add it: " + e.message); }
  }

  // ---------------- community ----------------
  function community() {
    const sec = h("section", { class: "fl-sec" });
    sec.append(h("div", { class: "fl-head" }, h("h2", { class: "sec", text: "Community words" }), h("span", { class: "quiet", text: "Just for you" })));
    const grid = h("div", { class: "fl-members" });
    const order = { Me: 0, Host: 1, Member: 2 };
    for (const m of F.members.slice().sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3) || a.name.localeCompare(b.name))) grid.append(memberCard(m));
    sec.append(grid);
    const name = h("input", { class: "fl-in", placeholder: "Name", "aria-label": "Name", maxlength: 60 });
    const word = h("input", { class: "fl-in", placeholder: "Their word", "aria-label": "Their word", maxlength: 40 });
    const meaning = h("input", { class: "fl-in", placeholder: "What it means to them (optional)", "aria-label": "Meaning", maxlength: 120 });
    sec.append(h("div", { class: "fl-form" },
      h("label", { class: "c2" }, h("span", { class: "fl-lab", text: "Name" }), name),
      h("label", { class: "c2" }, h("span", { class: "fl-lab", text: "Word" }), word),
      h("label", { class: "c2" }, h("span", { class: "fl-lab", text: "Meaning" }), meaning),
      h("div", { class: "c6" }, h("button", { class: "textlink", type: "button", text: "+ Add their word", onclick: async () => {
        if (!name.value.trim()) { name.focus(); return; }
        try { F.members.push(await api("POST", "/api/flown/member", { name: name.value.trim(), word: word.value.trim(), meaning: meaning.value.trim(), since: today() })); render(); }
        catch (e) { toast("Couldn't add: " + e.message); }
      } }))));
    return sec;
  }
  function memberCard(m) {
    const card = h("div", { class: "fl-member" + (m.role === "Me" ? " me" : "") });
    const paint = () => {
      card.replaceChildren(...[
        h("div", { class: "nm" }, h("span", { text: m.role === "Me" ? "You" : m.name }), h("span", { class: "role", text: m.role === "Me" ? "" : m.role })),
        h("p", { class: "wd" + (m.word ? "" : " none"), text: m.word || "No word yet" }),
        m.meaning ? h("p", { class: "mn", text: m.meaning }) : null,
        h("button", { class: "textlink edit", type: "button", text: "Edit", onclick: edit })].filter(Boolean));
    };
    const edit = () => {
      const w = h("input", { class: "fl-in", value: m.word, placeholder: "Word", "aria-label": "Word", maxlength: 40 });
      const mn = h("input", { class: "fl-in", value: m.meaning, placeholder: "What it means", "aria-label": "Meaning", maxlength: 120 });
      const nm = h("input", { class: "fl-in", value: m.name, placeholder: "Name", "aria-label": "Name", maxlength: 60 });
      card.replaceChildren(h("div", { class: "fl-medit" }, nm, w, mn, h("div", { class: "fl-actions", style: "margin:0" },
        h("button", { class: "btn", type: "button", text: "Save", onclick: async () => {
          const f = { name: nm.value.trim() || m.name, word: w.value.trim(), meaning: mn.value.trim() };
          if (f.word !== m.word) f.since = today();
          try { Object.assign(m, await api("PATCH", `/api/flown/member/${m.id}`, f)); render(); } catch (e) { toast("Couldn't save: " + e.message); }
        } }),
        h("button", { class: "textlink", type: "button", text: "Cancel", onclick: paint }),
        m.role === "Me" ? null : h("button", { class: "textlink", type: "button", text: "Remove", onclick: async () => {
          if (!window.confirm(`Remove ${m.name}?`)) return;
          await api("DELETE", `/api/flown/member/${m.id}`); F.members = F.members.filter((x) => x !== m); render();
        } }))));
      w.focus();
    };
    paint();
    return card;
  }

  // ---------------- past ----------------
  function past(list) {
    const sec = h("section", { class: "fl-sec" });
    sec.append(h("div", { class: "fl-head" }, h("h2", { class: "sec", text: "Past sessions" })));
    const ul = h("ul", { class: "fl-past" });
    for (const x of list.slice(-12).reverse()) {
      const d = (x.blocks || []).filter((b) => b.done).length;
      ul.append(h("li", {},
        h("span", { class: "d", text: fmtDay(x.start) }),
        h("span", { class: "t" }, x.title + (x.host ? " · " + x.host : ""), x.gratitude ? h("span", { class: "g", text: "Grateful for: " + x.gratitude }) : null),
        h("span", { class: "n", text: x.status === "Skipped" ? "skipped" : `${d} of ${(x.blocks || []).length} blocks` })));
    }
    if (!list.length) ul.append(h("li", { class: "quiet", text: "None yet." }));
    sec.append(ul);
    return sec;
  }

  // ---------------- page ----------------
  function render() {
    const main = $("#main");
    const y = window.scrollY;
    const mine = me();
    $("#myWord").textContent = mine && mine.word ? mine.word : "";
    const now = Date.now();
    const upcoming = F.sessions.filter((x) => x.status !== "Skipped" && (x.status === "Planned" ? (Date.parse(x.end || x.start) || 0) + 6 * 3600000 > now : dayOf(x.start) === today()));
    const done = F.sessions.filter((x) => !upcoming.includes(x) && Date.parse(x.start) < now);
    const kids = [
      h("h1", { class: "head fl-title", text: "FLOWN" }),
      h("p", { class: "fl-sub", text: mine && mine.word ? `Your word is ${mine.word}. Breathe, say what the block is for, do it, celebrate.` : "Breathe, say what the block is for, do it, celebrate." }),
      rewards(),
    ];
    const sesSec = h("section", {});
    if (upcoming.length) for (const x of upcoming.slice(0, 4)) sesSec.append(sessionCard(x));
    else sesSec.append(h("p", { class: "quiet", text: "No session planned. Add one below." }));
    kids.push(sesSec, newSession(), community(), past(done));
    main.replaceChildren(...kids);
    window.scrollTo(0, y);
    fresh = new Set();   // a star is born once
  }

  (async function boot() {
    try { await load(); render(); }
    catch (e) { if (e.message !== "signin") $("#main").replaceChildren(h("p", { class: "fl-err", text: "Couldn't load FLOWN: " + e.message })); }
    // pick up changes made elsewhere (the Timeline, another device) when coming back to the page
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;
      if (document.activeElement && document.activeElement.closest("input, textarea, select")) return;
      try { await load(); render(); } catch {}
    });
  })();
})();
