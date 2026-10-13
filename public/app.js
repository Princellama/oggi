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
    if (msg) { $("#pinForm").hidden = true; $("#signinForm").hidden = false; $("#signinMsg").textContent = msg; }
  }
  $("#pinForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const user = $("#user").value.trim(), pin = $("#pin").value.trim();
    if (!user || !pin) return;
    const msg = $("#pinMsg");
    try {
      const r = await fetch("/auth/pin", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ user, pin }) });
      if (r.ok) { $("#pin").value = ""; location.replace("/"); return; }
      msg.textContent = (await r.json().catch(() => ({}))).error || "Sign-in failed.";
    } catch { msg.textContent = "No connection. Try again in a moment."; }
    $("#pin").value = "";
  });
  $("#toEmail").addEventListener("click", () => { $("#pinForm").hidden = true; $("#signinForm").hidden = false; });
  $("#toPin").addEventListener("click", () => { $("#signinForm").hidden = true; $("#pinForm").hidden = false; });

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
    const sun = ((B.day.motifs || []).find((m) => m && (m.kind === "sun" || m === "sun")));
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
  function staleBanner() {
    const d = new Date(B.day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
    return h("div", { class: "stale" },
      h("p", { text: `No brief yet today — this is ${d}'s.` }),
      h("div", { class: "row" },
        ext(h("a", { class: "btn", href: runBriefLink(), text: "Run today's brief" })),
        h("span", { class: "quiet", text: "Then come back and tap Refresh." })));
  }
  function renderToday() {
    const pane = $("#paneToday");
    pane.replaceChildren();
    if (!B || !B.day) {
      pane.append(h("div", { class: "band-top" }, h("div", { class: "wrap" }, h("h1", { class: "head", text: "No brief yet today." }), h("p", { text: "It appears here as soon as the morning run writes it." }),
        h("div", { class: "row" }, ext(h("a", { class: "btn", href: runBriefLink(), text: "Run today's brief" })), h("button", { class: "textlink", onclick: (ev) => refreshNow(ev.currentTarget), text: "Refresh" })))));
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
        h("button", { class: "readaloud", onclick: (ev) => refreshNow(ev.currentTarget), text: "Refresh", title: "Refresh from Notion" }),
        " · ",
        h("button", { class: "readaloud", onclick: readAloud, id: "readBtn", text: "Read aloud" }))));
    if (refreshMsg) top.append(h("p", { class: "offline", text: refreshMsg }));
    if (staleDay()) top.append(staleBanner());
    if (offlineAt) top.append(h("p", { class: "offline", text: `Offline — this is the brief as of ${fmtTime(new Date(offlineAt))}.` }));
    top.append(h("h1", { class: "head", text: B.day.headline || "" }));
    if (!evening) {
      top.append(drawTerrain());
      const acts = h("div", { class: "acts" });
      for (const a of (B.day.acts || []).slice(0, 3)) acts.append(h("div", { class: "act" }, h("span", { class: "t", text: a.time || a.range || "" }), h("p", { text: a.text })));
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
      const body = h("div", { class: "body" }, h("p", { class: "itemmeta" }, areaChip(areaOf(it)), h("span", { class: "quiet", text: it.place }), newBadge(it)), titleEl(it), sentence(it));
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
      body.append(h("p", { class: "itemmeta" }, areaChip(areaOf(it)), h("span", { class: "quiet", text: it.place }), newBadge(it)));
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
    const tmr = typeof B.day.tomorrow === "string" ? B.day.tomorrow : (B.day.tomorrow && B.day.tomorrow.text);
    if (tmr) wrap.append(h("p", { class: "opens", text: tmr }));
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

  // ---------------- NOW: the sky ----------------
  // Every open thing is a star in the constellation of its place on the drive — west to east,
  // Home floating above the corridor. Drag to look around, pinch to zoom; Back / Next (or a tap
  // on a star) fly the camera from star to star; tapping the bright one dives in to the full card.
  const DRIVE = ["Skyline", "Airport", "Kalihi", "Kakaako", "Kahala", "Hawaii Kai", "Home"];
  const SKY_AT = {
    Skyline: [90, 340], Airport: [250, 372], Kalihi: [410, 330], Kakaako: [570, 366],
    Kahala: [730, 328], "Hawaii Kai": [890, 360], Home: [490, 150],
  };
  const EVENT_AT = [170, 210];
  const STAR_TINT = { CPA: "#E8997A", Medicare: "#8CC9A2", Personal: "#E4C06D", Money: "#93B8DE" };
  const EVENT_TINT = "#F4EFE4";
  const DIVE_W = 22;
  const SKY_MIN_W = 160, SKY_MAX_W = 1500;              // how close and how far you can zoom
  const SKY_BOX = { x0: -40, x1: 1020, y0: 60, y1: 520 }; // where the camera may wander
  let glide = 0;
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let nowDrilled = false;
  let cam = null;          // { x, y, w } in sky units
  let camAnim = 0;
  let surfacing = false;   // coming back out of a dive: start close, pull back
  let sky = null;          // the live sky: { el, svg, seq, stars, card, ctl }

  const placeRank = (p) => { const i = DRIVE.indexOf(p); return i < 0 ? 0 : i; };

  // ---------------- NOW: sorting the sky ----------------
  // Three ways to lay the sky out. Drive: the memory-palace map. Timeline: the open items in a
  // line across the day, each at the time it would start, in the order chosen in settings.
  // By area: CPA, Medicare, Money and Personal become suns with their items orbiting them.
  // Preferences, time estimates and effort live on this device only.
  const SKY_MODES = { drive: "Drive", timeline: "Timeline", area: "By area" };
  const ORDERS = {
    priority: ["By priority", "The brief's own order: what it put first, first."],
    easiest: ["Easiest first", "Quick, light things first to get moving."],
    frog: ["Eat that frog", "The hardest, most put-off thing first."],
    shortest: ["Shortest to longest", "By the time each one takes."],
  };
  const AREA_ORDER = ["CPA", "Medicare", "Money", "Personal"];
  const DEF_PREFS = { mode: "drive", order: "priority", start: "", gap: 5, pomo: 25, pomoBreak: 5, est: {}, diff: {} };
  function prefs() { const p = store.get("skyPrefs") || {}; return { ...DEF_PREFS, ...p, est: { ...(p.est || {}) }, diff: { ...(p.diff || {}) } }; }
  function setPrefs(patch) { store.set("skyPrefs", { ...prefs(), ...patch }); }
  // Rough minutes per item, from its title. Anything here can be changed in settings.
  const EST_RULES = [
    [/\bis done\b|waiting on|may not be e-?filed|e-?file status/i, 20],
    [/\breturns?\b|1040|file (his|her|their)? ?taxes|needs to file/i, 120],
    [/season|board|outreach|\baep\b/i, 90],
    [/crash|deploy|\bbug\b|\boggi\b|\bmilo\b/i, 60],
    [/\bplan\b|compar|doctors|network|coverage/i, 45],
    [/refund|adjust|notice|\bname\b/i, 30],
    [/\bcall\b|reply|email|\btext\b|\bask\b|follow up|nudge/i, 15],
    [/password|renew|w-?9|\bsign|card|\bpay|autopay|balance|declined/i, 15],
  ];
  const keyOf = (it) => it.key || it.id;
  function guessEst(it) { for (const [re, m] of EST_RULES) if (re.test(it.title || "")) return m; for (const [re, m] of EST_RULES) if (re.test(it.sentence || "")) return m; return 30; }
  function estOf(it, p = prefs()) { return Number(p.est[keyOf(it)]) || guessEst(it); }
  function guessDiff(it, p) { const m = estOf(it, p); return Math.min(3, (m >= 90 ? 3 : m >= 30 ? 2 : 1) + ((it.carries || 0) >= 7 ? 1 : 0)); }
  function diffOf(it, p = prefs()) { return Number(p.diff[keyOf(it)]) || guessDiff(it, p); }
  function fmtDur(m) { if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} hr ${r}` : `${h} hr`; }
  function orderItems(list, order, p = prefs()) {
    const a = list.slice();
    const tie = (x, y) => x.order - y.order;
    if (order === "easiest") a.sort((x, y) => diffOf(x, p) - diffOf(y, p) || estOf(x, p) - estOf(y, p) || tie(x, y));
    else if (order === "frog") a.sort((x, y) => diffOf(y, p) - diffOf(x, p) || (y.carries || 0) - (x.carries || 0) || estOf(y, p) - estOf(x, p) || tie(x, y));
    else if (order === "shortest") a.sort((x, y) => estOf(x, p) - estOf(y, p) || tie(x, y));
    else a.sort(tie);
    return a;
  }
  function dayStart(p = prefs()) {
    const now = new Date();
    let t = new Date(Math.ceil(now.getTime() / 300000) * 300000);   // the next five minutes
    if (/^\d\d:\d\d$/.test(p.start || "")) {
      const [hh, mm] = p.start.split(":").map(Number);
      const s0 = new Date(now); s0.setHours(hh, mm, 0, 0);
      if (s0 > t) t = s0;
    }
    return t.getTime();
  }
  // Lay the items end to end from the start time, stepping round anything on the calendar.
  function schedule(items, evs, p = prefs()) {
    const gap = (Number(p.gap) || 0) * 60000;
    const busy = evs.map((e) => [e.s.getTime(), e.e.getTime()]);
    let cur = dayStart(p);
    return items.map((it) => {
      const dur = estOf(it, p) * 60000;
      for (let moved = true; moved;) { moved = false; for (const [a, b] of busy) if (a < cur + dur && b > cur) { cur = b; moved = true; } }
      const slot = { it, at: cur, end: cur + dur };
      cur += dur + gap;
      return slot;
    });
  }
  function nowSequence() {
    const p = prefs();
    const t = Date.now();
    const evs = events().filter((e) => e.e.getTime() > t).sort((a, b) => a.s - b.s);
    const open = openNeeds();
    if (p.mode === "timeline") {
      const fixed = evs.filter(blocksTime);
      const slots = schedule(orderItems(open, p.order, p), fixed, p).map((x) => ({ kind: "item", ...x }));
      const evSlots = fixed.map((ev) => ({ kind: "event", ev, at: ev.s.getTime(), end: ev.e.getTime() }));
      return evSlots.concat(slots).sort((a, b) => a.at - b.at);
    }
    const seq = [];
    if (evs[0]) seq.push({ kind: "event", ev: evs[0] });
    if (p.mode === "area") {
      for (const a of AREA_ORDER) for (const it of orderItems(open.filter((i) => areaOf(i) === a), p.order, p)) seq.push({ kind: "item", it });
      return seq;
    }
    // the drive, west to east and Home last; the brief's own order inside a place
    const items = open.slice().sort((a, b) => placeRank(a.place) - placeRank(b.place) || a.order - b.order);
    for (const it of items) seq.push({ kind: "item", it });
    return seq;
  }
  // A calendar entry holds time on the timeline only if it is a real appointment:
  // optional entries and long blocks (a whole port day, an all-day hold) never push the work later.
  const blocksTime = (ev) => !ev.optional && ev.e - ev.s < 4 * 3600000;
  const evKey = (ev) => "ev:" + ev.s.getTime() + ":" + ev.title;
  const seqKey = (x) => (x.kind === "event" ? evKey(x.ev) : x.it.id);

  function hash(str) { let x = 2166136261; for (const c of String(str)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return (x >>> 0) / 4294967296; }
  function rng(seed) { let a = Math.floor(seed * 4294967296) || 1; return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 100000) / 100000; }; }

  // Drive positions depend only on the place and the brief's order, so a star stays put all day:
  // closing one dims it where it stands instead of reshuffling the sky. Every upcoming event gets
  // a star too; the drive shows only the next one, the timeline shows them all.
  function skyStars(seq) {
    const stars = [];
    const all = B.items.filter((i) => i.list === "Needs attention" || i.list === "Resolved");
    const byPlace = {};
    for (const it of all) (byPlace[SKY_AT[it.place] ? it.place : "Skyline"] ||= []).push(it);
    const reach = {};
    for (const [place, list] of Object.entries(byPlace)) {
      const [cx, cy] = SKY_AT[place];
      const rot = hash(place) * Math.PI * 2;
      list.sort((a, b) => (a.list === b.list ? 0 : a.list === "Needs attention" ? -1 : 1) || a.order - b.order);
      list.forEach((it, k) => {
        const r = k === 0 ? 0 : 46 * Math.sqrt(k);
        const a = rot + k * 2.39996;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a) * 0.9;
        stars.push({ kind: "item", it, place, key: it.id, open: false, seqIdx: -1, dx: x, dy: y, x, y });
        reach[place] = Math.max(reach[place] || 0, y - cy);
      });
    }
    const t = Date.now();
    events().filter((e) => e.e.getTime() > t).sort((a, b) => a.s - b.s).forEach((ev, j) => {
      const x = EVENT_AT[0] + j * 64, y = EVENT_AT[1] - j * 18;
      stars.push({ kind: "event", ev, key: evKey(ev), open: false, seqIdx: -1, dx: x, dy: y, x, y });
    });
    remapStars(stars, seq);
    return { stars, reach };
  }
  // Point each star at its place in the sequence (or at nothing, for this layout).
  function remapStars(stars, seq) {
    const idx = new Map();
    seq.forEach((x, i) => idx.set(seqKey(x), i));
    for (const st of stars) {
      st.seqIdx = idx.has(st.key) ? idx.get(st.key) : -1;
      st.open = st.seqIdx >= 0;
      st.slot = st.open ? seq[st.seqIdx] : null;
    }
  }
  const tintOf = (st) => (st.kind === "event" ? EVENT_TINT : STAR_TINT[areaOf(st.it)] || STAR_TINT.Personal);

  function buildSky(seq) {
    const { stars, reach } = skyStars(seq);
    const el = h("div", { class: "sky", role: "group", "aria-label": `Today's sky: ${seq.length} thing${seq.length === 1 ? "" : "s"}, west to east along the drive. Drag to look around, pinch to zoom, or use Back and Next to move; open the bright star for the detail.` });
    const svg = s("svg", { class: "sky-svg" });
    el.append(svg);

    // dust: a fixed field of faint stars, the same every day
    const r = rng(0.4137);
    const dust = s("g", { class: "dust", "aria-hidden": "true" });
    for (let i = 0; i < 190; i++) {
      const c = s("circle", { cx: (-260 + r() * 1520).toFixed(1), cy: (-200 + r() * 860).toFixed(1), r: (0.35 + r() * 0.9).toFixed(2), "fill-opacity": (0.12 + r() * 0.38).toFixed(2) });
      if (i % 7 === 0) { c.setAttribute("class", "tw"); c.style.animationDelay = (r() * 4).toFixed(2) + "s"; }
      dust.append(c);
    }
    svg.append(dust);

    // the drive itself, faint, west to east
    const pts = DRIVE.filter((p) => p !== "Home").map((p) => SKY_AT[p]);
    let d = `M${pts[0][0] - 120} ${pts[0][1] + 10} L${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const mx = (x0 + x1) / 2; d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`; }
    d += ` L${pts[pts.length - 1][0] + 120} ${pts[pts.length - 1][1] - 8}`;
    svg.append(s("path", { class: "road lay-drive", d, "aria-hidden": "true" }));
    svg.append(s("path", { class: "road lay-drive", d: `M${SKY_AT.Home[0] - 110} ${SKY_AT.Home[1] - 6} L${SKY_AT.Home[0] + 110} ${SKY_AT.Home[1] - 6}`, "aria-hidden": "true" }));

    // constellation lines inside each place
    const lines = s("g", { "aria-hidden": "true", class: "lay-drive" });
    for (const place of Object.keys(SKY_AT)) {
      const ps = stars.filter((x) => x.kind === "item" && x.place === place);
      for (const x of ps) { x.dx = x.x; x.dy = x.y; }
      for (let i = 1; i < ps.length; i++) lines.append(s("line", { class: "cline" + (ps[i].open && ps[i - 1].open ? "" : " faint"), x1: ps[i - 1].x.toFixed(1), y1: ps[i - 1].y.toFixed(1), x2: ps[i].x.toFixed(1), y2: ps[i].y.toFixed(1) }));
    }
    svg.append(lines);

    // place names under their constellations
    const labels = s("g", { "aria-hidden": "true", class: "lay-drive" });
    for (const [place, [cx, cy]] of Object.entries(SKY_AT)) {
      const live = stars.some((x) => x.kind === "item" && x.place === place && x.open);
      const g = s("g", { class: "pl" + (live ? " live" : ""), color: "#F4EFE4" });
      const ly = cy + Math.max(0, reach[place] || 0) + 58;
      g.append(s("use", { href: "#" + glyphOf(place), x: cx - 6, y: ly - 21, width: 12, height: 12 }));
      g.append(s("text", { x: cx, y: ly }, place.toUpperCase()));
      if (!reach[place] && reach[place] !== 0) g.append(s("circle", { cx, cy, r: 2.2, class: "ghost" }));
      labels.append(g);
    }
    svg.append(labels);

    // the timeline axis or the suns, redrawn whenever the sky is sorted
    const layer = s("g", { class: "lay-mode", "aria-hidden": "true" });
    svg.append(layer);
    const trails = s("g", { "aria-hidden": "true" });
    svg.append(trails);

    // the stars
    const field = s("g");
    for (const st of stars) {
      const tint = tintOf(st);
      const g = s("g", { class: "star" + (st.kind === "event" ? " ev" : ""), transform: `translate(${st.x.toFixed(1)} ${st.y.toFixed(1)})` });
      const body = s("g", { class: "star-b" });
      body.append(
        s("circle", { class: "halo2", r: 30, fill: tint }),
        s("circle", { class: "halo", r: 18, fill: tint }),
        s("circle", { class: "core", r: 10, fill: tint }));
      if (st.kind === "event") body.append(s("circle", { class: "orbit", r: 15, fill: "none", stroke: tint }));
      g.append(body);
      g.append(s("text", { class: "star-l", y: 17 }, st.kind === "event" ? fmtTime(st.ev.s) : shortLabel(st.it)));
      g.append(s("text", { class: "star-t", y: 28 }));
      st.el = g;
      starState(st);
      field.append(g);
    }
    svg.append(field);

    // tap a dim neighbour to travel to it; tap the bright one to dive in
    let swiped = false, sx = null, sy = null;
    const pick = (ev) => {
      const g = ev.target.closest(".star");
      if (!g && skyFull && !swiped && ev.type === "click") { closeModal(); return; }
      if (!g || swiped) return;
      const st = stars.find((x) => x.el === g);
      if (!st || !st.open || st.gone) return;
      if (skyFull) { if (st.seqIdx === nowIdx) openModal(); else flyTo(st.seqIdx, true); return; }
      if (st.seqIdx === nowIdx) dive(); else flyTo(st.seqIdx);
    };
    svg.addEventListener("click", pick);
    svg.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault(); pick(ev);
    });
    // Look around: drag with one finger to pan (with a little glide when you let go),
    // pinch with two to zoom; the wheel or trackpad does the same on a computer.
    const ptrs = new Map();
    let last = null, vel = { x: 0, y: 0, t: 0 }, pinch = null;
    const unit = () => (cam ? cam.w / (el.clientWidth || 360) : 1);
    const toSky = (px, py) => {
      const rc = el.getBoundingClientRect();
      return { x: cam.x + (px - rc.left - rc.width / 2) * unit(), y: cam.y + (py - rc.top - rc.height / 2) * unit() };
    };
    const zoomAt = (factor, px, py) => {
      if (!cam) return;
      const p = toSky(px, py);
      const w = Math.max(SKY_MIN_W, Math.min(skyMaxW(), cam.w * factor));
      const f = w / cam.w;
      cam = { x: p.x + (cam.x - p.x) * f, y: p.y + (cam.y - p.y) * f, w };
    };
    const startLook = () => { cancelAnimationFrame(camAnim); camAnim = 0; cancelAnimationFrame(glide); glide = 0; };
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button > 0) return;
      startLook();
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size === 1) { swiped = false; sx = ev.clientX; sy = ev.clientY; last = { x: ev.clientX, y: ev.clientY, t: performance.now() }; vel = { x: 0, y: 0, t: last.t }; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); swiped = true; }
    });
    el.addEventListener("pointermove", (ev) => {
      if (!ptrs.has(ev.pointerId) || !cam) return;
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoomAt(pinch / dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = dist;
        clampCam(); setView(); lookedAway();
        return;
      }
      if (!swiped && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!swiped) { swiped = true; try { el.setPointerCapture(ev.pointerId); } catch (e) { /* fine */ } }
      const now = performance.now();
      const dx = ev.clientX - last.x, dy = ev.clientY - last.y, dt = Math.max(1, now - last.t);
      cam = { ...cam, x: cam.x - dx * unit(), y: cam.y - dy * unit() };
      vel = { x: (dx / dt) * 0.6 + vel.x * 0.4, y: (dy / dt) * 0.6 + vel.y * 0.4, t: now };
      last = { x: ev.clientX, y: ev.clientY, t: now };
      clampCam(); setView(); lookedAway();
    });
    const endLook = (ev) => {
      if (!ptrs.has(ev.pointerId)) return;
      ptrs.delete(ev.pointerId);
      if (ptrs.size === 1) { const [p] = [...ptrs.values()]; last = { x: p.x, y: p.y, t: performance.now() }; vel = { x: 0, y: 0, t: last.t }; pinch = null; return; }
      if (ptrs.size) return;
      pinch = null; sx = null;
      if (!swiped || reduceMotion() || performance.now() - vel.t > 80) return;
      // glide to a stop
      let vx = vel.x, vy = vel.y, t0 = performance.now();
      const step = (now) => {
        const dt = now - t0; t0 = now;
        cam = { ...cam, x: cam.x - vx * dt * unit(), y: cam.y - vy * dt * unit() };
        const k = Math.pow(0.994, dt); vx *= k; vy *= k;
        clampCam(); setView();
        glide = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : 0;
      };
      glide = requestAnimationFrame(step);
    };
    el.addEventListener("pointerup", endLook);
    el.addEventListener("pointercancel", endLook);
    el.addEventListener("wheel", (ev) => {
      if (!cam) return;
      ev.preventDefault();
      startLook();
      if (ev.ctrlKey || !ev.deltaX && Math.abs(ev.deltaY) >= 50) zoomAt(Math.exp(ev.deltaY * (ev.ctrlKey ? 0.01 : 0.002)), ev.clientX, ev.clientY);
      else cam = { ...cam, x: cam.x + ev.deltaX * unit(), y: cam.y + ev.deltaY * unit() };
      clampCam(); setView(); lookedAway();
    }, { passive: false });

    // back to the bright star after looking around
    const home = h("button", { class: "sky-home", type: "button", "aria-label": "Back to the bright star", onclick: () => { const st = starFor(nowIdx); if (st) { el.classList.remove("away"); animateCam(restCam(st), 560); } } }, "◎");
    el.append(home);

    el.append(sortControl(), cornerTools());

    if (!isDesk() && !store.get("skyHintSeen") && seq.length > 1) el.append(h("p", { class: "sky-hint", text: "Drag to look around · pinch to zoom · tap a star to go there" }));
    let seenW = 0;
    if ("ResizeObserver" in window) new ResizeObserver(() => {
      if (!(cam && sky && sky.el === el)) return;
      if (!camAnim && el.clientWidth !== seenW && !el.classList.contains("away")) cam = { ...cam, w: restW(el) };
      seenW = el.clientWidth;
      setView();
    }).observe(el);
    return { el, svg, seq, stars, trails, layer };
  }

  // ---- sky layouts ----
  function starState(st) {
    const g = st.el;
    g.classList.toggle("dim", !st.open);
    if (st.open) {
      g.setAttribute("tabindex", "0"); g.setAttribute("role", "button");
      g.setAttribute("aria-label", st.kind === "event" ? `${st.ev.title}, ${fmtTime(st.ev.s)}` : `${st.it.title}, ${st.place}`);
    } else { g.removeAttribute("tabindex"); g.removeAttribute("role"); g.removeAttribute("aria-label"); }
    const tl = g.querySelector(".star-t");
    if (tl) tl.textContent = st.open && st.slot && st.slot.at ? `${fmtTime(new Date(st.slot.at))} · ${fmtDur(Math.round((st.slot.end - st.slot.at) / 60000))}` : "";
  }
  const TL_K = 2.6;     // sky units per minute on the timeline: an hour is 132 units
  const TL_Y = 300;     // where the planets sit; the day's line runs under them
  const TL_AXIS = 372;
  function boxOf(pts, pad) {
    if (!pts.length) return { ...SKY_BOX };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad * 0.6, y1: Math.max(...ys) + pad * 0.6 };
  }
  // Where every star goes in a layout, plus what to draw behind them.
  function layoutFor(mode, stars) {
    const pos = new Map();
    const draw = [];
    if (mode === "timeline") {
      const live = stars.filter((st) => st.open && st.slot && st.slot.at).sort((a, b) => a.slot.at - b.slot.at);
      if (!live.length) return layoutFor("drive", stars);
      const t0 = live[0].slot.at - 30 * 60000;
      const tEnd = Math.max(...live.map((st) => st.slot.end)) + 30 * 60000;
      const X = (t) => 80 + ((t - t0) / 60000) * TL_K;
      let px = -1e9, up = false;
      for (const st of live) {
        const x = X(st.slot.at);
        up = x - px < 92 ? !up : false;   // close neighbours step up and down so labels don't collide
        pos.set(st, { x, y: up ? TL_Y - 64 : TL_Y, show: true });
        px = x;
      }
      for (const st of stars) if (!pos.has(st)) pos.set(st, { x: st.dx, y: st.dy, show: false });
      draw.push((g) => {
        const x0 = X(t0), x1 = X(tEnd);
        g.append(s("line", { class: "tl-axis", x1: x0, y1: TL_AXIS, x2: x1, y2: TL_AXIS }));
        // hour ticks
        const h0 = new Date(t0); h0.setMinutes(0, 0, 0);
        for (let t = h0.getTime() + 3600000; t < tEnd; t += 3600000) {
          const x = X(t);
          g.append(s("line", { class: "tl-tick", x1: x, y1: TL_AXIS - 5, x2: x, y2: TL_AXIS + 5 }));
          g.append(s("text", { class: "tl-hour", x, y: TL_AXIS + 22 }, fmtTime(new Date(t))));
        }
        // now
        const nx = X(Date.now());
        if (nx >= x0 && nx <= x1) {
          g.append(s("line", { class: "tl-now", x1: nx, y1: TL_AXIS - 18, x2: nx, y2: TL_AXIS + 8 }));
          g.append(s("text", { class: "tl-nowl", x: nx, y: TL_AXIS - 24 }, "now"));
        }
        // each block of time, and a thread up to its planet
        for (const st of live) {
          const p = pos.get(st), tint = tintOf(st);
          g.append(s("line", { class: "tl-thread", x1: p.x, y1: p.y + 10, x2: p.x, y2: TL_AXIS, stroke: tint }));
          g.append(s("rect", { class: "tl-block", x: X(st.slot.at), y: TL_AXIS - 3, width: Math.max(4, X(st.slot.end) - X(st.slot.at)), height: 6, rx: 3, fill: tint }));
        }
      });
      const pts = [...live.map((st) => pos.get(st)), { x: X(t0), y: TL_AXIS + 30 }, { x: X(tEnd), y: TL_AXIS + 30 }];
      return { pos, draw, box: boxOf(pts, 140) };
    }
    if (mode === "area") {
      const areas = AREA_ORDER.filter((a) => stars.some((st) => st.open && st.kind === "item" && areaOf(st.it) === a));
      const suns = {}, rings = {};
      areas.forEach((a, i) => { suns[a] = { x: 220 + i * 440, y: 320 }; });
      for (const a of areas) {
        const list = stars.filter((st) => st.open && st.kind === "item" && areaOf(st.it) === a).sort((x, y) => x.seqIdx - y.seqIdx);
        const per = 7;
        list.forEach((st, k) => {
          const ring = Math.floor(k / per), n = Math.min(per, list.length - ring * per);
          const r = 104 + ring * 62;
          const a0 = -Math.PI / 2 + ring * 0.45 + (k % per) * (Math.PI * 2 / n);
          pos.set(st, { x: suns[a].x + r * Math.cos(a0), y: suns[a].y + r * Math.sin(a0) * 0.86, show: true });
          (rings[a] ||= new Set()).add(r);
        });
      }
      let j = 0;
      for (const st of stars) {
        if (pos.has(st)) continue;
        if (st.kind === "event" && st.open) { pos.set(st, { x: 120 + j * 70, y: 120, show: true }); j++; continue; }
        pos.set(st, { x: st.dx, y: st.dy, show: false });
      }
      draw.push((g) => {
        for (const a of areas) {
          const c = suns[a], tint = STAR_TINT[a] || STAR_TINT.Personal;
          for (const r of rings[a] || []) g.append(s("ellipse", { class: "orb-ring", cx: c.x, cy: c.y, rx: r, ry: r * 0.86, stroke: tint }));
          const n = stars.filter((st) => st.open && st.kind === "item" && areaOf(st.it) === a).length;
          const sun = s("g", { class: "sun", transform: `translate(${c.x} ${c.y})` });
          sun.append(s("circle", { class: "sun-glow", r: 74, fill: tint }), s("circle", { class: "sun-halo", r: 44, fill: tint }), s("circle", { class: "sun-core", r: 33, fill: tint }));
          sun.append(s("text", { class: "sun-l", y: 4 }, a.toUpperCase()));
          sun.append(s("text", { class: "sun-n", y: 56 }, `${n} open`));
          g.append(sun);
        }
      });
      return { pos, draw, suns, box: boxOf([...pos.values()].filter((p) => p.show), 160) };
    }
    for (const st of stars) pos.set(st, { x: st.dx, y: st.dy, show: st.kind === "item" || st.open });
    return { pos, draw, box: { ...SKY_BOX } };
  }
  function placeStar(st) { st.el.setAttribute("transform", `translate(${st.x.toFixed(1)} ${st.y.toFixed(1)})`); }
  let starAnim = 0;
  // Lay the sky out for a mode; with `animate`, every star travels to its new place.
  function applyLayout(mode, animate, onDone) {
    if (!sky) return;
    const L = layoutFor(mode, sky.stars);
    sky.el.classList.remove("m-drive", "m-timeline", "m-area");
    sky.el.classList.add("m-" + mode);
    sky.layer.replaceChildren();
    for (const d of L.draw) d(sky.layer);
    sky.layer.classList.remove("fresh"); sky.layer.getBoundingClientRect(); sky.layer.classList.add("fresh");
    sky.box = L.box;
    sky.suns = L.suns || null;
    for (const st of sky.stars) {
      const p = L.pos.get(st);
      st.gone = !p.show;
      st.el.classList.toggle("gone", st.gone);
      st.tx = p.x; st.ty = p.y;
      starState(st);
    }
    cancelAnimationFrame(starAnim); starAnim = 0;
    if (!animate || reduceMotion()) { for (const st of sky.stars) { st.x = st.tx; st.y = st.ty; placeStar(st); } if (onDone) onDone(); return; }
    const from = sky.stars.map((st) => ({ x: st.x, y: st.y }));
    const order = sky.stars.map((st, i) => i).sort((a, b) => (sky.stars[a].seqIdx < 0) - (sky.stars[b].seqIdx < 0) || sky.stars[a].seqIdx - sky.stars[b].seqIdx);
    const delay = new Map(order.map((i, k) => [i, Math.min(k, 16) * 38]));
    const dur = 1050, t0 = performance.now();
    const step = (now) => {
      let done = true;
      sky.stars.forEach((st, i) => {
        const t = Math.max(0, Math.min(1, (now - t0 - delay.get(i)) / dur));
        if (t < 1) done = false;
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        // a gentle arc, so the planets swing into place rather than slide
        const lift = Math.sin(Math.PI * e) * Math.min(60, Math.hypot(st.tx - from[i].x, st.ty - from[i].y) * 0.12);
        st.x = from[i].x + (st.tx - from[i].x) * e;
        st.y = from[i].y + (st.ty - from[i].y) * e - lift;
        placeStar(st);
      });
      if (!done) starAnim = requestAnimationFrame(step);
      else { starAnim = 0; if (onDone) onDone(); }
    };
    starAnim = requestAnimationFrame(step);
  }
  // After a sort, frame enough to read: a stretch of the day around the current planet,
  // or the current planet's sun with its whole orbit.
  function sortCam(mode) {
    const st = starFor(nowIdx);
    const base = restW(sky.el);
    if (mode === "timeline" && st) {
      const w = Math.min(base * 1.7, (sky.box.x1 - sky.box.x0));
      return { x: Math.max(sky.box.x0 + w / 2, Math.min(sky.box.x1 - w / 2, st.tx)), y: (TL_Y + TL_AXIS) / 2 - 18, w };
    }
    if (mode === "area" && st && st.kind === "item" && sky.suns && sky.suns[areaOf(st.it)]) {
      const c = sky.suns[areaOf(st.it)];
      const all = overviewCam();
      const w = Math.max(base * 1.35, 760);
      return all.w <= w * 1.25 ? all : { x: c.x, y: c.y, w };
    }
    return overviewCam();
  }
  function overviewCam() {
    const b = sky.box, el = sky.el;
    const aspect = el.clientWidth && el.clientHeight ? el.clientHeight / el.clientWidth : 0.85;
    const w = Math.max(b.x1 - b.x0, (b.y1 - b.y0) / aspect);
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, w: Math.max(SKY_MIN_W, w) };
  }
  // Re-sort: a new order for Back / Next, every planet flies to its new place, the camera pulls back to show it.
  function resort(mode) {
    if (!sky) { renderNow(); return; }
    setPrefs({ mode });
    const curKey = sky.seq[nowIdx] ? seqKey(sky.seq[nowIdx]) : null;
    const seq = nowSequence();
    sky.seq = seq;
    remapStars(sky.stars, seq);
    const i = curKey ? seq.findIndex((x) => seqKey(x) === curKey) : -1;
    nowIdx = mode === "timeline" ? 0 : i >= 0 ? i : 0;
    markStar(nowIdx);
    fillCtl(); fillCard();
    sky.el.classList.add("away");
    applyLayout(mode, true);
    animateCam(sortCam(mode), 1250);
    const sc = sky.el.querySelector(".sky-sort-b");
    if (sc) sc.textContent = "Sort · " + SKY_MODES[mode];
  }

  // ---- the Sort button, its menu, and the settings sheet ----
  function sortControl() {
    const p = prefs();
    const box = h("div", { class: "sky-sort" });
    const btn = h("button", { class: "sky-sort-b", type: "button", "aria-haspopup": "true", "aria-expanded": "false", text: "Sort · " + SKY_MODES[p.mode] });
    const menu = h("div", { class: "sky-menu", hidden: true, role: "menu" });
    const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    for (const [m, label] of Object.entries(SKY_MODES)) {
      const b = h("button", { type: "button", role: "menuitemradio", "aria-checked": String(p.mode === m) }, label,
        h("span", { class: "sky-menu-sub", text: m === "drive" ? "The map of the drive" : m === "timeline" ? ORDERS[p.order][0] + ", across the day" : "CPA, Medicare, Money, Personal" }));
      b.addEventListener("click", (ev) => { ev.stopPropagation(); close(); menu.querySelectorAll("[role=menuitemradio]").forEach((x) => x.setAttribute("aria-checked", String(x === b))); resort(m); });
      menu.append(b);
    }
    const set = h("button", { type: "button", class: "sky-menu-set", role: "menuitem", text: "Sort settings…" });
    set.addEventListener("click", (ev) => { ev.stopPropagation(); close(); openSortSettings(); });
    menu.append(set);
    btn.addEventListener("click", (ev) => { ev.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); });
    document.addEventListener("click", (ev) => { if (!box.contains(ev.target)) close(); });
    // keep the sky from treating taps on the control as drags
    box.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    box.append(btn, fullBtn(), menu);
    return box;
  }

  let sheetOpen = false;
  function openSortSettings() {
    const old = document.getElementById("sortSheet");
    if (old) old.remove();
    const p = prefs();
    const items = openNeeds();
    sheetOpen = true;
    const sheet = h("div", { class: "sheet", id: "sortSheet", role: "dialog", "aria-modal": "true", "aria-label": "Sort settings" });
    const w = h("div", { class: "wrap" });
    sheet.append(w);
    const done = () => { sheetOpen = false; sheet.remove(); if (sky) resort(prefs().mode); else renderNow(); };
    w.append(h("div", { class: "toprow" }, h("p", { class: "daydate", text: "Now · sort settings" }), h("button", { class: "readaloud", type: "button", onclick: done, text: "Done" })));
    w.append(h("h1", { class: "head", text: "How the sky sorts." }));

    const radios = (name, opts, cur, onPick) => {
      const g = h("div", { class: "opt-list", role: "radiogroup" });
      for (const [val, label, sub] of opts) {
        const id = `${name}-${val}`;
        const inp = h("input", { type: "radio", name, id, value: val, checked: cur === val });
        inp.addEventListener("change", () => onPick(val));
        g.append(h("label", { class: "opt", for: id }, inp, h("span", null, h("b", { text: label }), sub ? h("span", { class: "opt-sub", text: sub }) : null)));
      }
      return g;
    };
    w.append(h("h2", { class: "sec", text: "Lay the sky out" }));
    w.append(radios("mode", [["drive", "Drive", "Each place on your drive is a constellation."], ["timeline", "Timeline", "A line across the day, each planet at the time it would start."], ["area", "By area", "CPA, Medicare, Money and Personal as suns, their items in orbit."]], p.mode, (v) => setPrefs({ mode: v })));
    w.append(h("h2", { class: "sec", text: "Order" }));
    w.append(h("p", { class: "quiet set-note", text: "Used by the timeline, and for the order you move through each sun." }));
    w.append(radios("order", Object.entries(ORDERS).map(([k, [l, sub]]) => [k, l, sub]), p.order, (v) => setPrefs({ order: v })));

    w.append(h("h2", { class: "sec", text: "The day" }));
    const start = h("input", { type: "time", id: "setStart", class: "set-in", value: p.start || "" });
    start.addEventListener("change", () => setPrefs({ start: start.value }));
    const gap = h("select", { id: "setGap", class: "set-in" }, [0, 5, 10, 15].map((m) => { const o = h("option", { value: m, text: m ? `${m} minutes` : "None" }); o.selected = Number(p.gap) === m; return o; }));
    gap.addEventListener("change", () => setPrefs({ gap: Number(gap.value) }));
    w.append(h("div", { class: "set-row" }, h("label", { for: "setStart", text: "Start the day at" }), start, h("span", { class: "quiet", text: "Blank starts at the next quarter hour." })));
    w.append(h("div", { class: "set-row" }, h("label", { for: "setGap", text: "Break between tasks" }), gap));
    const pomo = h("select", { id: "setPomo", class: "set-in" }, [15, 25, 30, 45, 50].map((m) => { const o = h("option", { value: m, text: `${m} minutes` }); o.selected = Number(p.pomo) === m; return o; }));
    pomo.addEventListener("change", () => setPrefs({ pomo: Number(pomo.value) }));
    const brk = h("select", { id: "setBreak", class: "set-in" }, [5, 10, 15].map((m) => { const o = h("option", { value: m, text: `${m} minutes` }); o.selected = Number(p.pomoBreak) === m; return o; }));
    brk.addEventListener("change", () => setPrefs({ pomoBreak: Number(brk.value) }));
    w.append(h("div", { class: "set-row" }, h("label", { for: "setPomo", text: "Focus timer" }), pomo));
    w.append(h("div", { class: "set-row" }, h("label", { for: "setBreak", text: "Then a break of" }), brk));

    w.append(h("h2", { class: "sec", text: "Time and effort" }));
    w.append(h("p", { class: "quiet set-note", text: "Guessed from each title until you set them. A tax return starts at two hours; a call at fifteen minutes." }));
    const list = h("ul", { class: "set-items" });
    const MINS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240];
    for (const it of items) {
      const k = keyOf(it);
      const mine = Number(p.est[k]) || 0;
      const cur = mine || guessEst(it);
      const sel = h("select", { class: "set-in", id: "est-" + k, "aria-label": "Time for " + it.title },
        Array.from(new Set([...MINS, cur])).sort((a, b) => a - b).map((m) => { const o = h("option", { value: m, text: fmtDur(m) + (!mine && m === cur ? " (guess)" : "") }); o.selected = m === cur; return o; }));
      sel.addEventListener("change", () => { const q = prefs(); q.est[k] = Number(sel.value); setPrefs({ est: q.est }); });
      const eff = h("div", { class: "effort", role: "group", "aria-label": "Effort for " + it.title });
      const dcur = diffOf(it, p), dmine = Number(p.diff[k]) || 0;
      ["Easy", "Medium", "Hard"].forEach((lab, i) => {
        const b = h("button", { type: "button", "aria-pressed": String(dcur === i + 1), class: !dmine && dcur === i + 1 ? "guess" : null, text: lab });
        b.addEventListener("click", () => { const q = prefs(); q.diff[k] = i + 1; setPrefs({ diff: q.diff }); eff.querySelectorAll("button").forEach((x) => { x.setAttribute("aria-pressed", String(x === b)); x.classList.remove("guess"); }); });
        eff.append(b);
      });
      list.append(h("li", null, h("span", { class: "set-ttl" }, glyph(it.place), it.title), h("div", { class: "set-ctl" }, sel, eff)));
    }
    if (!items.length) list.append(h("li", { class: "quiet", text: "Nothing open right now." }));
    w.append(list);
    const reset = h("button", { class: "textlink", type: "button", text: "Clear my times and efforts" });
    reset.addEventListener("click", () => { setPrefs({ est: {}, diff: {} }); openSortSettings(); });
    w.append(h("div", { class: "row set-foot" }, h("button", { class: "btn", type: "button", onclick: done, text: "Done" }), reset));
    sheet.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); done(); } });
    document.body.append(sheet);
    const first = sheet.querySelector("input[checked], input");
    if (first) first.focus({ preventScroll: true });
  }

  // ---- the focus timer: a quiet pomodoro in the sky's dark upper corner ----
  // State lives on this device so it survives the sky being redrawn or the app being closed.
  const POMO_KEY = "pomo";
  const pomoState = () => store.get(POMO_KEY) || { phase: "idle" };
  let pomoTick = 0, audioCtx = null;
  function chime(times) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < times; i++) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * 0.42;
        o.type = "sine"; o.frequency.value = 784;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.4);
      }
    } catch { /* no sound available */ }
    try { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); } catch {}
  }
  function pomoLeft(st) { return st.phase === "idle" ? 0 : st.paused != null ? st.paused : Math.max(0, st.end - Date.now()); }
  function pomoAdvance() {
    const st = pomoState();
    if (st.phase === "idle" || st.paused != null || st.end > Date.now()) return st;
    const p = prefs();
    let next;
    const late = Date.now() - st.end > 90000;   // finished while the app was closed: no chime now
    if (st.phase === "focus") { if (!late) chime(2); next = { phase: "break", end: Date.now() + p.pomoBreak * 60000, len: p.pomoBreak * 60000, done: (st.done || 0) + 1 }; }
    else { if (!late) chime(1); next = { phase: "idle", done: st.done || 0 }; }
    store.set(POMO_KEY, next);
    return next;
  }
  function pomoWidget() {
    const R = 17, C = 2 * Math.PI * R;
    const box = h("div", { class: "pomo" });
    const ring = s("svg", { class: "pomo-ring", viewBox: "0 0 44 44", "aria-hidden": "true" });
    const track = s("circle", { cx: 22, cy: 22, r: R, class: "pomo-track" });
    const arc = s("circle", { cx: 22, cy: 22, r: R, class: "pomo-arc", "stroke-dasharray": C.toFixed(2), transform: "rotate(-90 22 22)" });
    ring.append(track, arc);
    const time = h("span", { class: "pomo-time" });
    const main = h("button", { type: "button", class: "pomo-main" }, ring, time);
    const lab = h("span", { class: "pomo-lab" });
    const reset = h("button", { type: "button", class: "pomo-reset", "aria-label": "Stop the timer", text: "×" });
    box.append(main, lab, reset);
    const draw = () => {
      if (!box.isConnected) { clearInterval(pomoTick); pomoTick = 0; return; }
      const st = pomoAdvance();
      const p = prefs();
      const left = pomoLeft(st);
      const len = st.len || p.pomo * 60000;
      const mm = Math.floor((st.phase === "idle" ? p.pomo * 60000 : left) / 60000), ss = Math.floor(((st.phase === "idle" ? 0 : left) % 60000) / 1000);
      time.textContent = `${mm}:${String(ss).padStart(2, "0")}`;
      arc.setAttribute("stroke-dashoffset", st.phase === "idle" ? C.toFixed(2) : (C * (1 - left / len)).toFixed(2));
      box.className = "pomo " + st.phase + (st.paused != null ? " paused" : "");
      lab.textContent = st.phase === "idle" ? (st.done ? `${st.done} done` : "Focus") : st.phase === "break" ? "Break" : st.paused != null ? "Paused" : "Focus";
      main.setAttribute("aria-label", st.phase === "idle" ? `Start a ${p.pomo}-minute focus timer` : `${lab.textContent}, ${mm} minutes ${ss} seconds left. ${st.paused != null ? "Resume" : "Pause"}`);
      reset.hidden = st.phase === "idle";
    };
    main.addEventListener("click", (ev) => {
      ev.stopPropagation();
      try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch {}
      const st = pomoState(), p = prefs();
      if (st.phase === "idle") store.set(POMO_KEY, { phase: "focus", end: Date.now() + p.pomo * 60000, len: p.pomo * 60000, done: st.done || 0 });
      else if (st.paused != null) store.set(POMO_KEY, { ...st, end: Date.now() + st.paused, paused: null });
      else store.set(POMO_KEY, { ...st, paused: Math.max(0, st.end - Date.now()) });
      draw();
    });
    reset.addEventListener("click", (ev) => { ev.stopPropagation(); store.set(POMO_KEY, { phase: "idle", done: pomoState().done || 0 }); draw(); });
    box.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    clearInterval(pomoTick);
    pomoTick = setInterval(draw, 1000);
    requestAnimationFrame(draw);
    return box;
  }

  // ---- Breathe and Break: two quiet resets beside the focus timer ----
  // Each opens a heavily blurred veil over the sky, so the stars still glow through it.
  // × or Esc closes either one.
  let veil = null;   // { el, timers: [], raf }
  const veilOpen = () => !!(veil && veil.el.isConnected);
  function cornerTools() {
    const box = h("div", { class: "sky-tools" });
    const tool = (cls, label, icon, onClick) => {
      const b = h("button", { type: "button", class: "sky-tool " + cls, "aria-label": label },
        h("span", { class: "sky-tool-i", "aria-hidden": "true" }, icon), h("span", { class: "pomo-lab", text: label }));
      b.addEventListener("click", (ev) => { ev.stopPropagation(); onClick(); });
      return b;
    };
    const breathIcon = s("svg", { viewBox: "0 0 24 24", width: 18, height: 18 });
    breathIcon.append(s("circle", { cx: 12, cy: 12, r: 3.2, fill: "none", stroke: "currentColor", "stroke-width": 1.5 }), s("circle", { cx: 12, cy: 12, r: 7.5, fill: "none", stroke: "currentColor", "stroke-width": 1, "stroke-opacity": 0.55 }));
    const cupIcon = s("svg", { viewBox: "0 0 24 24", width: 18, height: 18 });
    cupIcon.append(s("path", { d: "M6 9 H16 V14 A5 5 0 0 1 6 14 Z M16 10.5 H17.5 A2 2 0 0 1 17.5 14.5 H15.8 M9 4.5 C8.4 5.5 9.6 6 9 7 M12 4.5 C11.4 5.5 12.6 6 12 7", fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    box.append(tool("tool-breathe", "Breathe", breathIcon, () => openBreathe()), tool("tool-break", "Break", cupIcon, () => openBreak()), pomoWidget());
    box.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    return box;
  }
  function closeVeil() {
    if (!veil) return;
    for (const t of veil.timers) clearTimeout(t);
    cancelAnimationFrame(veil.raf);
    const el = veil.el;
    veil = null;
    el.classList.remove("in");
    setTimeout(() => el.remove(), reduceMotion() ? 0 : 420);
  }
  function openVeil(kind, label) {
    if (!sky) return null;
    closeVeil();
    const el = h("div", { class: "veil veil-" + kind, role: "dialog", "aria-modal": "true", "aria-label": label });
    for (const t of ["pointerdown", "wheel", "click"]) el.addEventListener(t, (ev) => ev.stopPropagation());
    // a slow field of drifting motes, the galaxy seen through frosted glass
    const motes = s("svg", { class: "veil-motes", viewBox: "0 0 400 300", preserveAspectRatio: "xMidYMid slice", "aria-hidden": "true" });
    const r = rng(hash(kind));
    for (let i = 0; i < 26; i++) {
      const c = s("circle", { cx: (r() * 400).toFixed(1), cy: (r() * 300).toFixed(1), r: (0.6 + r() * 1.4).toFixed(2) });
      c.style.animationDelay = (-r() * 18).toFixed(1) + "s";
      c.style.animationDuration = (14 + r() * 14).toFixed(1) + "s";
      motes.append(c);
    }
    const x = h("button", { type: "button", class: "veil-x", "aria-label": "Close", text: "×" });
    x.addEventListener("click", closeVeil);
    const body = h("div", { class: "veil-body" });
    el.append(motes, x, body);
    sky.el.append(el);
    veil = { el, body, timers: [], raf: 0 };
    requestAnimationFrame(() => el.classList.add("in"));
    return veil;
  }
  const later = (fn, ms) => { if (veil) veil.timers.push(setTimeout(fn, ms)); };
  document.addEventListener("keydown", (ev) => {
    if (!veilOpen() || ev.key !== "Escape") return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    closeVeil();
  }, true);
  function veilDone(title, sub, extra) {
    const v = veil; if (!v) return;
    v.body.replaceChildren();
    const start = h("button", { type: "button", class: "veil-btn", text: `Start a ${prefs().pomo}-minute focus` });
    start.addEventListener("click", () => {
      const p = prefs(), st = pomoState();
      store.set(POMO_KEY, { phase: "focus", end: Date.now() + p.pomo * 60000, len: p.pomo * 60000, done: st.done || 0 });
      closeVeil();
    });
    const close = h("button", { type: "button", class: "veil-btn ghost", text: "Back to the sky", onclick: closeVeil });
    v.body.append(h("p", { class: "veil-kicker", text: "Done" }), h("h2", { class: "veil-title", text: title }), sub ? h("p", { class: "veil-sub", text: sub }) : null,
      h("div", { class: "veil-row" }, start, extra || null, close));
    start.focus({ preventScroll: true });
  }

  // Break: a few minutes away from the screen, with a nudge every so often.
  const BREAK_NUDGES = [
    "Fill a glass of water and drink it.",
    "Stand up. Reach both arms overhead, then fold forward and let your head hang.",
    "Roll your shoulders back five times. Unclench your jaw.",
    "Look at the farthest thing you can see for twenty seconds.",
    "Take a short walk. Leave the phone where it is.",
    "Stretch your neck: ear toward one shoulder, then the other.",
    "Open a window or step outside for some air.",
  ];
  function openBreak() {
    const mins = Number(prefs().pomoBreak) || 5;
    const v = openVeil("break", `${mins}-minute break`);
    if (!v) return;
    const total = mins * 60000, end = Date.now() + total;
    const R = 92, C = 2 * Math.PI * R;
    const dial = s("svg", { class: "break-dial", viewBox: "0 0 220 220", "aria-hidden": "true" });
    const arc = s("circle", { cx: 110, cy: 110, r: R, class: "break-arc", "stroke-dasharray": C.toFixed(1), transform: "rotate(-90 110 110)" });
    const moon = s("circle", { r: 5, class: "break-moon" });
    dial.append(s("circle", { cx: 110, cy: 110, r: R, class: "break-track" }), arc, moon);
    const time = h("p", { class: "veil-time", "aria-live": "off" });
    const nudge = h("p", { class: "veil-nudge", "aria-live": "polite" });
    v.body.append(h("p", { class: "veil-kicker", text: "Break" }), h("div", { class: "break-wrap" }, dial, time), nudge,
      h("p", { class: "veil-foot", text: "Esc or × to come back early." }));
    let n = Math.floor(Math.random() * BREAK_NUDGES.length);
    const showNudge = () => {
      nudge.classList.remove("show");
      later(() => { nudge.textContent = BREAK_NUDGES[n++ % BREAK_NUDGES.length]; nudge.classList.add("show"); }, 380);
      later(showNudge, 25000);
    };
    showNudge();
    const tick = () => {
      if (!veil || veil.body !== v.body) return;
      const left = Math.max(0, end - Date.now());
      const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
      time.textContent = `${m}:${String(sec).padStart(2, "0")}`;
      const f = 1 - left / total;
      arc.setAttribute("stroke-dashoffset", (C * f).toFixed(1));
      const a = -Math.PI / 2 + f * 2 * Math.PI;
      moon.setAttribute("cx", (110 + R * Math.cos(a)).toFixed(1)); moon.setAttribute("cy", (110 + R * Math.sin(a)).toFixed(1));
      if (left <= 0) { chime(2); veilDone("Break's over.", "Water, a stretch, some air. Ready for the next one?"); return; }
      later(tick, 250);
    };
    tick();
  }

  // Breathe: three guided patterns, the orb swelling on the in-breath and settling on the out-breath.
  const BREATHS = {
    energy: { name: "Energize", hint: "When the afternoon sags", tint: "#E8997A",
      about: "In through the nose, a little longer than out. Lifts alertness without caffeine.",
      steps: [["in", 4], ["hold", 2], ["out", 2]] },
    clarity: { name: "Clear", hint: "Before something that needs focus", tint: "#93B8DE",
      about: "Box breathing: in, hold, out, hold, four counts each. Steadies attention.",
      steps: [["in", 4], ["hold", 4], ["out", 4], ["rest", 4]] },
    calm: { name: "Calm", hint: "To settle and reset", tint: "#8CC9A2",
      about: "4-7-8: a long, slow out-breath that tells the body to stand down.",
      steps: [["in", 4], ["hold", 7], ["out", 8]] },
  };
  const BREATH_WORDS = { in: "Breathe in", hold: "Hold", out: "Breathe out", rest: "Hold, empty" };
  const BREATH_LENGTHS = [[1, "1 min"], [3, "3 min"], [5, "5 min"]];
  function openBreathe() {
    const v = openVeil("breathe", "Breathe");
    if (!v) return;
    let pick = store.get("breathPick") || "calm";
    let mins = Number(store.get("breathMins")) || 3;
    const choose = () => {
      v.body.replaceChildren();
      v.body.append(h("p", { class: "veil-kicker", text: "Breathe" }), h("h2", { class: "veil-title", text: "A minute to reset." }));
      const cards = h("div", { class: "breath-cards", role: "radiogroup", "aria-label": "Pattern" });
      for (const [k, b] of Object.entries(BREATHS)) {
        const c = h("button", { type: "button", class: "breath-card", role: "radio", "aria-checked": String(pick === k), style: `--tint:${b.tint}` },
          h("span", { class: "breath-dot", "aria-hidden": "true" }),
          h("b", { text: b.name }), h("span", { class: "breath-hint", text: b.hint }),
          h("span", { class: "breath-pat", text: b.steps.map((x) => x[1]).join(" · ") }));
        c.addEventListener("click", () => { pick = k; store.set("breathPick", k); choose(); });
        cards.append(c);
      }
      const lens = h("div", { class: "breath-lens", role: "radiogroup", "aria-label": "Length" });
      for (const [m, lab] of BREATH_LENGTHS) {
        const b = h("button", { type: "button", role: "radio", "aria-checked": String(mins === m), text: lab });
        b.addEventListener("click", () => { mins = m; store.set("breathMins", m); choose(); });
        lens.append(b);
      }
      const go = h("button", { type: "button", class: "veil-btn", text: "Begin", onclick: () => run(pick, mins) });
      v.body.append(cards, h("p", { class: "veil-sub breath-about", text: BREATHS[pick].about }), lens, h("div", { class: "veil-row" }, go),
        h("p", { class: "veil-foot", text: "Breathe gently. If you feel light-headed, stop and breathe normally." }));
      go.focus({ preventScroll: true });
    };
    const run = (k, m) => {
      const b = BREATHS[k];
      const cycle = b.steps.reduce((a, x) => a + x[1], 0);
      const rounds = Math.max(2, Math.round((m * 60) / cycle));
      v.body.replaceChildren();
      v.el.style.setProperty("--tint", b.tint);
      const orb = h("div", { class: "breath-orb", "aria-hidden": "true" }, h("span", { class: "orb-glow" }), h("span", { class: "orb-core" }));
      const ring = h("div", { class: "breath-ring", "aria-hidden": "true" });
      const word = h("p", { class: "breath-word", "aria-live": "polite" });
      const count = h("p", { class: "breath-count", "aria-hidden": "true" });
      const prog = h("p", { class: "veil-foot" });
      v.body.append(h("p", { class: "veil-kicker", text: b.name }), h("div", { class: "breath-stage" }, ring, orb, h("div", { class: "breath-say" }, word, count)), prog);
      let round = 0, step = 0;
      const sizeFor = (phase) => (phase === "in" ? 1 : phase === "out" ? 0.42 : null);
      let size = 0.42;
      orb.style.setProperty("--s", size);
      const next = () => {
        if (!veil || veil.body !== v.body) return;
        if (step >= b.steps.length) { step = 0; round++; }
        if (round >= rounds) { chime(1); veilDone("Well done.", `${rounds} rounds of ${b.name.toLowerCase()} breathing.`, h("button", { type: "button", class: "veil-btn ghost", text: "Again", onclick: () => run(k, m) })); return; }
        const [phase, secs] = b.steps[step++];
        const target = sizeFor(phase);
        if (target != null) size = target;
        orb.style.transitionDuration = secs + "s";
        orb.style.setProperty("--s", size);
        orb.dataset.phase = phase;
        word.textContent = BREATH_WORDS[phase];
        prog.textContent = `Round ${round + 1} of ${rounds}`;
        for (let i = 0; i < secs; i++) later(() => { count.textContent = String(secs - i); }, i * 1000);
        later(next, secs * 1000);
      };
      // a three-count settle before the first breath
      word.textContent = "Get comfortable";
      count.textContent = "";
      prog.textContent = `${rounds} rounds · about ${Math.round((rounds * cycle) / 60) || 1} min`;
      later(next, 2400);
    };
    choose();
  }

  // ---- full screen: the sky fills the screen; tapping a planet floats its card over it ----
  let skyFull = false;
  function fullBtn() {
    const b = h("button", { class: "sky-sort-b sky-full-b", type: "button" });
    const set = () => { b.textContent = skyFull ? "Exit full screen" : "⤢"; b.setAttribute("aria-label", skyFull ? "Exit full screen" : "Full screen"); b.title = skyFull ? "Exit full screen (Esc)" : "Full screen"; };
    set();
    b.addEventListener("click", (ev) => { ev.stopPropagation(); if (skyFull) exitFull(); else enterFull(); });
    b._sync = set;
    return b;
  }
  function syncFullBtn() { const b = sky && sky.el.querySelector(".sky-full-b"); if (b && b._sync) b._sync(); }
  function enterFull() {
    if (!sky) return;
    skyFull = true;
    document.body.append(sky.el);
    sky.el.classList.add("full");
    document.body.classList.add("skyfull");
    syncFullBtn();
    requestAnimationFrame(() => { if (!sky) return; if (!sky.el.classList.contains("away")) { const st = starFor(nowIdx); if (st) cam = restCam(st); } setView(); });
  }
  function exitFull() {
    skyFull = false;
    document.body.classList.remove("skyfull");
    if (!sky) return;
    closeModal();
    sky.el.classList.remove("full");
    const box = document.querySelector("#paneNow .now");
    const w = box && box.querySelector(".wrap");
    if (box && w) box.insertBefore(sky.el, w); else sky.el.remove();
    syncFullBtn();
    requestAnimationFrame(() => { if (!sky) return; if (!sky.el.classList.contains("away")) { const st = starFor(nowIdx); if (st) cam = restCam(st); } setView(); fillCard(); fillCtl(); });
  }
  const modalEl = () => sky && sky.el.querySelector(".sky-modal");
  function closeModal() { const m = modalEl(); if (m) { m.classList.remove("in"); m.hidden = true; } }
  function openModal() {
    if (!sky) return;
    let m = modalEl();
    if (!m) {
      m = h("div", { class: "sky-modal", role: "dialog", "aria-modal": "false", hidden: true });
      for (const t of ["pointerdown", "wheel", "click"]) m.addEventListener(t, (ev) => ev.stopPropagation());
      sky.el.append(m);
    }
    fillModal(m);
    const wasHidden = m.hidden;
    m.hidden = false;
    const st = starFor(nowIdx);
    if (wasHidden && st && !camAnim) animateCam(cardCam(st), 520);
    requestAnimationFrame(() => { m.classList.remove("swap"); m.classList.add("in"); });
    const f = m.querySelector(".btn"); if (f) f.focus({ preventScroll: true });
  }
  function fillModal(m) {
    m.replaceChildren();
    const cur = sky.seq[nowIdx];
    if (!cur) return;
    m.setAttribute("aria-label", cur.kind === "event" ? cur.ev.title : cur.it.title);
    m.append(h("button", { class: "sky-modal-x", type: "button", "aria-label": "Close", onclick: closeModal, text: "×" }));
    m.append(...cardBits(cur, () => { exitFull(); dive(); }));
    const nav = h("div", { class: "now-ctl sky-modal-nav" });
    nav.append(h("button", { type: "button", text: "← Back", disabled: nowIdx === 0 ? true : null, onclick: () => flyTo(nowIdx - 1) }));
    nav.append(h("button", { type: "button", text: "Next →", disabled: nowIdx >= sky.seq.length - 1 ? true : null, onclick: () => flyTo(nowIdx + 1) }));
    nav.append(h("span", { class: "pos", text: `${nowIdx + 1} of ${sky.seq.length}` }));
    m.append(nav);
  }
  document.addEventListener("keydown", (ev) => {
    if (!skyFull || sheetOpen || veilOpen()) return;
    if (ev.target.closest && ev.target.closest("input, textarea, select")) return;
    if (ev.key === "Escape") { ev.stopImmediatePropagation(); const m = modalEl(); if (m && !m.hidden) closeModal(); else exitFull(); return; }
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") { ev.stopImmediatePropagation(); ev.preventDefault(); flyTo(nowIdx + (ev.key === "ArrowRight" ? 1 : -1)); }
    if (ev.key === "Enter" && !ev.target.closest("button, a")) { ev.stopImmediatePropagation(); openModal(); }
  }, true);

  const starFor = (i) => sky && sky.stars.find((x) => x.seqIdx === i);
  function clampCam() {
    if (!cam) return;
    const bx = (sky && sky.box) || SKY_BOX;
    cam.x = Math.max(bx.x0, Math.min(bx.x1, cam.x));
    cam.y = Math.max(bx.y0, Math.min(bx.y1, cam.y));
  }
  // the camera has left the bright star: offer the way back, retire the hint
  function lookedAway() {
    if (!sky) return;
    sky.el.classList.add("away");
    if (!store.get("skyHintSeen")) { store.set("skyHintSeen", true); const hint = sky.el.querySelector(".sky-hint"); if (hint) hint.classList.add("gone"); }
  }
  function restW(el) { const px = (el && el.clientWidth) || 360; return Math.max(380, Math.min(760, px * 1.05)); }
  function restCam(st) { return { x: st.x, y: st.y + (prefs().mode === "timeline" ? 30 : 6), w: restW(sky.el) * (prefs().mode === "drive" ? 1 : 1.35) }; }
  function cardCam(st) {
    const c = restCam(st);
    if (!(skyFull && sky)) return c;
    const px = sky.el.clientWidth || 1200;
    // wide screens: the card sits on the right, so the planet moves left; phones: the card sits low, so it moves up
    return isDesk() ? { ...c, x: c.x + (c.w / px) * 230 } : { ...c, y: c.y + (c.w / px) * 150 };
  }
  const skyMaxW = () => Math.max(SKY_MAX_W, sky && sky.box ? (sky.box.x1 - sky.box.x0) + 500 : 0);
  function setView() {
    if (!sky || !cam) return;
    const el = sky.el;
    const aspect = el.clientWidth && el.clientHeight ? el.clientHeight / el.clientWidth : 0.85;
    const hh = cam.w * aspect;
    sky.svg.setAttribute("viewBox", `${(cam.x - cam.w / 2).toFixed(2)} ${(cam.y - hh / 2).toFixed(2)} ${cam.w.toFixed(2)} ${hh.toFixed(2)}`);
  }
  // Fly the camera: position eases, the zoom moves on a log scale and pulls back a little
  // mid-flight in proportion to the distance, so long hops feel like travel.
  function animateCam(to, dur, onMid, onDone) {
    cancelAnimationFrame(camAnim); camAnim = 0;
    const from = cam || to;
    if (reduceMotion() || !dur) { cam = to; setView(); if (onMid) onMid(); if (onDone) onDone(); return; }
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const bump = Math.min(0.75, dist / 520);
    const t0 = performance.now();
    let mid = false;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w * Math.pow(to.w / from.w, e) * (1 + bump * Math.sin(Math.PI * t)) };
      setView();
      if (!mid && t >= 0.5) { mid = true; if (onMid) onMid(); }
      if (t < 1) camAnim = requestAnimationFrame(step);
      else { camAnim = 0; if (onDone) onDone(); }
    };
    camAnim = requestAnimationFrame(step);
  }
  function markStar(i) {
    for (const st of sky.stars) {
      const on = st.open && !st.gone && st.seqIdx === i;
      st.el.classList.toggle("on", on);
      if (st.open) st.el.setAttribute("aria-current", String(on));
    }
  }
  function drawTrail(a, b) {
    if (reduceMotion()) return;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ln = s("line", { class: "trail", x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: tintOf(b), "stroke-dasharray": len, "stroke-dashoffset": len });
    sky.trails.append(ln);
    requestAnimationFrame(() => requestAnimationFrame(() => ln.setAttribute("stroke-dashoffset", 0)));
    setTimeout(() => ln.classList.add("gone"), 900);
    setTimeout(() => ln.remove(), 1500);
  }

  function flyTo(i, showCard) {
    if (!sky || i < 0 || i >= sky.seq.length || i === nowIdx) return;
    const m = skyFull ? modalEl() : null;
    const withCard = skyFull && (showCard || (m && !m.hidden));
    if (m && !m.hidden) m.classList.add("swap");
    const a = starFor(nowIdx), b = starFor(i);
    nowIdx = i;
    if (!a || !b) { renderNow(); return; }
    if (!store.get("skyHintSeen")) { store.set("skyHintSeen", true); const hint = sky.el.querySelector(".sky-hint"); if (hint) hint.classList.add("gone"); }
    markStar(i);
    cancelAnimationFrame(glide); glide = 0;
    sky.el.classList.remove("away");
    drawTrail(a, b);
    sky.card.classList.add("swap");
    fillCtl();
    animateCam(withCard ? cardCam(b) : restCam(b), 820, () => { fillCard(); sky.card.classList.remove("swap"); if (withCard) openModal(); });
  }
  function dive() {
    if (skyFull) exitFull();
    const st = starFor(nowIdx);
    if (!st) return;
    if (!store.get("skyHintSeen")) store.set("skyHintSeen", true);
    sky.el.classList.add("diving");
    sky.card.classList.add("swap");
    animateCam({ x: st.x, y: st.y, w: DIVE_W }, 560, null, () => { nowDrilled = true; renderNow(); const p = $("#paneNow"); if (p) p.scrollTop = 0; });
  }
  function surface() { nowDrilled = false; surfacing = true; renderNow(); }

  // The card under the sky: just enough to know what the bright star is.
  function fillCard() {
    const card = sky.card;
    const cur = sky.seq[nowIdx];
    card.replaceChildren();
    if (!cur) return;
    card.append(...cardBits(cur, dive));
  }
  function cardBits(cur, onOpen) {
    const card = h("div");
    if (cur.kind === "event") {
      const e = cur.ev, t = Date.now();
      const running = e.s.getTime() <= t;
      card.append(h("p", { class: "now-kicker" }, glyphSvg("g-clock"), running ? `Until ${fmtTime(e.e)}` : `${fmtTime(e.s)} · ${fmtIn(e.s.getTime() - t)}`));
      card.append(h("h1", { class: "now-title", onclick: onOpen }, e.title));
      if (e.where) card.append(h("p", { class: "now-gist", text: e.where }));
    } else {
      const it = cur.it;
      const when = cur.at ? `· ${fmtTime(new Date(cur.at))}, about ${fmtDur(Math.round((cur.end - cur.at) / 60000))}` : "· " + it.place;
      card.append(h("p", { class: "now-kicker" }, areaChip(areaOf(it)), h("span", { class: "quiet", text: when })));
      card.append(h("h1", { class: "now-title", onclick: onOpen }, it.title));
      if (it.sentence) card.append(h("p", { class: "now-gist", text: firstSentence(it.sentence) }));
      if (it.carries > 1) card.append(h("p", { class: "now-carry", text: `Carried ${it.carries} days.` }));
    }
    const rec = recFor(cur);
    const open = h("div", { class: "now-open" }, h("button", { class: "btn", onclick: onOpen, text: "Open it" }));
    if (rec && (rec.claude === "yes" || rec.claude === "partly")) open.append(h("span", { class: "now-claude" }, glyphSvg("g-spark"), CLAUDE_SAYS[rec.claude]));
    card.append(open);
    return Array.from(card.childNodes);
  }
  function fillCtl() {
    const ctl = sky.ctl;
    ctl.replaceChildren();
    ctl.append(h("button", { text: "← Back", disabled: nowIdx === 0 ? true : null, onclick: () => flyTo(nowIdx - 1) }));
    ctl.append(h("button", { text: "Next →", disabled: nowIdx >= sky.seq.length - 1 ? true : null, onclick: () => flyTo(nowIdx + 1) }));
    const cur = sky.seq[nowIdx];
    const mode = prefs().mode;
    const where = !cur ? "" : cur.at ? " · " + fmtTime(new Date(cur.at)) : cur.kind === "item" ? " · " + (mode === "area" ? areaOf(cur.it) : cur.it.place) : "";
    ctl.append(h("span", { class: "pos", text: `${nowIdx + 1} of ${sky.seq.length}${where}` }));
    if (isDesk()) ctl.append(h("button", { text: "Close", onclick: () => toggleFocus(false) }));
  }

  function renderNow() {
    const pane = $("#paneNow");
    const keepFull = skyFull;
    if (veil) { for (const t of veil.timers) clearTimeout(t); veil = null; }
    if (sky && sky.el.classList.contains("full")) sky.el.remove();
    skyFull = false;
    document.body.classList.remove("skyfull");
    cancelAnimationFrame(camAnim); camAnim = 0;
    cancelAnimationFrame(glide); glide = 0;
    pane.replaceChildren();
    sky = null;
    const box = h("div", { class: "now" });
    const w = h("div", { class: "wrap" });
    box.append(w);
    pane.append(box);
    if (!B || !B.day) { w.append(h("p", { class: "now-empty", text: "Nothing yet. The brief lands here in the morning." })); return; }
    const seq = nowSequence();
    if (!seq.length) {
      nowDrilled = false;
      w.append(h("p", { class: "now-empty", text: "Nothing is waiting on you. The rest of today is yours." }));
      const top = renderRecommendation(topRec());
      if (top) { box.classList.add("has-rec"); pane.append(top); }
      return;
    }
    nowIdx = Math.max(0, Math.min(nowIdx, seq.length - 1));
    const cur = seq[nowIdx];
    if (nowDrilled) { renderDrilled(pane, box, w, seq, cur); return; }

    // the sky, then the card, then the controls
    box.classList.add("skyview");
    sky = buildSky(seq);
    box.insertBefore(sky.el, w);
    applyLayout(prefs().mode, false);
    sky.card = h("div", { class: "now-card" });
    sky.ctl = h("div", { class: "now-ctl" });
    w.append(sky.card, sky.ctl);
    markStar(nowIdx);
    fillCard();
    fillCtl();
    if (keepFull && !surfacing) enterFull();
    const st = starFor(nowIdx);
    if (!st) return;
    if (surfacing) {
      surfacing = false;
      cam = { x: st.x, y: st.y, w: DIVE_W };
      sky.el.classList.add("rising");
      setView();
      requestAnimationFrame(() => { sky.el.classList.remove("rising"); animateCam(restCam(st), 620); });
    } else {
      cam = restCam(st);
      setView();
    }
  }

  // Inside a star: everything the old Now card had, plus its recommendation and plan.
  function renderDrilled(pane, box, w, seq, cur) {
    box.classList.add("drilled");
    w.append(h("button", { class: "now-up", onclick: surface }, "← Back to the sky", h("span", { class: "quiet", text: `${nowIdx + 1} of ${seq.length}` })));
    const rec = renderRecommendation(recFor(cur));
    if (rec) { box.classList.add("has-rec"); rec.classList.add("drilled"); pane.append(rec); }

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
      w.append(h("p", { class: "ed-label now-where", text: "Where it goes" }), choiceRow(it));
    }

    const ctl = h("div", { class: "now-ctl" });
    if (cur.kind === "item") ctl.append(h("button", { class: "btn", text: "Done", onclick: async () => { await patchItem(cur.it, { status: "Closed" }); nowDrilled = false; surfacing = true; renderAll(); } }));
    ctl.append(h("button", { text: "Back to the sky", onclick: surface }));
    if (isDesk()) ctl.append(h("button", { text: "Close", onclick: () => toggleFocus(false) }));
    w.append(ctl);
  }

  // ---------------- AI recommendation ----------------
  // The brief run writes one recommendation per item into the day's JSON, keyed by item Key:
  //   recs: { "<itemKey>": { title, why, claude: "yes"|"partly"|"no", claudeDoes, youDo, prompt, mindmap } }
  // plus `recommendation` (the day's top pick, with `key` naming its item) for the desktop overview.
  // A recommendation is only ever shown on the item it is about. When the top pick has no `key`,
  // it is matched to the one item whose title shares the most names with it; anything without
  // its own recommendation gets an "Ask Claude" card built from that item instead.
  const CLAUDE_SAYS = { yes: "Claude can do this", partly: "Claude can do part of it", no: "This one needs you" };
  const validRec = (r) => r && typeof r === "object" && r.title;
  function topRec() { const r = B && B.day && B.day.recommendation; return validRec(r) ? r : null; }
  const names = (t, skipFirst) => {
    const words = String(t || "").replace(/[’']s\b/g, "").split(/[^A-Za-z0-9-]+/).filter(Boolean);
    return new Set(words.filter((w, i) => (!skipFirst || i > 0) && w.length > 1 && /^[A-Z]/.test(w)).map((w) => w.toLowerCase()));
  };
  function topKey() {
    const top = topRec();
    if (!top) return null;
    if (top.key) return top.key;
    const want = names(top.title, true);
    if (!want.size || !B || !B.items) return null;
    let best = null, bestN = 0, tie = false;
    for (const it of B.items) {
      if (!it.key || it.status === "Closed") continue;
      let n = 0;
      for (const w of names(it.title, false)) if (want.has(w)) n++;
      if (n > bestN) { best = it.key; bestN = n; tie = false; } else if (n && n === bestN) tie = true;
    }
    return bestN && !tie ? best : null;
  }
  function recForItem(it) {
    const d = B && B.day;
    if (!d || !it) return null;
    const recs = d.recs && typeof d.recs === "object" ? d.recs : null;
    const own = recs && it.key ? recs[it.key] : null;
    if (validRec(own)) return { area: areaOf(it), ...own };
    const top = topRec();
    if (top && it.key && topKey() === it.key) return top;
    return askRec(it);
  }
  // No plan was written for this item: offer to have Claude work one out for it, honestly labelled.
  function askRec(it) {
    if (!it || it.status === "Closed") return null;
    const bits = [`This is an open item from my daily brief (${areaOf(it)}): "${it.title}".`];
    if (it.sentence) bits.push(it.sentence);
    if (it.note) bits.push(`My note on it: ${it.note}`);
    if (safeUrl(it.task)) bits.push(`The task behind it is ${it.task}.`);
    bits.push("Read the barayuga-notion skill and anything linked, then tell me the one next step that changes the outcome, what you can do and what is left for me. Do your part as drafts only: send, pay or submit nothing. Put no SSNs, Medicare numbers or tax figures in anything you write.");
    return { generic: true, title: "No plan written for this one yet", why: "The brief didn't write a recommendation for this item. Claude can read it and its task and work one out.", area: areaOf(it), prompt: bits.join(" ") };
  }
  function recFor(cur) { return cur && cur.kind === "item" ? recForItem(cur.it) : null; }
  function renderRecommendation(r) {
    if (!validRec(r)) return null;
    const box = h("section", { class: "rec", "aria-label": "AI recommendation" });
    const w = h("div", { class: "wrap" });
    box.append(w);
    w.append(h("h2", { class: "sec rec-sec" }, glyphSvg("g-spark"), "AI recommendation"));
    const card = h("div", { class: "rec-card" });
    if (r.area) card.append(h("p", { class: "itemmeta" }, areaChip(r.area)));
    card.append(h("h3", { class: "rec-title", text: r.title }));
    if (r.why) card.append(h("p", { class: "rec-why", text: r.why }));
    if (r.generic) {
      card.classList.add("rec-generic");
      card.append(h("div", { class: "row" }, ext(h("a", { class: "btn", href: "https://claude.ai/new?q=" + encodeURIComponent(r.prompt), text: "Ask Claude for a plan" }))));
      w.append(card);
      return box;
    }
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
    w.append(h("div", { class: "row", style: "margin-top:22px" }, ext(h("a", { class: "btn", href: plaudLink(), text: "Retrieve Plaud (voice notes)" }))));
    host.append(w);
    draw();
  }

  // ---------------- Plaud → Claude ----------------
  // Opens a new Claude chat that runs the process-captures skill on any new recordings.
  function plaudLink() {
    const prompt =
`Check Plaud. It's ${localISO()} and I may have recorded new voice notes since the last run.

Please read the process-captures skill, then route any new Plaud recordings into Notion: work from the transcripts, not Plaud's summaries; turn anything I asked for into QuickActions; stop and ask me on any near-match name. Tell me in a few lines what you created, what you skipped, and anything you need me to confirm.`;
    return "https://claude.ai/new?q=" + encodeURIComponent(prompt);
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
    { const it = B && B.items.find((i) => i.id === id); if (it && isFresh(it)) { unFresh(it); const b = document.querySelector(`ol.items li[data-id="${CSS.escape(id)}"] .newbadge`); if (b) b.remove(); } }
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
      const own = renderRecommendation(recForItem(it));
      if (own) { own.classList.add("in-aside"); inner.append(h("hr"), own); }
      inner.append(h("hr"));
    } else {
      const rec = renderRecommendation(topRec());
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
    if (on) document.body.classList.remove("outboxview");
    if (isDesk()) markNav(on ? "now" : document.body.classList.contains("outboxview") ? "outbox" : "today");
    nowDrilled = false;
    if (on) { nowIdx = 0; const seq = nowSequence(); if (selKey) { const i = seq.findIndex((x) => x.kind === "item" && x.it.id === selKey); if (i >= 0) nowIdx = i; } renderNow(); }
  }

  // ---------------- keyboard (desktop) ----------------
  document.addEventListener("keydown", (ev) => {
    if (!isDesk() || !B || !B.day || sheetOpen || veilOpen()) return;
    const typing = ev.target.closest("input, textarea");
    if (ev.key === "Escape" && !typing && document.body.classList.contains("outboxview")) { document.body.classList.remove("outboxview"); markNav("today"); return; }
    if (ev.key === "Escape") { if (typing) ev.target.blur(); else if (document.body.classList.contains("focus") && nowDrilled) surface(); else if (document.body.classList.contains("focus")) toggleFocus(false); else { selKey = null; renderAll(); } return; }
    if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (document.body.classList.contains("outboxview")) return;
    // in focus, the arrows travel the sky and Enter dives into the bright star
    if (document.body.classList.contains("focus") && sky) {
      if (ev.key === "ArrowRight" || ev.key === "l") { ev.preventDefault(); flyTo(nowIdx + 1); return; }
      if (ev.key === "ArrowLeft" || ev.key === "h") { ev.preventDefault(); flyTo(nowIdx - 1); return; }
      if (ev.key === "Enter" && !ev.target.closest("button, a, .star")) { ev.preventDefault(); dive(); return; }
    }
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
      const tmr = typeof B.day.tomorrow === "string" ? B.day.tomorrow : (B.day.tomorrow && B.day.tomorrow.text);
      if (tmr) parts.push(tmr);
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

  // ---------------- OUTBOX ----------------
  // People and Partners rows whose "Push to" is set and "Pushed" is empty: what GHL, TaxDome
  // and Axcess are still owed. Mark pushed writes today's date into Pushed; Undo clears it.
  const OB_CATS = [
    { id: "tax", title: "TaxDome and Axcess", blurb: "Client records the tax side still needs." },
    { id: "ghl", title: "GHL — ready to enter", blurb: "Contacts and notes with everything needed to type them in." },
    { id: "partners", title: "Partners → GHL", blurb: "Lead-source names to standardise in GHL." },
    { id: "waiting", title: "Waiting on information", blurb: "Blocked until a phone, email or detail comes in." },
    { id: "gaps", title: "Email gaps", blurb: "No email on file. Ask at the next contact; nothing to enter until then." },
  ];
  const OB_BLOCKED = /blocked|no phone or email|no phone, email|not pushed|can.t create|cannot create|street number was not|before entering anything|confirm whether (she|he|they) (is|are) still/i;
  const OB = { rows: null, at: null, err: null, loading: false, done: {}, sel: {}, confirm: null, gapsOpen: false, msg: "" };
  function obCat(r) {
    if (r.table === "partners") return "partners";
    if (/^\s*no email on file/i.test(r.what || "")) return "gaps";
    if (OB_BLOCKED.test(r.what || "")) return "waiting";
    if ((r.pushTo || []).some((x) => /taxdome|axcess/i.test(x))) return "tax";
    return "ghl";
  }
  async function loadOutbox() {
    if (OB.loading) return;
    OB.loading = true; OB.err = null; renderOutbox();
    try {
      const r = await api("GET", "/api/outbox");
      const rows = r.rows || [];
      // keep what was checked off on this device visible, even though Notion no longer lists it
      for (const id of Object.keys(OB.done)) if (!rows.some((x) => x.id === id)) rows.push(OB.done[id].row);
      OB.rows = rows; OB.at = Date.now();
      store.set("outbox", { at: OB.at, rows: r.rows || [] });
    } catch (e) {
      if (e.message === "signin") { OB.loading = false; return; }
      OB.err = e.message === "share"
        ? "Oggi can't see People and Partners yet. In Notion, open each of those two tables, choose ••• → Connections, and add the oggi connection. Then refresh."
        : "Couldn't reach Notion" + (OB.rows ? " — showing the last copy." : ".");
      if (!OB.rows) { const c = store.get("outbox"); if (c) { OB.rows = c.rows; OB.at = c.at; } }
    }
    OB.loading = false;
    renderOutbox();
  }
  function obLine(r) { return `${r.name} → ${(r.pushTo || []).join(", ")}\n${r.what || ""}`; }
  function obClaudeLink(rows) {
    const sys = Array.from(new Set(rows.flatMap((r) => r.pushTo || [])));
    const prompt =
`Work through this batch of my Notion outbox. Read the barayuga-notion skill first.

For each Notion row below, open it with the Notion connector and read its Push to and What changed fields; What changed says exactly what to enter. Enter it into the named system (${sys.join(", ")}): use the HighLevel (IFG) connector for GHL where it can make the change, otherwise use my browser (GHL at app.teamifg.com, TaxDome, CCH Axcess). I sign in myself; never enter a password for me. Before saving each one, show me exactly what you are about to enter and wait for my OK. Never overwrite GHL tags with the tags field. Stop and ask on any near-match name rather than creating a duplicate. After I confirm a row is saved, set that row's Pushed date to today in Notion.

Rows:
${rows.map((r, i) => `${i + 1}. ${r.url}`).join("\n")}`;
    return "https://claude.ai/new?q=" + encodeURIComponent(prompt);
  }
  function obCopy(text, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = "Copied"; setTimeout(() => { btn.textContent = o; }, 1400); };
    const fallback = () => {
      let box = btn.parentElement.nextElementSibling;
      if (!box || !box.classList.contains("ob-fallback")) { box = h("textarea", { class: "ob-fallback", readonly: true, rows: 5 }); btn.parentElement.after(box); }
      box.value = text; box.focus(); box.select();
    };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch { fallback(); }
  }
  async function obSet(r, on) {
    await api("PATCH", `/api/outbox/${r.id}`, { pushed: on, name: r.name, pushTo: r.pushTo, dayId: B && B.day ? B.day.id : null });
    if (on) { OB.done[r.id] = { date: localISO(), row: r }; delete OB.sel[r.id]; }
    else delete OB.done[r.id];
  }
  function renderOutbox() {
    const host = $("#paneOutbox");
    if (!host) return;
    const y = host.scrollTop;
    host.replaceChildren();
    const w = h("div", { class: "wrap" });
    host.append(w);
    const rows = OB.rows || [];
    const open = (c) => rows.filter((r) => obCat(r) === c && !OB.done[r.id]);
    const ready = open("tax").length + open("ghl").length + open("partners").length;
    const refresh = h("button", { class: "readaloud", text: OB.loading ? "Refreshing…" : "Refresh", disabled: OB.loading });
    refresh.addEventListener("click", () => loadOutbox());
    w.append(h("div", { class: "toprow" }, h("p", { class: "daydate", text: "Outbox" + (OB.at ? ` · ${fmtTime(new Date(OB.at))}` : "") }), refresh));
    w.append(h("h1", { class: "head" }, OB.rows ? (ready ? `${ready} ready to enter, Eric.` : "Nothing is ready to enter.") : "Loading your outbox."));
    if (OB.rows) w.append(h("p", { class: "ob-tally" },
      h("span", null, h("b", { text: String(ready) }), " ready"),
      h("span", null, h("b", { text: String(open("waiting").length) }), " waiting"),
      h("span", null, h("b", { text: String(open("gaps").length) }), " email gaps"),
      Object.keys(OB.done).length ? h("span", null, h("b", { text: String(Object.keys(OB.done).length) }), " pushed here") : null));
    if (OB.err) w.append(h("p", { class: "ob-err", text: OB.err }));
    if (OB.msg) w.append(h("p", { class: "ob-msg", role: "status", text: OB.msg }));
    if (!OB.rows) { host.scrollTop = y; return; }

    for (const c of OB_CATS) {
      const items = rows.filter((r) => obCat(r) === c.id);
      const openRows = items.filter((r) => !OB.done[r.id]);
      const sec = h("section", { class: "ob-sec" + (c.id === "gaps" ? " ob-gaps" : "") });
      const head = h("div", { class: "ob-head" }, h("h2", { class: "sec", text: c.title }), h("span", { class: "ob-count", text: String(openRows.length) }));
      const blurb = h("p", { class: "quiet ob-blurb", text: c.blurb });
      const list = h("ul", { class: "ob-list" });
      for (const r of items) {
        const d = OB.done[r.id];
        const cb = h("input", { type: "checkbox", id: "ob-" + r.id, "aria-label": "Select " + r.name, disabled: !!d });
        cb.checked = !!OB.sel[r.id];
        cb.addEventListener("change", () => { if (cb.checked) OB.sel[r.id] = 1; else delete OB.sel[r.id]; OB.confirm = null; renderOutbox(); });
        const nm = safeUrl(r.url) ? ext(h("a", { href: r.url, text: r.name })) : h("span", { text: r.name });
        const tools = h("div", { class: "itemtools" });
        if (d) {
          const undo = h("button", { text: "Undo" });
          undo.addEventListener("click", async () => { undo.disabled = true; try { await obSet(r, false); OB.msg = `${r.name} is back in the outbox.`; } catch (e) { if (e.message !== "signin") OB.msg = "Couldn't save that to Notion. Try again."; } renderOutbox(); });
          tools.append(h("span", { class: "ob-done", text: `Pushed ${d.date}` }), undo);
        } else {
          const cp = h("button", { text: "Copy" });
          cp.addEventListener("click", () => obCopy(obLine(r), cp));
          const pu = h("button", { text: "Mark pushed" });
          pu.addEventListener("click", async () => { pu.disabled = true; pu.textContent = "Saving…"; try { await obSet(r, true); OB.msg = `${r.name} marked pushed.`; } catch (e) { if (e.message !== "signin") OB.msg = "Couldn't save that to Notion. Try again."; } renderOutbox(); });
          tools.append(cp, pu);
        }
        list.append(h("li", { class: d ? "closed" : null }, cb, h("div", { class: "body" },
          h("div", { class: "ttl ob-name" }, nm, ...(r.pushTo || []).map((x) => h("span", { class: "ob-chip", text: x }))),
          h("p", { class: "sen ob-what", text: r.what || "No detail written yet." }),
          tools)));
      }
      if (!items.length) list.append(h("li", { class: "ob-empty quiet", text: "Nothing here right now." }));

      let bar = null;
      if (c.id !== "gaps" && openRows.length) {
        const sel = openRows.filter((r) => OB.sel[r.id]);
        const all = h("button", { class: "textlink", text: sel.length === openRows.length ? "Clear" : "Select all" });
        all.addEventListener("click", () => { const on = sel.length !== openRows.length; openRows.forEach((r) => { if (on) OB.sel[r.id] = 1; else delete OB.sel[r.id]; }); OB.confirm = null; renderOutbox(); });
        const copyB = h("button", { class: "textlink", text: "Copy batch", disabled: !sel.length });
        copyB.addEventListener("click", () => obCopy(sel.map(obLine).join("\n\n"), copyB));
        const confirming = OB.confirm === c.id;
        const pushB = h("button", { class: "textlink" + (confirming ? " ob-confirm" : ""), text: confirming ? `Confirm: mark ${sel.length} pushed` : "Mark pushed", disabled: !sel.length });
        pushB.addEventListener("click", async () => {
          if (!confirming) { OB.confirm = c.id; renderOutbox(); return; }
          OB.confirm = null; pushB.disabled = true; pushB.textContent = "Saving…";
          let failed = 0;
          for (const r of sel) { try { await obSet(r, true); } catch { failed++; } }
          OB.msg = failed ? `${sel.length - failed} marked pushed; ${failed} didn't save. Try those again.` : `${sel.length} marked pushed.`;
          renderOutbox();
        });
        const claude = sel.length ? ext(h("a", { class: "btn", href: obClaudeLink(sel), text: "Have Claude enter these" })) : h("span", { class: "btn ob-off", "aria-disabled": "true", text: "Have Claude enter these" });
        bar = sel.length
          ? h("div", { class: "ob-bar" }, h("span", { class: "quiet", text: `${sel.length} selected` }), all, copyB, pushB, claude)
          : h("div", { class: "ob-bar ob-bar-idle" }, h("span", { class: "quiet", text: "Tick items to copy them, mark them pushed, or hand them to Claude as a batch." }), all);
      }

      if (c.id === "gaps") {
        const det = h("details", { open: OB.gapsOpen });
        det.addEventListener("toggle", () => { OB.gapsOpen = det.open; });
        det.append(h("summary", null, head, blurb), list);
        sec.append(det);
      } else sec.append(...[head, blurb, list, bar].filter(Boolean));
      w.append(sec);
    }
    w.append(h("p", { class: "quiet", style: "margin-top:8px", text: "Mark pushed writes today's date into Pushed in Notion, which takes the row out of the outbox. Have Claude enter these opens a new chat that reads the selected rows from Notion and fills them in, asking before each save." }));
    host.scrollTop = y;
  }
  function showOutbox() { if (!OB.rows || Date.now() - (OB.at || 0) > 5 * 60_000) loadOutbox(); else renderOutbox(); }

  // ---------------- nav (phone) ----------------
  const panes = $("#panes");
  function go(name, smooth = true) {
    const el = document.querySelector(`.pane[data-pane="${name}"]`);
    if (!el) return;
    panes.scrollTo({ left: el.offsetLeft, behavior: smooth ? "smooth" : "auto" });
    markNav(name);
    if (name === "outbox") showOutbox();
  }
  function markNav(name) { document.querySelectorAll(".nav button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.go === name))); }
  $("#nav").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-go]");
    if (!b) return;
    if (!isDesk()) { go(b.dataset.go); return; }
    // desktop: Now = focus view, Today = the brief + editor, Capture = jump to the capture box, Outbox = its own page
    const name = b.dataset.go;
    document.body.classList.toggle("outboxview", name === "outbox");
    toggleFocus(name === "now");
    markNav(name);
    if (name === "outbox") showOutbox();
    if (name === "capture") { const c = $("#deskCapture"); if (c) { c.scrollIntoView({ block: "center" }); c.focus(); } }
  });
  panes.addEventListener("scroll", debounce(() => {
    if (isDesk()) return;
    const i = Math.round(panes.scrollLeft / panes.clientWidth);
    const name = ["now", "today", "capture", "outbox"][i] || "today";
    markNav(name);
    if (name === "outbox" && !OB.rows && !OB.loading) loadOutbox();
  }, 60));


  // ---------------- refresh + "New" badges ----------------
  // An item is new if it was not in the brief the last time this device loaded it.
  // Badges last a day, or until the item is opened, so a quiet re-load does not wipe them.
  const FRESH_MS = 24 * 3600 * 1000;
  const itemKey = (it) => it.key || it.id;
  function noteFresh() {
    if (!B || !B.day) return 0;
    const cur = B.items.map(itemKey);
    const seen = store.get("seenKeys");
    const fresh = store.get("freshKeys") || {};
    const now = Date.now();
    for (const k of Object.keys(fresh)) if (now - fresh[k] > FRESH_MS || !cur.includes(k)) delete fresh[k];
    let added = 0;
    if (Array.isArray(seen)) for (const k of cur) if (!seen.includes(k) && !fresh[k]) { fresh[k] = now; added++; }
    store.set("seenKeys", Array.from(new Set([...(seen || []), ...cur])).slice(-600));
    store.set("freshKeys", fresh);
    return added;
  }
  const isFresh = (it) => !!(store.get("freshKeys") || {})[itemKey(it)];
  function unFresh(it) { const f = store.get("freshKeys") || {}; if (f[itemKey(it)]) { delete f[itemKey(it)]; store.set("freshKeys", f); } }
  const newBadge = (it) => (isFresh(it) ? h("span", { class: "newbadge", text: "New" }) : null);

  function briefPassNow() { const hr = new Date().getHours(); return hr < 12 ? "morning" : hr < 17 ? "afternoon" : "evening"; }
  function runBriefLink() {
    const pass = briefPassNow();
    const prompt =
`Run my ${pass} brief for ${localISO()} with the brief-web skill, so it lands in Oggi. Read "Edits since brief" on the latest day first and carry anything still open.`;
    return "https://claude.ai/new?q=" + encodeURIComponent(prompt);
  }
  const staleDay = () => !!(B && B.day && B.day.date !== localISO());
  let refreshMsg = "";
  async function refreshNow(btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Refreshing…"; }
    const beforeDate = B && B.day ? B.day.date : null;
    let ok = false;
    try { ok = await load(); } catch {}
    const added = ok ? noteFresh() : 0;
    const dayMoved = ok && B && B.day && beforeDate && B.day.date !== beforeDate;
    refreshMsg = !ok ? "Couldn't reach Notion — showing the last copy."
      : dayMoved ? `New brief for ${new Date(B.day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}${added ? ` · ${added} new` : ""}.`
      : added ? `${added} new since you last looked.`
      : `Up to date · ${fmtTime(new Date())}`;
    renderAll();
  }

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
    noteFresh();
    renderAll();
    if (!isDesk()) go(p.get("view") || "today", false);
    if (isDesk() && p.get("view") === "now") toggleFocus(true);
    if (isDesk() && p.get("view") === "outbox") { document.body.classList.add("outboxview"); markNav("outbox"); showOutbox(); }
    // refresh quietly when the app comes back to the foreground
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;
      if (document.activeElement && document.activeElement.closest("input, textarea")) return;
      if (await load().catch(() => false)) { noteFresh(); renderAll(); }
    });
    window.matchMedia("(min-width: 980px)").addEventListener("change", renderAll);
    setInterval(() => { if (camAnim || starAnim || sheetOpen || skyFull || veilOpen()) return; if (sky && (sky.el.classList.contains("away") || !sky.el.querySelector(".sky-menu[hidden]"))) return; if (!document.activeElement || !document.activeElement.closest("input, textarea")) renderNow(); }, 60_000);
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  boot();
})();
