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
  const TABS = ["overview", "pulse", "carriers", "campaigns", "content", "partners"];
  const PROMPTS = {
    scan: "/medicare-marketing scan — scan Hawaii and national Medicare news and the four carriers (Devoted, UHC, Humana, HMSA), and add what's new to Medicare Pulse.",
    count: "/medicare-marketing count — count leads, appointments and enrollments in GHL for each running campaign in Medicare Campaigns, and sync my kiosk and event schedule from Google Calendar into Medicare Field Days.",
    writeAll: "/medicare-marketing write — write every Medicare Content row that is Requested: thumbnail, IG and Facebook captions, summary, call to action and disclaimer.",
    write: (r) => `/medicare-marketing write — write this post in Medicare Content: “${r.title}”${r.url ? " " + r.url : ""}. Thumbnail, IG and Facebook captions, summary, call to action and disclaimer.`,
    partner: (p) => `/medicare-marketing partner — give me a short talk track for ${p.name}${p.url ? " (" + p.url + ")" : ""}: who they are, what this AEP's changes mean for their patients or members, and one ask.`,
  };

  // ---------------- routing ----------------
  function tabFromPath() {
    const t = location.pathname.replace(/^\/medicare\/?/, "").split("/")[0];
    return TABS.includes(t) ? t : "overview";
  }
  function go(tab, push = true) {
    S.tab = tab; S.msg = null;
    if (push) history.pushState({}, "", tab === "overview" ? "/medicare" : "/medicare/" + tab);
    render();
    window.scrollTo(0, 0);
  }
  $("#tabs").addEventListener("click", (e) => {
    const a = e.target.closest("a[data-tab]");
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); go(a.dataset.tab);
  });
  window.addEventListener("popstate", () => go(tabFromPath(), false));

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
    ({ overview, pulse, carriers, campaigns, content, partners })[S.tab](main);
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
    main.append(h("p", { class: "mc-lede", text: "Each carrier's news from the Pulse, newest first. What you say still has to fit each client; this is where the market is moving." }));
    const grid = h("div", { class: "car-grid" });
    for (const c of CARRIERS) {
      const items = rows("pulse").filter((r) => (r.carriers || []).includes(c.k)).slice(0, 4);
      const card = h("article", { class: `car k-${c.k}` + (c.k === "Devoted" ? " focus" : "") },
        h("h3", { text: c.k }), h("p", { class: "role", text: c.role }), h("p", { class: "stance", text: c.stance }));
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

  // ---------------- start ----------------
  S.tab = tabFromPath();
  render();
  load();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.data) load(); });
})();
