/* Oggi · /medicare — plain JS, no build step.
   Everything gathered from Notion is rendered with textContent, never as markup. */
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
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const safeUrl = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : null);
  const ext = (a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };
  const TZ = "Pacific/Honolulu";
  const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const dayDiff = (a, b) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);
  const fmtDay = (iso) => {
    if (!iso) return "";
    const d = new Date(iso.length <= 10 ? iso + "T12:00:00Z" : iso);
    return new Intl.DateTimeFormat("en-US", { timeZone: iso.length <= 10 ? "UTC" : TZ, month: "short", day: "numeric" }).format(d);
  };
  const fmtWeekday = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date(iso));
  const fmtClock = (iso) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(iso));
    const g = (t) => (parts.find((x) => x.type === t) || {}).value || "";
    return (g("minute") === "00" ? g("hour") : `${g("hour")}:${g("minute")}`) + " " + g("dayPeriod").toUpperCase();
  };
  const localDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const ago = (iso) => {
    if (!iso) return "never";
    const n = dayDiff(todayISO(), iso.slice(0, 10));
    return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
  };
  const money = (v) => (v == null ? "—" : "$" + Math.round(v).toLocaleString("en-US"));
  const num = (v) => (v == null ? "—" : String(v));
  const claude = (prompt) => "https://claude.ai/new?q=" + encodeURIComponent(prompt);

  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
    if (r.status === 401) { location.href = "/"; throw new Error("signin"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `failed (${r.status})`);
    return j;
  }
  function copyBtn(getText, label = "Copy") {
    const b = h("button", { class: "copy", type: "button", text: label });
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(getText()); b.textContent = "Copied"; b.classList.add("done"); }
      catch { b.textContent = "Couldn't copy"; }
      setTimeout(() => { b.textContent = label; b.classList.remove("done"); }, 1800);
    });
    return b;
  }
  const chip = (text, cls) => h("span", { class: "chip" + (cls ? " " + cls : ""), text });

  // ---------------- state ----------------
  const S = { data: null, err: null, msg: null, tab: "overview", pulseScope: "All", pulseCarrier: "All", partnerFilter: "All", draft: { kind: "In the field" } };
  const TABS = ["overview", "pulse", "carriers", "veterans", "campaigns", "content", "partners", "log"];
  const PROMPTS = {
    scan: "/medicare-marketing scan — scan Hawaii and national Medicare news and the four carriers (Devoted, UHC, Humana, HMSA), and add what's new to Medicare Pulse.",
    count: "/medicare-marketing count — count leads, appointments and enrollments in GHL for each running campaign in Medicare Campaigns, and sync my kiosk and event schedule from Google Calendar into Medicare Field Days.",
    writeAll: "/medicare-marketing write — write every Medicare Content row that is Requested: thumbnail, IG and Facebook captions, summary, call to action and disclaimer.",
    write: (r) => `/medicare-marketing write — write this post in Medicare Content: “${r.title}”${r.url ? " " + r.url : ""}. Thumbnail, IG and Facebook captions, summary, call to action and disclaimer.`,
    partner: (p) => `/medicare-marketing partner — give me a short talk track for ${p.name}${p.url ? " (" + p.url + ")" : ""}: who they are, what this AEP's changes mean for their patients or members, and one ask.`,
  };

  // ---------------- routing ----------------
  // /medicare/carriers/2027[/Devoted] is the 2027 Plans page, shown under the Carriers tab.
  function routeFromPath() {
    const [t, sub, c] = location.pathname.replace(/^\/medicare\/?/, "").split("/");
    S.sub = t === "carriers" && sub === "2027" ? "plans" : null;
    if (S.sub) S.planCarrier = decodeURIComponent(c || "") || S.planCarrier || "Devoted";
    return TABS.includes(t) ? t : "overview";
  }
  const tabFromPath = routeFromPath;
  function go(tab, push = true, sub = null) {
    S.tab = tab; S.msg = null; S.sub = sub;
    const path = tab === "overview" ? "/medicare" : "/medicare/" + tab + (sub === "plans" ? "/2027/" + encodeURIComponent(S.planCarrier || "Devoted") : "");
    if (push) history.pushState({}, "", path);
    render();
    window.scrollTo(0, 0);
  }
  $("#tabs").addEventListener("click", (e) => {
    const a = e.target.closest("a[data-tab]");
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); go(a.dataset.tab);
  });
  window.addEventListener("popstate", () => { const t = routeFromPath(); go(t, false, S.sub); });

  // ---------------- load ----------------
  async function load() {
    try {
      const me = await (await fetch("/auth/me", { credentials: "same-origin" })).json();
      if (!me.signedIn) { location.href = "/"; return; }
      S.data = await api("GET", "/api/medicare?d=" + todayISO());
      S.err = null;
    } catch (e) { if (e.message !== "signin") S.err = "Couldn't reach Notion. Pull to refresh in a moment."; }
    render();
  }
  const rows = (k) => (S.data && S.data[k] ? S.data[k].rows : []);
  const shareErrors = () => S.data ? Object.entries(S.data).filter(([, v]) => v.error === "share").map(([k]) => k) : [];
  const otherErrors = () => S.data ? Object.entries(S.data).filter(([, v]) => v.error && v.error !== "share") : [];

  // ---------------- header ----------------
  function header() {
    const left = dayDiff("2026-12-07", todayISO());
    const aep = $("#aep");
    aep.textContent = "";
    if (left >= 0 && dayDiff(todayISO(), "2026-10-15") >= 0) aep.append("AEP · ", h("b", { text: left === 0 ? "last day" : `${left} day${left === 1 ? "" : "s"} left` }));
    else if (left > 0) aep.textContent = "AEP opens Oct 15";
    for (const a of document.querySelectorAll("#tabs a")) {
      a.setAttribute("aria-current", a.dataset.tab === S.tab ? "page" : "false");
      const old = a.querySelector(".dot"); if (old) old.remove();
      const n = a.dataset.tab === "pulse" ? rows("pulse").filter((r) => r.status === "New").length
        : a.dataset.tab === "content" ? rows("content").filter((r) => r.status === "Requested").length : 0;
      if (n) a.append(h("span", { class: "dot", text: n }));
      if (a.dataset.tab === S.tab) try { a.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch {}
    }
  }

  function render() {
    header();
    const main = $("#main");
    main.textContent = "";
    if (S.err) main.append(h("p", { class: "mc-err", text: S.err }));
    if (!S.data) { if (!S.err) main.append(h("p", { class: "quiet", text: "Loading…" })); return; }
    const sh = shareErrors();
    if (sh.length) {
      main.append(h("div", { class: "mc-share" },
        h("p", { text: "Oggi can't see some of the Medicare tables yet (" + sh.join(", ") + ")." }),
        h("p", { text: "In Notion, open the Medicare Marketing page under Second Brain, then ••• → Connections → add oggi. The tables inside it follow." })));
    }
    for (const [k, v] of otherErrors()) main.append(h("p", { class: "mc-err", text: `${k}: ${v.error}` }));
    if (S.msg) main.append(h("p", { class: "mc-msg", text: S.msg }));
    if (S.tab === "carriers" && S.sub === "plans") return plans2027(main);
    ({ overview, pulse, carriers, veterans, campaigns, content, partners, log })[S.tab](main);
  }

  // ---------------- overview ----------------
  function fieldList(list) {
    const today = todayISO();
    const ul = h("ul", { class: "field-list" });
    for (const f of list) {
      const d = f.start ? localDay(f.start) : null;
      const isToday = d === today, past = d && d < today;
      const when = !f.start ? "—" : isToday ? "Today" : dayDiff(d, today) === 1 ? "Tomorrow" : `${fmtWeekday(f.start)} ${fmtDay(f.start)}`;
      const time = f.start && f.start.length > 10 ? fmtClock(f.start) + (f.end ? "–" + fmtClock(f.end) : "") : "";
      ul.append(h("li", { class: (isToday ? "today" : "") + (past ? " past" : "") },
        h("span", { class: "when" }, when, time ? h("small", { text: time }) : null),
        h("span", { class: "what", text: f.name || f.site || "Field day" }),
        h("span", { class: "where", text: [f.carrier, f.address].filter(Boolean).join(" · ") })));
    }
    return ul;
  }
  function overview(main) {
    const today = todayISO();
    const pulseNew = rows("pulse").filter((r) => r.status === "New");
    const requested = rows("content").filter((r) => r.status === "Requested");
    const ready = rows("content").filter((r) => r.status === "Ready" || r.status === "Draft");
    const camps = rows("campaigns").filter((c) => c.status !== "Done");
    const spend = camps.reduce((a, c) => a + (c.cost || 0), 0);
    const leads = camps.reduce((a, c) => a + (c.leads || 0), 0);
    const enrolled = camps.reduce((a, c) => a + (c.enrollments || 0), 0);
    const hot = rows("partners").filter((p) => p.disruption && p.disruption !== "None known");

    const tile = (n, l, s, tab) => h("a", { class: "tile", href: "/medicare/" + tab, onclick: (e) => { e.preventDefault(); go(tab); } },
      h("div", { class: "n", text: n }), h("div", { class: "l", text: l }), s ? h("div", { class: "s", text: s }) : null);
    main.append(h("div", { class: "ov-grid" },
      tile(pulseNew.length, "new in the Pulse", pulseNew[0] ? pulseNew[0].headline : "Nothing new", "pulse"),
      tile(requested.length + ready.length, "posts in progress", requested.length ? `${requested.length} waiting for Claude` : ready.length ? `${ready.length} ready to post` : "Queue is empty", "content"),
      tile(leads, "campaign leads", `${money(spend)} spent · ${enrolled} enrolled`, "campaigns"),
      tile(hot.length, "partners in the disruption", hot[0] ? hot[0].name : "None flagged yet", "partners")));

    const upcoming = rows("field").filter((f) => !f.start || localDay(f.start) >= today).slice(0, 5);
    const sec = h("section", { class: "mc-sec" }, h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "In the field" }),
      ext(h("a", { class: "textlink", href: claude(PROMPTS.count), text: "Sync from my calendar" }))));
    if (upcoming.length) {
      sec.append(fieldList(upcoming));
      const now = upcoming.find((f) => f.start && localDay(f.start) === today);
      if (now) sec.append(h("div", { class: "mc-acts" }, h("button", { class: "btn", type: "button", text: "Post from the table", onclick: () => { S.draft = { kind: "In the field", title: `At the ${now.site || "kiosk"} table`, brief: `${now.name}, ${fmtWeekday(now.start)} ${fmtDay(now.start)}. ` }; go("content"); } })));
    } else sec.append(h("p", { class: "quiet", text: "No field days copied over yet. Sync from your calendar and they'll show here." }));
    main.append(sec);

    if (pulseNew.length) {
      const ps = h("section", { class: "mc-sec" }, h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "New in the Pulse" })));
      ps.append(pulseList(pulseNew.slice(0, 3), true));
      main.append(ps);
    }
  }

  // ---------------- pulse ----------------
  async function setPulse(r, status) {
    try { Object.assign(r, await api("PATCH", "/api/medicare/pulse/" + r.id, { status })); } catch (e) { S.msg = "Couldn't save that to Notion."; }
    if (status === "Archived") S.data.pulse.rows = rows("pulse").filter((x) => x.id !== r.id);
    render();
  }
  async function postFromPulse(r) {
    try {
      const c = await api("POST", "/api/medicare/content", {
        title: r.headline, kind: r.carriers.some((x) => ["Devoted", "UHC", "Humana", "HMSA"].includes(x)) ? "Carrier news" : "Educational",
        brief: `From the Pulse: ${r.headline}. ${r.summary}${r.link ? " Source: " + r.link : ""}. Keep it educational; no plan names unless the carrier approves.`,
      });
      S.data.content.rows.unshift(c);
      S.msg = `“${r.headline}” is in the Content queue.`;
      if (r.status === "New" || r.status === "Read") await setPulse(r, "Acted"); else render();
    } catch { S.msg = "Couldn't add that post. Try again."; render(); }
  }
  function pulseList(list, compact) {
    const ul = h("ul", { class: "pulse" });
    for (const r of list) {
      const li = h("li", { class: r.status === "New" ? "" : "is-read" });
      li.append(h("div", { class: "meta" },
        r.status === "New" ? chip("New", "new") : null,
        chip(r.scope || "—"), ...(r.carriers || []).map((c) => chip(c, "c-" + c)),
        h("span", { text: [fmtDay(r.date), r.source].filter(Boolean).join(" · ") })));
      li.append(h("h3", { text: r.headline || "" }));
      if (r.summary) li.append(h("p", { class: "sum", text: r.summary }));
      if (r.why) li.append(h("p", { class: "why" }, h("b", { text: "Why it matters" }), r.why));
      if (r.action && !compact) li.append(h("p", { class: "next" }, h("b", { text: "Next" }), r.action));
      const acts = h("div", { class: "mc-acts" });
      const link = safeUrl(r.link);
      if (link) acts.append(ext(h("a", { class: "textlink", href: link, text: "Read the article", onclick: () => { if (r.status === "New") setPulse(r, "Read"); } })));
      if (!compact) {
        if (r.status === "New") acts.append(h("button", { class: "textlink", type: "button", text: "Mark read", onclick: () => setPulse(r, "Read") }));
        if (r.status !== "Acted") acts.append(h("button", { class: "textlink", type: "button", text: "Done with it", onclick: () => setPulse(r, "Acted") }));
        acts.append(h("button", { class: "textlink", type: "button", text: "Make a post", onclick: () => postFromPulse(r) }));
        acts.append(h("button", { class: "textlink", type: "button", text: "Archive", onclick: () => setPulse(r, "Archived") }));
      }
      li.append(acts);
      ul.append(li);
    }
    return ul;
  }
  function filterBar(options, current, set) {
    const bar = h("div", { class: "filters" });
    for (const o of options) bar.append(h("button", { type: "button", "aria-pressed": String(o === current), text: o, onclick: () => { set(o); render(); } }));
    return bar;
  }
  function pulse(main) {
    main.append(h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "Pulse" }),
      ext(h("a", { class: "btn small", href: claude(PROMPTS.scan), text: "Scan now" }))));
    main.append(h("p", { class: "mc-lede", text: "What's moving in Medicare, Hawaii first. Claude adds to this on each scan; you mark what you've handled." }));
    main.append(filterBar(["All", "Hawaii", "National"], S.pulseScope, (v) => (S.pulseScope = v)));
    main.append(filterBar(["All", "Devoted", "UHC", "Humana", "HMSA", "CMS"], S.pulseCarrier, (v) => (S.pulseCarrier = v)));
    const list = rows("pulse").filter((r) => (S.pulseScope === "All" || r.scope === S.pulseScope) && (S.pulseCarrier === "All" || (r.carriers || []).includes(S.pulseCarrier)));
    if (!list.length) main.append(h("p", { class: "quiet", text: "Nothing here yet. Tap Scan now to have Claude look." }));
    else main.append(pulseList(list));
  }

  // ---------------- carriers ----------------
  const CARRIERS = [
    { k: "Devoted", role: "Appointed · your focus", stance: "Lead with it where it fits the client's doctors and drugs. Kiosks at Salt Lake and Kalihi, community letter out." },
    { k: "UHC", role: "Appointed", stance: "Keep current clients served; watch for network and benefit changes that move people." },
    { k: "Humana", role: "Appointed", stance: "Nationally pulling back. Check which Hawaii plans change for 2027 and reach your Humana clients first." },
    { k: "HMSA", role: "Not in your lineup · largest local carrier", stance: "Its plan changes drive this AEP's disruption. Members who must choose are the people to help." },
  ];
  function carriers(main) {
    main.append(h("a", { class: "pin2027", href: "/medicare/carriers/2027/Devoted", onclick: (e) => { e.preventDefault(); S.planCarrier = "Devoted"; go("carriers", true, "plans"); } },
      h("span", { class: "pin-k", text: "📌 Pinned" }),
      h("span", { class: "pin-t", text: "2027 Plans" }),
      h("span", { class: "pin-s", text: "Cheat sheet and kiosk presentation: every plan, what changed, what's new" }),
      h("span", { class: "pin-go", text: "→" })));
    main.append(h("p", { class: "mc-lede", text: "Each carrier's news from the Pulse, newest first. What you say still has to fit each client; this is where the market is moving." }));
    const grid = h("div", { class: "car-grid" });
    for (const c of CARRIERS) {
      const items = rows("pulse").filter((r) => (r.carriers || []).includes(c.k)).slice(0, 4);
      const rts = rows("portals").find((p) => p.carrier === c.k && p.rts && p.rts !== "n/a");
      const card = h("article", { class: `car k-${c.k}` + (c.k === "Devoted" ? " focus" : "") },
        h("h3", { text: c.k }), h("p", { class: "role", text: c.role }),
        rts ? h("div", { class: "chips", style: "margin:-4px 0 12px" }, rtsChip(rts.rts)) : null,
        h("p", { class: "stance", text: c.stance }));
      const ul = h("ul");
      if (!items.length) ul.append(h("li", { class: "quiet", text: "No news on file yet." }));
      for (const r of items) {
        const link = safeUrl(r.link);
        const a = link ? ext(h("a", { href: link, text: r.headline })) : h("span", { text: r.headline });
        ul.append(h("li", {}, a, h("span", { class: "d", text: [fmtDay(r.date), r.scope, r.kind].filter(Boolean).join(" · ") })));
      }
      card.append(ul);
      grid.append(card);
    }
    main.append(grid);
    portals(main);
  }

  // ---------------- carrier portals: the sites you sign in to ----------------
  // Login is the email or username only, and Password hint says where the password lives
  // (a password manager). The password itself never goes in Notion or this page.
  const RTS = ["Ready to sell", "Action needed", "Pending", "n/a"];
  const rtsChip = (v) => (v && v !== "n/a" ? chip("2027 · " + v, v === "Ready to sell" ? "ok" : v === "Action needed" ? "warn" : "") : null);
  const PORTAL_ORDER = ["Devoted", "UHC", "Humana", "IFG", "Industry"];
  async function savePortal(p, fields, flag) {
    try {
      Object.assign(p, await api("PATCH", "/api/medicare/portal/" + p.id, { ...fields, d: todayISO() }));
      S.msg = null;
      if (flag) { flag.textContent = "Saved"; setTimeout(() => (flag.textContent = ""), 1500); return; }
    } catch { S.msg = "Couldn't save that to Notion."; }
    render();
  }
  function portals(main) {
    main.append(h("div", { class: "mc-head", style: "margin-top:34px" }, h("h2", { class: "sec", text: "Portals and logins" })));
    main.append(h("p", { class: "mc-lede", text: "Every site you sign in to for Medicare: what it's for, the email you log in with, and where the password is kept. Passwords stay in your password manager, never here." }));
    const list = rows("portals").slice().sort((a, b) => {
      const ra = PORTAL_ORDER.indexOf(a.carrier), rb = PORTAL_ORDER.indexOf(b.carrier);
      return (ra < 0 ? 9 : ra) - (rb < 0 ? 9 : rb) || String(a.name).localeCompare(String(b.name));
    });
    const ul = h("ul", { class: "partners portals" });
    if (!list.length) ul.append(h("li", { class: "quiet", text: "No portals on file yet. They live in the Carrier Portals table under Medicare Marketing in Notion." }));
    const today = todayISO();
    for (const p of list) {
      const web = safeUrl(p.website);
      const flag = h("span", { class: "quiet saved-flag" });
      const login = h("input", { placeholder: "Login email or username", value: p.login || "", "aria-label": `${p.name} login`, autocomplete: "off", spellcheck: "false" });
      login.addEventListener("change", () => savePortal(p, { login: login.value.trim() }, flag));
      const hint = h("input", { placeholder: "Where the password lives, e.g. Google Password Manager", value: p.hint || "", "aria-label": `${p.name} password hint`, autocomplete: "off" });
      hint.addEventListener("change", () => savePortal(p, { hint: hint.value.trim() }, flag));
      const rts = h("select", { class: "copy", "aria-label": "Ready to Sell 2027", style: "border:0;background:transparent" },
        h("option", { value: "", text: "Ready to Sell: not set" }),
        ...RTS.map((o) => h("option", { value: o, text: o === "n/a" ? "Ready to Sell: n/a" : "2027: " + o, selected: o === p.rts })));
      rts.addEventListener("change", () => savePortal(p, { rts: rts.value || null }));
      const c = p.lastChecked ? dayDiff(today, p.lastChecked.slice(0, 10)) : null;
      ul.append(h("li", {},
        h("div", { class: "chips" }, p.carrier ? chip(p.carrier, "c-" + p.carrier) : null, rtsChip(p.rts), ...(p.kinds || []).slice(0, 3).map((k) => chip(k))),
        h("p", { class: "name", style: "margin-top:8px" }, web ? ext(h("a", { class: "portal-link", href: web, text: p.name + " ↗" })) : p.name),
        p.what ? h("p", { class: "portal-what", text: p.what }) : null,
        h("div", { class: "next" }, h("span", { class: "portal-l", text: "Login" }), login, copyBtn(() => login.value.trim())),
        h("div", { class: "next" }, h("span", { class: "portal-l", text: "Password" }), hint),
        h("p", { class: "meta", style: "margin-top:10px" },
          p.emailsTo ? h("span", { text: "Notices go to " + p.emailsTo }) : null,
          p.support ? h("span", { text: "Help: " + p.support }) : null,
          h("span", { class: c != null && c > 30 ? "mc-stale" : "", text: "Last checked " + ago(p.lastChecked) }),
          flag),
        p.notes ? h("p", { class: "portal-note", text: p.notes }) : null,
        h("div", { class: "mc-acts" },
          h("button", { class: "textlink", type: "button", text: "Mark checked today", onclick: () => savePortal(p, { checked: true }) }),
          rts,
          safeUrl(p.url) ? ext(h("a", { class: "textlink", href: p.url, text: "Open in Notion" })) : null)));
    }
    main.append(ul);
  }

  // ---------------- campaigns ----------------
  async function saveCampaign(c, fields, flag) {
    try { Object.assign(c, await api("PATCH", "/api/medicare/campaign/" + c.id, fields)); if (flag) { flag.textContent = "Saved"; setTimeout(() => (flag.textContent = ""), 1500); } }
    catch { S.msg = "Couldn't save that to Notion."; render(); }
  }
  function campaigns(main) {
    const list = rows("campaigns");
    const live = list.filter((c) => c.status !== "Done");
    const spend = live.reduce((a, c) => a + (c.cost || 0), 0), leads = live.reduce((a, c) => a + (c.leads || 0), 0);
    main.append(h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "Campaigns" }),
      ext(h("a", { class: "btn small", href: claude(PROMPTS.count), text: "Count from GHL" }))));
    main.append(h("p", { class: "mc-lede", text: `Running: ${money(spend)} spent for ${leads} lead${leads === 1 ? "" : "s"}${leads ? ", " + money(spend / leads) + " a lead" : ""}. Costs are yours to enter; Claude counts the rest from GHL by source.` }));

    const ul = h("ul", { class: "camp" });
    for (const c of list) {
      const cpl = c.cost != null && c.leads ? money(c.cost / c.leads) : "—";
      const flag = h("span", { class: "saved" });
      const costIn = h("input", { type: "number", min: "0", step: "1", inputmode: "decimal", value: c.cost ?? "", "aria-label": "Cost" });
      costIn.addEventListener("change", () => saveCampaign(c, { cost: costIn.value }, flag).then(() => render()));
      const piecesIn = h("input", { type: "number", min: "0", step: "1", inputmode: "numeric", value: c.pieces ?? "", "aria-label": "Pieces" });
      piecesIn.addEventListener("change", () => saveCampaign(c, { pieces: piecesIn.value }, flag));
      const st = h("select", { "aria-label": "Status" }, ...["Planned", "Running", "Done"].map((o) => h("option", { value: o, selected: o === c.status, text: o })));
      st.addEventListener("change", () => saveCampaign(c, { status: st.value }, flag).then(() => render()));
      ul.append(h("li", {},
        h("div", { class: "chips" }, chip(c.channel || "—"), ...(c.carriers || []).map((x) => chip(x, "c-" + x)), c.status === "Done" ? chip("Done") : null),
        h("div", { class: "name", text: c.name }),
        h("div", { class: "funnel" },
          h("div", {}, h("b", { text: money(c.cost) }), "spent"),
          h("div", {}, h("b", { text: num(c.leads) }), "leads"),
          h("div", {}, h("b", { text: num(c.appointments) }), "appts"),
          h("div", {}, h("b", { text: num(c.enrollments) }), "enrolled"),
          h("div", { class: "cpl" }, h("b", { text: cpl }), "a lead")),
        h("div", { class: "inline-edit" },
          h("label", {}, "Cost $", costIn), h("label", {}, "Pieces", piecesIn), h("label", {}, "Status", st), flag),
        h("p", { class: "meta", text: [c.countedOn ? "Counted " + ago(c.countedOn) : "Not counted yet", c.tracking ? "Tracking: " + c.tracking : null, c.start ? "Since " + fmtDay(c.start) : null].filter(Boolean).join(" · ") })));
    }
    if (!list.length) ul.append(h("li", { class: "quiet", text: "No campaigns yet. Add the first one below." }));
    main.append(ul);
    main.append(h("div", { style: "height:26px" }));
    main.append(newCampaignForm());

    const field = rows("field");
    if (field.length) main.append(h("section", { class: "mc-sec", style: "margin-top:34px" }, h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "Field days" })), fieldList(field)));
  }
  function newCampaignForm() {
    const d = h("details", { class: "form" }, h("summary", { text: "＋ Add a campaign" }));
    const name = h("input", { class: "field", required: true, placeholder: "e.g. Kaimuki seminar, Nov 12" });
    const channel = h("select", { class: "field" }, ...["Kiosk", "Mailer", "Social", "Event", "Seminar", "Referral", "Other"].map((o) => h("option", { text: o })));
    const carrier = h("select", { class: "field" }, ...["Devoted", "UHC", "Humana", "Multi"].map((o) => h("option", { text: o })));
    const start = h("input", { class: "field", type: "date", value: todayISO() });
    const cost = h("input", { class: "field", type: "number", min: "0", inputmode: "decimal", placeholder: "0" });
    const pieces = h("input", { class: "field", type: "number", min: "0", inputmode: "numeric", placeholder: "Letters, flyers, posts" });
    const tracking = h("input", { class: "field", placeholder: "Unique phone, QR, URL, or 'ask how they heard'" });
    const btn = h("button", { class: "btn", type: "submit", text: "Add campaign" });
    const form = h("form", {},
      h("label", { class: "f", text: "Name" }), name,
      h("div", { class: "row2" }, h("div", {}, h("label", { class: "f", text: "Channel" }), channel), h("div", {}, h("label", { class: "f", text: "Carrier" }), carrier)),
      h("div", { class: "row2" }, h("div", {}, h("label", { class: "f", text: "Start" }), start), h("div", {}, h("label", { class: "f", text: "Cost so far ($)" }), cost)),
      h("div", { class: "row2" }, h("div", {}, h("label", { class: "f", text: "Pieces" }), pieces), h("div", {}, h("label", { class: "f", text: "How responses are tracked" }), tracking)),
      h("div", { class: "go" }, btn));
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); btn.disabled = true; btn.textContent = "Saving…";
      try {
        const c = await api("POST", "/api/medicare/campaign", { name: name.value, channel: channel.value, carriers: [carrier.value], start: start.value || null, cost: cost.value, pieces: pieces.value, tracking: tracking.value });
        S.data.campaigns.rows.unshift(c); S.msg = `Added “${c.name}”.`;
      } catch { S.msg = "Couldn't add that campaign."; }
      render();
    });
    d.append(form);
    return d;
  }

  // ---------------- content ----------------
  async function shrink(file) {
    // Phones hand over 4–12 MB photos; send a 2048px JPEG instead (about 0.5–1.5 MB).
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
    if (!bmp) {
      return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    }
    const max = 2048, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  }
  function newPostForm() {
    const dr = S.draft || {};
    const wrap = h("div", { class: "form" });
    const fileIn = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/heic,image/*" });
    const prev = h("div", { class: "ph", text: "＋" });
    const dropTxt = h("div", {}, h("div", { style: "color:var(--ink)", text: "Add a photo" }), h("div", { class: "quiet", text: "Optional for educational posts" }));
    const drop = h("label", { class: "drop" }, prev, dropTxt, fileIn);
    let dataUrl = null;
    fileIn.addEventListener("change", async () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      dropTxt.firstChild.textContent = "Preparing photo…";
      try {
        dataUrl = await shrink(f);
        const img = h("img", { src: dataUrl, alt: "" });
        prev.replaceWith(img);
        dropTxt.firstChild.textContent = f.name;
      } catch { dropTxt.firstChild.textContent = "That photo couldn't be read. Try another."; dataUrl = null; }
    });
    const title = h("input", { class: "field", placeholder: "e.g. At the Salt Lake table", value: dr.title || "" });
    const kind = h("select", { class: "field" }, ...["In the field", "Educational", "Mailer follow-up", "Event promo", "Carrier news"].map((o) => h("option", { text: o, selected: o === dr.kind })));
    const camp = h("select", { class: "field" }, h("option", { value: "", text: "None" }), ...rows("campaigns").filter((c) => c.status !== "Done").map((c) => h("option", { value: c.id, text: c.name })));
    const brief = h("textarea", { class: "field", rows: "3", placeholder: "Where, who, what you want to say. Claude writes the rest." });
    brief.value = dr.brief || "";
    const btn = h("button", { class: "btn", type: "submit", text: "Add to the queue" });
    const note = h("span", { class: "quiet", text: "Claude writes the thumbnail, captions, call to action and disclaimer." });
    const form = h("form", {}, drop,
      h("label", { class: "f", text: "Title" }), title,
      h("div", { class: "row2" }, h("div", {}, h("label", { class: "f", text: "Kind" }), kind), h("div", {}, h("label", { class: "f", text: "Campaign" }), camp)),
      h("label", { class: "f", text: "Your line about it" }), brief,
      h("div", { class: "go" }, btn, note));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!title.value.trim()) { title.focus(); return; }
      btn.disabled = true; btn.textContent = dataUrl ? "Uploading…" : "Saving…";
      try {
        const c = await api("POST", "/api/medicare/content", { title: title.value, kind: kind.value, brief: brief.value, campaign: camp.value || null, image: dataUrl });
        S.data.content.rows.unshift(c);
        S.draft = { kind: kind.value };
        S.msg = `“${c.title}” is in the queue. Tap “Have Claude write it” when you're ready.`;
      } catch (err) { S.msg = err.message && err.message.length < 80 ? err.message : "Couldn't save that post. Try again."; btn.disabled = false; btn.textContent = "Add to the queue"; }
      render();
    });
    wrap.append(h("p", { class: "sec", style: "margin-bottom:14px", text: "New post" }), form);
    return wrap;
  }
  async function saveContent(r, fields) {
    try { Object.assign(r, await api("PATCH", "/api/medicare/content/" + r.id, fields)); } catch { S.msg = "Couldn't save that to Notion."; }
    render();
  }
  function caption(label, text, fine) {
    if (!text) return null;
    return h("div", { class: "cap" }, h("div", { class: "lab" }, h("span", { text: label }), copyBtn(() => text)), h("p", { class: "txt" + (fine ? " fine" : ""), text }));
  }
  function postCard(r) {
    const hasPic = r.thumbs || r.photos;
    const pic = hasPic ? h("img", { class: "pic", loading: "lazy", alt: r.title || "", src: `/api/medicare/img/${encodeURIComponent(r.id)}?p=${r.thumbs ? "Thumbnail" : "Photo"}` })
      : h("div", { class: "pic nopic", text: r.status === "Requested" ? "Claude will make a graphic" : "No image" });
    const body = h("div", { class: "body" });
    const comp = r.compliance === "Needs carrier approval" ? chip("Needs carrier approval", "warn") : r.compliance === "Approved" ? chip("Approved" + (r.materialId ? " · " + r.materialId : ""), "ok") : r.compliance ? chip("Educational", "ok") : null;
    body.append(h("div", { class: "chips" }, chip(r.status, r.status === "Requested" ? "" : r.status === "Posted" ? "ok" : ""), chip(r.kind || "—"), comp));
    body.append(h("h3", { text: r.title || "" }));
    if (r.status === "Requested") {
      if (r.brief) body.append(h("p", { class: "brief", text: r.brief }));
      body.append(h("p", { class: "waiting", text: "Waiting for Claude to write it." }));
      body.append(h("div", { class: "mc-acts" }, ext(h("a", { class: "btn small", href: claude(PROMPTS.write(r)), text: "Have Claude write it" }))));
      return h("article", { class: "post" }, pic, body);
    }
    body.append(caption("Instagram", r.ig), caption("Facebook", r.fb), caption("Call to action", r.cta), caption("Summary", r.summary), caption("Disclaimer", r.disclaimer, true));
    const full = (cap) => [cap, r.cta, r.disclaimer].filter(Boolean).join("\n\n");
    const acts = h("div", { class: "mc-acts" });
    if (r.ig) acts.append(copyBtn(() => full(r.ig), "Copy IG post"));
    if (r.fb) acts.append(copyBtn(() => full(r.fb), "Copy FB post"));
    if (r.thumbs) acts.append(h("a", { class: "textlink", href: `/api/medicare/img/${encodeURIComponent(r.id)}?p=Thumbnail`, download: (r.title || "thumbnail").replace(/[^\w-]+/g, "-") + ".jpg", text: "Save image" }));
    const blocked = r.compliance === "Needs carrier approval";
    if (r.status === "Draft") acts.append(h("button", { class: "textlink", type: "button", text: "Looks good, mark ready", onclick: () => saveContent(r, { status: "Ready" }) }));
    if (r.status !== "Posted") acts.append(h("button", { class: "btn small", type: "button", disabled: blocked || null, title: blocked ? "Needs the carrier's approval and a material ID first" : null, text: "Mark posted", onclick: () => saveContent(r, { status: "Posted" }) }));
    else acts.append(h("span", { class: "quiet", text: "Posted " + fmtDay(r.postDate) }), h("button", { class: "textlink", type: "button", text: "Not posted", onclick: () => saveContent(r, { status: "Ready", postDate: null }) }));
    if (blocked) {
      const mid = h("input", { class: "field", style: "margin:12px 0 0;max-width:260px", placeholder: "Material ID once approved", value: r.materialId || "" });
      mid.addEventListener("change", () => saveContent(r, { materialId: mid.value, compliance: mid.value.trim() ? "Approved" : "Needs carrier approval" }));
      body.append(mid);
    }
    body.append(acts);
    return h("article", { class: "post" }, pic, body);
  }
  function content(main) {
    const all = rows("content");
    const requested = all.filter((r) => r.status === "Requested");
    main.append(h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "Content" }),
      requested.length > 1 ? ext(h("a", { class: "btn small", href: claude(PROMPTS.writeAll), text: `Have Claude write all ${requested.length}` })) : null));
    main.append(h("p", { class: "mc-lede", text: "Drop in a photo and a line. Claude writes the thumbnail, both captions, a call to action and the current disclaimer. Anything naming a plan, benefit or premium is flagged until the carrier approves it." }));
    main.append(newPostForm());
    const groups = [["Waiting for Claude", requested], ["Drafts and ready", all.filter((r) => r.status === "Draft" || r.status === "Ready")], ["Posted", all.filter((r) => r.status === "Posted").slice(0, 12)]];
    for (const [label, list] of groups) {
      if (!list.length) continue;
      const sec = h("section", { class: "mc-sec" }, h("div", { class: "mc-head" }, h("h2", { class: "sec", text: label }), h("span", { class: "quiet", text: String(list.length) })));
      const grid = h("div", { class: "posts" });
      for (const r of list) grid.append(postCard(r));
      sec.append(grid);
      main.append(sec);
    }
  }

  // ---------------- partners ----------------
  async function savePartner(p, fields) {
    try { Object.assign(p, await api("PATCH", "/api/medicare/partner/" + p.id, fields)); S.msg = null; } catch { S.msg = "Couldn't save that to Notion."; }
    render();
  }
  function partners(main) {
    main.append(h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "Providers and partners" })));
    main.append(h("p", { class: "mc-lede", text: "Doctors' offices, care homes and groups whose people are caught in this year's changes. Be the person their front desk calls. Nothing of value for referrals, and no marketing inside treatment areas." }));
    main.append(filterBar(["All", "In the disruption", "Providers", "Gone quiet"], S.partnerFilter, (v) => (S.partnerFilter = v)));
    const today = todayISO();
    const quiet = (p) => !p.lastContact || dayDiff(today, p.lastContact.slice(0, 10)) > 30;
    let list = rows("partners").slice();
    if (S.partnerFilter === "In the disruption") list = list.filter((p) => p.disruption && p.disruption !== "None known");
    if (S.partnerFilter === "Providers") list = list.filter((p) => p.channel === "Providers");
    if (S.partnerFilter === "Gone quiet") list = list.filter(quiet);
    const rank = (p) => (p.disruption && p.disruption !== "None known" ? 0 : 1);
    list.sort((a, b) => rank(a) - rank(b) || (a.lastContact || "").localeCompare(b.lastContact || ""));
    const ul = h("ul", { class: "partners" });
    for (const p of list) {
      const next = h("input", { placeholder: "Next step with them", value: p.nextStep || "", "aria-label": "Next step" });
      next.addEventListener("change", () => savePartner(p, { nextStep: next.value }));
      const dis = h("select", { class: "copy", "aria-label": "Disruption", style: "border:0;background:transparent" }, h("option", { value: "", text: "Disruption: not set" }),
        ...["HMSA plan closing", "Humana changes", "Devoted fit", "None known"].map((o) => h("option", { value: o, text: o, selected: o === p.disruption })));
      dis.addEventListener("change", () => savePartner(p, { disruption: dis.value || null }));
      const c = p.lastContact ? dayDiff(today, p.lastContact.slice(0, 10)) : null;
      ul.append(h("li", {},
        h("div", { class: "chips" },
          p.disruption && p.disruption !== "None known" ? chip(p.disruption, "warn") : null,
          p.channel ? chip(p.channel) : null, p.phase ? chip(p.phase) : null,
          ...(p.networks || []).map((x) => chip(x, "c-" + x))),
        h("p", { class: "name", style: "margin-top:8px", text: p.name }),
        h("p", { class: "meta" },
          p.contact ? h("span", { text: p.contact }) : null,
          h("span", { class: c == null || c > 30 ? "mc-stale" : "", text: "Last spoke " + ago(p.lastContact) }),
          p.leads != null ? h("span", { text: `${p.leads} lead${p.leads === 1 ? "" : "s"} in GHL` }) : null),
        h("div", { class: "next" }, next),
        h("div", { class: "mc-acts" },
          h("button", { class: "textlink", type: "button", text: "Talked today", onclick: () => savePartner(p, { contacted: true }) }),
          dis,
          ext(h("a", { class: "textlink", href: claude(PROMPTS.partner(p)), text: "Talk track" })),
          safeUrl(p.url) ? ext(h("a", { class: "textlink", href: p.url, text: "Open in Notion" })) : null)));
    }
    if (!list.length) ul.append(h("li", { class: "quiet", text: "No one matches this filter." }));
    main.append(ul);
  }

  // ---------------- shared: full screen ----------------
  // Real full screen where the browser allows it (iPhone Safari doesn't for divs), otherwise a fixed overlay.
  function openFull(el, onClose) {
    el.classList.add("mc-full");
    document.body.classList.add("mc-noscroll");
    const close = () => {
      el.classList.remove("mc-full");
      document.body.classList.remove("mc-noscroll");
      document.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", fsc);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (onClose) onClose();
    };
    const key = (e) => { if (e.key === "Escape") close(); };
    const fsc = () => { if (!document.fullscreenElement && el.classList.contains("mc-full")) close(); };
    document.addEventListener("keydown", key);
    if (el.requestFullscreen) el.requestFullscreen().then(() => document.addEventListener("fullscreenchange", fsc)).catch(() => {});
    return close;
  }

  // ---------------- veterans ----------------
  const SVGNS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  // Text that wraps inside a box (SVG has no wrapping): split by words to a max width in characters.
  function wrapLines(text, max) {
    const out = []; let line = "";
    for (const w of String(text).split(" ")) {
      if ((line + " " + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + " " + w).trim();
    }
    if (line) out.push(line);
    return out;
  }
  function box(x, y, w, hgt, tone, title, sub) {
    const g = s("g", { class: "vd-box vd-" + tone });
    g.append(s("rect", { x, y, width: w, height: hgt, rx: 10 }));
    const tl = wrapLines(title, Math.floor(w / 8.4)), sl = sub ? wrapLines(sub, Math.floor(w / 6.6)) : [];
    const total = tl.length * 18 + (sl.length ? 6 + sl.length * 15 : 0);
    let ty = y + (hgt - total) / 2 + 13;
    for (const l of tl) { g.append(s("text", { x: x + w / 2, y: ty, class: "vd-t", "text-anchor": "middle" }, l)); ty += 18; }
    ty += sl.length ? 4 : 0;
    for (const l of sl) { g.append(s("text", { x: x + w / 2, y: ty, class: "vd-s", "text-anchor": "middle" }, l)); ty += 15; }
    return g;
  }
  function arrow(x1, x2, y) {
    return s("g", { class: "vd-arrow" }, s("line", { x1, y1: y, x2: x2 - 7, y2: y }), s("path", { d: `M${x2 - 8} ${y - 5} L${x2} ${y} L${x2 - 8} ${y + 5} Z` }));
  }
  function vetDiagram() {
    const W = 960, laneH = 146, top = 56;
    const lanes = [
      { t: "Civilian doctor or hospital (in the plan's network)", boxes: [["You get care", "", "you"], ["Medicare Advantage plan pays first", "No drug coverage, $0 premium", "plan"], ["TRICARE For Life pays second", "If it doesn't arrive on its own, file with WPS: 866-773-0404", "tfl"], ["You owe little or nothing", "", "ok"]] },
      { t: "VA facility: service-connected condition", boxes: [["You get care at the VA", "", "you"], ["VA covers it", "Nothing goes to the plan or TRICARE", "va"], ["$0, nothing to file", "", "ok"]] },
      { t: "VA facility: not service-connected", boxes: [["You get care at the VA", "", "you"], ["Medicare and the plan pay nothing", "Medicare can't pay a VA facility", "no"], ["TFL pays at most 20%", "Of TRICARE's allowed amount; ask VA billing", "tfl"], ["You may owe the rest", "Usually better: a civilian doctor in the plan", "warn"]] },
      { t: "Prescriptions", boxes: [["You fill a prescription", "", "you"], ["TRICARE pharmacy or VA pharmacy", "Same as today", "tfl"], ["No Part D needed", "TRICARE and VA drug coverage count as creditable: no late penalty", "ok"]] },
    ];
    const H = top + lanes.length * laneH + 24;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "vd", role: "img", "aria-label": "How VA care, TRICARE For Life and a Medicare Advantage plan without drug coverage work together" });
    svg.append(s("text", { x: 0, y: 26, class: "vd-h" }, "Who pays, and where"));
    svg.append(s("text", { x: 0, y: 46, class: "vd-s vd-left" }, "The VA, TRICARE For Life and the Medicare Advantage plan run in separate lanes; none replaces the others."));
    lanes.forEach((lane, i) => {
      const y = top + i * laneH + 14;
      svg.append(s("rect", { x: 0, y: y - 6, width: W, height: laneH - 14, rx: 12, class: "vd-lane" }));
      svg.append(s("text", { x: 14, y: y + 14, class: "vd-l" }, lane.t));
      const n = lane.boxes.length, gap = 34, bw = (W - 28 - gap * (n - 1)) / n, by = y + 26, bh = laneH - 52;
      lane.boxes.forEach(([t, sub, tone], j) => {
        const bx = 14 + j * (bw + gap);
        svg.append(box(bx, by, bw, bh, tone, t, sub));
        if (j < n - 1) svg.append(arrow(bx + bw + 3, bx + bw + gap - 3, by + bh / 2));
      });
    });
    return svg;
  }
  function vetEmail(planSpecific) {
    const V = MC_DATA.veterans;
    const lines = ["Hi [Name],", ""];
    if (!planSpecific) {
      lines.push(
        "Thank you for your service, and thanks for stopping by. Here's the information I mentioned about how Medicare works with VA care and TRICARE For Life.",
        "",
        "The short version: some Medicare Advantage plans are built for veterans and don't include drug coverage, because you already have drug coverage through TRICARE or the VA. Joining one doesn't affect your VA care, and TRICARE For Life still pays second.",
        "",
        "Straight from the source:");
      for (const l of V.links) lines.push(`- ${l.t}: ${l.u}`);
      lines.push("",
        "If you'd like to see the plans available in your area side by side, I'm happy to sit down with you. Open enrollment runs through December 7.",
        "", "Mahalo,", "Eric Barayuga", "(808) 256-6736");
    } else {
      lines.push(
        "Thank you for meeting with me. As promised, here are the 2027 Medicare Advantage plans on Oahu that have no drug coverage, so you keep your TRICARE pharmacy benefit:", "");
      for (const p of V.plans) lines.push(`- ${p.carrier === "UHC" ? "UnitedHealthcare" : p.carrier} ${p.name} (${p.type}): ${p.premium} premium, $${p.giveback} a month back on your Part B premium ($${(p.giveback * 12).toLocaleString("en-US")} a year).`);
      lines.push("",
        "With any of them, TRICARE For Life still pays second, and your VA care stays exactly the same. Sometimes a TRICARE claim needs to be sent in by hand after an MA plan pays; I'll show you how.",
        "", "Worth reading:");
      for (const l of [...V.links, ...V.planLinks]) lines.push(`- ${l.t}: ${l.u}`);
      lines.push("",
        "The giveback only applies if you pay your own Part B premium, and it can take a few months to show up in your check. Benefits vary by plan, so let's check your doctors before you choose. Open enrollment runs through December 7.",
        "", "Mahalo,", "Eric Barayuga", "(808) 256-6736", "", MC_DATA.disclaimer);
    }
    return lines.join("\n");
  }
  function veterans(main) {
    const V = MC_DATA.veterans;
    main.append(h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "Veterans" }), h("span", { class: "quiet", text: `${V.area} · 2027` })));
    main.append(h("p", { class: "mc-lede", text: "For veterans with TRICARE For Life or VA care: Medicare Advantage plans with no drug coverage, how they fit with the VA, and what to say. Show the plans only after a signed Scope." }));
    main.append(h("nav", { class: "vet-jump" }, ...[["vet-options", "Options"], ["vet-diagram", "Diagram"], ["vet-faq", "FAQ"], ["vet-script", "Script"], ["vet-email", "Email"]].map(([id, t]) =>
      h("a", { href: "#" + id, text: t, onclick: (e) => { e.preventDefault(); document.getElementById(id).scrollIntoView({ behavior: "smooth", block: "start" }); } }))));

    // Options
    const opt = h("section", { class: "mc-sec", id: "vet-options" }, h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "2027 options · no drug coverage" })));
    const plans = V.plans.slice().sort((a, b) => b.giveback - a.giveback);
    const grid = h("div", { class: "vet-plans" });
    for (const p of plans) {
      grid.append(h("article", { class: `vplan k-${p.carrier}` + (p.best ? " best" : "") },
        h("div", { class: "chips" }, chip(p.carrier, "c-" + p.carrier), chip(p.type), p.best ? chip("Highest giveback", "new") : null),
        h("h3", { text: p.name }),
        h("div", { class: "vgive" }, h("b", { text: "$" + p.giveback }), h("span", { text: "/mo back" }), h("small", { text: `$${(p.giveback * 12).toLocaleString("en-US")} a year on the Part B premium` })),
        h("dl", {}, ...[["Premium", p.premium], ["Primary care", p.pcp], ["Specialist", p.specialist], ["Dental", p.dental], ["Eyewear", p.eyewear], ["Hearing", p.hearing], ["Drugs", "None: keep TRICARE pharmacy"]]
          .flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })])),
        h("p", { class: "quiet", text: p.id })));
    }
    opt.append(grid);
    if (V.checks && V.checks.length) opt.append(h("ul", { class: "vet-checks" }, ...V.checks.map((c) => h("li", { text: c }))));
    main.append(opt);

    // Diagram
    const dsec = h("section", { class: "mc-sec", id: "vet-diagram" });
    const frame = h("div", { class: "vd-frame" });
    const closeBtn = h("button", { class: "vd-close", type: "button", "aria-label": "Close full screen", text: "×" });
    frame.append(closeBtn, vetDiagram());
    let closeFull = null;
    closeBtn.addEventListener("click", () => closeFull && closeFull());
    dsec.append(h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "How VA, TRICARE and the plan fit" }),
      h("button", { class: "btn small ghost", type: "button", text: "⤢ Full screen", onclick: () => { closeFull = openFull(frame, () => (closeFull = null)); } })), frame);
    main.append(dsec);

    // FAQ
    const fsec = h("section", { class: "mc-sec", id: "vet-faq" }, h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "FAQ" })));
    for (const f of V.faq) fsec.append(h("details", { class: "faq" }, h("summary", { text: f.q }), h("p", { text: f.a })));
    main.append(fsec);

    // Script
    const scr = h("section", { class: "mc-sec", id: "vet-script" });
    scr.append(h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "In the field" }), copyBtn(() => V.script.join("\n\n"), "Copy script")));
    scr.append(h("p", { class: "mc-lede", text: "Say it, don't read it. No plan names until they've signed a Scope." }));
    scr.append(h("ol", { class: "script" }, ...V.script.map((l) => h("li", { text: l }))));
    main.append(scr);

    // Email
    const em = h("section", { class: "mc-sec", id: "vet-email" }, h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "Email" })));
    em.append(filterBar(["Educational", "After a Scope"], S.vetEmail || "Educational", (v) => (S.vetEmail = v)));
    const specific = S.vetEmail === "After a Scope";
    em.append(h("p", { class: "mc-lede", text: specific
      ? "Names the plans and the giveback, so it's marketing: send only to someone who has signed a Scope for Medicare Advantage. The disclaimer is already at the bottom."
      : "Safe to send to anyone: explains how it works and links the official TRICARE, VA and Medicare pages. No plan names or amounts." }));
    const text = vetEmail(specific);
    const subject = specific ? "Your 2027 Medicare options with TRICARE For Life" : "How Medicare works with your VA and TRICARE For Life";
    em.append(h("div", { class: "cap" }, h("div", { class: "lab" }, h("span", { text: "Subject" }), copyBtn(() => subject)), h("p", { class: "txt", text: subject })));
    em.append(h("div", { class: "cap" }, h("div", { class: "lab" }, h("span", { text: "Body" }), copyBtn(() => text)), h("p", { class: "txt email-body", text })));
    em.append(h("div", { class: "mc-acts" },
      h("a", { class: "btn small", href: "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text), text: "Open in Mail" }),
      copyBtn(() => subject + "\n\n" + text, "Copy all")));
    main.append(em);
  }

  // ---------------- 2027 plans (cheat sheet + presentation) ----------------
  const fmtGive = (g) => (g == null ? "—" : "$" + (Number.isInteger(g) ? g : g.toFixed(2)) + "/mo");
  const PLAN_ROWS = [
    ["Premium", (p) => p.premium], ["Giveback", (p) => fmtGive(p.giveback)], ["Medical deductible", (p) => p.deductible],
    ["Specialist", (p) => p.specialist], ["Hospital", (p) => p.inpatient], ["Out-of-pocket max", (p) => p.moop],
    ["Dental / yr", (p) => p.dental], ["Eyewear / yr", (p) => p.eyewear], ["OTC", (p) => p.otc], ["Food & Home Card", (p) => p.food],
    ["Drug coverage", (p) => (p.partD ? "Yes (Part D)" : "None")], ["Drug deductible", (p) => p.rxDed], ["Drug tiers 1–5", (p) => p.tiers],
  ];
  const PLAN_FILTERS = {
    All: () => true, "Devoted's picks": (p) => p.featured, Giveback: (p) => p.giveback != null,
    "No drugs": (p) => !p.partD, "Chronic (C-SNP)": (p) => /C-SNP/.test(p.type), PPO: (p) => /PPO/.test(p.type), "New for 2027": (p) => p.isNew,
  };
  function plans2027(main) {
    const D = MC_DATA.plans2027, c = D[S.planCarrier] ? S.planCarrier : "Devoted", C = D[c];
    main.append(h("a", { class: "textlink", href: "/medicare/carriers", text: "← Carriers", onclick: (e) => { e.preventDefault(); go("carriers"); } }));
    main.append(h("div", { class: "mc-head", style: "margin-top:14px" }, h("h2", { class: "head", style: "font-size:30px;margin:0", text: "2027 Plans" }),
      C.status === "ready" ? h("button", { class: "btn small", type: "button", text: "▶ Present", onclick: () => present(c, C) }) : null));
    main.append(h("div", { class: "filters" }, ...D.order.map((k) => h("button", { type: "button", "aria-pressed": String(k === c),
      text: k + (D[k].status === "ready" ? "" : " · coming"), onclick: () => { S.planCarrier = k; go("carriers", true, "plans"); } }))));
    if (C.status !== "ready") {
      main.append(h("div", { class: "mc-share" }, h("p", { text: `${c}'s 2027 cheat sheet isn't built yet.` }),
        h("p", { text: "Send Claude the carrier's 2027 plan list or your cheat sheet and it'll be added here in the same layout." }),
        h("p", {}, ext(h("a", { class: "textlink", href: claude(`Add ${c}'s 2027 Honolulu County plans to the 2027 Plans page in Oggi /medicare (public/medicare-data.js, plans2027.${c}), in the same layout as Devoted: plans, what changed from 2026, what's new.`), text: "Ask Claude to build it" })))));
      return;
    }
    main.append(h("p", { class: "mc-lede", text: `${C.area} · ${C.plans.length} plans · updated ${fmtDay(C.updated)}. Tap ▶ Present to show someone at the kiosk.` }));

    const ch = h("section", { class: "mc-sec" }, h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "What changed for 2027" })));
    ch.append(h("ul", { class: "changes" }, ...C.changes.map((t) => h("li", { text: t }))));
    main.append(ch);

    const sec = h("section", { class: "mc-sec" }, h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "The plans" })));
    sec.append(filterBar(Object.keys(PLAN_FILTERS), S.planFilter || "All", (v) => (S.planFilter = v)));
    const list = C.plans.filter(PLAN_FILTERS[S.planFilter || "All"]);
    const cards = h("div", { class: "pcards" });
    for (const p of list) {
      cards.append(h("article", { class: "pcard" },
        h("div", { class: "chips" }, chip(p.type), p.featured ? chip("Devoted's pick", "ok") : null, p.isNew ? chip("New for 2027", "new") : null, !p.partD ? chip("No drugs") : null),
        h("h3", {}, p.name, p.nick ? h("span", { class: "nick", text: " · " + p.nick }) : null),
        h("p", { class: "who", text: p.who }),
        h("dl", {}, ...PLAN_ROWS.filter(([, f]) => f(p) != null).flatMap(([k, f]) => [h("dt", { text: k }), h("dd", { class: k === "Giveback" && p.giveback ? "give" : "", text: f(p) })])),
        h("p", { class: "quiet", text: p.id })));
    }
    if (!list.length) cards.append(h("p", { class: "quiet", text: "No plans match this filter." }));
    sec.append(cards);
    main.append(sec);
    main.append(h("p", { class: "fine", text: `Source: ${C.source} Nicknames are yours and never show in Present. Check the Summary of Benefits before quoting a number; show plans only after a signed Scope.` }));
  }

  // Full-screen slides: an overview, one slide per plan, then what's new. ← → or swipe; Esc closes.
  function present(cname, C) {
    const slides = [];
    const plans = C.plans;
    slides.push(() => h("div", { class: "sl" },
      h("p", { class: "sl-k", text: `2027 · ${C.area}` }), h("h2", { text: `${cname} Medicare Advantage plans` }),
      h("div", { class: "sl-grid" }, ...plans.map((p, i) => h("button", { type: "button", class: "sl-tile", onclick: () => show(i + 1) },
        h("b", { text: p.name }), h("span", { text: p.type }),
        h("em", { text: p.giveback ? fmtGive(p.giveback) + " back" : !p.partD ? "No drug coverage" : p.premium + " premium" }))))));
    for (const p of plans) slides.push(() => h("div", { class: "sl" },
      h("p", { class: "sl-k", text: `${cname} · ${p.type}` + (p.isNew ? " · New for 2027" : "") }),
      h("h2", { text: p.name }),
      h("p", { class: "sl-who", text: p.who.replace(/ ?Full QUEST members only; ask the MedQUEST level first\./, "").replace(/ and the plan Devoted's trainers point SLMB members to/, "") }),
      h("div", { class: "sl-big" },
        h("div", {}, h("b", { text: p.premium }), h("span", { text: "monthly premium" })),
        p.giveback ? h("div", { class: "g" }, h("b", { text: fmtGive(p.giveback) }), h("span", { text: "back on your Part B premium" })) : null,
        h("div", {}, h("b", { text: p.dental }), h("span", { text: "dental a year" }))),
      h("dl", {}, ...PLAN_ROWS.filter(([k, f]) => !["Premium", "Giveback", "Dental / yr"].includes(k) && f(p) != null).flatMap(([k, f]) => [h("dt", { text: k }), h("dd", { text: f(p) })]))));
    slides.push(() => h("div", { class: "sl" }, h("p", { class: "sl-k", text: `${cname} · 2027` }), h("h2", { text: "What's new this year" }),
      h("ul", { class: "sl-list" }, ...C.changes.filter((t) => !/D-SNP|MedQUEST/.test(t)).map((t) => h("li", { text: t })))));

    let i = 0;
    const stage = h("div", { class: "sl-stage" });
    const count = h("span", { class: "sl-n" });
    const prev = h("button", { type: "button", class: "sl-nav", "aria-label": "Previous", text: "←", onclick: () => show(i - 1) });
    const next = h("button", { type: "button", class: "sl-nav", "aria-label": "Next", text: "→", onclick: () => show(i + 1) });
    const x = h("button", { type: "button", class: "sl-x", "aria-label": "Close", text: "×" });
    const deck = h("div", { class: "deck" }, x, stage,
      h("div", { class: "sl-foot" }, prev, count, next),
      h("p", { class: "sl-disc", text: MC_DATA.disclaimer + " Benefits summarized from 2027 plan information; see the Summary of Benefits for full details." }));
    function show(n) {
      i = Math.max(0, Math.min(slides.length - 1, n));
      stage.textContent = ""; stage.append(slides[i]());
      count.textContent = `${i + 1} / ${slides.length}`;
      prev.disabled = i === 0; next.disabled = i === slides.length - 1;
    }
    const key = (e) => { if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); show(i + 1); } if (e.key === "ArrowLeft") show(i - 1); };
    let sx = null;
    deck.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
    deck.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1)); sx = null; });
    document.body.append(deck);
    document.addEventListener("keydown", key);
    const close = openFull(deck, () => { document.removeEventListener("keydown", key); deck.remove(); });
    x.addEventListener("click", close);
    show(0);
  }

  // ---------------- activity log ----------------
  const LOG_KINDS = ["All", "Prospects", "Clients", "Email", "GHL", "Forms", "Other"];
  const kindGroup = (k) => k === "Prospect met" ? "Prospects" : k === "Client review" || k === "Plan comparison" || k === "Phone call" ? "Clients" : k === "Email" ? "Email" : k === "GHL push" ? "GHL" : k === "Form filled" ? "Forms" : "Other";
  const GHL_CHIP = { "In GHL": "ok", "In Outbox": "warn", "Not in GHL": "" };
  function log(main) {
    const all = rows("log");
    main.append(h("div", { class: "mc-head" }, h("h2", { class: "sec", text: "Activity Log" }), h("span", { class: "quiet", text: `${all.length} since AEP opened` })));
    main.append(h("p", { class: "mc-lede", text: "Everything Medicare that Claude did for you: people you met, clients you reviewed, GHL pushes, emails it read, forms it filled. GHL status is read live from People, so it's current." }));
    const search = h("input", { class: "field log-q", type: "search", placeholder: "Search a name, tag or word", value: S.logQ || "" });
    search.addEventListener("input", () => { S.logQ = search.value; drawList(); });
    main.append(search);
    main.append(filterBar(LOG_KINDS, S.logKind || "All", (v) => (S.logKind = v)));
    main.append(filterBar(["Any GHL status", "Not in GHL", "In Outbox", "In GHL"], S.logGhl || "Any GHL status", (v) => (S.logGhl = v)));
    const tags = [...new Set(all.flatMap((r) => r.tags || []))].sort();
    if (tags.length) main.append(filterBar(["Any tag", ...tags], S.logTag || "Any tag", (v) => (S.logTag = v)));
    const sortSel = h("select", { class: "copy", "aria-label": "Sort", style: "border:0;background:transparent;margin:0 0 14px" },
      ...["Newest first", "Oldest first", "By person"].map((o) => h("option", { text: o, selected: o === (S.logSort || "Newest first") })));
    sortSel.addEventListener("change", () => { S.logSort = sortSel.value; drawList(); });
    const selAll = h("button", { class: "textlink", type: "button", text: "Select everyone shown", style: "margin:0 0 14px 14px" });
    main.append(h("div", {}, sortSel, selAll));
    const holder = h("div");
    main.append(holder);
    const bar = h("div", { class: "selbar", hidden: true });
    main.append(bar);
    let shown = [];
    selAll.addEventListener("click", () => { for (const r of shown) if (selKey(r)) toggleSel(r, true); drawList(); drawBar(); });

    function drawBar() {
      bar.textContent = "";
      const n = S.sel.size;
      bar.hidden = !n;
      if (!n) return;
      const people = [...S.sel.values()];
      const note = h("p", { class: "selbar-note", hidden: true });
      const run = (action) => {
        if (action === "Scope" && n > 1 && note.hidden) {
          note.hidden = false;
          note.textContent = `RetireFlo can't save drafts, so Claude does these ${n} one at a time and waits for your "next" between each. Tap Claude Scope again to start.`;
          return;
        }
        const at = new Date().toISOString();
        const pend = readPending();
        for (const k of S.sel.keys()) pend[k] = { action, at };
        writePending(pend);
        window.open(claude(buildPrompt(action, people)), "_blank", "noopener");
        S.sel.clear(); drawList(); drawBar();
      };
      bar.append(
        h("span", { class: "selbar-n", text: `${n} selected` }),
        h("button", { class: "btn small", type: "button", onclick: () => run("Quote") }, flameIcon(), " Claude Quote"),
        h("button", { class: "btn small", type: "button", onclick: () => run("Scope") }, waveIcon(), " Claude Scope"),
        h("button", { class: "btn small", type: "button", text: "Claude → GHL", onclick: () => run("GHL") }),
        h("button", { class: "textlink", type: "button", text: "Clear", onclick: () => { S.sel.clear(); drawList(); drawBar(); } }),
        note,
        h("p", { class: "selbar-who", text: people.map((x) => x.name).join(", ") }));
    }

    function drawList() {
      const q = (S.logQ || "").trim().toLowerCase();
      let list = all.filter((r) =>
        (!S.logKind || S.logKind === "All" || kindGroup(r.kind) === S.logKind) &&
        (!S.logGhl || S.logGhl === "Any GHL status" || r.ghl === S.logGhl) &&
        (!S.logTag || S.logTag === "Any tag" || (r.tags || []).includes(S.logTag)) &&
        (!q || [r.summary, r.who, r.personName, r.kind, r.source, ...(r.tags || [])].join(" ").toLowerCase().includes(q)));
      const srt = S.logSort || "Newest first";
      list.sort((a, b) => srt === "By person" ? String(a.personName || a.who).localeCompare(String(b.personName || b.who)) || String(b.when).localeCompare(String(a.when))
        : srt === "Oldest first" ? String(a.when).localeCompare(String(b.when)) : String(b.when).localeCompare(String(a.when)));
      holder.textContent = "";
      shown = list;
      if (!list.length) { holder.append(h("p", { class: "quiet", text: all.length ? "Nothing matches these filters." : "Nothing logged yet." })); return; }
      const ul = h("ul", { class: "logl" });
      let lastDay = null;
      for (const r of list) {
        const d = r.when ? (r.when.length > 10 ? localDay(r.when) : r.when) : "";
        if (srt !== "By person" && d !== lastDay) { ul.append(h("li", { class: "log-day", text: d ? `${fmtWeekday(d + "T12:00:00-10:00")} ${fmtDay(d)}` : "Undated" })); lastDay = d; }
        const det = h("div", { class: "log-det", hidden: true });
        if (r.details) det.append(h("p", { class: "txt", text: r.details }));
        const links = [
          safeUrl(r.notionUrl) ? ext(h("a", { class: "textlink", href: r.notionUrl, text: "Notion row" })) : null,
          safeUrl(r.personUrl) ? ext(h("a", { class: "textlink", href: r.personUrl, text: "People" })) : null,
          safeUrl(r.gmail) ? ext(h("a", { class: "textlink", href: r.gmail, text: "Email thread" })) : null,
          r.ghlContact ? h("span", { class: "quiet", text: "GHL contact " + r.ghlContact }) : null,
          safeUrl(r.url) ? ext(h("a", { class: "textlink", href: r.url, text: "Log row" })) : null,
        ].filter(Boolean);
        if (links.length) det.append(h("div", { class: "mc-acts" }, ...links));
        const toggle = h("button", { class: "textlink", type: "button", text: "Details", "aria-expanded": "false" });
        toggle.addEventListener("click", () => { det.hidden = !det.hidden; toggle.setAttribute("aria-expanded", String(!det.hidden)); toggle.textContent = det.hidden ? "Details" : "Hide details"; });
        const key = selKey(r), pend = key ? pending(key) : null;
        const box = key ? h("input", { type: "checkbox", class: "log-sel", "aria-label": "Select " + (r.personName || r.who) }) : null;
        if (box) { box.checked = S.sel.has(key); box.addEventListener("change", () => { toggleSel(r, box.checked); drawList(); drawBar(); }); }
        ul.append(h("li", { class: (box ? "selectable" : "") + (box && box.checked ? " picked" : "") },
          box,
          h("div", { class: "chips" }, chip(r.kind || "Note"), r.ghl ? chip(r.ghl, GHL_CHIP[r.ghl]) : null, pend ? chip(`With Claude · ${pend.action}`, "claude") : null, ...(r.tags || []).slice(0, 4).map((t) => chip(t, "c-" + t))),
          h("p", { class: "name", style: "margin:8px 0 4px", text: r.personName || r.who || "—" }),
          h("p", { class: "log-sum", text: r.summary }),
          h("div", { class: "meta" }, r.when && r.when.length > 10 ? h("span", { text: fmtClock(r.when) }) : null, r.source ? h("span", { text: "From " + r.source }) : null, toggle),
          det));
      }
      holder.append(ul);
    }
    drawList();
    drawBar();
  }

  // ---------------- activity log: select people, hand them to Claude ----------------
  // Only rows about a person can be selected; one person counts once however many rows they have.
  // The prompt carries names and Notion links only: never a phone, birth date or ID number in a URL.
  S.sel = new Map();
  const PERSON_KINDS = ["Prospect met", "Client review", "Phone call", "Plan comparison", "Form filled"];
  function selKey(r) {
    if (r.person) return r.person;
    if (PERSON_KINDS.includes(r.kind) && r.who) return "who:" + r.who;
    return null;
  }
  function toggleSel(r, on) {
    const k = selKey(r);
    if (!k) return;
    if (on) S.sel.set(k, { name: r.personName ? r.personName.split(", ").reverse().join(" ") : r.who, personUrl: r.personUrl || null, logUrl: r.url || null, ghlContact: r.ghlContact || "" });
    else S.sel.delete(k);
  }
  const PEND_KEY = "mcPending";
  function readPending() { try { return JSON.parse(localStorage.getItem(PEND_KEY) || "{}"); } catch { return {}; } }
  function writePending(p) { try { localStorage.setItem(PEND_KEY, JSON.stringify(p)); } catch {} }
  // "With Claude" lasts until a newer log row for that person arrives, or six hours.
  function pending(key) {
    const p = readPending()[key];
    if (!p) return null;
    const newer = rows("log").some((r) => selKey(r) === key && r.created && r.created > p.at);
    if (newer || Date.now() - Date.parse(p.at) > 6 * 3600e3) { const all = readPending(); delete all[key]; writePending(all); return null; }
    return p;
  }
  const svgIcon = (cls, paths) => { const NS = "http://www.w3.org/2000/svg"; const sv = document.createElementNS(NS, "svg"); sv.setAttribute("viewBox", "0 0 16 16"); sv.setAttribute("class", "qi " + cls); sv.setAttribute("aria-hidden", "true"); for (const [d, c] of paths) { const pa = document.createElementNS(NS, "path"); pa.setAttribute("d", d); if (c) pa.setAttribute("class", c); sv.append(pa); } return sv; };
  const flameIcon = () => svgIcon("qi-flame", [["M8.6 1.2c.3 2-.9 3.1-2 4.3C5.4 6.8 4 8.1 4 10.2 4 12.9 5.9 15 8 15s4-2 4-4.6c0-1.7-.8-3-1.7-3.9.1 1.1-.4 2-1.2 2.4.4-2.6-.3-5.4-.5-7.7z"], ["M8.1 9.2c-.9.8-1.6 1.5-1.6 2.6 0 1 .7 1.8 1.5 1.8s1.5-.8 1.5-1.8c0-1.2-.7-1.8-1.4-2.6z", "qi-core"]]);
  const waveIcon = () => svgIcon("qi-wave", [["M1 9.2c1.6-2.6 3.4-2.6 5 0s3.4 2.6 5 0 2.6-2.8 4-1.6"], ["M1 12.6c1.6-2.2 3.4-2.2 5 0s3.4 2.2 5 0 2.6-2.4 4-1.4"]]);

  const LOG_DS = "collection://4239afa2-8b29-47a7-99a7-1dd1ffa76284";
  const GATHER = "Gather each person's details. Contact details (name, phone, email, address) come from GHL through the HighLevel (IFG) connector: find the contact by the GHL contact id if given, else phone, email, then name. Health details (date of birth, PCP, other doctors, medications with dosage, pharmacy) and the Medicare number come from their Notion People row (Notes → HEALTH and IDs lines, and the MBI field). GHL wins on contact details and Notion on health; if the two disagree on something you need, stop and show me both.";
  const WRITEBACK = (kind, label) => `When you finish, write back so Oggi updates on its own:
- Medicare Activity Log (${LOG_DS}): one row per person, following the System Map's Activity Log rules. Kind: ${kind}. Person: their People row. Summary in one plain sentence. Details: field by field what you entered and where (no ID numbers anywhere in the row; say "Medicare number on file"). Source: Claude. Key: ${label.toLowerCase()}-<people id>-<today's date>; check the Key isn't there already.
- People: set Last contact only if I actually spoke with them; for a GHL push set Pushed to today and update What changed.
- Brief Items: add or update one item per person for today (Last seen today, Area Medicare, Place Kakaako, Person = first name, a unique Key), following the brief's conventions, so it shows in the sky. Say what's ready and what's left for me.
- Then post a short summary here, and send me a phone notification (PushNotification) saying what's ready.`;
  function buildPrompt(action, people) {
    const list = people.map((x) => `- ${x.name}${x.personUrl ? " · People: " + x.personUrl : " · no People row yet"}${x.ghlContact ? " · GHL contact " + x.ghlContact : ""}${x.logUrl ? " · log: " + x.logUrl : ""}`).join("\n");
    const n = people.length, who = n === 1 ? "this person" : `these ${n} people`;
    if (action === "Quote") return `Claude Quote: put ${who} into Sunfire (IFG) and open their 2027 quote, from Oggi's Medicare Activity Log.

${list}

For each person, in order:
1. ${GATHER}
2. Minimum to start: name, date of birth, ZIP code, and medications with dosage (or confirmed none). PCP, other doctors and pharmacy are optional; add them if on file. If something required is missing, skip that person and list exactly what's missing.
3. In my Chrome (Claude in Chrome), open https://www.sunfirematrix.com/app/agent/ifg. If I'm signed out, stop and ask me to sign in, then carry on.
4. Search Sunfire for the contact. If they exist, open them. If not, add them: name, date of birth, address, phone, email. Then enter medications with dosage, pharmacy and doctors. Save after each section.
5. Leave the Medicare number field empty for me (don't type ID numbers); tell me where it's on file.
6. Open their 2027 quote page and stop there for me to review the plans.
With more than one person, work through them all, saving each, and end with each name and its Sunfire quote page.

${WRITEBACK("Plan comparison", "quote")}`;
    if (action === "Scope") return `Claude Scope: create a Scope of Appointment in RetireFlo for ${who}, from Oggi's Medicare Activity Log.

${list}

RetireFlo can't save drafts, so do one person at a time.${n > 1 ? ' After each one, stop and wait for me to say "next".' : ""}
For each person:
1. ${GATHER}
2. Minimum to start: name, address, and a phone number or email. PCP, other doctors, medications with dosage, Medicare number and pharmacy are optional; use them if on file. If something required is missing, skip that person and list exactly what's missing.
3. In my Chrome (Claude in Chrome), open https://app.retireflo.com/hawaii. If I'm signed out, stop and ask me to sign in, then carry on.
4. Create the Scope. Plans discussed: MA, MAPD, Med Supp, Medicaid (match RetireFlo's checkboxes word for word). Fill in everything else you have, but leave the Medicare number field for me.
5. Stop at the signature page. Never sign or submit; the client signs. Tell me it's ready for them.

${WRITEBACK("Form filled", "scope")}`;
    return `Claude → GHL: push ${who} to GHL, from Oggi's Medicare Activity Log. This message is my OK for this batch.

${list}

Use the ghl-medicare-prospects skill (pipeline, potential earnings, location met). For each person:
1. ${GATHER}
2. Minimum: name plus a phone number or email (GHL rejects a contact without one). If it's missing, skip that person and say so.
3. Look for an existing GHL contact first (phone, email, then name) and update it rather than make a duplicate. Enter what the People row's What changed says. Never put an ID number in a GHL note.

${WRITEBACK("GHL push", "push")}`;
  }

  // ---------------- start ----------------
  S.tab = tabFromPath();
  render();
  load();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.data) load(); });
  // Claude writes back after a Quote, Scope or GHL run; pick it up within a minute while the page is open.
  // Skipped while typing, presenting, or with a log row's details open, and redraws only on a change.
  setInterval(async () => {
    if (document.visibilityState !== "visible" || !S.data) return;
    if (document.querySelector(".mc-full") || document.querySelector(".log-det:not([hidden])")) return;
    if (document.activeElement && document.activeElement.closest("input:not([type=checkbox]), textarea, select")) return;
    try {
      const fresh = await api("GET", "/api/medicare?d=" + todayISO());
      if (JSON.stringify(fresh) !== JSON.stringify(S.data)) { const y = window.scrollY; S.data = fresh; render(); window.scrollTo(0, y); }
    } catch {}
  }, 60_000);
})();
