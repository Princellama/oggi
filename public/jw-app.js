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
  const projSlug = () => { const m = /^\/jw\/p\/([\w-]+)/.exec(location.pathname); return m ? m[1] : null; };
  async function load() {
    if (projSlug()) return loadProject(projSlug());
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
    card.append(replyBox(p.notes, (v) => api("PATCH", "/api/jw/part/" + p.id, { notes: v }).then((n) => { p.notes = n.notes; })));
    const links = h("div", { class: "jw-links" });
    if (safeUrl(p.link)) links.append(ext(p.link, "Open the talk page ↗"));
    if (safeUrl(p.url)) links.append(ext(p.url, "Edit in Notion ↗"));
    if (links.childNodes.length) card.append(links);
    return card;
  }

  // A reply / update box. Autosaves; Claude reads it on the next Oggi run.
  function replyBox(value, save, opts = {}) {
    const wrap = h("div", { class: "jw-reply" });
    const state = h("span", { class: "jw-saved", "aria-live": "polite" });
    const ta = h("textarea", { class: "jw-notes", rows: "3", placeholder: opts.placeholder || "Your update or answer: what happened, what's decided, what you need. Claude reads this on the next run.", "aria-label": opts.label || "Your update" });
    ta.value = value || "";
    const go = debounce(() => {
      state.textContent = "Saving…";
      save(ta.value).then(() => { state.textContent = "Saved · Claude will pick it up"; setTimeout(() => (state.textContent = ""), 2500); }, (e) => { state.textContent = "Not saved: " + e.message; });
    }, 1000);
    ta.addEventListener("input", go);
    const box = h("div", { class: "jw-notewrap" }, h("div", { class: "jw-row" }, h("span", { class: "jw-mini-h", text: opts.label || "Your update for Claude" }), state), ta);
    if (value || opts.open) { wrap.append(box); return wrap; }
    const btn = h("button", { type: "button", class: "jw-replybtn", text: opts.button || "Reply / update" });
    btn.addEventListener("click", () => { btn.replaceWith(box); ta.focus(); });
    wrap.append(btn);
    return wrap;
  }
  const saveItem = (it, body) => api("PATCH", "/api/item/" + it.id, { ...body, dayId: D && D.dayId }).then((n) => Object.assign(it, n));

  function itemLi(it) {
    const done = it.status === "Closed";
    const li = h("li", { id: it.key || it.id, class: "jw-item" + (done ? " jw-done" : "") });
    li.append(h("div", { class: "jw-row" }, h("p", { class: "jw-name", text: it.title }),
      it.waitingOn && !done ? h("span", { class: "jw-chip wait", text: "Waiting on " + it.waitingOn }) : h("span", { class: "jw-meta", text: done ? "done" : "" })));
    if (it.sentence) li.append(h("p", { class: "jw-p", text: it.sentence }));
    if (!done) li.append(replyBox(it.note, (v) => saveItem(it, { note: v })));
    const links = h("div", { class: "jw-links" });
    if (safeUrl(it.link)) links.append(ext(it.link, (/mail\.google\.com/.test(it.link) ? "✉ " : "") + (it.sourcePhrase || "Source") + " ↗"));
    if (safeUrl(it.task)) links.append(ext(it.task, "Task ↗"));
    if (!done && it.waitingOn) links.append(h("button", { type: "button", text: "They answered", onclick: async (ev) => {
      ev.currentTarget.disabled = true;
      try { await saveItem(it, { waitingOn: null }); render(); } catch (e) { ev.currentTarget.disabled = false; alert("Didn't save: " + e.message); }
    } }));
    if (!done) links.append(h("button", { type: "button", text: "Mark done", onclick: async (ev) => {
      ev.currentTarget.disabled = true;
      try { await saveItem(it, { status: "Closed" }); render(); } catch (e) { ev.currentTarget.disabled = false; alert("Didn't save: " + e.message); }
    } }));
    if (done) links.append(h("button", { type: "button", text: "Reopen", onclick: async () => { await saveItem(it, { status: "Open" }).catch(() => {}); render(); } }));
    li.append(links);
    return li;
  }

  // sticky menu that jumps to each section
  function jumpNav(list) {
    const nav = h("nav", { class: "jw-jump", "aria-label": "Jump to" });
    for (const [id, label, n] of list) nav.append(h("a", { href: "#" + id, onclick: (ev) => { ev.preventDefault(); const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); } }, label, n ? h("b", { text: String(n) }) : null));
    return nav;
  }
  const projOf = (id) => (D.projects || []).find((p) => p.id && id && p.id.replace(/-/g, "") === id.replace(/-/g, ""));
  const inDays = (iso, n) => { const d = daysTo(iso); return d != null && d >= 0 && d <= n; };
  const whenLabel = (iso) => { const d = daysTo(iso); return (d === 0 ? "Today" : d === 1 ? "Tomorrow" : fmtDay(iso).replace(/, \d{4}$/, "")) + (clock(iso) ? " · " + clock(iso) : ""); };

  function render() {
    $("#lock").hidden = false;
    const main = $("#main"); main.replaceChildren();
    const items = D.items || [];
    const open = items.filter((i) => i.status !== "Closed");
    const mine = open.filter((i) => !i.waitingOn), theirs = open.filter((i) => i.waitingOn);
    const closed = items.filter((i) => i.status === "Closed");
    const alerts = (D.alerts || []).slice().sort((a, b) => (a.level === "Action" ? 0 : 1) - (b.level === "Action" ? 0 : 1) || a.order - b.order);
    const mail = open.filter((i) => /mail\.google\.com/.test(i.link || ""));
    // next three days: calendar, parts, project items due
    const soon = [];
    for (const e of D.events || []) if (inDays(e.start, 3)) soon.push({ at: e.start, title: e.title, sub: e.where, allDay: e.allDay });
    for (const p of D.parts || []) if (p.when && p.status !== "Given" && inDays(p.when, 3)) soon.push({ at: p.when, title: "Your part: " + p.name, href: "#part-" + p.id });
    for (const d of D.due || []) { const pr = projOf(d.projectId); soon.push({ at: d.due, title: d.title, sub: pr ? pr.name : "", href: pr ? "/jw/p/" + encodeURIComponent(pr.slug) + "#i-" + d.id : null }); }
    soon.sort((a, b) => String(a.at).localeCompare(String(b.at)));

    main.append(h("header", { class: "jw-homehead" }, glyph(), h("div", null, h("h1", { class: "jw-title", text: "Kalihi" }),
      h("p", { class: "jw-sub", text: `${mine.length} on you · ${theirs.length} waiting on others · ${(D.projects || []).length} projects` }))));
    main.append(jumpNav([["today", "Today"], ["mine", "On me", mine.length], ["theirs", "Waiting", theirs.length], ["projects", "Projects", (D.projects || []).length], ["parts", "Parts"], ["coming", "Calendar"], ["lit", "Literature"]]));
    if (D.errors && D.errors.length) main.append(h("p", { class: "jw-err", text: `Couldn't read from Notion: ${D.errors.join(", ")}. Share those tables with the Oggi connection.` }));

    // Today: alerts, next three days, JW mail
    const tiles = h("div", { class: "jw-tiles" });
    const at = h("article", { class: "jw-tile" + (alerts.some((a) => a.level === "Action") ? " hot" : "") }, h("h3", null, "Alerts ", h("b", { text: String(alerts.length) })));
    if (alerts.length) at.append(h("ul", null, alerts.map((a) => { const pr = projOf(a.projectId); return h("li", null, h("a", { href: pr ? "/jw/p/" + encodeURIComponent(pr.slug) + "#alerts" : "#" }, h("i", { class: "lv " + (a.level === "Action" ? "a" : "h") }), a.title), pr ? h("span", { text: pr.name }) : null); })));
    else at.append(h("p", { class: "jw-quiet", text: "No alerts." }));
    const st = h("article", { class: "jw-tile" }, h("h3", null, "Next 3 days ", h("b", { text: String(soon.length) })));
    if (soon.length) st.append(h("ul", null, soon.map((x) => h("li", null, x.href ? h("a", { href: x.href, text: x.title }) : h("span", { class: "t", text: x.title }), h("span", { text: (x.allDay ? fmtDay(x.at).replace(/, \d{4}$/, "") : whenLabel(x.at)) + (x.sub ? " · " + x.sub : "") })))));
    else st.append(h("p", { class: "jw-quiet", text: "Nothing in the next three days." }));
    const mt = h("article", { class: "jw-tile" }, h("h3", null, "JW mail ", h("b", { text: String(mail.length) })));
    if (mail.length) mt.append(h("ul", null, mail.map((i) => h("li", null, h("a", { href: "#" + (i.key || i.id), text: i.title }), h("a", { class: "sub", href: i.link, target: "_blank", rel: "noopener noreferrer", text: "Open in Gmail ↗" })))));
    else mt.append(h("p", { class: "jw-quiet", text: "No JW mail waiting." }));
    mt.append(h("p", { class: "jw-links" }, ext("https://mail.google.com/mail/u/0/#label/JW", "Gmail JW label ↗")));
    tiles.append(at, st, mt);
    main.append(h("section", { class: "jw-sec", id: "today" }, h("h2", { class: "jw-h", text: "Today" }), tiles));

    // On me / waiting on others
    main.append(h("section", { class: "jw-sec", id: "mine" }, h("h2", { class: "jw-h", text: `Waiting on me · ${mine.length}` }),
      mine.length ? h("ul", { class: "jw-list" }, mine.map(itemLi)) : h("p", { class: "jw-quiet", text: "Nothing on you in Kalihi." })));
    main.append(h("section", { class: "jw-sec", id: "theirs" }, h("h2", { class: "jw-h", text: `Waiting on others · ${theirs.length}` }),
      theirs.length ? h("ul", { class: "jw-list" }, theirs.map(itemLi)) : h("p", { class: "jw-quiet", text: "Nothing waiting on anyone else." })));

    // Projects
    const psec = h("section", { class: "jw-sec", id: "projects" }, h("h2", { class: "jw-h", text: "Projects" }));
    for (const p of D.projects || []) {
      const days = daysTo(p.when);
      const nAlerts = alerts.filter((a) => projOf(a.projectId) === p).length;
      psec.append(h("a", { class: "jw-proj", href: "/jw/p/" + encodeURIComponent(p.slug) },
        h("div", { class: "jw-proj-l" }, h("b", { text: p.name }), h("span", { text: [p.when ? fmtDay(p.when) + (clock(p.when) ? " · " + clock(p.when) : "") : null, p.where].filter(Boolean).join(" · ") }), p.summary ? h("p", { text: p.summary }) : null,
          nAlerts ? h("span", { class: "jw-chip hotchip", text: `${nAlerts} alert${nAlerts > 1 ? "s" : ""}` }) : null),
        days != null && days >= 0 ? h("div", { class: "jw-proj-n" }, h("b", { text: String(days) }), h("span", { text: days === 1 ? "day to go" : "days to go" })) : h("span", { class: "jw-chip", text: p.status || "" })));
    }
    if (!(D.projects || []).length) psec.append(h("p", { class: "jw-quiet", text: "No projects yet." }));
    main.append(psec);

    // Parts: the soonest one coming up, else the newest not given
    const parts = D.parts.slice().sort((a, b) => a.order - b.order);
    const live = parts.filter((p) => p.status && p.status !== "Given");
    const dated = live.filter((p) => p.when && daysTo(p.when) >= 0).sort((a, b) => a.when.localeCompare(b.when));
    const nexts = dated.length ? [dated[0], ...live.filter((p) => p !== dated[0]).slice(-1)] : live.slice(-1);
    const sec = h("section", { class: "jw-sec", id: "parts" }, h("h2", { class: "jw-h", text: "Parts" }));
    nexts.forEach((p, i) => sec.append(partCard(p, i === 0)));
    const rest = parts.filter((p) => !nexts.includes(p));
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

    // Calendar
    const esec = h("section", { class: "jw-sec", id: "coming" }, h("h2", { class: "jw-h", text: "Coming up" }));
    if ((D.events || []).length) esec.append(h("ul", { class: "jw-list" }, D.events.map((e) => h("li", { id: e.itemKey ? "ev-" + e.itemKey : null },
      h("div", { class: "jw-row" }, h("p", { class: "jw-name", text: e.title }), h("span", { class: "jw-meta", text: fmtDay(e.start) + (e.allDay ? "" : " · " + clock(e.start)) })),
      e.where ? h("p", { class: "jw-meta", text: e.where }) : null))));
    else esec.append(h("p", { class: "jw-quiet", text: "Nothing on the calendar." }));
    main.append(esec);

    // Literature
    const lit = D.literature || [];
    const lsec = h("section", { class: "jw-sec", id: "lit" });
    const liveLit = lit.filter((l) => !["Handed out", "Cancelled"].includes(l.status));
    lsec.append(h("h2", { class: "jw-h", text: `Literature requests · ${liveLit.length} in progress` }));
    if (lit.length) {
      const rows = (liveLit.length ? liveLit : lit.slice(0, 10)).map((l) => h("tr", null,
        h("td", null, l.item, l.symbol ? h("span", { class: "jw-meta", text: " " + l.symbol }) : null),
        h("td", { text: [l.forWhom, l.language].filter(Boolean).join(" · ") }),
        h("td", { class: "n", text: l.quantity == null ? "" : String(l.quantity) }),
        h("td", { text: (l.status || "") + (l.requested ? " · " + fmtDay(l.requested).replace(/, \d{4}$/, "") : "") })));
      lsec.append(h("div", { class: "jw-scroll" }, h("table", { class: "jw-table" }, h("thead", null, h("tr", null, ["Item", "For", "Qty", "Status"].map((t) => h("th", { text: t })))), h("tbody", null, rows))));
    } else lsec.append(h("p", { class: "jw-quiet", text: "No requests." }));
    main.append(lsec);

    if (closed.length) main.append(h("section", { class: "jw-sec" }, h("details", { class: "jw-details" }, h("summary", { text: `Done lately (${closed.length})` }), h("ul", { class: "jw-list" }, closed.map(itemLi)))));

    // arrived from a star: fly to it
    const key = decodeURIComponent(location.hash.slice(1));
    if (key) { const el = document.getElementById(key); if (el) { el.classList.add("hit"); el.scrollIntoView({ block: "center" }); setTimeout(() => el.classList.remove("hit"), 2500); } }
  }

  // ---------------- a project page ----------------
  function daysTo(iso) {
    if (!iso) return null;
    const t = new Date(today() + "T12:00:00"), d = new Date(iso.slice(0, 10) + "T12:00:00");
    return Math.round((d - t) / 864e5);
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const initials = (name) => String(name || "").split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const savePI = (it, body) => api("PATCH", "/api/jw/pitem/" + it.id, body).then((n) => Object.assign(it, n));
  let P = null;

  async function loadProject(slug) {
    $(".jw-back").textContent = "← Kalihi"; $(".jw-back").setAttribute("href", "/jw");
    try { P = await api("GET", "/api/jw/project/" + encodeURIComponent(slug)); }
    catch (e) {
      if (e.status === 401 && e.code === "pin") return showGate();
      if (e.status === 401) return toSignin();
      $("#main").replaceChildren(h("p", { class: "jw-err", text: e.status === 404 ? "That project isn't in Notion." : "Couldn't load: " + e.message }));
      return;
    }
    renderProject();
  }

  function stepsBox(it) {
    const box = h("div", { class: "jw-steps" });
    const list = parseDel(it.steps);
    const prog = h("p", { class: "jw-prog" });
    const bar = h("i");
    const meter = h("div", { class: "jw-meter", role: "progressbar", "aria-label": "Steps done" }, bar);
    const ul = h("ul", { class: "jw-checks" });
    const save = () => savePI(it, { steps: joinDel(list) }).catch((e) => alert("Didn't save: " + e.message));
    function paint() {
      const n = list.filter((d) => d.done).length;
      prog.textContent = list.length ? `${n} of ${list.length} steps done` : "No steps yet.";
      bar.style.width = list.length ? (100 * n / list.length) + "%" : "0";
      meter.setAttribute("aria-valuenow", String(n)); meter.setAttribute("aria-valuemax", String(list.length));
      ul.replaceChildren(...list.map((d, i) => {
        const li = h("li", { class: d.done ? "on" : "" });
        const cb = h("input", { type: "checkbox", id: `s-${it.id}-${i}` }); cb.checked = d.done;
        cb.addEventListener("change", () => { d.done = cb.checked; paint(); save(); });
        const rm = h("button", { type: "button", class: "jw-x", "aria-label": "Remove step", text: "×", onclick: () => { list.splice(i, 1); paint(); save(); } });
        li.append(cb, h("label", { for: cb.id }, h("span", { text: d.text })), rm);
        return li;
      }));
    }
    const add = h("input", { class: "jw-add", type: "text", placeholder: "Add a step and press Enter", maxlength: "200" });
    add.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && add.value.trim()) { list.push({ done: false, text: add.value.trim() }); add.value = ""; paint(); save(); } });
    paint();
    box.append(meter, prog, ul, add);
    return box;
  }

  function notesBox(it) {
    const state = h("span", { class: "jw-saved", "aria-live": "polite" });
    const ta = h("textarea", { class: "jw-notes", rows: "3", placeholder: "Your notes: who you talked to, what's decided, what's next…", "aria-label": "My notes" });
    ta.value = it.notes || "";
    const go = debounce(() => { state.textContent = "Saving…"; savePI(it, { notes: ta.value }).then(() => { state.textContent = "Saved"; setTimeout(() => (state.textContent = ""), 1500); }, () => { state.textContent = "Not saved"; }); }, 900);
    ta.addEventListener("input", go);
    return h("div", { class: "jw-notewrap" }, h("div", { class: "jw-row" }, h("span", { class: "jw-mini-h", text: "My notes · Claude reads these" }), state), ta);
  }

  function statusSeg(it, onChange) {
    const seg = h("div", { class: "jw-seg", role: "group", "aria-label": "Status" });
    for (const s of ["To do", "Doing", "Done"]) {
      const b = h("button", { type: "button", "aria-pressed": String(it.status === s), class: "s-" + s.replace(" ", ""), text: s });
      b.addEventListener("click", async () => {
        const prev = it.status; it.status = s; onChange();
        try { await savePI(it, { status: s }); } catch (e) { it.status = prev; onChange(); alert("Didn't save: " + e.message); }
      });
      seg.append(b);
    }
    return seg;
  }

  function assignmentCard(it) {
    const card = h("article", { class: "jw-assign" + (it.status === "Done" ? " done" : ""), id: "i-" + it.id });
    const paint = () => {
      card.className = "jw-assign" + (it.status === "Done" ? " done" : "");
      card.replaceChildren();
      const dd = daysTo(it.due);
      card.append(h("div", { class: "jw-row" },
        h("div", null, h("span", { class: "jw-you", text: "Your assignment" }), h("h3", { class: "jw-name", text: it.title })),
        statusSeg(it, paint)));
      const meta = [it.due ? fmtDay(it.due) + (clock(it.due) ? " · " + clock(it.due) : "") + (dd != null && dd >= 0 && it.status !== "Done" ? ` · ${dd} days` : "") : null].filter(Boolean).join("");
      if (meta) card.append(h("p", { class: "jw-meta", text: meta }));
      if (it.assistants) card.append(h("div", { class: "jw-crew" }, h("span", { class: "jw-mini-h", text: "With" }), it.assistants.split(/,\s*/).map((n) => h("span", { class: "jw-person" }, h("i", { text: initials(n) }), n))));
      if (it.details) card.append(h("details", { class: "jw-details" }, h("summary", { text: "What this covers" }), h("pre", { text: it.details })));
      if (it.status !== "Done" || it.steps) card.append(stepsBox(it));
      card.append(notesBox(it));
    };
    paint();
    return card;
  }

  function alertCard(it, rerender) {
    const done = it.status === "Done";
    const card = h("article", { id: "i-" + it.id, class: `jw-alert lv-${(it.level || "Info").replace(/\W/g, "")}` + (done ? " done" : "") });
    const icon = it.level === "Action" ? "!" : it.level === "Heads-up" ? "◆" : "i";
    card.append(h("span", { class: "jw-alert-i", "aria-hidden": "true", text: icon }));
    const body = h("div", { class: "jw-alert-b" },
      h("div", { class: "jw-row" }, h("b", { text: it.title }), h("span", { class: "jw-meta", text: [it.level, it.lead].filter(Boolean).join(" · ") })));
    if (it.details) {
      const m = /"([^"]{40,})"/.exec(it.details);   // a quoted announcement gets a copy button
      body.append(h("pre", { class: "jw-alert-d", text: it.details }));
      if (m && navigator.clipboard) body.append(h("div", { class: "jw-links" }, h("button", { type: "button", text: "Copy announcement", onclick: (ev) => { navigator.clipboard.writeText(m[1]).then(() => { ev.target.textContent = "Copied"; }); } })));
    }
    if (it.level === "Action" || it.level === "Heads-up") body.append(replyBox(it.notes, (v) => savePI(it, { notes: v }), { placeholder: "Your response: what you did or answered. Claude reads this on the next run." }));
    if (it.level === "Action" || it.level === "Heads-up") {
      const links = body.querySelector(".jw-links") || body.appendChild(h("div", { class: "jw-links" }));
      links.append(h("button", { type: "button", text: done ? "Reopen" : "Mark done", onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        try { await savePI(it, { status: done ? "To do" : "Done" }); rerender(); } catch (e) { ev.currentTarget.disabled = false; alert("Didn't save: " + e.message); }
      } }));
    }
    card.append(body);
    return card;
  }

  function program(items, startIso) {
    const wrap = h("ol", { class: "jw-tl" });
    let lo = 0, hi = 0;
    const start = startIso ? new Date(startIso) : null;
    const at = (m) => start ? new Date(start.getTime() + m * 60000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Pacific/Honolulu" }) : "";
    for (const it of items) {
      const [a, b] = String(it.minutes || "0").split(/[-–]/).map((x) => Number(x) || 0);
      wrap.append(h("li", null,
        h("span", { class: "jw-tl-t", text: at(lo) }),
        h("div", { class: "jw-tl-b" },
          h("div", { class: "jw-row" }, h("b", { text: it.title }), h("span", { class: "jw-pill", text: (it.minutes || "?") + " min" })),
          it.lead ? h("p", { class: "jw-meta", text: it.lead + (it.assistants ? " · " + it.assistants : "") }) : null,
          it.details ? h("p", { class: "jw-p", text: it.details }) : null)));
      lo += a; hi += b || a;
    }
    const end = h("p", { class: "jw-meta jw-tl-end", text: start ? `Ends about ${at(lo)}${hi !== lo ? "–" + at(hi) : ""} · ${lo}${hi !== lo ? "–" + hi : ""} minutes` : `${lo}–${hi} minutes` });
    return [wrap, end];
  }

  function teams(items) {
    const grid = h("div", { class: "jw-teams" });
    const q = h("input", { class: "jw-find", type: "search", placeholder: "Find a brother…", "aria-label": "Find a brother in the teams" });
    const cards = items.map((it) => {
      const people = [it.lead, ...String(it.assistants || "").split(/,\s*/)].filter(Boolean);
      const c = h("article", { class: "jw-team" + (it.mine ? " mine" : "") },
        h("div", { class: "jw-row" }, h("b", { text: it.title }), it.mine ? h("span", { class: "jw-chip next", text: "You" }) : null),
        it.lead ? h("p", { class: "jw-lead" }, h("span", { class: "jw-person" }, h("i", { text: initials(it.lead) }), it.lead), h("span", { class: "jw-role", text: "Overseer" })) : null,
        it.assistants ? h("p", { class: "jw-asst" }, h("span", { class: "jw-role", text: "With " }), it.assistants) : null,
        it.details ? h("p", { class: "jw-p small", text: it.details }) : null);
      c.dataset.people = people.join(" ").toLowerCase() + " " + it.title.toLowerCase();
      return c;
    });
    grid.append(...cards);
    q.addEventListener("input", () => { const v = q.value.trim().toLowerCase(); cards.forEach((c) => { c.hidden = !!v && !c.dataset.people.includes(v); }); });
    return [q, grid];
  }

  function renderProject() {
    $("#lock").hidden = false;
    const { project: p, items } = P;
    const by = (k) => items.filter((i) => i.kind === k).sort((a, b) => a.order - b.order);
    const main = $("#main"); main.replaceChildren();
    document.title = p.name + " · Kalihi";
    const days = daysTo(p.when);

    main.append(h("header", { class: "jw-hero" },
      h("div", null,
        h("span", { class: "jw-eyebrow", text: "Project" + (p.status ? " · " + p.status : "") }),
        h("h1", { class: "jw-title", text: p.name }),
        h("p", { class: "jw-sub", text: [p.when ? fmtDay(p.when) + (clock(p.when) ? " · " + clock(p.when) : "") : null, p.where].filter(Boolean).join(" · ") })),
      days != null && days >= 0 ? h("div", { class: "jw-count" }, h("b", { text: String(days) }), h("span", { text: days === 1 ? "day to go" : "days to go" })) : null));
    main.append(jumpNav([["alerts", "Alerts", items.filter((i) => i.kind === "Alert" && i.status !== "Done" && i.level !== "Info").length], ["mine", "Mine", items.filter((i) => i.mine && i.kind === "Assignment" && i.status !== "Done").length], ["docs", "Instructions"], ["program", "Program"], ["teams", "Teams"], ["decisions", "Decided"]].filter(([id]) => id === "alerts" || items.some((i) => ({ mine: "Assignment", docs: "Document", program: "Program", teams: "Team", decisions: "Decision" })[id] === i.kind))));
    if (p.summary) main.append(h("p", { class: "jw-p jw-lede", text: p.summary }));
    const facts = String(p.facts || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf(":"); return i > 0 ? [l.slice(0, i), l.slice(i + 1).trim()] : ["", l]; });
    if (facts.length) main.append(h("dl", { class: "jw-facts" }, facts.map(([k, v]) => h("div", null, h("dt", { text: k }), h("dd", { text: v })))));

    // announcements and alerts
    const alerts = by("Alert");
    const open = alerts.filter((a) => a.status !== "Done"), closed = alerts.filter((a) => a.status === "Done");
    const asec = h("section", { class: "jw-sec", id: "alerts" }, h("h2", { class: "jw-h", text: `Announcements & alerts${open.filter((a) => a.level === "Action").length ? " · " + open.filter((a) => a.level === "Action").length + " need action" : ""}` }));
    const lvl = { Action: 0, "Heads-up": 1, Info: 2 };
    open.sort((a, b) => (lvl[a.level] ?? 3) - (lvl[b.level] ?? 3) || a.order - b.order).forEach((a) => asec.append(alertCard(a, renderProject)));
    if (!open.length) asec.append(h("p", { class: "jw-quiet", text: "Nothing needs attention." }));
    if (closed.length) asec.append(h("details", { class: "jw-details" }, h("summary", { text: `Done (${closed.length})` }), closed.map((a) => alertCard(a, renderProject))));
    main.append(asec);

    // my assignments
    const mine = by("Assignment").filter((i) => i.mine);
    if (mine.length) {
      const msec = h("section", { class: "jw-sec", id: "mine" }, h("h2", { class: "jw-h", text: "My assignments" }));
      mine.sort((a, b) => (a.status === "Done") - (b.status === "Done") || a.order - b.order).forEach((it) => msec.append(assignmentCard(it)));
      main.append(msec);
    }

    // documents: the official text, readable here
    const docs = by("Document");
    if (docs.length) {
      const dsec = h("section", { class: "jw-sec", id: "docs" }, h("h2", { class: "jw-h", text: docs.length > 1 ? "Official instructions" : "Official instruction" }));
      for (const d of docs) {
        const paras = String(d.details || "").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
        dsec.append(h("details", { class: "jw-doc", open: docs.length === 1 ? true : null },
          h("summary", null, h("b", { text: d.title }), d.lead ? h("span", { text: d.lead }) : null),
          h("div", { class: "jw-doc-b" }, paras.map((t) => { const m = /^(\d+)\.\s*([^:]{2,60}:)?\s*/.exec(t); return h("p", null, m ? h("span", { class: "n", text: m[1] }) : null, m && m[2] ? h("b", { text: m[2] + " " }) : null, m ? t.slice(m[0].length) : t); }))));
      }
      main.append(dsec);
    }

    // program
    const prog = by("Program");
    if (prog.length) main.append(h("section", { class: "jw-sec", id: "program" }, h("h2", { class: "jw-h", text: "Program" }), ...program(prog, p.when)));

    // departments and teams
    const tm = by("Team");
    if (tm.length) main.append(h("section", { class: "jw-sec", id: "teams" }, h("h2", { class: "jw-h", text: `Departments & teams · ${tm.length}` }), ...teams(tm.sort((a, b) => b.mine - a.mine || a.order - b.order))));

    // decisions
    const dec = by("Decision");
    if (dec.length) main.append(h("section", { class: "jw-sec", id: "decisions" }, h("h2", { class: "jw-h", text: "Decided" }), h("ul", { class: "jw-dec" }, dec.map((d) => h("li", { text: d.title })))));

    if (safeUrl(p.url)) main.append(h("p", { class: "jw-links" }, ext(p.url, "Open the project in Notion ↗")));
    const key = decodeURIComponent(location.hash.slice(1));
    if (key) { const el = document.getElementById(key); if (el) { el.scrollIntoView({ block: "start" }); if (el.tagName === "ARTICLE") { el.classList.add("hit"); setTimeout(() => el.classList.remove("hit"), 2500); } } }
  }

  $("#lock").addEventListener("click", async () => { await api("POST", "/auth/jw/lock").catch(() => {}); D = null; showGate(); });
  addEventListener("hashchange", () => { if (D) render(); });
  load();
})();
