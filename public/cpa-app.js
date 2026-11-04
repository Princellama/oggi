// /cpa — Eric's CPA client meetings: Meetings, Clients, Deadlines.
// Reads /api/cpa (Notion: CPA Clients + CPA Meetings) and writes back what happens in the room.
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const claude = (prompt) => "https://claude.ai/new?q=" + encodeURIComponent(prompt);
  const money = (v) => (v == null || v === "" ? "—" : (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-US"));
  const TZ = "Pacific/Honolulu";
  const main = $("#main");

  let data = { clients: [], meetings: [] };
  let open = null; // meeting id expanded
  let showNew = null; // "meeting" | "client" | null
  let dlFilter = "All";

  // ---------- agenda templates ----------
  const TEMPLATES = {
    Monthly: [
      "Bank feeds connected; every account reconciled",
      "P&L for the month vs last month and last year",
      "Uncategorized items cleared",
      "GE tax (G-45) for the month: figures and due date",
      "Payroll ran; federal and Hawaii deposits made",
      "Receivables and collections",
      "Cash on hand vs the next 60 days of bills",
      "Questions and next steps",
    ],
    Quarterly: [
      "Bank feeds connected; quarter reconciled",
      "YTD P&L: revenue, margin, net vs last year",
      "Full-year projection",
      "Estimated tax: next voucher (federal and Hawaii) vs safe harbor",
      "S corp: reasonable compensation and distributions",
      "941 and UC-B6 for the quarter filed",
      "GE tax filings current",
      "Big purchases planned (vehicles, equipment) and depreciation",
      "Questions and next steps",
    ],
    "Year-end": [
      "Bank feeds connected; books closed through last month",
      "YTD P&L and full-year projection",
      "Q4 estimate (federal Jan 15, Hawaii Jan 20) or extra December withholding",
      "Depreciation: assets bought this year (Section 179 / bonus)",
      "S corp: reasonable comp; shareholder health insurance in W-2 box 1",
      "Retirement contributions before Dec 31",
      "W-2s and 1099s: employee and vendor details complete (due Jan 31)",
      "Documents needed for the return; engagement letter and fee",
      "Next year: meeting cadence and estimate plan",
    ],
    Annual: [
      "Last year's return: results, refund or balance due",
      "This year's estimates and withholding plan",
      "Life and business changes",
      "Documents checklist and engagement letter",
      "Planning ideas for the year",
    ],
    "Ad hoc": ["Purpose of the meeting", "Decisions", "Next steps"],
  };
  const TYPES = Object.keys(TEMPLATES);
  const STEPS = ["Planned", "Prepped", "Held", "Followed up"];
  const SERVICES = ["Bookkeeping", "Payroll", "GE tax", "Estimates", "Business return", "Personal return", "Advisory", "Sales tax"];
  const ENTITIES = ["S corp", "LLC", "Sole prop", "C corp", "Partnership", "Individual", "Trust"];
  const CADENCES = ["Monthly", "Quarterly", "Annual", "As needed"];

  // ---------- dates (Honolulu) ----------
  const hstNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  const todayIso = () => { const d = hstNow(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayOf = (when) => (!when ? "" : String(when).length <= 10 ? String(when) : dayFmt.format(new Date(when)));
  const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const isoDay = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = parseDay(s); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
  const diffDays = (a, b) => Math.round((parseDay(a) - parseDay(b)) / 864e5);
  const fmtDay = (s, opts) => parseDay(s).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  function fmtWhen(when) {
    if (!when) return "No date";
    const day = fmtDay(dayOf(when), { weekday: "short", month: "short", day: "numeric" });
    if (String(when).length <= 10) return day;
    const t = new Date(when).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
    return day + " · " + t;
  }

  // ---------- api ----------
  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
    if (r.status === 401) { location.href = "/"; throw new Error("signin"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Couldn't save");
    return j;
  }
  async function load() {
    try { data = await api("GET", "/api/cpa"); render(); }
    catch (e) { if (e.message !== "signin") main.innerHTML = '<p class="err">Couldn\'t load from Notion. ' + esc(e.message) + "</p>"; }
  }
  const clientOf = (id) => data.clients.find((c) => c.id === id) || null;
  function replace(list, row) { const i = data[list].findIndex((x) => x.id === row.id); if (i >= 0) data[list][i] = row; else data[list].push(row); }
  const timers = {};
  function saveLater(key, fn, el) {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(async () => {
      try { await fn(); if (el) flash(el); } catch (e) { alert(e.message); }
    }, 700);
  }
  function flash(el) {
    const s = document.createElement("span"); s.className = "saved"; s.textContent = "Saved";
    const lbl = el.closest("[data-wrap]")?.querySelector(".lbl") || el.previousElementSibling;
    if (lbl) { lbl.querySelector(".saved")?.remove(); lbl.appendChild(s); setTimeout(() => s.remove(), 1800); }
  }

  // ---------- tabs ----------
  function tab() { const p = location.pathname.replace(/\/+$/, ""); return p.endsWith("/clients") ? "clients" : p.endsWith("/deadlines") ? "deadlines" : "meetings"; }
  document.getElementById("tabs").addEventListener("click", (e) => {
    const a = e.target.closest("a[data-tab]"); if (!a) return;
    e.preventDefault(); history.pushState(null, "", a.getAttribute("href")); showNew = null; render(); window.scrollTo(0, 0);
  });
  window.addEventListener("popstate", render);

  function render() {
    const t = tab();
    document.querySelectorAll("#tabs a").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === t ? "page" : "false"));
    const due = deadlines(todayIso(), 30).filter((d) => d.date >= todayIso())[0];
    $("#nextdue").innerHTML = due ? "Next due <b>" + esc(fmtDay(due.date, { month: "short", day: "numeric" })) + "</b> · " + esc(due.what) : "";
    if (t === "clients") renderClients(); else if (t === "deadlines") renderDeadlines(); else renderMeetings();
  }

  // ---------- meetings ----------
  function snapshot(c) {
    if (!c) return "";
    const watch = (c.watch || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const paid = (c.fedPaid || 0) + (c.statePaid || 0) + (c.withholding || 0);
    return '<div class="snap">' +
      '<div class="cp-spread"><b style="color:var(--ink)">' + esc(c.name) + '</b><span class="mt-sub">' + esc([c.entity, c.cadence].filter(Boolean).join(" · ")) + (c.through ? " · figures through " + esc(fmtDay(c.through, { month: "short", day: "numeric" })) : "") + "</span></div>" +
      '<div class="figs">' +
        '<div class="fig"><b>' + money(c.ytdRevenue) + "</b><span>YTD revenue</span></div>" +
        '<div class="fig"><b>' + money(c.ytdNet) + "</b><span>YTD net</span></div>" +
        '<div class="fig"><b>' + money(c.projectedNet) + "</b><span>Projected net</span></div>" +
        (c.priorTax != null ? '<div class="fig"><b>' + money(c.priorTax) + "</b><span>Prior-year tax</span></div>" : "") +
        (paid ? '<div class="fig"><b>' + money(paid) + "</b><span>Paid this year</span></div>" : "") +
      "</div>" +
      (c.estimateCall ? '<span class="lbl">Estimate call</span><p class="estcall">' + esc(c.estimateCall) + "</p>" : "") +
      (watch.length ? '<span class="lbl">Needs attention</span><ul class="watch">' + watch.map((w) => "<li>" + esc(w) + "</li>").join("") + "</ul>" : "") +
      '<p style="margin:10px 0 0"><a class="textlink" href="/cpa/clients#' + esc(c.id) + '">Edit client</a>' + (c.qbo ? ' · <a class="textlink" href="' + esc(c.qbo) + '" target="_blank" rel="noopener">QuickBooks</a>' : "") + "</p>" +
      "</div>";
  }
  function prepPrompt(m, c) {
    return "Prep my " + m.type.toLowerCase() + " CPA meeting with " + (c ? c.name + (c.owner ? " (" + c.owner + ")" : "") : "a client") + " on " + fmtWhen(m.when) + ".\n" +
      "Meeting row: " + (m.url || "(CPA Meetings)") + "\nClient row: " + ((c && c.url) || "(CPA Clients)") + "\n\n" +
      "If I attach a P&L, read it. Update the client row (Through, YTD revenue, YTD net, Projected net, Watch, Estimate call), " +
      "tailor the meeting's Agenda (JSON list of {t, done}) for this client, and set Status to Prepped. Highlight anything that needs attention and whether the next estimated payment should change.";
  }
  function filePrompt(m, c) {
    return "File my CPA meeting with " + (c ? c.name : "a client") + " (" + fmtWhen(m.when) + ").\nMeeting row: " + (m.url || "(CPA Meetings)") + "\nClient row: " + ((c && c.url) || "(CPA Clients)") + "\n\n" +
      "Read the Notes, Decisions and Follow-ups. Make a QuickAction for each follow-up with a due date, update the client row (Estimate call, Watch, figures), " +
      "draft a short recap email to the client in my Gmail drafts, set the meeting Status to Followed up, and schedule the next meeting from the client's cadence if none exists.";
  }
  function agendaOf(m) { return m.agenda && m.agenda.length ? m.agenda : TEMPLATES[m.type] ? TEMPLATES[m.type].map((t) => ({ t, done: false })) : []; }

  function meetingCard(m, isNext) {
    const c = clientOf(m.client);
    const d = dayOf(m.when);
    const isOpen = open === m.id;
    const ag = agendaOf(m);
    const doneCount = ag.filter((x) => x.done).length;
    const head = '<button class="mt-head" data-open="' + esc(m.id) + '" aria-expanded="' + isOpen + '">' +
      '<div class="mt-date">' + (d ? "<span>" + esc(fmtDay(d, { month: "short" })) + "</span><b>" + esc(fmtDay(d, { day: "numeric" })) + "</b>" : "<b>—</b>") + "</div>" +
      "<div><p class=\"mt-title\">" + esc(m.title) + '</p><div class="mt-sub">' + esc([c ? c.owner || c.name : "", fmtWhen(m.when), m.status, ag.length ? doneCount + "/" + ag.length + " covered" : ""].filter(Boolean).join(" · ")) + "</div></div>" +
      '<span class="chip t-' + esc(m.type) + '">' + esc(m.type) + "</span></button>";
    if (!isOpen) return '<article class="mt' + (isNext ? " next" : "") + (m.status === "Followed up" || m.status === "Cancelled" ? " done" : "") + '">' + head + "</article>";
    const body = '<div class="mt-body"><div>' +
      '<div class="steps" role="group" aria-label="Status">' + STEPS.map((s) => '<button type="button" data-status="' + esc(s) + '" aria-pressed="' + (m.status === s) + '">' + esc(s) + "</button>").join("") + "</div>" +
      '<div class="actions">' +
        (m.link ? '<a class="btn primary" href="' + esc(m.link) + '" target="_blank" rel="noopener">Join</a>' : "") +
        '<a class="btn" href="' + esc(claude(prepPrompt(m, c))) + '" target="_blank" rel="noopener">Prep with Claude</a>' +
        '<a class="btn" href="' + esc(claude(filePrompt(m, c))) + '" target="_blank" rel="noopener">File with Claude</a>' +
        (m.brief ? '<a class="btn" href="' + esc(m.brief) + '" target="_blank" rel="noopener">Talking points</a>' : "") +
        (m.url ? '<a class="btn" href="' + esc(m.url) + '" target="_blank" rel="noopener">Notion</a>' : "") +
      "</div>" +
      '<span class="lbl">Agenda' + (m.agenda ? "" : " · " + esc(m.type) + " template") + "</span>" +
      '<ul class="agenda">' + ag.map((x, i) => '<li class="' + (x.done ? "done" : "") + '"><input type="checkbox" data-ag="' + i + '"' + (x.done ? " checked" : "") + ' aria-label="Covered"><span>' + esc(x.t) + '</span><button class="x" data-agdel="' + i + '" aria-label="Remove">×</button></li>').join("") + "</ul>" +
      '<div class="addline"><input type="text" placeholder="Add an agenda item" data-agnew maxlength="160"><button class="btn" data-agadd>Add</button></div>' +
      '<div class="cp-row" style="margin-top:10px"><label class="mt-sub" for="mt-type">Type</label><select id="mt-type" data-mtype style="width:auto">' + TYPES.map((t) => "<option" + (t === m.type ? " selected" : "") + ">" + esc(t) + "</option>").join("") + "</select>" +
      '<label class="mt-sub" for="mt-when">When</label><input id="mt-when" type="datetime-local" data-mwhen style="width:auto" value="' + esc(localInput(m.when)) + '"></div>' +
      '</div><div>' + snapshot(c) +
      '<div data-wrap><span class="lbl">Notes</span><textarea data-mf="notes" placeholder="What came up">' + esc(m.notes) + "</textarea></div>" +
      '<div data-wrap><span class="lbl">Decisions</span><textarea data-mf="decisions" placeholder="e.g. Pay $2,000 federal on the Jan 15 voucher">' + esc(m.decisions) + "</textarea></div>" +
      '<div data-wrap><span class="lbl">Follow-ups (one per line)</span><textarea data-mf="followups" placeholder="Who does what by when">' + esc(m.followups) + "</textarea></div>" +
      "</div></div>";
    return '<article class="mt' + (isNext ? " next" : "") + '" data-mid="' + esc(m.id) + '">' + head + body + "</article>";
  }
  function localInput(when) {
    if (!when) return "";
    if (String(when).length <= 10) return when + "T09:00";
    const d = new Date(when);
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const g = (t) => p.find((x) => x.type === t).value;
    return g("year") + "-" + g("month") + "-" + g("day") + "T" + (g("hour") === "24" ? "00" : g("hour")) + ":" + g("minute");
  }
  const fromLocalInput = (v) => (v ? v + ":00-10:00" : null);

  function newMeetingForm() {
    const active = data.clients.filter((c) => c.status !== "Former");
    return '<form class="newform" id="newMeeting">' +
      '<label class="full">Client<select name="client" required>' + active.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>").join("") + "</select></label>" +
      '<label>Type<select name="type">' + TYPES.map((t) => "<option>" + esc(t) + "</option>").join("") + "</select></label>" +
      '<label>When<input type="datetime-local" name="when" required></label>' +
      '<label class="full">Title (optional)<input type="text" name="title" maxlength="140" placeholder="Made from client and type if blank"></label>' +
      '<label class="full">Meet / Zoom link (optional)<input type="url" name="link" placeholder="https://"></label>' +
      '<div class="full cp-row"><button class="btn primary" type="submit">Add meeting</button><button class="btn" type="button" data-cancel>Cancel</button></div></form>';
  }

  function renderMeetings() {
    const today = todayIso();
    const ms = data.meetings.filter((m) => m.status !== "Cancelled");
    const upcoming = ms.filter((m) => !m.when || dayOf(m.when) >= today || (m.status !== "Followed up" && diffDays(today, dayOf(m.when)) <= 3)).sort((a, b) => String(a.when || "9").localeCompare(String(b.when || "9")));
    const past = ms.filter((m) => !upcoming.includes(m)).sort((a, b) => String(b.when).localeCompare(String(a.when)));
    if (open === null && upcoming[0]) open = upcoming[0].id;
    const owed = dueClients();
    main.innerHTML =
      '<section class="cp-sec"><div class="cp-spread"><h2 class="cp-h2">Coming up</h2><button class="btn" data-new="meeting">+ New meeting</button></div>' +
      (showNew === "meeting" ? newMeetingForm() : "") +
      (upcoming.length ? upcoming.map((m, i) => meetingCard(m, i === 0)).join("") : '<p class="quiet">Nothing scheduled.</p>') + "</section>" +
      (owed.length ? '<section class="cp-sec"><h2 class="cp-h2">Due for a meeting</h2>' + owed.map((o) =>
        '<div class="dl"><div class="dl-d">' + esc(o.when ? fmtDay(o.when, { month: "short", day: "numeric" }) : "Now") + '</div><div><div class="dl-what">' + esc(o.c.name) + '</div><div class="dl-who">' + esc(o.c.cadence + " · " + o.why) + '</div></div><button class="btn" data-schedule="' + esc(o.c.id) + '">Schedule ' + esc(o.type.toLowerCase()) + "</button></div>").join("") + "</section>" : "") +
      '<section class="cp-sec"><h2 class="cp-h2">Past</h2>' + (past.length ? past.map((m) => meetingCard(m, false)).join("") : '<p class="quiet">None yet.</p>') + "</section>";
  }

  // next meeting owed per client cadence
  const CAD_DAYS = { Monthly: 30, Quarterly: 91, Annual: 365 };
  function nextType(c, day) { const m = Number(day.slice(5, 7)); if (c.cadence === "Monthly") return m === 12 || m === 1 ? "Year-end" : "Monthly"; if (c.cadence === "Quarterly") return m >= 11 || m === 1 ? "Year-end" : "Quarterly"; return "Annual"; }
  function dueClients() {
    const today = todayIso();
    return data.clients.filter((c) => c.status === "Active" && CAD_DAYS[c.cadence]).map((c) => {
      const mine = data.meetings.filter((m) => m.client === c.id && m.status !== "Cancelled" && m.when);
      if (mine.some((m) => dayOf(m.when) >= today)) return null;
      const last = mine.map((m) => dayOf(m.when)).sort().pop();
      const when = last ? addDays(last, CAD_DAYS[c.cadence]) : today;
      if (diffDays(when, today) > 21) return null;
      return { c, when: when < today ? today : when, type: nextType(c, when < today ? today : when), why: last ? "last met " + fmtDay(last, { month: "short", day: "numeric" }) : "no meetings yet" };
    }).filter(Boolean);
  }

  // ---------- clients ----------
  function safeHarbor(c) {
    if (c.priorTax == null) return '<p class="quiet">Add prior-year tax to see the safe harbor.</p>';
    const paid = (c.fedPaid || 0) + (c.statePaid || 0) + (c.withholding || 0);
    const pct = c.priorTax > 0 ? Math.min(100, (paid / c.priorTax) * 100) : 100;
    const gap = Math.max(0, c.priorTax - paid);
    return '<div class="meter' + (gap > 0 ? " short" : "") + '"><i style="width:' + pct.toFixed(0) + '%"></i></div>' +
      '<p class="mt-sub" style="margin:0">' + (gap > 0 ? money(gap) + " short of 100% of last year's tax (110% if last year's AGI was over $150K)." : "Safe harbor met: no underpayment penalty, any balance is due in April.") + "</p>";
  }
  function numField(c, k, label) { return '<label class="field">' + esc(label) + '<input type="number" step="1" data-cf="' + k + '" value="' + (c[k] == null ? "" : Math.round(c[k])) + '"></label>'; }
  function clientCard(c) {
    const mine = data.meetings.filter((m) => m.client === c.id && m.when).sort((a, b) => String(a.when).localeCompare(String(b.when)));
    const today = todayIso();
    const next = mine.find((m) => dayOf(m.when) >= today);
    const last = mine.filter((m) => dayOf(m.when) < today).pop();
    return '<article class="cl" id="' + esc(c.id) + '" data-cid="' + esc(c.id) + '">' +
      '<div class="cp-spread"><h3>' + esc(c.name) + '</h3><div class="cp-row">' + (c.qbo ? '<a class="btn" href="' + esc(c.qbo) + '" target="_blank" rel="noopener">QuickBooks</a>' : "") + (c.url ? '<a class="btn" href="' + esc(c.url) + '" target="_blank" rel="noopener">Notion</a>' : "") + "</div></div>" +
      '<p class="cl-meta">' + esc([c.owner, c.entity, c.cadence && c.cadence + " meetings"].filter(Boolean).join(" · ")) +
        (next ? " · next " + esc(fmtWhen(next.when)) : "") + (last ? " · last " + esc(fmtDay(dayOf(last.when), { month: "short", day: "numeric" })) : "") + "</p>" +
      '<div class="svc">' + SERVICES.map((s) => '<label><input type="checkbox" data-svc="' + esc(s) + '"' + (c.services.includes(s) ? " checked" : "") + ">" + esc(s) + "</label>").join("") + "</div>" +
      '<div class="cl-grid"><div>' +
        '<span class="lbl">Figures' + (c.through ? " · through " + esc(fmtDay(c.through, { month: "short", day: "numeric", year: "numeric" })) : "") + "</span>" +
        numField(c, "ytdRevenue", "YTD revenue") + numField(c, "ytdNet", "YTD net") + numField(c, "projectedNet", "Projected full-year net") +
        '<label class="field">Through<input type="date" data-cf="through" value="' + esc(c.through || "") + '"></label>' +
        '<span class="lbl">Estimates</span>' +
        numField(c, "priorTax", "Prior-year total tax") + numField(c, "fedPaid", "Federal estimates paid") + numField(c, "statePaid", "Hawaii estimates paid") + numField(c, "withholding", "Withholding") +
        safeHarbor(c) +
      '</div><div>' +
        '<div data-wrap><span class="lbl">Estimate call</span><textarea data-cf="estimateCall" placeholder="What to pay on the next voucher, and why">' + esc(c.estimateCall) + "</textarea></div>" +
        '<div data-wrap><span class="lbl">Needs attention (one per line)</span><textarea data-cf="watch" style="min-height:110px">' + esc(c.watch) + "</textarea></div>" +
        '<div data-wrap><span class="lbl">Notes</span><textarea data-cf="notes">' + esc(c.notes) + "</textarea></div>" +
        '<div class="cp-row" style="margin-top:8px"><select data-cf="cadence" style="width:auto">' + CADENCES.map((x) => "<option" + (x === c.cadence ? " selected" : "") + ">" + esc(x) + "</option>").join("") + "</select>" +
        '<select data-cf="entity" style="width:auto">' + ENTITIES.map((x) => "<option" + (x === c.entity ? " selected" : "") + ">" + esc(x) + "</option>").join("") + "</select>" +
        '<button class="btn" data-schedule="' + esc(c.id) + '">Schedule next meeting</button></div>' +
      "</div></div></article>";
  }
  function newClientForm() {
    return '<form class="newform" id="newClient">' +
      '<label>Business or client name<input type="text" name="name" required maxlength="140"></label>' +
      '<label>Owner<input type="text" name="owner" maxlength="140"></label>' +
      '<label>Entity<select name="entity">' + ENTITIES.map((x) => "<option>" + esc(x) + "</option>").join("") + "</select></label>" +
      '<label>Cadence<select name="cadence">' + CADENCES.map((x) => "<option" + (x === "Quarterly" ? " selected" : "") + ">" + esc(x) + "</option>").join("") + "</select></label>" +
      '<div class="full cp-row"><button class="btn primary" type="submit">Add client</button><button class="btn" type="button" data-cancel>Cancel</button></div></form>';
  }
  function renderClients() {
    const list = data.clients.filter((c) => c.status !== "Former");
    main.innerHTML = '<section class="cp-sec"><div class="cp-spread"><h2 class="cp-h2">Clients</h2><button class="btn" data-new="client">+ Add client</button></div>' +
      (showNew === "client" ? newClientForm() : "") +
      (list.length ? list.map(clientCard).join("") : '<p class="quiet">No clients yet.</p>') + "</section>";
    if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }
  }

  // ---------- deadlines ----------
  function bizDay(s) { const d = parseDay(s); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1); return isoDay(d); }
  function deadlines(from, days) {
    const to = addDays(from, days);
    const start = parseDay(from); start.setUTCMonth(start.getUTCMonth() - 1);
    const out = [];
    const add = (date, what, svc, entities, note) => {
      const due = bizDay(date);
      if (due < from || due > to) return;
      const who = data.clients.filter((c) => c.status === "Active" && c.services.includes(svc) && (!entities || entities.includes(c.entity))).map((c) => c.name);
      if (who.length) out.push({ date: due, what, who, note });
    };
    for (let i = 0; i < 16; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
      const ym = (mm, dd) => y + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
      const prev = new Date(Date.UTC(y, m - 2, 1)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long" });
      add(ym(m, 20), "GE tax (G-45) for " + prev, "GE tax");
      if ([1, 4, 7, 10].includes(m)) add(ym(m, m === 4 ? 30 : 31), "941 and Hawaii UC-B6 for last quarter", "Payroll");
      if (m === 1) {
        add(ym(1, 15), "Q4 federal estimate (1040-ES)", "Estimates");
        add(ym(1, 20), "Q4 Hawaii estimate (N-1)", "Estimates");
        add(ym(1, 31), "W-2s / W-3 and Hawaii HW-2 / HW-3", "Payroll");
        add(ym(1, 31), "1099-NEC to contractors and IRS", "Bookkeeping");
      }
      if (m === 3) add(ym(3, 15), "1120-S / 1065 (or extension 7004)", "Business return", ["S corp", "Partnership", "LLC"]);
      if (m === 4) {
        add(ym(4, 15), "1040 (or extension 4868)", "Personal return");
        add(ym(4, 15), "1120 (or extension 7004)", "Business return", ["C corp"]);
        add(ym(4, 15), "Q1 federal estimate (1040-ES)", "Estimates");
        add(ym(4, 20), "Hawaii N-11", "Personal return");
        add(ym(4, 20), "Q1 Hawaii estimate (N-1)", "Estimates");
        add(ym(4, 20), "Hawaii N-35 / N-20", "Business return", ["S corp", "Partnership", "LLC"]);
        add(ym(4, 20), "GE annual reconciliation (G-49)", "GE tax");
      }
      if (m === 6) { add(ym(6, 15), "Q2 federal estimate (1040-ES)", "Estimates"); add(ym(6, 20), "Q2 Hawaii estimate (N-1)", "Estimates"); }
      if (m === 9) {
        add(ym(9, 15), "Q3 federal estimate (1040-ES)", "Estimates"); add(ym(9, 20), "Q3 Hawaii estimate (N-1)", "Estimates");
        add(ym(9, 15), "Extended 1120-S / 1065 due", "Business return", ["S corp", "Partnership", "LLC"]);
      }
      if (m === 10) add(ym(10, 15), "Extended 1040 due", "Personal return");
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.what.localeCompare(b.what));
  }
  function renderDeadlines() {
    const today = todayIso();
    const list = deadlines(today, 150);
    const names = ["All"].concat(data.clients.filter((c) => c.status === "Active").map((c) => c.name));
    const shown = list.filter((d) => dlFilter === "All" || d.who.includes(dlFilter));
    let month = "";
    let html = '<section class="cp-sec"><h2 class="cp-h2">Next five months</h2><p class="quiet" style="margin-top:-6px">From each client\'s services. Weekend due dates roll to Monday; holidays aren\'t adjusted. Monthly GE filers assumed.</p>' +
      '<div class="filters">' + names.map((n) => '<button data-dlf="' + esc(n) + '" aria-pressed="' + (n === dlFilter) + '">' + esc(n) + "</button>").join("") + "</div>";
    for (const d of shown) {
      const mo = fmtDay(d.date, { month: "long", year: "numeric" });
      if (mo !== month) { html += '<div class="dl-month">' + esc(mo) + "</div>"; month = mo; }
      const left = diffDays(d.date, today);
      html += '<div class="dl' + (left <= 7 ? " soon" : "") + '"><div class="dl-d">' + esc(fmtDay(d.date, { month: "short", day: "numeric" })) + "<small>" + (left === 0 ? "today" : left === 1 ? "tomorrow" : "in " + left + " days") + '</small></div><div class="dl-what">' + esc(d.what) + '</div><div class="dl-who">' + esc(d.who.join(", ")) + "</div></div>";
    }
    if (!shown.length) html += '<p class="quiet">Nothing due. Add services on the Clients tab.</p>';
    main.innerHTML = html + "</section>";
  }

  // ---------- events ----------
  main.addEventListener("click", async (e) => {
    const t = e.target;
    const openBtn = t.closest("[data-open]");
    if (openBtn) { open = open === openBtn.dataset.open ? "" : openBtn.dataset.open; render(); return; }
    if (t.closest("[data-new]")) { showNew = t.closest("[data-new]").dataset.new; render(); return; }
    if (t.closest("[data-cancel]")) { showNew = null; render(); return; }
    const dlf = t.closest("[data-dlf]"); if (dlf) { dlFilter = dlf.dataset.dlf; render(); return; }
    const sched = t.closest("[data-schedule]");
    if (sched) {
      const c = clientOf(sched.dataset.schedule); if (!c) return;
      const o = dueClients().find((x) => x.c.id === c.id);
      const when = (o && o.when) || addDays(todayIso(), CAD_DAYS[c.cadence] || 30);
      const type = nextType(c, when);
      sched.disabled = true;
      try {
        const m = await api("POST", "/api/cpa/meeting", { title: c.name.replace(/\s+(LLC|Inc\.?|Corp\.?)$/i, "") + " " + type.toLowerCase() + " meeting", client: c.id, type, when });
        replace("meetings", m); open = m.id; history.pushState(null, "", "/cpa"); render();
      } catch (err) { alert(err.message); sched.disabled = false; }
      return;
    }
    const card = t.closest("[data-mid]");
    if (card) {
      const m = data.meetings.find((x) => x.id === card.dataset.mid); if (!m) return;
      const st = t.closest("[data-status]");
      if (st) { const prev = m.status; m.status = st.dataset.status; render(); try { replace("meetings", await api("PATCH", "/api/cpa/meeting/" + m.id, { status: m.status })); } catch (err) { m.status = prev; render(); alert(err.message); } return; }
      const del = t.closest("[data-agdel]");
      if (del) { const ag = agendaOf(m).slice(); ag.splice(Number(del.dataset.agdel), 1); return saveAgenda(m, ag); }
      if (t.closest("[data-agadd]")) { const inp = card.querySelector("[data-agnew]"); const v = inp.value.trim(); if (v) saveAgenda(m, agendaOf(m).concat([{ t: v, done: false }])); }
    }
  });
  main.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-agnew]")) { e.preventDefault(); e.target.closest("[data-mid]").querySelector("[data-agadd]").click(); }
  });
  async function saveAgenda(m, ag) {
    const prev = m.agenda; m.agenda = ag; render();
    try { replace("meetings", await api("PATCH", "/api/cpa/meeting/" + m.id, { agenda: ag })); } catch (err) { m.agenda = prev; render(); alert(err.message); }
  }
  main.addEventListener("change", async (e) => {
    const t = e.target;
    const card = t.closest("[data-mid]");
    if (card) {
      const m = data.meetings.find((x) => x.id === card.dataset.mid); if (!m) return;
      if (t.matches("[data-ag]")) { const ag = agendaOf(m).map((x) => ({ ...x })); ag[Number(t.dataset.ag)].done = t.checked; return saveAgenda(m, ag); }
      if (t.matches("[data-mtype]")) { m.type = t.value; const patch = { type: m.type }; render(); try { replace("meetings", await api("PATCH", "/api/cpa/meeting/" + m.id, patch)); } catch (err) { alert(err.message); } return; }
      if (t.matches("[data-mwhen]")) { m.when = fromLocalInput(t.value); render(); try { replace("meetings", await api("PATCH", "/api/cpa/meeting/" + m.id, { when: m.when })); } catch (err) { alert(err.message); } return; }
    }
    const cc = t.closest("[data-cid]");
    if (cc) {
      const c = clientOf(cc.dataset.cid); if (!c) return;
      if (t.matches("[data-svc]")) {
        c.services = Array.from(cc.querySelectorAll("[data-svc]")).filter((x) => x.checked).map((x) => x.dataset.svc);
        try { replace("clients", await api("PATCH", "/api/cpa/client/" + c.id, { services: c.services })); } catch (err) { alert(err.message); }
        return;
      }
      if (t.matches("select[data-cf], input[type=number][data-cf], input[type=date][data-cf]")) {
        const k = t.dataset.cf; const v = t.type === "number" ? (t.value === "" ? null : Number(t.value)) : t.value || null;
        c[k] = v;
        try { replace("clients", await api("PATCH", "/api/cpa/client/" + c.id, { [k]: v })); render(); } catch (err) { alert(err.message); }
      }
    }
  });
  main.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches("textarea[data-mf]")) {
      const m = data.meetings.find((x) => x.id === t.closest("[data-mid]").dataset.mid); const k = t.dataset.mf; m[k] = t.value;
      saveLater(m.id + k, async () => replace("meetings", await api("PATCH", "/api/cpa/meeting/" + m.id, { [k]: m[k] })), t);
    }
    if (t.matches("textarea[data-cf]")) {
      const c = clientOf(t.closest("[data-cid]").dataset.cid); const k = t.dataset.cf; c[k] = t.value;
      saveLater(c.id + k, async () => replace("clients", await api("PATCH", "/api/cpa/client/" + c.id, { [k]: c[k] })), t);
    }
  });
  main.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target; const fd = new FormData(f); const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    try {
      if (f.id === "newMeeting") {
        const c = clientOf(fd.get("client")); const type = fd.get("type");
        const m = await api("POST", "/api/cpa/meeting", { client: c.id, type, when: fromLocalInput(fd.get("when")), title: fd.get("title") || c.name.replace(/\s+(LLC|Inc\.?|Corp\.?)$/i, "") + " " + type.toLowerCase() + " meeting", link: fd.get("link") || null });
        replace("meetings", m); open = m.id;
      } else if (f.id === "newClient") {
        const c = await api("POST", "/api/cpa/client", { name: fd.get("name"), owner: fd.get("owner"), entity: fd.get("entity"), cadence: fd.get("cadence") });
        replace("clients", c);
      }
      showNew = null; render();
    } catch (err) { alert(err.message); btn.disabled = false; }
  });

  load();
  setInterval(() => { if (!document.hidden && !document.activeElement.matches("textarea, input, select")) load(); }, 120000);
})();
