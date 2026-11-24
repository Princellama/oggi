(function () {
  var MEETING = "4218f469-b674-817e-9164-e2b0efad82bc";
  var KEY = "oggi_vibrations_v1";
  var AGENDA = ["1. Consulting: how to run the business from California", "2. Add two members so ownership is 50/50", "3. CPA and accounting services going forward"];
  var CLIENT = "4228f469-b674-81e5-ad82-d75da19d3ac7"; // CPA Clients row: plan JSON lives in its page body
  var PLAN = null;
  var LISTS = {
    tlList: [],
    stepsList: ["Confirm Hawaii allows the LLC to convert out (DCCA) and get a certificate of good standing", "Clear the name in California (bizfile search) and reserve it if needed", "File LLC-1A (Articles of Organization – Conversion) with the CA Secretary of State", "File the Hawaii-side conversion / termination with DCCA", "Appoint a California agent for service of process", "File the Statement of Information (LLC-12) within 90 days", "Form 8822-B to the IRS for the new address (EIN and S election carry over)", "CDTFA seller's permit before the first California sale", "File the county DBA and publish it", "EDD employer account if anyone is paid in California", "City business license for the store", "Update bank, merchant processor, lease, insurance and vendors to the California entity"],
    hiList: ["Last Hawaii sale date set", "Final G-45 for the last period", "G-49 annual reconciliation", "Close GE license on Hawaii Tax Online", "Final HW-14 / HW-3 and HW-2s, close withholding", "Final DLIR unemployment report, close UI account", "Cancel Hawaii trade names", "Final N-35 for the year the business leaves", "Hawaii lease, utilities, business insurance closed out"],
    caList: ["Entity in good standing with CA Secretary of State", "Agent for service of process", "Statement of Information filed", "CDTFA seller's permit (posted in the store)", "Resale certificates to suppliers", "EDD employer registration", "County DBA filed and published", "City business license", "FTB: 100S calendar, $800 minimum paid by the 15th day of the 4th month", "Workers' comp policy if there are employees"],
    ownList: ["S corp: one class of stock, so profits and distributions follow ownership 50/50, never side deals", "New owner must be a US citizen or resident (or eligible trust)", "Gift of 50%: Form 709 if over the annual exclusion, unless it's to a US-citizen spouse", "Sale of 50%: Murat reports gain on the half he sells", "Mid-year change: K-1 income is split per share per day, so a Jan 1 effective date is cleanest", "Amend the operating agreement (attorney): ownership, voting, buy-sell, distributions", "Update DCCA / CA SOS records and the bank signers", "Reasonable salary for any owner who works in the store"]
  };
  var FIELDS = [
    ["Facts", ["f_legal","Legal name"],["f_dba","DBA"],["f_dcca","Hawaii DCCA #"],["f_ein","EIN"],["f_s","S election"],["f_ge","Hawaii GE #"],["f_wh","Withholding / UI"],["f_bank","Bank / processor"],["f_lease","Hawaii lease ends"],["f_close","Last day in Hawaii"],["f_caaddr","CA store"],["f_caopen","CA store opening"],["f_caentity","Who runs CA store"],["f_inv","Inventory / fixtures"],["f_move","Murat moves"],["f_home","Hawaii home"],["f_rev","Revenue"],["f_pay","Payroll"],["f_other","Other"]],
    ["1 · Moving to California", ["m_city","City"],["m_city_other","City detail"],["m_route","Route"],["m_notes","Notes"]],
    ["Name check", ["n_sos","CA SOS"],["n_dba","County DBA"],["n_tm","USPTO"],["n_hi","Hawaii trade names"],["n_notes","Notes"]],
    ["State information", ["s_notes","Notes"]],
    ["Tax", ["t_leave","Leaves Hawaii"],["t_spouse","Spouse / co-owner"],["t_ties","CA ties"],["t_hi","Hawaii ties kept"],["t_notes","Notes"]],
    ["2 · Ownership 50/50", ["o_who","Who"],["o_pct","%"],["o_us","US citizen/resident"],["o_how","Gift / sale / capital"],["o_date","Effective"],["o_work","Works in business"],["o_notes","Notes"]],
    ["3 · CPA services", ["c_svc","Services"],["c_books","Books"],["c_payroll","Payroll"],["c_fee","Fee"],["c_start","Start"],["c_docs","Docs"],["c_eng","Engagement"],["c_notes","Notes"]]
  ];
  var LIST_TITLES = { tlList: "Route A timeline done", stepsList: "Route A steps done", hiList: "Hawaii wind-down done", caList: "California set-up done", ownList: "Ownership points covered" };

  var st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { st = {}; }
  st.v = st.v || {}; st.ck = st.ck || {}; st.ag = st.ag || [false, false, false];
  var saveEl = document.getElementById("save");
  function local() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function checklist(id, items, store) {
    var box = document.getElementById(id);
    box.innerHTML = items.map(function (t, i) { return '<label class="check"><input type="checkbox" data-i="' + i + '"><span>' + esc(t) + "</span></label>"; }).join("");
    box.querySelectorAll("input").forEach(function (cb) {
      var i = +cb.dataset.i; cb.checked = !!store()[i]; cb.parentNode.classList.toggle("done", cb.checked);
      cb.addEventListener("change", function () { store()[i] = cb.checked; cb.parentNode.classList.toggle("done", cb.checked); changed(); });
    });
  }

  var plFilter = "all", planErr = "";
  var FILTERS = [["all","All"],["HI","Hawaii"],["CA","California"],["FED","Federal"],["eric","Eric's check-ins"],["confirm","To confirm"],["cancel","To cancel"],["articles","Articles"],["open","Not done"]];
  function badge(label, color, cls) { return '<span class="bd' + (cls ? " " + cls : "") + '" style="' + (cls === "p" ? "color:" + color : "background:" + color) + '">' + esc(label) + "</span>"; }
  function renderPlan() {
    if (!PLAN) { document.getElementById("plList").innerHTML = '<p class="lede">' + (planErr ? esc(planErr) : "Loading the plan from Notion…") + "</p>"; return; }
    var ck = st.ck.tlList = st.ck.tlList || [];
    document.getElementById("plFilters").innerHTML = FILTERS.map(function (f) { return '<button type="button" data-f="' + f[0] + '" class="' + (plFilter === f[0] ? "on" : "") + '">' + f[1] + "</button>"; }).join("");
    document.getElementById("plLegend").innerHTML = Object.keys(PLAN.flags).map(function (k) { return badge(PLAN.flags[k][0], PLAN.flags[k][1]); }).join("") + badge("HI", "", "s") + badge("CA", "", "s") + badge("FED", "", "s");
    var n = 0, d = 0, html = "";
    PLAN.phases.forEach(function (ph) {
      var rows = "";
      PLAN.items.forEach(function (x, i) {
        if (x.phase !== ph[0]) return;
        var isDone = !!ck[i] || x.flags.indexOf("done") >= 0; n++; if (isDone) d++;
        var f = plFilter, show = f === "all" || f === x.st || (f === "eric" && (x.eric || x.flags.indexOf("checkin") >= 0)) || x.flags.indexOf(f) >= 0 || (f === "open" && !isDone);
        if (!show) return;
        var b = badge(x.st, "", "s") + x.flags.filter(function (k) { return k !== "done" || isDone; }).map(function (k) { return badge(PLAN.flags[k][0], PLAN.flags[k][1]); }).join("") + x.who.map(function (w) { return badge(PLAN.parties[w][0], PLAN.parties[w][1], "p"); }).join("");
        rows += '<div class="pl-it' + (isDone ? " done" : "") + (x.eric ? " eric" : "") + '"><input type="checkbox" data-pi="' + i + '"' + (isDone ? " checked" : "") + '><div class="pl-date">' + esc(x.date) + '</div><div class="pl-t">' + esc(x.title) + '</div><div class="pl-b">' + b + "</div>" + (x.note ? '<div class="pl-n">' + esc(x.note) + "</div>" : "") + "</div>";
      });
      if (rows) html += '<div class="pl-phase"><b>' + esc(ph[1]) + "</b><span>" + esc(ph[2]) + "</span></div>" + rows;
    });
    document.getElementById("plList").innerHTML = html || '<p class="lede">Nothing in this view.</p>';
    document.getElementById("plProg").textContent = d + " of " + n + " done";
    document.getElementById("plBar").style.width = (n ? Math.round(100 * d / n) : 0) + "%";
    document.getElementById("plArticles").innerHTML = PLAN.articles.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    document.getElementById("plCancel").innerHTML = PLAN.cancel.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    document.getElementById("plRoutine").innerHTML = "<tr><th></th><th>Hawaii (ending)</th><th>California (from Jan 1)</th></tr>" + PLAN.routines.map(function (r) { return "<tr><td><b>" + esc(r[0]) + "</b></td><td>" + esc(r[1]) + "</td><td>" + esc(r[2]) + "</td></tr>"; }).join("");
    document.getElementById("plLearn").innerHTML = PLAN.learn.map(function (l) { return '<li><a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + esc(l[0]) + "</a>: " + esc(l[2]) + "</li>"; }).join("");
  }
  document.getElementById("plFilters").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; plFilter = b.dataset.f; renderPlan(); });
  document.getElementById("plList").addEventListener("change", function (e) { var i = e.target.dataset && e.target.dataset.pi; if (i == null) return; st.ck.tlList[+i] = e.target.checked; renderPlan(); changed(); });
  function render() {
    checklist("agendaList", AGENDA, function () { return st.ag; });
    Object.keys(LISTS).forEach(function (id) { st.ck[id] = st.ck[id] || []; if (id === "tlList") return renderPlan(); checklist(id, LISTS[id], function () { return st.ck[id]; }); });
    document.querySelectorAll("[data-k]").forEach(function (el) { el.value = st.v[el.dataset.k] || ""; });
    document.querySelectorAll("[data-chip]").forEach(function (g) {
      var k = g.dataset.chip, multi = g.classList.contains("multi");
      var cur = (st.v[k] || "").split(" · ").filter(Boolean);
      if (!multi) cur = st.v[k] ? [st.v[k]] : [];
      g.querySelectorAll("button").forEach(function (b) { b.type = "button"; b.classList.toggle("on", cur.indexOf(b.textContent) >= 0); });
    });
    var r = st.v.m_route || "";
    document.querySelectorAll("[data-route]").forEach(function (d) { d.classList.toggle("pick", r.charAt(0) === d.dataset.route); });
  }

  document.addEventListener("input", function (e) { var k = e.target.dataset && e.target.dataset.k; if (k) { st.v[k] = e.target.value; changed(); } });
  document.querySelectorAll("[data-chip]").forEach(function (g) {
    g.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var k = g.dataset.chip;
      if (g.classList.contains("multi")) {
        var cur = (st.v[k] || "").split(" · ").filter(Boolean), i = cur.indexOf(b.textContent);
        if (i >= 0) cur.splice(i, 1); else cur.push(b.textContent);
        st.v[k] = cur.join(" · ");
      } else st.v[k] = st.v[k] === b.textContent ? "" : b.textContent;
      render(); changed();
    });
  });

  function compile() {
    var out = ["Worksheet: oggi.princellama.com/vibrations"];
    FIELDS.forEach(function (sec) {
      var lines = [];
      sec.slice(1).forEach(function (f) { var v = (st.v[f[0]] || "").trim(); if (v) lines.push(f[1] + ": " + v); });
      if (lines.length) out.push("", "## " + sec[0], lines.join("\n"));
    });
    Object.keys(LISTS).forEach(function (id) {
      var done = LISTS[id].filter(function (_, i) { return st.ck[id] && st.ck[id][i]; });
      if (done.length) out.push("", "## " + LIST_TITLES[id], done.map(function (t) { return "✓ " + t; }).join("\n"));
    });
    return out.join("\n");
  }

  var timer = null, inflight = false, again = false;
  function changed() { st.t = Date.now(); local(); saveEl.textContent = "Saved on this device · syncing…"; saveEl.className = "vb-save"; clearTimeout(timer); timer = setTimeout(push, 1500); }
  function push() {
    if (inflight) { again = true; return; }
    inflight = true;
    var body = { notes: compile(), decisions: st.v.decisions || "", followups: st.v.followups || "", agenda: AGENDA.map(function (t, i) { return { t: t, done: !!st.ag[i] }; }) };
    if (st.ag.every(Boolean)) body.status = "Held";
    fetch("/api/cpa/meeting/" + MEETING, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) })
      .then(function (r) {
        if (r.status === 401) throw new Error("Sign in to Oggi to sync");
        if (!r.ok) throw new Error("Notion " + r.status);
        saveEl.textContent = "Saved · Notion " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); saveEl.className = "vb-save ok";
      })
      .catch(function (e) { saveEl.textContent = "Saved on this device · " + e.message + " (will retry)"; saveEl.className = "vb-save err"; setTimeout(push, 15000); })
      .then(function () { inflight = false; if (again) { again = false; push(); } });
  }

  // First open on a new device: rebuild from what's in Notion.
  function hydrate(m) {
    var labels = {}; FIELDS.forEach(function (sec) { sec.slice(1).forEach(function (f) { labels[sec[0] + "|" + f[1]] = f[0]; }); });
    var cur = null, lastKey = null;
    (m.notes || "").split("\n").forEach(function (line) {
      var h = line.match(/^## (.+)$/); if (h) { cur = h[1]; lastKey = null; return; }
      var listId = Object.keys(LIST_TITLES).filter(function (id) { return LIST_TITLES[id] === cur; })[0];
      if (listId) { var i = LISTS[listId].indexOf(line.replace(/^✓ /, "")); if (i >= 0) { st.ck[listId] = st.ck[listId] || []; st.ck[listId][i] = true; } return; }
      var kv = line.match(/^([^:]+): ([\s\S]*)$/), k = kv && labels[cur + "|" + kv[1]];
      if (k) { st.v[k] = kv[2]; lastKey = k; } else if (lastKey) st.v[lastKey] += "\n" + line;
    });
    st.v.decisions = m.decisions || ""; st.v.followups = m.followups || "";
    if (m.agenda) st.ag = AGENDA.map(function (t, i) { return !!(m.agenda[i] && m.agenda[i].done); });
  }
  function init() {
  render();
    if (!st.t) {
      fetch("/api/cpa", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var m = d && (d.meetings || []).filter(function (x) { return x.id === MEETING; })[0];
        if (m && !st.t) { hydrate(m); local(); render(); saveEl.textContent = "Loaded from Notion"; }
      }).catch(function () {});
    }
  }
  render();
  fetch("/api/cpa/client/" + CLIENT + "/plan", { credentials: "same-origin" })
    .then(function (r) { if (r.status === 401) throw new Error("Sign in to Oggi to see the plan"); if (!r.ok) throw new Error("Couldn't load the plan from Notion (" + r.status + ")"); return r.json(); })
    .then(function (p) { PLAN = p; LISTS.tlList = PLAN.items.map(function (x) { return x.title; }); })
    .catch(function (e) { planErr = e.message; })
    .then(init);
})();
