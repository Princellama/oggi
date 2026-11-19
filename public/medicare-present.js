/* Oggi · /medicare Present mode — for in-person and video visits.
   Two windows talk over a BroadcastChannel:
   - the presenter (Eric's laptop): the needs outline from the visit card's Presentation field, private notes,
     the files to show (PNG comparisons, Sunfire PDFs) and the close-out checklist;
   - the audience screen (/medicare/screen): only what Eric chooses to show, for the monitor across the table
     or a Zoom window share.
   Files stay on this device (IndexedDB) and travel between the two windows directly; they never go to Notion.
   Everything from Notion is rendered with textContent, never as markup. */
(function () {
  "use strict";

  const CH = "oggi-present";
  const h = (tag, attrs, ...kids) => {
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
  };
  const DISCLAIMER = "We do not offer every plan available in your area. Currently we represent 3 organizations which offer 26 products in your area. Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program (SHIP) to get information on all of your options.";
  const AGENT = "Eric Barayuga · licensed Medicare agent · 808 218 1903 · HelpingHawaiiSeniors.com";

  // What each kind of point is, in the presenter and on the screen.
  const KINDS = {
    said: { label: "You said", screen: "You told me" },
    asked: { label: "You asked", screen: "You asked" },
    info: { label: "Good to know", screen: "" },
    ask: { label: "Ask them", screen: "Let's talk about" },
    plan: { label: "Agenda", screen: "" },
  };
  const KIND_ORDER = ["said", "asked", "info", "ask", "plan"];

  // A needs-analysis outline for a visit card that has none yet.
  function template(name) {
    const first = String(name || "").split(/\s+and\s+|\s*&\s*|,/)[0].trim().split(/\s+/)[0] || "";
    const pts = (...xs) => xs.map(([k, t]) => ({ k, t }));
    return {
      v: 1, title: (first ? first + "'s" : "Your") + " Medicare review",
      sections: [
        { id: "welcome", t: "Welcome", lead: "Today we look at what matters to you, then the plans side by side. You decide; I explain.",
          points: pts(["plan", "What's important to you"], ["plan", "Your doctors and medicines"], ["plan", "The plans, side by side"], ["plan", "Next steps, only if you're ready"]),
          notes: "Plaud on. Disclaimer in the first minute. Scope of Appointment before any plan talk. Verify: they say their DOB and address." },
        { id: "now", t: "Where you are today", points: pts(["ask", "What plan are you on now?"], ["ask", "What do you like about it, and what would you change?"]) },
        { id: "doctors", t: "Your doctors and medicines", points: pts(["ask", "Which doctors do you see?"], ["ask", "Which medicines do you take?"], ["plan", "I'll check every plan for your doctors and your drug costs"]) },
        { id: "health", t: "Care coming up", points: pts(["ask", "Any surgery, procedure or new specialist coming up next year?"]) },
        { id: "money", t: "What you spend", points: pts(["ask", "What matters more: a lower monthly cost, or a lower worst-case year?"], ["info", "Every plan has a yearly maximum you'd ever pay for medical care"]) },
        { id: "extras", t: "Extras", points: pts(["ask", "Which extras do you use: dental, glasses, hearing, the over-the-counter card?"]) },
        { id: "compare", t: "The plans, side by side", points: pts(["plan", "We'll narrow it to the plans that fit what you told me today"]), notes: "Only after a signed Scope. No 'best plan'; tie each plan back to what they said." },
        { id: "next", t: "Next steps", points: pts(["plan", "Annual Enrollment ends December 7"], ["plan", "Changes take effect January 1"]) },
      ],
      links: [], close: {}, closeNote: "",
    };
  }
  function parse(s, name) {
    try { const o = JSON.parse(s); if (o && Array.isArray(o.sections)) return normalize(o); } catch {}
    return normalize(template(name));
  }
  function normalize(o) {
    o.sections = o.sections.filter((x) => x && typeof x.t === "string").map((x, i) => ({
      id: String(x.id || "s" + i), t: x.t, lead: String(x.lead || ""), notes: String(x.notes || ""), exhibit: x.exhibit ? String(x.exhibit) : "",
      points: (Array.isArray(x.points) ? x.points : []).filter((p) => p && typeof p.t === "string").map((p) => ({ k: KINDS[p.k] ? p.k : "info", t: p.t, hide: !!p.hide })),
    }));
    o.links = (Array.isArray(o.links) ? o.links : []).filter((l) => l && /^https:\/\//i.test(String(l.u || ""))).map((l) => ({ t: String(l.t || "Link"), u: String(l.u) }));
    o.close = o.close && typeof o.close === "object" ? o.close : {};
    o.closeNote = String(o.closeNote || "");
    o.title = String(o.title || "Medicare review");
    return o;
  }

  // ---------------- files on this device (IndexedDB) ----------------
  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("oggi-present", 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore("files", { keyPath: "id" }); s.createIndex("call", "call"); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function filesFor(call) {
    try {
      const d = await db();
      return await new Promise((res) => { const q = d.transaction("files").objectStore("files").index("call").getAll(call); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
    } catch { return []; }
  }
  async function putFile(rec) { const d = await db(); await new Promise((res, rej) => { const t = d.transaction("files", "readwrite"); t.objectStore("files").put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function delFile(id) { const d = await db(); await new Promise((res) => { const t = d.transaction("files", "readwrite"); t.objectStore("files").delete(id); t.oncomplete = res; t.onerror = res; }); }
  const isPdf = (f) => f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name));

  // ---------------- the audience screen ----------------
  // Draws one view. Used by /medicare/screen and by the presenter's small "On screen" preview.
  function drawView(box, view, blob) {
    box.textContent = "";
    const v = view || { kind: "title" };
    const foot = () => h("p", { class: "scr-disc", text: DISCLAIMER });
    if (v.kind === "blank") { box.append(h("div", { class: "scr scr-blank" })); return; }
    if (v.kind === "exhibit") {
      const url = blob ? URL.createObjectURL(blob) : null;
      const stage = h("div", { class: "scr scr-ex" });
      if (!url) stage.append(h("p", { class: "scr-lead", text: "Opening the file…" }));
      else if (v.pdf) stage.append(h("iframe", { class: "scr-pdf", src: url + "#toolbar=0&navpanes=0&view=FitH", title: v.name || "Document" }));
      else stage.append(h("img", { class: "scr-img", src: url, alt: v.name || "Comparison" }));
      box.append(stage);
      return;
    }
    if (v.kind === "link") {
      box.append(h("div", { class: "scr scr-card" },
        h("p", { class: "scr-k", text: "Looking at it together" }), h("h1", { text: v.t || "Plan search" }),
        h("p", { class: "scr-lead", text: "The plan finder is open in its own window." }), foot()));
      return;
    }
    if (v.kind === "mahalo") {
      box.append(h("div", { class: "scr scr-card" },
        h("p", { class: "scr-k", text: "Mahalo" }), h("h1", { text: v.title || "Thank you" }),
        v.next && v.next.length ? h("ul", { class: "scr-pts" }, ...v.next.map((t) => h("li", { class: "k-plan" }, h("span", { class: "scr-t", text: t })))) : null,
        h("p", { class: "scr-agent", text: AGENT }), foot()));
      return;
    }
    if (v.kind === "section") {
      const pts = (v.points || []).filter((p) => !p.hide);
      box.append(h("div", { class: "scr scr-sec" },
        h("p", { class: "scr-k", text: v.kicker || "" }),
        h("h1", { text: v.t || "" }),
        v.lead ? h("p", { class: "scr-lead", text: v.lead }) : null,
        pts.length ? h("ul", { class: "scr-pts" }, ...pts.map((p) => h("li", { class: "k-" + p.k },
          KINDS[p.k] && KINDS[p.k].screen ? h("span", { class: "scr-lab", text: KINDS[p.k].screen }) : null,
          h("span", { class: "scr-t", text: p.t })))) : null,
        foot()));
      return;
    }
    box.append(h("div", { class: "scr scr-card scr-title" },
      h("p", { class: "scr-k", text: "Helping Hawaii Seniors" }), h("h1", { text: v.title || "Your Medicare review" }),
      v.sub ? h("p", { class: "scr-lead", text: v.sub }) : null,
      h("p", { class: "scr-agent", text: AGENT }), foot()));
  }

  function screen() {
    document.body.classList.add("mc-screen");
    document.title = "Screen · Oggi";
    const main = document.getElementById("main");
    main.className = "scr-root";
    main.textContent = "";
    const stage = h("div", { class: "scr-stage" });
    const hint = h("button", { type: "button", class: "scr-hint", text: "Drag this window to the screen they'll see, then click here for full screen. Arrow keys move through the sections; B blanks the screen." });
    hint.addEventListener("click", () => { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); hint.hidden = true; });
    main.append(stage, hint);
    let last = null;
    drawView(stage, { kind: "title", title: "Your Medicare review" });
    const bc = new BroadcastChannel(CH);
    bc.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "view") { last = m; drawView(stage, m.view, m.blob || null); }
      if (m.type === "ping") bc.postMessage({ type: "here" });
      if (m.type === "bye") drawView(stage, { kind: "blank" });
    };
    bc.postMessage({ type: "hello" });
    setInterval(() => bc.postMessage({ type: "here" }), 4000);
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === " " || e.key === "PageDown" || e.key === "PageUp" || /^[bBtT]$/.test(e.key)) {
        e.preventDefault(); bc.postMessage({ type: "key", key: e.key });
      }
      if (e.key === "f" || e.key === "F") document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
    });
    window.addEventListener("beforeunload", () => bc.close());
    return last;
  }

  // ---------------- the presenter ----------------
  // c: the visit card (Medicare Calls row). deps: { save(fields) → Promise, outcomes, fmtClock, onClose }.
  function presenter(c, deps) {
    const P = parse(c.presentation, c.name);
    const people = String(c.name || "").replace(/\s+/g, " ").trim();
    let cur = 0;                    // section index in the presenter
    let onScreen = { kind: "title" }, onBlob = null;
    let files = [];
    let saveT = null, connected = false, lastHere = 0;
    const started = Date.now();
    const bc = new BroadcastChannel(CH);
    const flag = h("span", { class: "pz-flag", "aria-live": "polite" });

    const persist = () => {
      clearTimeout(saveT);
      flag.textContent = "";
      saveT = setTimeout(async () => {
        flag.textContent = "Saving…";
        try { await deps.save({ presentation: JSON.stringify(P) }); flag.textContent = "Saved"; setTimeout(() => { if (flag.textContent === "Saved") flag.textContent = ""; }, 1400); }
        catch { flag.textContent = "Not saved yet. Check the connection; your edits are still here."; }
      }, 1100);
    };

    // ----- what's on the other screen -----
    const kicker = (s) => (s.id === "welcome" ? "Helping Hawaii Seniors" : P.title);
    const viewOf = (s) => ({ kind: "section", sid: s.id, t: s.t, lead: s.lead, kicker: kicker(s), points: s.points.map((p) => ({ k: p.k, t: p.t, hide: p.hide })) });
    function send(view, blob) {
      onScreen = view; onBlob = blob || null;
      bc.postMessage({ type: "view", view, blob: onBlob });
      paintPreview();
      paintRail();
    }
    const showTitle = () => send({ kind: "title", title: P.title, sub: "with " + AGENT.split(" · ")[0] + ", licensed Medicare agent" });
    const showSection = (i) => { cur = i; send(viewOf(P.sections[i])); paint(); };
    const fileByName = (n) => files.find((f) => f.name === n) || null;
    const showFile = (f) => { if (f) send({ kind: "exhibit", name: f.name, pdf: isPdf(f) }, f.blob); };
    // Points, title and lead edits go straight to the screen when that section is showing.
    const isLive = (s) => onScreen.kind === "section" && onScreen.sid === s.id;
    const liveIndex = () => Math.max(0, P.sections.findIndex((x) => isLive(x)));
    const refreshIfShowing = (s) => { if (isLive(s)) send(viewOf(s)); };

    bc.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "hello") { connected = true; lastHere = Date.now(); bc.postMessage({ type: "view", view: onScreen, blob: onBlob }); paintConn(); }
      if (m.type === "here") { lastHere = Date.now(); if (!connected) { connected = true; paintConn(); } }
      if (m.type === "key") onKey({ key: m.key, preventDefault() {}, fromScreen: true });
    };
    const connTimer = setInterval(() => { const was = connected; connected = Date.now() - lastHere < 9000; if (was !== connected) paintConn(); bc.postMessage({ type: "ping" }); }, 3000);

    // Opens the audience window; on Chrome with a second screen, places it there.
    async function openScreen() {
      let feat = "popup,width=1280,height=800";
      try {
        if (window.getScreenDetails) {
          const sd = await window.getScreenDetails();
          const other = sd.screens.find((s) => s !== sd.currentScreen);
          if (other) feat = `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
        }
      } catch {}
      const w = window.open("/medicare/screen", "oggi-screen", feat);
      if (!w) { alert("The browser blocked the screen window. Allow pop-ups for Oggi, then try again."); return; }
      setTimeout(() => bc.postMessage({ type: "view", view: onScreen, blob: onBlob }), 900);
    }
    function openLink(l) {
      window.open(l.u, "oggi-sunfire", "popup,width=1280,height=860");
      send({ kind: "link", t: l.t });
    }

    // ----- layout -----
    const root = h("div", { class: "pz", role: "dialog", "aria-label": "Present mode" });
    const conn = h("span", { class: "pz-conn" });
    const clock = h("span", { class: "pz-clock" });
    const top = h("div", { class: "pz-top" },
      h("span", { class: "pz-mode", text: "Present" }), h("b", { class: "pz-who", text: people }), clock, conn, flag,
      h("span", { class: "pz-sp" }),
      h("button", { type: "button", class: "btn small ghost", text: "Open screen", title: "Opens the audience window. Drag it to the other monitor or share it on Zoom.", onclick: openScreen }),
      h("button", { type: "button", class: "btn small", text: "Close out", onclick: () => closeOut() }),
      h("button", { type: "button", class: "pz-x", "aria-label": "Leave Present mode", text: "×", onclick: () => leave() }));
    const rail = h("nav", { class: "pz-rail", "aria-label": "Sections" });
    const body = h("section", { class: "pz-body" });
    const side = h("aside", { class: "pz-side" });
    root.append(top, h("div", { class: "pz-cols" }, rail, body, side));

    function paintConn() {
      conn.className = "pz-conn" + (connected ? " on" : "");
      conn.textContent = connected ? "Screen connected" : "No screen yet";
    }
    const tick = setInterval(() => { const m = Math.floor((Date.now() - started) / 60000); clock.textContent = m + " min"; }, 15000);
    clock.textContent = "0 min";

    function paintRail() {
      rail.textContent = "";
      const item = (label, active, live, on) => h("button", { type: "button", class: "pz-ri" + (active ? " cur" : "") + (live ? " live" : ""), onclick: on }, label, live ? h("span", { class: "pz-live", text: "on screen" }) : null);
      rail.append(item("Title screen", false, onScreen.kind === "title", showTitle));
      P.sections.forEach((s, i) => {
        const said = s.points.filter((p) => p.k === "said" || p.k === "asked").length;
        rail.append(item(h("span", {}, h("span", { class: "pz-n", text: String(i + 1) }), s.t, said ? h("span", { class: "pz-said", title: "Things they told you", text: "★" + said }) : null),
          i === cur, isLive(s), () => { cur = i; paint(); }));
      });
      rail.append(h("button", { type: "button", class: "pz-ri pz-add", text: "+ Add a section", onclick: () => {
        P.sections.push({ id: "s" + Date.now().toString(36), t: "New section", lead: "", notes: "", exhibit: "", points: [] });
        cur = P.sections.length - 1; persist(); paint();
      } }));
    }

    function pointRow(s, p, i) {
      const kind = h("select", { class: "pz-kind k-" + p.k, "aria-label": "Kind of point" }, ...KIND_ORDER.map((k) => h("option", { value: k, text: KINDS[k].label, selected: k === p.k })));
      kind.addEventListener("change", () => { p.k = kind.value; kind.className = "pz-kind k-" + p.k; persist(); refreshIfShowing(s); paintRail(); });
      const t = h("input", { class: "pz-pt", type: "text", value: p.t, "aria-label": "Point" });
      t.addEventListener("input", () => { p.t = t.value; persist(); refreshIfShowing(s); });
      const eye = h("button", { type: "button", class: "pz-eye" + (p.hide ? " off" : ""), title: p.hide ? "Hidden from the screen. Click to show." : "Shown on the screen. Click to hide.", text: p.hide ? "hidden" : "shown" });
      eye.addEventListener("click", () => { p.hide = !p.hide; persist(); refreshIfShowing(s); paint(); });
      const del = h("button", { type: "button", class: "pz-del", "aria-label": "Remove point", text: "×", onclick: () => { s.points.splice(i, 1); persist(); refreshIfShowing(s); paint(); } });
      return h("li", { class: "pz-point" + (p.hide ? " off" : "") }, kind, t, eye, del);
    }

    function paint() {
      paintRail();
      body.textContent = "";
      const s = P.sections[cur];
      if (!s) return;
      const title = h("input", { class: "pz-title", value: s.t, "aria-label": "Section title" });
      title.addEventListener("input", () => { s.t = title.value; persist(); refreshIfShowing(s); paintRail(); });
      const lead = h("textarea", { class: "pz-lead", rows: "2", placeholder: "One line they'll read on the screen (optional)" });
      lead.value = s.lead;
      lead.addEventListener("input", () => { s.lead = lead.value; persist(); refreshIfShowing(s); });
      const live = isLive(s);
      body.append(
        h("div", { class: "pz-head" },
          h("span", { class: "pz-step", text: `${cur + 1} of ${P.sections.length}` }),
          h("button", { type: "button", class: "btn" + (live ? " ghost" : ""), text: live ? "On screen ✓" : "Show on screen ▶", onclick: () => showSection(cur) }),
          h("span", { class: "pz-sp" }),
          h("button", { type: "button", class: "btn small ghost", text: "← Back", disabled: cur === 0, onclick: () => { cur = Math.max(0, cur - 1); paint(); } }),
          h("button", { type: "button", class: "btn small ghost", text: "Next →", disabled: cur === P.sections.length - 1, onclick: () => { cur = Math.min(P.sections.length - 1, cur + 1); paint(); } })),
        title, lead);

      const ul = h("ul", { class: "pz-points" }, ...s.points.map((p, i) => pointRow(s, p, i)));
      const nk = h("select", { class: "pz-kind k-said", "aria-label": "Kind" }, ...KIND_ORDER.map((k) => h("option", { value: k, text: KINDS[k].label })));
      nk.addEventListener("change", () => { nk.className = "pz-kind k-" + nk.value; });
      const nt = h("input", { class: "pz-pt", type: "text", placeholder: "Type what they said or asked, then Enter" });
      const add = () => { const v = nt.value.trim(); if (!v) return; s.points.push({ k: nk.value, t: v }); nt.value = ""; persist(); refreshIfShowing(s); paint(); const again = body.querySelector(".pz-new .pz-pt"); if (again) again.focus(); };
      nt.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
      ul.append(h("li", { class: "pz-point pz-new" }, nk, nt, h("button", { type: "button", class: "btn small ghost", text: "Add", onclick: add })));
      body.append(h("h3", { class: "pz-h", text: "Points" }), ul);

      // The file for this section (a comparison PNG or a Sunfire PDF).
      const ex = s.exhibit ? fileByName(s.exhibit) : null;
      const exBox = h("div", { class: "pz-ex" });
      if (ex) {
        exBox.append(thumb(ex), h("div", { class: "pz-exm" }, h("b", { text: ex.name }),
          h("button", { type: "button", class: "btn small", text: onScreen.kind === "exhibit" && onScreen.name === ex.name ? "On screen ✓" : "Show on screen ▶", onclick: () => showFile(ex) }),
          h("button", { type: "button", class: "textlink pz-linkbtn", text: "Use a different file", onclick: () => pick((f) => { s.exhibit = f.name; persist(); paint(); }) })));
      } else {
        exBox.append(h("p", { class: "quiet", text: s.exhibit ? `Expecting ${s.exhibit}. Add it below (drag it in from Downloads) and it attaches here.` : "No file for this section." }),
          h("button", { type: "button", class: "btn small ghost", text: s.exhibit ? "Add " + s.exhibit : "Attach a PNG or PDF", onclick: () => pick((f) => { s.exhibit = f.name; persist(); paint(); }) }));
      }
      body.append(h("h3", { class: "pz-h", text: "File for this section" }), exBox);

      const notes = h("textarea", { class: "pz-notes", rows: "4", placeholder: "Private notes. Never shown on the screen." });
      notes.value = s.notes;
      notes.addEventListener("input", () => { s.notes = notes.value; persist(); });
      body.append(h("h3", { class: "pz-h", text: "Only you see this" }), notes);
      paintSide();
    }

    // ----- right column: what's on screen, quick screens, files, links -----
    const preview = h("div", { class: "pz-prev", "aria-label": "What the screen shows now" });
    function paintPreview() { const inner = h("div", { class: "pz-prev-in" }); drawView(inner, onScreen, onBlob); preview.textContent = ""; preview.append(inner); fitPreview(); }
    const fitPreview = () => { if (preview.clientWidth) preview.style.setProperty("--pz-scale", String(preview.clientWidth / 1280)); };
    if (window.ResizeObserver) new ResizeObserver(fitPreview).observe(preview);
    function thumb(f) {
      if (isPdf(f)) return h("span", { class: "pz-thumb pdf", text: "PDF" });
      const img = h("img", { class: "pz-thumb", alt: "" });
      img.src = URL.createObjectURL(f.blob);
      return img;
    }
    function paintSide() {
      side.textContent = "";
      side.append(h("h3", { class: "pz-h", text: "On their screen" }), preview,
        h("div", { class: "pz-quick" },
          h("button", { type: "button", class: "btn small ghost", text: "Title", onclick: showTitle }),
          h("button", { type: "button", class: "btn small ghost", text: "Blank (B)", onclick: () => send({ kind: "blank" }) }),
          h("button", { type: "button", class: "btn small ghost", text: "This section", onclick: () => showSection(cur) })));
      // Files
      const fl = h("ul", { class: "pz-files" });
      for (const f of files) {
        const live = onScreen.kind === "exhibit" && onScreen.name === f.name;
        fl.append(h("li", { class: live ? "live" : "" }, thumb(f), h("span", { class: "pz-fn", text: f.name }),
          h("button", { type: "button", class: "btn small" + (live ? " ghost" : ""), text: live ? "On ✓" : "Show", onclick: () => showFile(f) }),
          h("button", { type: "button", class: "pz-del", "aria-label": "Remove " + f.name, text: "×", onclick: async () => { await delFile(f.id); files = files.filter((x) => x !== f); paint(); } })));
      }
      const drop = h("button", { type: "button", class: "pz-drop", text: files.length ? "+ Add PNG or PDF (or drop here)" : "Drop the comparison PNGs or Sunfire PDFs here, or click to choose", onclick: () => pick() });
      side.append(h("h3", { class: "pz-h", text: "Files · on this device" }), fl, drop);
      // Links
      const ll = h("ul", { class: "pz-links" });
      P.links.forEach((l, i) => ll.append(h("li", {}, h("span", { text: l.t }),
        h("button", { type: "button", class: "btn small", text: "Open ▶", title: "Opens in its own window to drag to their screen; their screen shows a plan-search card meanwhile.", onclick: () => openLink(l) }),
        h("button", { type: "button", class: "pz-del", "aria-label": "Remove link", text: "×", onclick: () => { P.links.splice(i, 1); persist(); paint(); } }))));
      const lt = h("input", { class: "pz-pt", type: "text", placeholder: "Name, e.g. Sunfire quote" });
      const lu = h("input", { class: "pz-pt", type: "url", placeholder: "https://www.sunfirematrix.com/…" });
      const addLink = () => { const u = lu.value.trim(); if (!/^https:\/\//i.test(u)) { lu.focus(); return; } P.links.push({ t: lt.value.trim() || "Sunfire", u }); persist(); paint(); };
      lu.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } });
      side.append(h("h3", { class: "pz-h", text: "Sunfire and web links" }), ll,
        h("div", { class: "pz-addlink" }, lt, lu, h("button", { type: "button", class: "btn small ghost", text: "Add link", onclick: addLink })));
      side.append(h("p", { class: "pz-keys", text: "Keys: → ← move and show sections · B blank · T title · Esc leaves. The same keys work in the screen window." }));
      paintPreview();
    }

    // ----- adding files -----
    const input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,application/pdf", multiple: true, hidden: true });
    root.append(input);
    let after = null;
    function pick(cb) { after = cb || null; input.value = ""; input.click(); }
    async function addFiles(list) {
      let lastAdded = null;
      for (const f of list) {
        if (!/^image\/(png|jpeg|webp)$/.test(f.type) && !isPdf(f)) continue;
        const same = files.find((x) => x.name === f.name);
        const rec = { id: same ? same.id : c.id + ":" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), call: c.id, name: f.name, type: f.type || (isPdf(f) ? "application/pdf" : ""), blob: f, added: new Date().toISOString() };
        try { await putFile(rec); } catch {}
        files = files.filter((x) => x.name !== f.name).concat(rec);
        lastAdded = rec;
      }
      if (after && lastAdded) after(lastAdded);
      after = null;
      paint();
    }
    input.addEventListener("change", () => addFiles([...input.files]));
    root.addEventListener("dragover", (e) => { e.preventDefault(); root.classList.add("drag"); });
    root.addEventListener("dragleave", (e) => { if (e.target === root) root.classList.remove("drag"); });
    root.addEventListener("drop", (e) => { e.preventDefault(); root.classList.remove("drag"); if (e.dataTransfer && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });

    // ----- keys -----
    function onKey(e) {
      if (!e.fromScreen && document.activeElement && document.activeElement.closest("input, textarea, select")) { if (e.key === "Escape") document.activeElement.blur(); return; }
      if (root.querySelector(".pz-close")) { if (e.key === "Escape") root.querySelector(".pz-close").remove(); return; }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); showSection(onScreen.kind === "section" ? Math.min(P.sections.length - 1, liveIndex() + 1) : onScreen.kind === "title" ? 0 : cur); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); if (onScreen.kind === "section" && liveIndex() === 0) showTitle(); else showSection(onScreen.kind === "section" ? Math.max(0, liveIndex() - 1) : cur); }
      else if (e.key === "b" || e.key === "B") send(onScreen.kind === "blank" ? viewOf(P.sections[cur]) : { kind: "blank" });
      else if (e.key === "t" || e.key === "T") showTitle();
      else if (e.key === "Escape" && !e.fromScreen) leave();
    }
    document.addEventListener("keydown", onKey);

    // ----- close-out checklist -----
    const CALLBOX = [["recording", "Plaud recording on"], ["verified", "Identity verified (they said their DOB and address)"], ["disclaimer", "Disclaimer read in the first minute"], ["soa", "Scope of Appointment signed before plan talk"]];
    const ALWAYS = [["docs", "Doctors checked in network on the plans we looked at"], ["drugs", "Medicines and drug costs checked"], ["sb", "Offered the Summary of Benefits, star ratings and where to find the Evidence of Coverage"],
      ["card", "Left my card and how to reach me"], ["referral", "Asked who else might need help with Medicare"], ["plaud", "Plaud note: Claude matches the recording"]];
    const ENROLLED = [["app", "Application submitted and confirmation saved"], ["effective", "Told them the start date and when the ID card and welcome kit arrive"], ["auto", "Explained the current plan ends on its own when the new one starts; don't cancel it yourself"], ["drugsfill", "Reminded them to fill prescriptions after the start date with the new card"]];
    function closeOut() {
      const K = P.close;
      for (const [k] of CALLBOX) if (K[k] == null && c[k]) K[k] = true;
      const panel = h("div", { class: "pz-close", role: "dialog", "aria-label": "Close-out checklist" });
      const covered = [];
      P.sections.forEach((s) => s.points.forEach((p, i) => { if (p.k === "said" || p.k === "asked") covered.push({ key: `pt:${s.id}:${i}`, t: p.t, s: s.t }); }));
      const box = (key, label, sub) => {
        const id = "pzc-" + key.replace(/[^a-z0-9]/gi, "-");
        const inp = h("input", { type: "checkbox", id });
        inp.checked = !!K[key];
        inp.addEventListener("change", () => { K[key] = inp.checked; persist(); count(); });
        return h("label", { for: id, class: "pz-cb" }, inp, h("span", {}, label, sub ? h("small", { text: " · " + sub }) : null));
      };
      const outcome = h("select", { id: "pzc-outcome" }, h("option", { value: "", text: "Choose…" }), ...deps.outcomes.map((o) => h("option", { value: o, text: o, selected: o === (K.outcome || c.outcome) })));
      const planIn = h("input", { type: "text", id: "pzc-plan", placeholder: "Plan chosen (if any)", value: K.plan || "" });
      const confIn = h("input", { type: "text", id: "pzc-conf", placeholder: "Application confirmation # (not a Medicare number)", value: K.conf || "" });
      const nextIn = h("input", { type: "text", id: "pzc-next", placeholder: "Next step, e.g. Send drug check results", value: K.nextStep || c.nextStep || "" });
      const nextD = h("input", { type: "date", id: "pzc-nextd", value: (K.nextDate || c.nextDate || "").slice(0, 10) });
      const noteIn = h("textarea", { id: "pzc-note", rows: "3", placeholder: "Anything else from the meeting (no Medicare numbers)" });
      noteIn.value = P.closeNote;
      const enrolledBox = h("div", { class: "pz-cgroup", hidden: (K.outcome || c.outcome) !== "Enrolled" ? true : null }, h("h4", { text: "They enrolled" }), ...ENROLLED.map(([k, l]) => box(k, l)), h("div", { class: "pz-crow" }, planIn, confIn));
      for (const [el, k] of [[planIn, "plan"], [confIn, "conf"], [nextIn, "nextStep"], [nextD, "nextDate"]]) el.addEventListener("input", () => { K[k] = el.value; persist(); });
      noteIn.addEventListener("input", () => { P.closeNote = noteIn.value; persist(); });
      outcome.addEventListener("change", () => { K.outcome = outcome.value; enrolledBox.hidden = outcome.value !== "Enrolled"; persist(); count(); });
      const left = h("span", { class: "pz-left" });
      const fin = h("button", { type: "button", class: "btn", text: "Finish and save to the visit card" });
      function count() {
        const all = [...CALLBOX, ...ALWAYS].map(([k]) => k).concat(covered.map((x) => x.key)).concat(K.outcome === "Enrolled" ? ENROLLED.map(([k]) => k) : []);
        const n = all.filter((k) => !K[k]).length;
        left.textContent = n ? `${n} not ticked` : "All ticked";
        left.className = "pz-left" + (n ? "" : " ok");
      }
      fin.addEventListener("click", async () => {
        if (!outcome.value) { outcome.focus(); left.textContent = "Choose an outcome first"; return; }
        fin.disabled = true; fin.textContent = "Saving…";
        const now = deps.fmtClock(new Date().toISOString());
        const missed = covered.filter((x) => !K[x.key]).map((x) => x.t);
        const sum = [`[${now}] Present mode close-out: ${outcome.value}.`,
          covered.length ? `Covered what they raised: ${covered.filter((x) => K[x.key]).map((x) => x.t).join("; ") || "none ticked"}.` : "",
          missed.length ? `Not yet covered: ${missed.join("; ")}.` : "",
          K.plan ? `Plan chosen: ${K.plan}.` : "", K.conf ? `Confirmation: ${K.conf}.` : "",
          [...ALWAYS, ...(K.outcome === "Enrolled" ? ENROLLED : [])].filter(([k]) => !K[k]).length ? `Unticked: ${[...ALWAYS, ...(K.outcome === "Enrolled" ? ENROLLED : [])].filter(([k]) => !K[k]).map(([, l]) => l).join("; ")}.` : "",
          P.closeNote ? `Notes: ${P.closeNote}` : ""].filter(Boolean).join(" ");
        K.done = new Date().toISOString();
        const fields = { outcome: outcome.value, stamp: !c.calledAt, nextStep: nextIn.value, nextDate: nextD.value || null,
          recording: !!K.recording, verified: !!K.verified, disclaimer: !!K.disclaimer, soa: !!K.soa, plaud: !!K.plaud || !!K.recording,
          notes: ((c.notes || "").trim() ? (c.notes || "").trim() + "\n" : "") + sum, presentation: JSON.stringify(P) };
        try {
          clearTimeout(saveT);
          await deps.save(fields);
          send({ kind: "mahalo", title: "Mahalo, " + people.replace(/^(.+?) and (.+?) (\S+)$/, "$1 & $2"), next: [nextIn.value && (nextIn.value + (nextD.value ? " · " + deps.fmtDay(nextD.value) : "")), "Questions anytime: call or text 808 218 1903"].filter(Boolean) });
          panel.querySelector(".pz-cfoot").replaceChildren(h("p", { class: "pz-left ok", text: "Saved to the visit card. Their screen says mahalo. File it with Claude from the Calls tab." }),
            h("button", { type: "button", class: "btn small ghost", text: "Back to Present", onclick: () => panel.remove() }),
            h("button", { type: "button", class: "btn small", text: "Leave Present mode", onclick: () => leave() }));
        } catch { fin.disabled = false; fin.textContent = "Not saved. Try again"; }
      });
      panel.append(h("div", { class: "pz-cin" },
        h("div", { class: "pz-chead" }, h("h2", { text: "Close out · " + people }), h("button", { type: "button", class: "pz-x", "aria-label": "Close the checklist", text: "×", onclick: () => panel.remove() })),
        h("div", { class: "pz-cgroup" }, h("h4", { text: "Compliance" }), ...CALLBOX.map(([k, l]) => box(k, l))),
        covered.length ? h("div", { class: "pz-cgroup" }, h("h4", { text: "What they raised: did we cover it?" }), ...covered.map((x) => box(x.key, x.t, x.s))) : null,
        h("div", { class: "pz-cgroup" }, h("h4", { text: "Before you leave" }), ...ALWAYS.map(([k, l]) => box(k, l))),
        h("div", { class: "pz-cgroup" }, h("h4", { text: "Outcome" }),
          h("div", { class: "pz-crow" }, h("label", { for: "pzc-outcome", text: "Outcome" }), outcome),
          h("div", { class: "pz-crow" }, nextIn, nextD)),
        enrolledBox,
        h("div", { class: "pz-cgroup" }, h("h4", { text: "Notes" }), noteIn),
        h("div", { class: "pz-cfoot" }, left, fin)));
      root.append(panel);
      count();
    }

    // ----- leaving -----
    function leave() {
      clearTimeout(saveT);
      deps.save({ presentation: JSON.stringify(P) }).catch(() => {});
      bc.postMessage({ type: "view", view: { kind: "blank" } });
      clearInterval(connTimer); clearInterval(tick);
      document.removeEventListener("keydown", onKey);
      bc.close();
      root.remove();
      document.body.classList.remove("mc-noscroll");
      if (deps.onClose) deps.onClose();
    }

    document.body.append(root);
    document.body.classList.add("mc-noscroll");
    paintConn();
    paint();
    showTitle();
    filesFor(c.id).then((fs) => { files = fs.sort((a, b) => String(a.added).localeCompare(String(b.added))); paint(); });
  }

  window.MCPresent = { screen, presenter, template };
})();
