/* Oggi · /jw — the Kalihi galaxy. Plain JS, no build step.
   Behind Oggi sign-in and the /jw PIN (checked on the server). Everything shown comes from Notion
   after both checks; nothing JW-specific is written in this file. All text goes in via textContent. */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
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
  const safeUrl = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : null);
  const ext = (href, text) => h("a", { href, target: "_blank", rel: "noopener noreferrer", text });
  const pad = (n) => String(n).padStart(2, "0");
  const today = () => { const x = new Date(); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  const fmtDay = (iso) => new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  function clock(iso) {
    const m = /T(\d\d):(\d\d)/.exec(iso || ""); if (!m) return "";
    let hh = Number(m[1]); const ap = hh >= 12 ? "PM" : "AM"; hh = hh % 12 || 12;
    return m[2] === "00" ? `${hh} ${ap}` : `${hh}:${m[2]} ${ap}`;
  }
  const glyph = () => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "jw-glyph"); s.setAttribute("aria-hidden", "true"); const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#g-jw"); s.append(u); return s; };

  async function api(method, path, body) {
    const opt = { method, credentials: "same-origin" };
    if (body) { opt.headers = { "Content-Type": "application/json" }; opt.body = JSON.stringify(body); }
    const r = await fetch(path + (method === "GET" ? "?d=" + today() : ""), opt);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || `failed (${r.status})`); e.status = r.status; e.code = j.error; throw e; }
    return j;
  }

  // ---------------- the sky ----------------
  (function stars() {
    const c = $("#stars"); if (!c || !c.getContext) return;
    const ctx = c.getContext("2d");
    const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W, H, S = [];
    function size() {
      const r = window.devicePixelRatio || 1; W = innerWidth; H = innerHeight;
      c.width = W * r; c.height = H * r; ctx.setTransform(r, 0, 0, r, 0, 0);
      S = Array.from({ length: Math.round(W * H / 5200) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.1 + .2, p: Math.random() * 6.28, s: .4 + Math.random() }));
    }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      for (const s of S) { ctx.globalAlpha = .25 + .5 * (still ? .6 : (Math.sin(s.p + t / 1000 * s.s) + 1) / 2); ctx.fillStyle = "#CFE6E2"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.29); ctx.fill(); }
      if (!still) requestAnimationFrame(draw);
    }
    size(); addEventListener("resize", size); requestAnimationFrame(draw);
  })();

  // ---------------- PIN gate ----------------
  function showGate(msg) {
    $("#lock").hidden = true;
    const main = $("#main"); main.replaceChildren();
    const boxes = [0, 1, 2, 3].map(() => h("input", { type: "password", inputmode: "numeric", maxlength: "1", autocomplete: "off", "aria-label": "PIN digit" }));
    const err = h("p", { class: "jw-err", role: "alert", text: msg || "" });
    const row = h("div", { class: "jw-pin" }, boxes);
    async function submit() {
      const pin = boxes.map((b) => b.value).join("");
      if (pin.length < 4) return;
      boxes.forEach((b) => (b.disabled = true));
      try { await api("POST", "/auth/jw", { pin }); load(); }
      catch (e) {
        if (e.status === 401 && e.code === "signin") return toSignin();
        err.textContent = e.message; row.classList.remove("shake"); void row.offsetWidth; row.classList.add("shake");
        boxes.forEach((b) => { b.disabled = false; b.value = ""; }); boxes[0].focus();
      }
    }
    boxes.forEach((b, i) => {
      b.addEventListener("input", () => { b.value = b.value.replace(/\D/g, "").slice(-1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); submit(); });
      b.addEventListener("keydown", (ev) => { if (ev.key === "Backspace" && !b.value && boxes[i - 1]) { boxes[i - 1].focus(); boxes[i - 1].value = ""; } });
      b.addEventListener("paste", (ev) => { const d = (ev.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 4); if (d.length === 4) { ev.preventDefault(); d.split("").forEach((x, k) => (boxes[k].value = x)); submit(); } });
    });
    main.append(h("div", { class: "jw-gate" }, glyph(), h("h1", { class: "jw-title", text: "Kalihi" }), h("p", { class: "jw-sub", text: "Enter your PIN." }), row, err));
    boxes[0].focus();
  }
  function toSignin() {
    const main = $("#main"); main.replaceChildren(
      h("div", { class: "jw-gate" }, glyph(), h("h1", { class: "jw-title", text: "Kalihi" }), h("p", { class: "jw-sub", text: "Sign in to Oggi first, then come back here." }),
        h("p", null, h("a", { class: "jw-back", href: "/", text: "Go to Oggi sign-in →" }))));
  }

  // ---------------- data ----------------
  let D = null;
  async function load() {
    try { D = await api("GET", "/api/jw"); }
    catch (e) {
      if (e.status === 401 && e.code === "pin") return showGate();
      if (e.status === 401) return toSignin();
      $("#main").replaceChildren(h("p", { class: "jw-err", text: "Couldn't load: " + e.message }));
      return;
    }
    render();
  }

  // deliverables: one per line; a line starting "[x]" is done
  const parseDel = (txt) => String(txt || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const m = /^\[(x| )\]\s*/i.exec(l); return { done: !!m && m[1].toLowerCase() === "x", text: m ? l.slice(m[0].length) : l }; });
  const joinDel = (list) => list.map((d) => (d.done ? "[x] " : "") + d.text).join("\n");

  function partCard(p, lead) {
    const card = h("div", { class: "jw-part" + (lead ? " lead" : ""), id: "part-" + p.id });
    const chips = h("span", null, lead ? h("span", { class: "jw-chip next", text: "Next part" }) : null, " ", p.status ? h("span", { class: "jw-chip " + p.status, text: p.status }) : null);
    card.append(h("div", { class: "jw-row" }, h("h3", { class: "jw-name", text: p.name }), chips));
    const meta = [p.event, p.when ? fmtDay(p.when) + (clock(p.when) ? " · " + clock(p.when) : "") : null, p.where].filter(Boolean).join(" · ");
    if (meta) card.append(h("p", { class: "jw-meta", text: meta }));
    if (p.theme) card.append(h("p", { class: "jw-p", text: p.theme }));
    const dels = parseDel(p.deliverables);
    if (dels.length) {
      const prog = h("p", { class: "jw-prog" });
      const upd = () => { prog.textContent = `${dels.filter((d) => d.done).length} of ${dels.length} done`; };
      const ul = h("ul", { class: "jw-checks" });
      dels.forEach((d, i) => {
        const li = h("li", { class: d.done ? "on" : "" });
        const cb = h("input", { type: "checkbox", id: `d-${p.id}-${i}` });
        cb.checked = d.done;
        cb.addEventListener("change", async () => {
          d.done = cb.checked; li.classList.toggle("on", d.done); upd();
          try { const np = await api("PATCH", "/api/jw/part/" + p.id, { deliverables: joinDel(dels) }); p.deliverables = np.deliverables; }
          catch (e) { d.done = !d.done; cb.checked = d.done; li.classList.toggle("on", d.done); upd(); alert("Didn't save: " + e.message); }
        });
        li.append(cb, h("label", { for: cb.id }, h("span", { text: d.text })));
        ul.append(li);
      });
      upd();
      card.append(ul, prog);
    }
    if (p.details) card.append(h("details", { class: "jw-details" }, h("summary", { text: "Outline and notes" }), h("pre", { text: p.details })));
    const links = h("div", { class: "jw-links" });
    if (safeUrl(p.link)) links.append(ext(p.link, "Open the talk page ↗"));
    if (safeUrl(p.url)) links.append(ext(p.url, "Edit in Notion ↗"));
    if (links.childNodes.length) card.append(links);
    return card;
  }

  function itemLi(it) {
    const done = it.status === "Closed";
    const li = h("li", { id: it.key || it.id, class: done ? "jw-done" : "" });
    li.append(h("div", { class: "jw-row" }, h("p", { class: "jw-name", text: it.title }), h("span", { class: "jw-meta", text: done ? "done" : it.lastSeen ? "seen " + fmtDay(it.lastSeen) : "" })));
    if (it.sentence) li.append(h("p", { class: "jw-p", text: it.sentence }));
    if (it.note) li.append(h("p", { class: "jw-note", text: "Your update: " + it.note }));
    const links = h("div", { class: "jw-links" });
    if (safeUrl(it.link)) links.append(ext(it.link, (it.sourcePhrase || "Source") + " ↗"));
    if (safeUrl(it.task)) links.append(ext(it.task, "Task ↗"));
    if (!done) links.append(h("button", { type: "button", text: "Mark done", onclick: async (ev) => {
      ev.currentTarget.disabled = true;
      try { await api("PATCH", "/api/item/" + it.id, { status: "Closed" }); it.status = "Closed"; render(); }
      catch (e) { ev.currentTarget.disabled = false; alert("Didn't save: " + e.message); }
    } }));
    li.append(links);
    return li;
  }

  function render() {
    $("#lock").hidden = false;
    const main = $("#main"); main.replaceChildren();
    main.append(glyph(), h("h1", { class: "jw-title", text: "Kalihi" }));
    const open = D.items.filter((i) => i.status !== "Closed");
    main.append(h("p", { class: "jw-sub", text: `${open.length} open · ${D.parts.length} parts` }));
    if (D.errors && D.errors.length) main.append(h("p", { class: "jw-err", text: `Couldn't read from Notion: ${D.errors.join(", ")}. Share those tables with the Oggi connection.` }));

    // Parts: the next part up top, every part so far as a link
    const parts = D.parts.slice().sort((a, b) => a.order - b.order);
    const next = parts.slice().reverse().find((p) => p.status && p.status !== "Given") || null;
    const sec = h("section", { class: "jw-sec" }, h("h2", { class: "jw-h", text: "Parts" }));
    if (next) sec.append(partCard(next, true));
    const rest = parts.filter((p) => p !== next);
    if (rest.length) {
      const grid = h("div", { class: "jw-mini" });
      for (const p of rest) {
        const href = safeUrl(p.link) || safeUrl(p.url);
        const inner = [h("b", { text: p.name }), h("span", { text: [p.status, p.event, p.when ? fmtDay(p.when) : null].filter(Boolean).join(" · ") || "Talk page" })];
        grid.append(href ? h("a", { href, target: "_blank", rel: "noopener noreferrer" }, inner) : h("a", { href: "#part-" + p.id }, inner));
      }
      sec.append(grid);
    }
    if (!parts.length) sec.append(h("p", { class: "jw-quiet", text: "No parts yet." }));
    main.append(sec);

    // Items: the Kalihi stars from Sky and Today, with their details
    const isec = h("section", { class: "jw-sec" }, h("h2", { class: "jw-h", text: "Reminders and to-dos" }));
    if (D.items.length) isec.append(h("ul", { class: "jw-list" }, D.items.map(itemLi)));
    else isec.append(h("p", { class: "jw-quiet", text: "Nothing open in Kalihi." }));
    main.append(isec);

    // Schedule
    if (D.events.length) {
      const esec = h("section", { class: "jw-sec" }, h("h2", { class: "jw-h", text: "Coming up" }));
      esec.append(h("ul", { class: "jw-list" }, D.events.map((e) => h("li", { id: e.itemKey || null },
        h("div", { class: "jw-row" }, h("p", { class: "jw-name", text: e.title }), h("span", { class: "jw-meta", text: fmtDay(e.start) + (e.allDay ? "" : " · " + clock(e.start)) })),
        e.where ? h("p", { class: "jw-meta", text: e.where }) : null))));
      main.append(esec);
    }

    // Literature
    const lit = D.literature || [];
    if (lit.length) {
      const live = lit.filter((l) => !["Handed out", "Cancelled"].includes(l.status));
      const lsec = h("section", { class: "jw-sec" }, h("h2", { class: "jw-h", text: `Literature requests · ${live.length} in progress` }));
      const rows = (live.length ? live : lit.slice(0, 10)).map((l) => h("tr", null,
        h("td", null, l.item, l.symbol ? h("span", { class: "jw-meta", text: " " + l.symbol }) : null),
        h("td", { text: [l.forWhom, l.language].filter(Boolean).join(" · ") }),
        h("td", { class: "n", text: l.quantity == null ? "" : String(l.quantity) }),
        h("td", { text: (l.status || "") + (l.requested ? " · " + fmtDay(l.requested).replace(/, \d{4}$/, "") : "") })));
      lsec.append(h("div", { class: "jw-scroll" }, h("table", { class: "jw-table" }, h("thead", null, h("tr", null, ["Item", "For", "Qty", "Status"].map((t) => h("th", { text: t })))), h("tbody", null, rows))));
      main.append(lsec);
    }

    // arrived from a star: fly to it
    const key = decodeURIComponent(location.hash.slice(1));
    if (key) { const el = document.getElementById(key); if (el) { el.classList.add("hit"); el.scrollIntoView({ block: "center" }); setTimeout(() => el.classList.remove("hit"), 2500); } }
  }

  $("#lock").addEventListener("click", async () => { await api("POST", "/auth/jw/lock").catch(() => {}); D = null; showGate(); });
  addEventListener("hashchange", () => { if (D) render(); });
  load();
})();
