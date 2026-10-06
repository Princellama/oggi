/* Oggi — client. Plain JS, no build step.
   Every piece of gathered text is rendered with textContent, never as markup. */
(function () {
  "use strict";

  // ---------------- helpers ----------------
  const $ = (s, r = document) => r.querySelector(s);
  const SVGNS = "http://www.w3.org/2000/svg";
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const safeUrl = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : null);
  const ext = (a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const localISO = (d = new Date()) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  };
  function fmtTime(d) {
    let h = d.getHours(), m = d.getMinutes();
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return m ? `${h}:${String(m).padStart(2, "0")} ${ap}` : `${h} ${ap}`;
  }
  function fmtIn(ms) {
    const m = Math.round(ms / 60000);
    if (m < 1) return "now";
    if (m < 60) return `in ${m} minute${m === 1 ? "" : "s"}`;
    const h = Math.floor(m / 60), r = m % 60;
    return `in ${h} hour${h === 1 ? "" : "s"}${r ? ` ${r} min` : ""}`;
  }

  async function api(method, url, body) {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}d=${localISO()}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify({ ...body, d: localISO() }) : undefined,
      credentials: "same-origin",
    });
    if (res.status === 401) { showSignin(); throw new Error("signin"); }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  // ---------------- places and glyphs ----------------
  const PLACES = [
    { name: "Skyline", x: 90, glyph: "g-transit" },
    { name: "Airport", x: 230, glyph: "g-travel" },
    { name: "Kalihi", x: 370, glyph: "g-jw" },
    { name: "Kakaako", x: 510, glyph: "g-medicare" },
    { name: "Kahala", x: 650, glyph: "g-tax" },
    { name: "Hawaii Kai", x: 770, glyph: "g-tech" },
  ];
  const HOME = { name: "Home", x: 420, y: 52, glyph: "g-home" };
  const glyphOf = (place) => (place === "Home" ? HOME.glyph : (PLACES.find((p) => p.name === place) || PLACES[0]).glyph);
  function glyph(place, cls = "gl") {
    const svg = s("svg", { class: cls, "aria-hidden": "true" });
    svg.append(s("use", { href: "#" + glyphOf(place) }));
    return svg;
  }

  // ---------------- areas ----------------
  // The four main areas sit above the places: a place is where a thing lives on the drive,
  // an area is which part of life it belongs to. Claude sets Area; older rows fall back to Place.
  const AREAS = [
    { name: "CPA", glyph: "g-tax", cls: "a-cpa" },
    { name: "Medicare", glyph: "g-medicare", cls: "a-med" },
    { name: "Personal", glyph: "g-person", cls: "a-per" },
    { name: "Money", glyph: "g-money", cls: "a-mon" },
  ];
  const areaOf = (it) => it.area && AREAS.some((a) => a.name === it.area) ? it.area : (it.place === "Kahala" ? "CPA" : it.place === "Kakaako" ? "Medicare" : "Personal");
  const areaDef = (name) => AREAS.find((a) => a.name === name) || AREAS[2];
  function areaChip(name, withLabel = true) {
    const a = areaDef(name);
    return h("span", { class: "area " + a.cls, title: a.name }, glyphSvg(a.glyph), withLabel ? a.name : null);
  }
  let areaFilter = null;

  // ---------------- state ----------------
  let B = null;         // { day, items }
  let selKey = null;    // selected item id (desktop)
  let nowIdx = 0;       // position in the Now sequence
  let offlineAt = null;
  const isDesk = () => window.matchMedia("(min-width: 980px)").matches;
  const passOf = () => {
    const q = new URLSearchParams(location.search).get("pass");
    if (q) return q[0].toUpperCase() + q.slice(1).toLowerCase();
    if (B && B.day && B.day.pass === "Evening") return "Evening";
    if (B && B.day && B.day.date === localISO() && new Date().getHours() >= 19) return "Evening";
    return (B && B.day && B.day.pass) || "Morning";
  };
  const needs = () => B.items.filter((i) => i.list === "Needs attention").sort((a, b) => a.order - b.order);
  const resolved = () => B.items.filter((i) => i.list === "Resolved").sort((a, b) => a.order - b.order);
  const openNeeds = () => needs().filter((i) => i.status !== "Closed");
  const events = () => ((B.day && B.day.events) || []).map((e) => ({ ...e, s: new Date(e.start), e: new Date(e.end) })).filter((e) => !isNaN(e.s));

  // ---------------- sign in ----------------
  function showSignin(msg) {
    $("#app").hidden = true;
    $("#signin").hidden = false;
    if (msg) $("#signinMsg").textContent = msg;
  }
  $("#signinForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = $("#email").value.trim();
    if (!email) return;
    await fetch("/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => {});
    $("#signinMsg").textContent = "If that address is the one on file, a link is on its way. It works once, for fifteen minutes.";
    $("#email").value = "";
  });

  // ---------------- terrain ----------------
  function drawTerrain() {
    const W = 840, H = 170, BASE = 128, START = 6, END = 24;
    const evs = events().filter((e) => localISO(e.s) === B.day.date);
    const xOf = (d) => {
      const hrs = d.getHours() + d.getMinutes() / 60;
      return ((Math.min(Math.max(hrs, START), END) - START) / (END - START)) * W;
    };
    const shapeScale = B.day.shape === "Heavy" ? 1.35 : B.day.shape === "Open" ? 0.6 : 1;
    const bumps = evs.filter((e) => !e.optional).map((e) => {
      const x1 = xOf(e.s), x2 = xOf(e.e);
      return { c: (x1 + x2) / 2, w: Math.max(28, (x2 - x1) / 1.4), a: (16 + 10 * (e.weight || 1)) * shapeScale };
    });
    const yAt = (x) => BASE - bumps.reduce((acc, b) => acc + b.a * Math.exp(-((x - b.c) ** 2) / (2 * b.w * b.w)), 0) + Math.sin(x / 47) * 1.2;
    const pts = [];
    for (let x = 0; x <= W; x += 6) pts.push([x, yAt(x)]);
    const path = (from, to) => {
      const p = pts.filter(([x]) => x >= from && x <= to);
      if (!p.length) return "";
      return "M " + p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ");
    };

    const today = B.day.date === localISO();
    const nowX = today && passOf() !== "Morning" ? xOf(new Date()) : null;
    const svg = s("svg", { class: "terrain", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": terrainLabel(evs) });
    const common = { fill: "none", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" };
    if (nowX != null && nowX > 0) {
      svg.append(s("path", { ...common, stroke: "#B4B3A8", d: path(0, nowX) }));
      svg.append(s("path", { ...common, stroke: "#2E2C27", d: path(nowX - 6, W) }));
    } else svg.append(s("path", { ...common, stroke: "#2E2C27", d: path(0, W) }));

    // motif: one clay sun where the day opens up
    const sun = ((B.day.motifs || []).find((m) => m.kind === "sun"));
    if (sun) {
      const sx = sun.at === "evening" ? 700 : sun.at === "morning" ? 140 : 420;
      const g = s("g", { fill: "none", stroke: "#C6613F", "stroke-width": "1.5", "stroke-linecap": "round" });
      g.append(s("circle", { cx: sx, cy: 60, r: 12 }));
      g.append(s("path", { d: `M${sx} 37 V30 M${sx} 90 V83 M${sx - 23} 60 H${sx - 30} M${sx + 30} 60 H${sx + 23} M${sx - 16} 44 L${sx - 21} 39 M${sx + 16} 76 L${sx + 21} 81 M${sx + 16} 44 L${sx + 21} 39 M${sx - 16} 76 L${sx - 21} 81` }));
      svg.append(g);
    }
    // meeting dots, on the line
    for (const e of evs) {
      const cx = (xOf(e.s) + xOf(e.e)) / 2;
      const past = nowX != null && cx < nowX;
      const r = e.optional ? 5 : Math.min(13, 6 + 2.5 * (e.weight || 1));
      svg.append(s("circle", { cx: cx.toFixed(1), cy: yAt(cx).toFixed(1), r, fill: e.optional || past ? "#B4B3A8" : "#2E2C27" }));
    }
    if (nowX != null && nowX > 0 && nowX < W) svg.append(s("circle", { cx: nowX.toFixed(1), cy: yAt(nowX).toFixed(1), r: 5, fill: "#2E2C27" }));
    return svg;
  }
  function terrainLabel(evs) {
    if (!evs.length) return "Today drawn as a nearly level line: nothing on the calendars.";
    return "Today drawn as terrain: " + evs.map((e) => `${e.optional ? "optional " : ""}${e.title} at ${fmtTime(e.s)}`).join(", ") + ".";
  }

  // ---------------- place map ----------------
  // Claude writes a two-or-three-word Map label; fall back to the title's opening words.
  const WEAK = new Set(["a", "an", "the", "is", "are", "was", "has", "have", "for", "to", "of", "and", "behind", "with", "still", "your", "you", "nobody"]);
  function shortLabel(it) {
    if (it.mapLabel) return it.mapLabel;
    let w = String(it.title || "").replace(/[,.;:—–]+.*$/, "").split(/\s+/).slice(0, 3);
    while (w.length > 1 && WEAK.has(w[w.length - 1].toLowerCase())) w.pop();
    return w.join(" ");
  }
  function drawMap(items, evening) {
    const H = evening ? 250 : 300;
    const svg = s("svg", { viewBox: `0 0 840 ${H}`, role: "img", "aria-label": B.day.mapCaption || "Where the open items sit on the drive." });
    const font = "-apple-system,'Segoe UI',sans-serif";
    svg.append(s("line", { x1: 40, y1: 140, x2: 800, y2: 140, stroke: "#2E2C27", "stroke-width": 1.5, "stroke-linecap": "round" }));
    svg.append(s("line", { x1: 330, y1: 52, x2: 510, y2: 52, stroke: "#E4E3DC", "stroke-width": 1, "stroke-dasharray": "4 5" }));
    const at = (name) => items.filter((i) => i.place === name);
    const node = (p, cx, cy, labelY, list) => {
      const live = list.length > 0;
      const color = live ? "#2E2C27" : "#B4B3A8";
      const g = s("g", { color });
      g.append(s("use", { href: "#" + p.glyph, x: cx - 9, y: labelY - 30, width: 18, height: 18 }));
      svg.append(g);
      svg.append(live
        ? s("circle", { cx, cy, r: Math.min(10, 5 + list.length), fill: "#2E2C27" })
        : s("circle", { cx, cy, r: 4, fill: "none", stroke: "#B4B3A8", "stroke-width": 1.5 }));
      svg.append(s("text", { x: cx, y: labelY, "text-anchor": "middle", "font-family": font, "font-size": 11, "letter-spacing": 1, fill: color }, p.name.toUpperCase()));
      if (!live) return;
      const r = Math.min(10, 5 + list.length);
      const up = cy < 100; // Home sits above the corridor; its items list sideways
      if (up) {
        list.slice(0, 2).forEach((it, i) => svg.append(s("text", { x: cx + 18, y: cy + 4 + i * 16, "font-family": font, "font-size": 11.5, fill: "#6B6A63" }, shortLabel(it))));
        return;
      }
      svg.append(s("line", { x1: cx, y1: cy + r, x2: cx, y2: cy + r + 8, stroke: "#B4B3A8", "stroke-width": 1 }));
      const show = list.slice(0, evening ? 3 : 5);
      show.forEach((it, i) => svg.append(s("text", { x: cx, y: cy + r + 24 + i * 18, "text-anchor": "middle", "font-family": font, "font-size": 11.5, fill: "#6B6A63" }, shortLabel(it))));
      if (list.length > show.length) svg.append(s("text", { x: cx, y: cy + r + 24 + show.length * 18, "text-anchor": "middle", "font-family": font, "font-size": 11.5, fill: "#B4B3A8" }, `and ${list.length - show.length} more`));
    };
    node(HOME, HOME.x, HOME.y, 38, at("Home"));
    for (const p of PLACES) node(p, p.x, 140, 122, at(p.name));
    return svg;
  }

  // ---------------- item pieces ----------------
  function sentence(it) {
    const p = h("p", { class: "sen" });
    const txt = it.sentence || "";
    const ph = it.sourcePhrase;
    const url = safeUrl(it.link);
    const i = ph && url ? txt.indexOf(ph) : -1;
    if (i < 0) { p.textContent = txt; return p; }
    p.append(txt.slice(0, i), ext(h("a", { href: url, text: ph })), txt.slice(i + ph.length));
    return p;
  }
  function titleEl(it) {
    const url = safeUrl(it.link);
    const el = url ? ext(h("a", { class: "ttl", href: url })) : h("span", { class: "ttl" });
    el.append(document.createTextNode(it.title || ""));
    return el;
  }

  function saver(fn, savedEl) {
    const go = debounce(async (v) => {
      try { await fn(v); if (savedEl) { savedEl.textContent = "Saved"; setTimeout(() => (savedEl.textContent = ""), 1600); } }
      catch { if (savedEl) savedEl.textContent = "Not saved — offline?"; }
    }, 700);
    return go;
  }
  function grow(el) { el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px"; }

  async function patchItem(it, fields) {
    Object.assign(it, fields);
    const upd = await api("PATCH", `/api/item/${it.id}`, { ...fields, dayId: B.day.id });
    Object.assign(it, upd);
    cache();
    refreshChanges();
    return upd;
  }

  // ---------------- TODAY ----------------
  function renderToday() {
    const pane = $("#paneToday");
    pane.replaceChildren();
    if (!B || !B.day) {
      pane.append(h("div", { class: "band-top" }, h("div", { class: "wrap" }, h("h1", { class: "head", text: "No brief yet today." }), h("p", { text: "It appears here as soon as the morning run writes it." }))));
      return;
    }
    const pass = passOf();
    const evening = pass === "Evening";
    const d = new Date(B.day.date + "T12:00:00");
    const dayline = d.toLocaleDateString("en-US", { weekday: "long" }) + " · " + d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).replace(",", "") + (pass !== "Morning" ? " · " + fmtTime(new Date()) : "");

    // top band
    const top = h("div", { class: "wrap" });
    top.append(h("div", { class: "toprow" },
      h("p", { class: "daydate", text: dayline }),
      h("span", null,
        isDesk() ? h("button", { class: "readaloud focusbar", onclick: () => toggleFocus(true), text: "Focus", title: "Focus (f)" }) : null,
        isDesk() ? " · " : null,
        h("button", { class: "readaloud", onclick: readAloud, id: "readBtn", text: "Read aloud" }))));
    if (offlineAt) top.append(h("p", { class: "offline", text: `Offline — this is the brief as of ${fmtTime(new Date(offlineAt))}.` }));
    top.append(h("h1", { class: "head", text: B.day.headline || "" }));
    if (!evening) {
      top.append(drawTerrain());
      const acts = h("div", { class: "acts" });
      for (const a of (B.day.acts || []).slice(0, 3)) acts.append(h("div", { class: "act" }, h("span", { class: "t", text: a.time }), h("p", { text: a.text })));
      top.append(acts);
    }
    pane.append(h("div", { class: "band-top" }, top));

    // bottom band
    const bot = h("div", { class: "wrap" });
    const open = openNeeds();
    bot.append(h("div", { class: "mapblock" },
      h("h2", { class: "sec", text: evening ? "Where the rest of it sits" : "Where today sits" }),
      h("figure", null, h("div", { class: "map-scroll" }, drawMap(open, evening)), h("figcaption", { text: B.day.mapCaption || "" }))));

    if (evening) bot.append(renderEveningList());
    else {
      const n = needs(), r = resolved();
      if (!n.length && !r.length) bot.append(h("p", { class: "calm", text: "Nothing needs you this morning." }));
      if (n.length) {
        bot.append(areaStrip(n));
        const shown = areaFilter ? n.filter((it) => areaOf(it) === areaFilter) : n;
        shown.numbers = shown.map((it) => n.indexOf(it));
        bot.append(h("div", { class: "blk" }, h("h2", { class: "sec", text: areaFilter ? `Needs attention · ${areaFilter}` : "Needs attention" }),
          shown.length ? listOf(shown, true) : h("p", { class: "quiet", text: `Nothing open in ${areaFilter}.` })));
      }
      if (r.length) bot.append(h("div", { class: "blk" }, h("h2", { class: "sec", text: "Resolved" }), listOf(r, false)));
      bot.append(renderIntentions(pass));
    }
    if (!isDesk()) bot.append(renderChanges());
    pane.append(h("div", null, bot));
  }

  function areaStrip(items) {
    const strip = h("div", { class: "areas", role: "group", "aria-label": "Filter by area" });
    for (const a of AREAS) {
      const open = items.filter((it) => it.status !== "Closed" && areaOf(it) === a.name).length;
      const b = h("button", { class: "areatile " + a.cls + (open ? "" : " empty"), "aria-pressed": String(areaFilter === a.name) },
        glyphSvg(a.glyph), h("span", { class: "an", text: a.name }), h("span", { class: "ac", text: String(open) }));
      b.addEventListener("click", () => { areaFilter = areaFilter === a.name ? null : a.name; rerenderListOnly(); });
      strip.append(b);
    }
    return strip;
  }

  function listOf(items, live) {
    const ol = h("ol", { class: "items" });
    items.forEach((it, idx) => {
      const closed = it.status === "Closed" && live;
      const li = h("li", { "data-id": it.id, class: (closed ? "closed " : "") + (selKey === it.id ? "sel" : "") });
      li.append(h("span", { class: "num", text: String((items.numbers ? items.numbers[idx] : idx) + 1) }));
      const body = h("div", { class: "body" }, h("p", { class: "itemmeta" }, areaChip(areaOf(it)), h("span", { class: "quiet", text: it.place })), titleEl(it), sentence(it));
      if (it.note) body.append(h("p", { class: "mynote", text: it.note }));
      if (live && !closed && !isDesk()) body.append(inlineTools(it, body));
      li.append(body);
      if (live && isDesk()) li.addEventListener("click", (ev) => { if (ev.target.closest("a")) return; select(it.id); });
      ol.append(li);
    });
    return ol;
  }

  // phone: a quiet "Note · Done" row that opens a note field under the item
  function inlineTools(it, body) {
    const row = h("div", { class: "itemtools" });
    const noteBtn = h("button", { text: it.note ? "Edit note" : "Note" });
    const doneBtn = h("button", { text: "Done" });
    noteBtn.addEventListener("click", () => {
      if (body.querySelector("textarea")) return;
      const ta = h("textarea", { class: "note", rows: 1, placeholder: "Note to self…" });
      ta.value = it.note || "";
      const saved = h("div", { class: "saved" });
      const save = saver((v) => patchItem(it, { note: v }), saved);
      ta.addEventListener("input", () => { grow(ta); save(ta.value); });
      row.before(ta, saved);
      grow(ta); ta.focus();
    });
    doneBtn.addEventListener("click", async () => { await patchItem(it, { status: "Closed" }); renderAll(); });
    row.append(noteBtn, doneBtn);
    return row;
  }

  function renderIntentions(pass) {
    const box = h("div", { class: "writeins" });
    box.append(h("h2", { class: "sec", text: "Intentions for today" }));
    if (pass === "Afternoon" && B.day.intentions) box.append(h("p", { class: "prior", text: B.day.intentions }));
    const ta = h("textarea", { class: "big", placeholder: pass === "Afternoon" ? "What the rest of today is for…" : "What today is for…" });
    ta.value = pass === "Afternoon" ? "" : (B.day.intentions || "");
    const saved = h("div", { class: "saved" });
    const save = saver(async (v) => { B.day.intentions = v; await api("PATCH", `/api/day/${B.day.id}`, { intentions: v }); cache(); refreshChanges(); }, saved);
    ta.addEventListener("input", () => save(ta.value));
    box.append(ta, saved);
    return box;
  }

  // ---------------- EVENING ----------------
  function renderEveningList() {
    const wrap = h("div", { class: "blk" }, h("h2", { class: "sec", text: "What moves" }));
    const ol = h("ol", { class: "items" });
    openNeeds().forEach((it, i) => {
      const li = h("li", { "data-id": it.id, class: selKey === it.id ? "sel" : "" });
      li.append(h("span", { class: "num", text: String(i + 1) }));
      const body = h("div", { class: "body" });
      body.append(h("p", { class: "itemmeta" }, areaChip(areaOf(it)), h("span", { class: "quiet", text: it.place })));
      body.append(h("span", { class: "ttl", text: it.title }));
      const carried = it.carries > 0 ? `Carried ${it.carries} day${it.carries === 1 ? "" : "s"}.` : "New today.";
      body.append(h("p", { class: "carry", text: `${carried} ${firstSentence(it.sentence)}` }));
      body.append(choiceRow(it));
      li.append(body);
      if (isDesk()) li.addEventListener("click", (ev) => { if (ev.target.closest("button,a")) return; select(it.id); });
      ol.append(li);
    });
    wrap.append(ol);

    // one log line
    const logBox = h("div", { class: "writeins" });
    const inp = h("input", { class: "miss", placeholder: "Worth remembering about today — or leave it blank" });
    inp.value = B.day.log || "";
    const saved = h("div", { class: "saved" });
    const save = saver(async (v) => { B.day.log = v; await api("PATCH", `/api/day/${B.day.id}`, { log: v }); cache(); refreshChanges(); }, saved);
    inp.addEventListener("input", () => save(inp.value));
    logBox.append(inp, saved);
    wrap.append(logBox);
    if (B.day.tomorrow) wrap.append(h("p", { class: "opens", text: B.day.tomorrow }));
    return wrap;
  }
  const firstSentence = (t) => { const m = String(t || "").match(/^.*?[.!?](\s|$)/); return m ? m[0].trim() : String(t || ""); };
  function choiceRow(it) {
    const row = h("div", { class: "choices", role: "group", "aria-label": "Where it goes" });
    for (const c of ["Tomorrow", "This week", "Let go"]) {
      const b = h("button", { "aria-pressed": String(it.decision === c), text: c });
      b.addEventListener("click", async () => {
        const next = it.decision === c ? null : c;
        row.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.textContent === next)));
        try { await patchItem(it, { decision: next }); } catch { b.setAttribute("aria-pressed", "false"); }
        if (isDesk()) renderAside();
      });
      row.append(b);
    }
    return row;
  }

  // ---------------- NOW ----------------
  function nowSequence() {
    const seq = [];
    const t = Date.now();
    const evs = events().filter((e) => e.e.getTime() > t).sort((a, b) => a.s - b.s);
    if (evs[0]) seq.push({ kind: "event", ev: evs[0] });
    for (const it of openNeeds()) seq.push({ kind: "item", it });
    return seq;
  }
  function renderNow() {
    const pane = $("#paneNow");
    pane.replaceChildren();
    const box = h("div", { class: "now" });
    const w = h("div", { class: "wrap" });
    box.append(w);
    pane.append(box);
    if (!B || !B.day) { w.append(h("p", { class: "now-empty", text: "Nothing yet. The brief lands here in the morning." })); return; }
    const rec = renderRecommendation();
    if (rec) { box.classList.add("has-rec"); pane.append(rec); }
    const seq = nowSequence();
    if (!seq.length) { w.append(h("p", { class: "now-empty", text: "Nothing is waiting on you. The rest of today is yours." })); return; }
    nowIdx = Math.max(0, Math.min(nowIdx, seq.length - 1));
    const cur = seq[nowIdx];

    if (cur.kind === "event") {
      const e = cur.ev, t = Date.now();
      const running = e.s.getTime() <= t;
      w.append(h("p", { class: "now-kicker" }, glyphSvg("g-clock"), running ? `Until ${fmtTime(e.e)}` : `${fmtTime(e.s)} · ${fmtIn(e.s.getTime() - t)}`));
      w.append(h("h1", { class: "now-title", text: e.title }));
      if (e.where) w.append(h("p", { class: "now-sub", text: e.where }));
      const nextItem = seq.find((x) => x.kind === "item");
      if (nextItem) w.append(h("p", { class: "now-then" }, h("span", { class: "quiet", style: "margin-right:8px", text: running ? "After this" : "Before it" }), h("b", { text: nextItem.it.title })));
    } else {
      const it = cur.it;
      w.append(h("p", { class: "now-kicker" }, areaChip(areaOf(it)), h("span", { class: "quiet", text: "· " + it.place })));
      w.append(h("h1", { class: "now-title", text: it.title }));
      w.append(sentence(it));
      if (it.carries > 1) w.append(h("p", { class: "now-carry", text: `Carried ${it.carries} days.` }));
      const ta = h("textarea", { class: "note", rows: 1, placeholder: "Note to self…", style: "margin-top:18px" });
      ta.value = it.note || "";
      const saved = h("div", { class: "saved" });
      const save = saver((v) => patchItem(it, { note: v }), saved);
      ta.addEventListener("input", () => { grow(ta); save(ta.value); });
      w.append(ta, saved);
      setTimeout(() => grow(ta), 0);
    }

    const ctl = h("div", { class: "now-ctl" });
    if (cur.kind === "item") ctl.append(h("button", { text: "Done", onclick: async () => { await patchItem(cur.it, { status: "Closed" }); renderAll(); } }));
    if (nowIdx > 0) ctl.append(h("button", { text: "← Back", onclick: () => { nowIdx--; renderNow(); } }));
    if (nowIdx < seq.length - 1) ctl.append(h("button", { text: "Next →", onclick: () => { nowIdx++; renderNow(); } }));
    ctl.append(h("span", { class: "pos", text: `${nowIdx + 1} of ${seq.length}` }));
    if (isDesk()) ctl.append(h("button", { text: "Close", onclick: () => toggleFocus(false) }));
    w.append(ctl);
  }

  // ---------------- AI recommendation ----------------
  // The brief run writes one recommendation into the day's JSON:
  // { title, why, area, claude: "yes"|"partly"|"no", claudeDoes, youDo, prompt, mindmap: { center, branches: [{ label, items: [] }] } }
  const CLAUDE_SAYS = { yes: "Claude can do this", partly: "Claude can do part of it", no: "This one needs you" };
  function renderRecommendation() {
    const r = B && B.day && B.day.recommendation;
    if (!r || !r.title) return null;
    const box = h("section", { class: "rec", "aria-label": "AI recommendation" });
    const w = h("div", { class: "wrap" });
    box.append(w);
    w.append(h("h2", { class: "sec rec-sec" }, glyphSvg("g-spark"), "AI recommendation"));
    const card = h("div", { class: "rec-card" });
    if (r.area) card.append(h("p", { class: "itemmeta" }, areaChip(r.area)));
    card.append(h("h3", { class: "rec-title", text: r.title }));
    if (r.why) card.append(h("p", { class: "rec-why", text: r.why }));
    const who = CLAUDE_SAYS[r.claude] ? r.claude : "no";
    card.append(h("p", { class: "rec-badge rb-" + who, text: CLAUDE_SAYS[who] }));
    const dl = h("dl", { class: "rec-split" });
    if (r.claudeDoes && who !== "no") dl.append(h("dt", { text: "Claude" }), h("dd", { text: r.claudeDoes }));
    if (r.youDo) dl.append(h("dt", { text: "You" }), h("dd", { text: r.youDo }));
    if (dl.childNodes.length) card.append(dl);
    if (who !== "no") {
      const prompt = r.prompt || `Please take care of this for me: ${r.title}. ${r.claudeDoes || ""} Read the barayuga-notion skill first, and tell me what is left for me when you're done.`;
      card.append(h("div", { class: "row" }, ext(h("a", { class: "btn", href: "https://claude.ai/new?q=" + encodeURIComponent(prompt), text: who === "yes" ? "Have Claude do it" : "Have Claude start it" }))));
    }
    w.append(card);
    if (r.mindmap && r.mindmap.center && Array.isArray(r.mindmap.branches) && r.mindmap.branches.length) {
      w.append(h("h2", { class: "sec rec-sec", text: "The plan" }));
      w.append(mindmap(r.mindmap));
    }
    return box;
  }

  // A small left-to-right mind map: the goal, up to four branches, up to three steps each.
  // Laid out with HTML so labels wrap naturally; the connectors are drawn after layout.
  function mindmap(m) {
    const root = h("div", { class: "mm" });
    const svg = s("svg", { class: "mm-lines", "aria-hidden": "true" });
    const center = h("div", { class: "mm-center", text: m.center });
    const col = h("div", { class: "mm-branches" });
    const nodes = [];
    for (const b of m.branches.slice(0, 4)) {
      const node = h("div", { class: "mm-node", text: b.label || "" });
      const leaves = h("ul", { class: "mm-leaves" }, (b.items || []).slice(0, 3).map((t) => h("li", { text: t })));
      col.append(h("div", { class: "mm-branch" }, node, leaves));
      nodes.push(node);
    }
    root.append(svg, center, col);
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", `Plan: ${m.center}. ` + m.branches.slice(0, 4).map((b) => `${b.label}: ${(b.items || []).join(", ")}`).join(". "));
    const draw = () => {
      if (!root.isConnected) return;
      const R = root.getBoundingClientRect(), C = center.getBoundingClientRect();
      svg.setAttribute("width", R.width); svg.setAttribute("height", R.height);
      svg.replaceChildren();
      const x1 = C.right - R.left, y1 = C.top - R.top + C.height / 2;
      for (const n of nodes) {
        const N = n.getBoundingClientRect();
        const x2 = N.left - R.left, y2 = N.top - R.top + N.height / 2, mx = (x1 + x2) / 2;
        svg.append(s("path", { d: `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`, fill: "none", stroke: "#B4B3A8", "stroke-width": 1.5 }));
      }
    };
    requestAnimationFrame(draw);
    if ("ResizeObserver" in window) new ResizeObserver(() => draw()).observe(root);
    return root;
  }
  function glyphSvg(id) { const v = s("svg", { class: "gl", "aria-hidden": "true" }); v.append(s("use", { href: "#" + id })); return v; }

  // ---------------- CAPTURE ----------------
  function renderCapture(target) {
    const host = target || $("#paneCapture");
    host.replaceChildren();
    const w = target ? h("div") : h("div", { class: "wrap" });
    w.append(h("h2", { class: "sec", text: "Anything I missed" }));
    const inp = h("input", { class: "miss", placeholder: "Type it and press Enter", autocomplete: "off", enterkeyhint: "done", id: target ? "deskCapture" : "phoneCapture" });
    const list = h("ul", { class: "added" });
    const key = "captures:" + localISO();
    const draw = () => { list.replaceChildren(...(store.get(key) || []).map((c) => h("li", null, c.text, c.ok ? null : h("span", { class: "quiet", text: "not filed yet" })))); };
    inp.addEventListener("keydown", async (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      const text = inp.value.trim();
      if (!text) return;
      inp.value = "";
      const all = store.get(key) || [];
      const entry = { text, ok: false };
      all.push(entry); store.set(key, all); draw();
      try { await api("POST", "/api/capture", { text, dayId: B && B.day ? B.day.id : null }); entry.ok = true; store.set(key, all); draw(); refreshChanges(); }
      catch {}
    });
    w.append(inp, list);
    if (!target) w.append(h("p", { class: "quiet", style: "margin-top:26px", text: "Each line becomes a QuickAction in Notion, due today." }));
    host.append(w);
    draw();
  }

  // ---------------- changes → Send to Claude ----------------
  function claudeLink() {
    const lines = (B.day.edits || "").split("\n").filter(Boolean);
    const prompt =
`In Oggi I made these changes since the ${String(B.day.pass || "morning").toLowerCase()} brief on ${B.day.date}. They are already saved in Notion (Brief Days → "Edits since brief" for ${B.day.date}, and the Brief Items rows).

${lines.map((l) => "- " + l.replace(/^\d\d:\d\dZ\s*/, "")).join("\n")}

Please read the barayuga-notion skill, then act on them: make sure each capture is a QuickAction, that each QuickAction's due date matches the choice I made, and that my notes are carried into the next brief. Tell me in a few lines what you changed, then clear "Edits since brief".`;
    return "https://claude.ai/new?q=" + encodeURIComponent(prompt);
  }
  function renderChanges() {
    const box = h("div", { class: "changes", id: "changes" });
    const lines = (B && B.day && B.day.edits ? B.day.edits.split("\n").filter(Boolean) : []);
    box.append(h("h2", { class: "sec", text: "Changes since the brief" }));
    if (!lines.length) { box.append(h("p", { class: "quiet", text: "Nothing changed yet. Notes, choices and captures will list here." })); return box; }
    box.append(h("ul", null, lines.slice(-12).map((l) => h("li", { text: l.replace(/^\d\d:\d\dZ\s*/, "") }))));
    const send = ext(h("a", { class: "btn", href: claudeLink(), text: "Send to Claude" }));
    const clear = h("button", { class: "textlink", text: "Clear the list" });
    clear.addEventListener("click", async () => { await api("POST", "/api/edits/clear", { dayId: B.day.id }); B.day.edits = ""; cache(); refreshChanges(); });
    box.append(h("div", { class: "row" }, send, clear));
    return box;
  }
  function refreshChanges() {
    // Edits are written server-side; mirror the line locally so the list updates at once.
    api("GET", "/api/brief").then((fresh) => {
      if (!fresh || !fresh.day) return;
      B.day.edits = fresh.day.edits;
      const old = document.getElementById("changes");
      if (old) old.replaceWith(renderChanges());
      cache();
    }).catch(() => {});
  }

  // ---------------- DESKTOP aside ----------------
  function select(id) {
    selKey = id;
    document.querySelectorAll("ol.items li").forEach((li) => li.classList.toggle("sel", li.getAttribute("data-id") === id));
    renderAside();
  }
  function renderAside() {
    if (!isDesk()) return;
    const aside = $("#aside");
    aside.replaceChildren();
    const inner = h("div", { class: "inner" });
    aside.append(inner);
    const it = B && B.items.find((i) => i.id === selKey);
    if (it) {
      inner.append(h("p", { class: "ed-label", text: `Item ${needs().indexOf(it) + 1} · ${it.key || ""}` }));
      const t = h("textarea", { class: "ed-title", rows: 2 });
      t.value = it.title;
      const ts = h("div", { class: "saved" });
      const saveT = saver(async (v) => { await patchItem(it, { title: v }); rerenderListOnly(); }, ts);
      t.addEventListener("input", () => { grow(t); saveT(t.value.trim()); });
      inner.append(t, ts);
      setTimeout(() => grow(t), 0);
      inner.append(sentence(it));

      inner.append(h("div", { class: "ed-row" }, h("p", { class: "ed-label", text: "Note to self" }), (() => {
        const ta = h("textarea", { class: "note", rows: 2, id: "edNote", placeholder: "Note to self…" });
        ta.value = it.note || "";
        const sv = h("div", { class: "saved" });
        const save = saver(async (v) => { await patchItem(it, { note: v }); rerenderListOnly(); }, sv);
        ta.addEventListener("input", () => { grow(ta); save(ta.value); });
        setTimeout(() => grow(ta), 0);
        return h("div", null, ta, sv);
      })()));

      const places = h("div", { class: "places" });
      for (const p of [...PLACES, HOME]) {
        const b = h("button", { "aria-pressed": String(it.place === p.name) }, glyph(p.name), p.name);
        b.addEventListener("click", async () => { await patchItem(it, { place: p.name }); renderAll(); });
        places.append(b);
      }
      const areas = h("div", { class: "places" });
      for (const a of AREAS) {
        const b = h("button", { "aria-pressed": String(areaOf(it) === a.name) }, glyphSvg(a.glyph), a.name);
        b.addEventListener("click", async () => { await patchItem(it, { area: a.name }); renderAll(); });
        areas.append(b);
      }
      inner.append(h("div", { class: "ed-row" }, h("p", { class: "ed-label", text: "Area" }), areas));
      inner.append(h("div", { class: "ed-row" }, h("p", { class: "ed-label", text: "Place" }), places));
      inner.append(h("div", { class: "ed-row" }, h("p", { class: "ed-label", text: it.carries ? `Where it goes · carried ${it.carries} day${it.carries === 1 ? "" : "s"}` : "Where it goes" }), choiceRow(it)));

      const links = h("div", { class: "ed-links" });
      const done = h("button", { class: "textlink", text: it.status === "Closed" ? "Mark open again" : "Mark done" });
      done.addEventListener("click", async () => { await patchItem(it, { status: it.status === "Closed" ? "Open" : "Closed" }); renderAll(); });
      links.append(done);
      if (safeUrl(it.link)) links.append(ext(h("a", { class: "textlink", href: it.link, text: "Open the source" })));
      if (safeUrl(it.task)) links.append(ext(h("a", { class: "textlink", href: it.task, text: "Open the task" })));
      inner.append(h("div", { class: "ed-row" }, links));
      inner.append(h("hr"));
    } else {
      const rec = renderRecommendation();
      if (rec) { rec.classList.add("in-aside"); inner.append(rec, h("hr")); }
      inner.append(h("p", { class: "quiet", style: "margin:0 0 24px", text: "Select an item to edit it, or press j." }));
    }

    const cap = h("div");
    renderCapture(cap);
    inner.append(cap);
    inner.append(renderChanges());
    inner.append(h("hr"));
    inner.append(h("div", { class: "kbd" },
      h("div", null, h("b", { text: "j k" }), "  move through items"),
      h("div", null, h("b", { text: "t" }), "  tomorrow   ", h("b", { text: "w" }), "  this week   ", h("b", { text: "x" }), "  let go"),
      h("div", null, h("b", { text: "d" }), "  done   ", h("b", { text: "n" }), "  note   ", h("b", { text: "c" }), "  capture"),
      h("div", null, h("b", { text: "f" }), "  focus   ", h("b", { text: "r" }), "  read aloud   ", h("b", { text: "esc" }), "  back")));
  }
  function rerenderListOnly() { const y = $("#paneToday").scrollTop; renderToday(); $("#paneToday").scrollTop = y; }

  function toggleFocus(on) {
    document.body.classList.toggle("focus", on);
    if (on) { nowIdx = 0; const seq = nowSequence(); if (selKey) { const i = seq.findIndex((x) => x.kind === "item" && x.it.id === selKey); if (i >= 0) nowIdx = i; } renderNow(); }
  }

  // ---------------- keyboard (desktop) ----------------
  document.addEventListener("keydown", (ev) => {
    if (!isDesk() || !B || !B.day) return;
    const typing = ev.target.closest("input, textarea");
    if (ev.key === "Escape") { if (typing) ev.target.blur(); else if (document.body.classList.contains("focus")) toggleFocus(false); else { selKey = null; renderAll(); } return; }
    if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const list = passOf() === "Evening" ? openNeeds() : needs();
    const i = list.findIndex((x) => x.id === selKey);
    const it = list[i];
    switch (ev.key) {
      case "j": select((list[Math.min(list.length - 1, i + 1)] || {}).id); scrollSel(); break;
      case "k": select((list[Math.max(0, i - 1)] || {}).id); scrollSel(); break;
      case "t": if (it) decide(it, "Tomorrow"); break;
      case "w": if (it) decide(it, "This week"); break;
      case "x": if (it) decide(it, "Let go"); break;
      case "d": if (it) patchItem(it, { status: it.status === "Closed" ? "Open" : "Closed" }).then(renderAll); break;
      case "n": { const n = $("#edNote"); if (n) { ev.preventDefault(); n.focus(); } break; }
      case "c": { const c = $("#deskCapture"); if (c) { ev.preventDefault(); c.focus(); } break; }
      case "f": toggleFocus(!document.body.classList.contains("focus")); break;
      case "r": readAloud(); break;
      default: return;
    }
  });
  function scrollSel() { const li = document.querySelector("li.sel"); if (li) li.scrollIntoView({ block: "nearest" }); }
  async function decide(it, c) { await patchItem(it, { decision: it.decision === c ? null : c }); renderAll(); }

  // ---------------- read aloud ----------------
  function readAloud() {
    const synth = window.speechSynthesis;
    const btn = $("#readBtn");
    if (!synth) return;
    if (synth.speaking) { synth.cancel(); if (btn) btn.textContent = "Read aloud"; return; }
    const parts = [B.day.headline, B.day.mapCaption];
    const open = openNeeds();
    if (passOf() === "Evening") {
      parts.push(open.length ? `${open.length} thing${open.length === 1 ? "" : "s"} to decide on.` : "Nothing to carry.");
      open.forEach((it, i) => parts.push(`${i + 1}. ${it.title}. ${it.carries ? `Carried ${it.carries} days.` : ""}`));
      if (B.day.tomorrow) parts.push(B.day.tomorrow);
    } else {
      if (open.length) parts.push("Needs attention.");
      open.forEach((it, i) => parts.push(`${i + 1}. ${it.title}. ${it.sentence || ""}`));
    }
    const u = new SpeechSynthesisUtterance(parts.filter(Boolean).join("  "));
    u.rate = 1.0;
    u.onend = () => { if (btn) btn.textContent = "Read aloud"; };
    synth.speak(u);
    if (btn) btn.textContent = "Stop reading";
  }

  // ---------------- nav (phone) ----------------
  const panes = $("#panes");
  function go(name, smooth = true) {
    const el = document.querySelector(`.pane[data-pane="${name}"]`);
    if (!el) return;
    panes.scrollTo({ left: el.offsetLeft, behavior: smooth ? "smooth" : "auto" });
    markNav(name);
  }
  function markNav(name) { document.querySelectorAll(".nav button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.go === name))); }
  $("#nav").addEventListener("click", (ev) => { const b = ev.target.closest("button[data-go]"); if (b) go(b.dataset.go); });
  panes.addEventListener("scroll", debounce(() => {
    if (isDesk()) return;
    const i = Math.round(panes.scrollLeft / panes.clientWidth);
    markNav(["now", "today", "capture"][i] || "today");
  }, 60));

  // ---------------- boot ----------------
  function cache() { if (B) store.set("brief", { at: Date.now(), B }); }
  function renderAll() { renderToday(); renderNow(); if (!isDesk()) renderCapture(); renderAside(); }

  async function load() {
    try {
      const fresh = await api("GET", "/api/brief");
      B = fresh; offlineAt = null; cache();
    } catch (e) {
      if (e.message === "signin") return false;
      const c = store.get("brief");
      if (!c) throw e;
      B = c.B; offlineAt = c.at;
    }
    return true;
  }

  async function boot() {
    const p = new URLSearchParams(location.search);
    if (p.get("signin") === "expired") showSignin("That link has expired or was already used. Ask for a new one.");
    let me = { signedIn: false };
    try { me = await (await fetch("/auth/me", { credentials: "same-origin" })).json(); }
    catch { const c = store.get("brief"); if (c) me.signedIn = true; }
    if (!me.signedIn) { showSignin(); return; }
    $("#signin").hidden = true;
    $("#app").hidden = false;
    const ok = await load().catch(() => false);
    if (ok === false && !B) return;
    renderAll();
    if (!isDesk()) go(p.get("view") || "today", false);
    if (isDesk() && p.get("view") === "now") toggleFocus(true);
    // refresh quietly when the app comes back to the foreground
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;
      if (document.activeElement && document.activeElement.closest("input, textarea")) return;
      if (await load().catch(() => false)) renderAll();
    });
    window.matchMedia("(min-width: 980px)").addEventListener("change", renderAll);
    setInterval(() => { if (!document.activeElement || !document.activeElement.closest("input, textarea")) renderNow(); }, 60_000);
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  boot();
})();
