// /leadhero — Eric's Hawaii field plan for Aaron Burton (IFG).
// Static page: no sign-in, no API calls. Figures counted 2 Nov 2026.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var money = function (v) {
    v = Math.round(v);
    if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (Math.abs(v) >= 1e4) return "$" + (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return "$" + v.toLocaleString("en-US");
  };
  var num = function (v) { return Math.round(v).toLocaleString("en-US"); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  // ---------- pipeline snapshot (GHL, open opportunities, 2 Nov 2026) ----------
  var PIPES = [
    { n: "Events", c: 319, v: 1451 },
    { n: "Retail Market", c: 54, v: 19964, hot: true },
    { n: "Referrals", c: 29, v: 10527, hot: true },
    { n: "T65", c: 26, v: 11972, hot: true },
    { n: "Business Tracker", c: 10, v: 3630 },
    { n: "Digital Marketing", c: 4, v: 1452 },
    { n: "Onboarding", c: 4, v: 0 },
    { n: "Presentations", c: 1, v: 363 },
    { n: "Sat Not Sold", c: 1, v: 0 }
  ];
  (function bars() {
    var max = Math.max.apply(null, PIPES.map(function (p) { return p.c; }));
    $("pipeChart").innerHTML = PIPES.map(function (p) {
      var w = Math.max(1.5, (p.c / max) * 100);
      return '<div class="bar-row"><span class="bl" title="' + esc(p.n) + '">' + esc(p.n) + '</span>' +
        '<span class="bar-track"><span class="bar-fill' + (p.hot ? " hot" : "") + '" style="width:' + w.toFixed(1) + '%"></span></span>' +
        '<span class="bv"><b>' + p.c + '</b> · ' + money(p.v) + '</span></div>';
    }).join("");
  })();

  // ---------- network, ranked ----------
  var NET = [
    { n: "Barayuga CPA practice (my own tax clients)", ch: "Own book", cls: "c-own", phase: "Producing", s: 5,
      out: "Highest-trust channel, least worked", why: "Tax clients already trust me with their money. Clients turning 65, facing IRMAA or helping a parent are natural Medicare conversations, and so far only one has come across.",
      next: "During tax season, flag every client 63 and older and every IRMAA notice for a separate Medicare conversation." },
    { n: "Devoted kiosks: Longs Kalihi and Salt Lake", ch: "Retail", cls: "c-retail", phase: "Producing", s: 4,
      out: "17 leads since September, 2 appointments", why: "Carrier-sponsored, so it costs only my time. Foot traffic is real and every lead is tagged by location for follow-up.",
      next: "Call every kiosk lead within 48 hours and offer an in-person review before 7 December." },
    { n: "Community newsletter publisher (I.L.)", ch: "Digital", cls: "c-part", phase: "Working", s: 4,
      out: "About 6,500 readers; 4 digital leads", why: "A tax client and friend who publishes a newsletter with real reach in the community. The best amplifier for the advocate site.",
      next: "Offer a short monthly explainer (starting with the HMSA closures) that links back to the blog." },
    { n: "Filipino Chamber of Commerce", ch: "Community", cls: "c-ev", phase: "Producing", s: 4,
      out: "23 warm leads from its membership", why: "Most of the warm list traces back to one golf tournament and the Chamber's membership. 72 contacts carry the Chamber tag. The gap: no named owner of the relationship on my side yet.",
      next: "Name one contact at the Chamber and offer an educational member session during Open Enrollment (Jan–Mar)." },
    { n: "Provider offices I work with", ch: "Providers", cls: "c-prov", phase: "Establishing", s: 3,
      out: "Dentists · internal and family medicine · opticians",
      why: "Dental practices, internal and family medicine offices, and opticians whose patients ask which plans they take. When a plan closes or a network changes, their front desk needs somewhere to send people.",
      next: "Visit the offices most affected by the HMSA closures with a one-page guide to which plans they accept." },
    { n: "helpinghawaiiseniors.com, Contact me form and booking", ch: "Digital", cls: "c-part", phase: "Working", s: 3,
      out: "The only source with clean attribution", why: "Every form, booking and RetireFlo intake from the site lands in GHL already tagged, so I can see exactly what the site, the magazine and the online ads produce.",
      next: "Put the Contact me link at the end of every post and count requests per post and per ad." },
    { n: "Individual referrers (G.C., A.K., A.N., V.D., A.B.)", ch: "Professionals", cls: "c-prov", phase: "Working", s: 3,
      out: "One referral each, Ewa Beach to Maui", why: "People who have already sent someone once. Small numbers, but every one of these leads arrived warm.",
      next: "A thank-you and an AEP check-in to each, with a simple way to send the next person." },
    { n: "Financial planners and RIA partners (incl. a WFG couple)", ch: "Professionals", cls: "c-prov", phase: "Establishing", s: 3,
      out: "Two-way referrals with the CPA practice", why: "Their clients are retiring onto Medicare. I can send them tax and planning work in return.",
      next: "Set an introductory meeting and agree how referrals pass in both directions." },
    { n: "Community and civic golf events", ch: "Events", cls: "c-ev", phase: "Working", s: 2,
      out: "About 200 contacts, mostly unqualified", why: "Ewa Beach tournament, alumni and Filipino community groups, Waimanalo and Habitat events. Large lists, unknown ages.",
      next: "One qualifying message to the whole list; keep those 64 and older, park the rest." },
    { n: "West Loch Ewa Senior Residence", ch: "Events", cls: "c-ev", phase: "Establishing", s: 2,
      out: "Venue open; seminars not yet running", why: "Residents in one place and a venue that has said yes. The seminar channel is designed but hasn't run.",
      next: "One educational session during Open Enrollment, with sign-ups for one-on-one reviews." }
  ];
  var current = "All";
  function renderNet() {
    var list = NET.filter(function (p) { return current === "All" || p.ch === current; });
    $("netList").innerHTML = list.map(function (p) {
      var rank = NET.indexOf(p) + 1, dots = "";
      for (var i = 1; i <= 5; i++) dots += '<i class="' + (i <= p.s ? "on" : "") + '"></i>';
      return '<li class="' + (rank <= 3 ? "top" : "") + '"><span class="rk-n">' + rank + '</span><div>' +
        '<div class="rk-head"><h3>' + esc(p.n) + '</h3><span class="lh-chip ' + p.cls + '">' + esc(p.ch) + '</span>' +
        '<span class="rk-meta">' + esc(p.phase) + ' · ' + esc(p.out) + ' <span class="rk-score" title="Strength ' + p.s + ' of 5" aria-label="Strength ' + p.s + ' of 5">' + dots + '</span></span></div>' +
        '<p class="rk-why">' + esc(p.why) + '</p><p class="rk-next">' + esc(p.next) + '</p></div></li>';
    }).join("");
  }
  (function filters() {
    var chans = ["All"];
    NET.forEach(function (p) { if (chans.indexOf(p.ch) < 0) chans.push(p.ch); });
    $("netFilters").innerHTML = chans.map(function (c) {
      return '<button type="button" data-ch="' + esc(c) + '" aria-pressed="' + (c === current) + '">' + esc(c) + '</button>';
    }).join("");
    $("netFilters").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      current = b.getAttribute("data-ch");
      [].forEach.call(this.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      renderNet();
    });
    renderNet();
  })();

  // ---------- planner ----------
  var G = [
    { id: "book", label: "Starting book (members)", min: 0, max: 400, step: 1, v: 101, f: num },
    { id: "init", label: "New to Medicare / MA ($/yr)", min: 400, max: 900, step: 5, v: 725, f: money },
    { id: "ren", label: "Switch and renewal ($/yr)", min: 200, max: 500, step: 1, v: 363, f: money },
    { id: "pnew", label: "Share of new clients who are new to MA", min: 0, max: 100, step: 1, v: 40, f: function (v) { return v + "%"; } },
    { id: "keep", label: "Members kept each year", min: 60, max: 100, step: 1, v: 90, f: function (v) { return v + "%"; } },
    { id: "grow", label: "Referral growth per year", min: 0, max: 50, step: 1, v: 15, f: function (v) { return v + "%"; } },
    { id: "lift", label: "Closing-rate improvement per year", min: 0, max: 20, step: 1, v: 5, f: function (v) { return v + "%"; } },
    { id: "opex", label: "Operating costs (% of revenue)", min: 5, max: 40, step: 1, v: 18, f: function (v) { return v + "%"; } },
    { id: "tax", label: "Income tax estimate", min: 0, max: 45, step: 1, v: 30, f: function (v) { return v + "%"; } }
  ];
  var SRC = [
    { n: "CPA tax clients and families", r: 3, c: 45 },
    { n: "Filipino Chamber and community groups", r: 3, c: 25 },
    { n: "Devoted kiosks", r: 6, c: 15 },
    { n: "Health walks and fairs", r: 0, c: 20 },
    { n: "Doctors, dentists, optometry", r: 3, c: 35 },
    { n: "Chiropractic and massage", r: 1, c: 20 },
    { n: "Financial planners and RIAs", r: 2, c: 35 },
    { n: "Senior residences and care homes", r: 2, c: 25 },
    { n: "Newsletter and social media", r: 4, c: 10 },
    { n: "Website and news blog", r: 3, c: 20 },
    { n: "Mail (letters, ReminderMedia)", r: 3, c: 8 }
  ];
  var DEF = SRC.map(function (x) { return { r: x.r, c: x.c }; });
  var val = {};
  $("globals").innerHTML = G.map(function (g) {
    val[g.id] = g.v;
    return '<div class="pl-ctl"><label for="g-' + g.id + '"><span>' + esc(g.label) + '</span><b id="o-' + g.id + '">' + g.f(g.v) + '</b></label>' +
      '<input type="range" id="g-' + g.id + '" data-g="' + g.id + '" min="' + g.min + '" max="' + g.max + '" step="' + g.step + '" value="' + g.v + '"></div>';
  }).join("");
  $("srcBody").innerHTML = SRC.map(function (s, i) {
    return '<tr><td class="pl-src">' + esc(s.n) + '</td>' +
      '<td><div class="pl-sl"><input type="range" aria-label="Referrals a month, ' + esc(s.n) + '" data-s="' + i + '" data-k="r" min="0" max="30" step="1" value="' + s.r + '"><output id="sr' + i + '">' + s.r + '</output></div></td>' +
      '<td><div class="pl-sl"><input type="range" aria-label="Close rate, ' + esc(s.n) + '" data-s="' + i + '" data-k="c" min="0" max="80" step="1" value="' + s.c + '"><output id="sc' + i + '">' + s.c + '%</output></div></td>' +
      '<td class="n" id="scl' + i + '"></td><td class="n" id="srv' + i + '"></td></tr>';
  }).join("");

  function year(y, begBook) {
    var g = Math.pow(1 + val.grow / 100, y), l = Math.pow(1 + val.lift / 100, y);
    var refs = 0, closed = 0;
    SRC.forEach(function (s) { var r = s.r * 12 * g; refs += r; closed += r * Math.min(1, s.c / 100 * l); });
    var nNew = closed * val.pnew / 100, nSw = closed - nNew;
    var kept = begBook * val.keep / 100;
    var revNew = nNew * val.init, revSw = nSw * val.ren, revRen = kept * val.ren;
    var rev = revNew + revSw + revRen, opex = rev * val.opex / 100, ebit = rev - opex, net = ebit * (1 - val.tax / 100);
    return { refs: refs, closed: closed, begBook: begBook, endBook: kept + closed, revNew: revNew, revSw: revSw, revRen: revRen, rev: rev, opex: opex, net: net };
  }

  function render() {
    G.forEach(function (g) { $("o-" + g.id).textContent = g.f(val[g.id]); });
    var tR = 0, tC = 0, tV = 0, per = val.pnew / 100 * val.init + (1 - val.pnew / 100) * val.ren;
    SRC.forEach(function (s, i) {
      var cl = s.r * 12 * s.c / 100, rv = cl * per;
      $("sr" + i).textContent = s.r; $("sc" + i).textContent = s.c + "%";
      $("scl" + i).textContent = cl.toFixed(1); $("srv" + i).textContent = money(rv);
      tR += s.r; tC += cl; tV += rv;
    });
    $("totRef").textContent = tR + " / mo"; $("totCr").textContent = tR ? Math.round(tC / (tR * 12) * 100) + "% avg" : "—";
    $("totCl").textContent = tC.toFixed(0); $("totRev").textContent = money(tV);

    var yrs = [], b = val.book;
    for (var y = 0; y < 5; y++) { var d = year(y, b); yrs.push(d); b = d.endBook; }
    var y1 = yrs[0], y5 = yrs[4];
    $("kpis").innerHTML =
      '<div><b>' + num(y1.closed) + '</b><span>new clients in year one</span></div>' +
      '<div><b>' + money(y1.rev) + '</b><span>year-one revenue, renewals included</span></div>' +
      '<div><b>' + num(y5.endBook) + '</b><span>members after five years</span></div>' +
      '<div><b>' + money(y5.revRen) + '</b><span>renewal income in year five</span></div>';

    $("fiveBody").innerHTML = yrs.map(function (d, i) {
      return '<tr><td>Year ' + (i + 1) + '</td><td class="n">' + num(d.begBook) + '</td><td class="n">' + num(d.closed) + '</td><td class="n">' + num(d.endBook) +
        '</td><td class="n">' + money(d.rev) + '</td><td class="n">' + money(d.opex) + '</td><td class="n">' + money(d.net) + '</td></tr>';
    }).join("");
    chart(yrs);
  }

  function chart(yrs) {
    var W = 720, H = 260, L = 56, R = 12, T = 14, B = 28, iw = W - L - R, ih = H - T - B;
    var max = Math.max.apply(null, yrs.map(function (d) { return d.rev; })) || 1;
    var step = Math.pow(10, Math.floor(Math.log10(max))), nice = Math.ceil(max / step) * step;
    if (nice / step <= 2) nice = Math.ceil(max / (step / 2)) * (step / 2);
    var sy = function (v) { return T + ih - v / nice * ih; };
    var bw = iw / yrs.length * 0.52, out = [];
    for (var k = 0; k <= 4; k++) {
      var gv = nice * k / 4, yy = sy(gv);
      out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--hair)" stroke-width="1"/>');
      out.push('<text x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + money(gv) + '</text>');
    }
    var pts = [];
    yrs.forEach(function (d, i) {
      var cx = L + iw / yrs.length * (i + 0.5), x = cx - bw / 2, base = sy(0);
      [["revRen", "var(--chart-ren)"], ["revSw", "var(--chart-sw)"], ["revNew", "var(--chart-new)"]].forEach(function (p) {
        var h = d[p[0]] / nice * ih;
        if (h > 0) out.push('<rect x="' + x.toFixed(1) + '" y="' + (base - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + p[1] + '"><title>' + money(d[p[0]]) + '</title></rect>');
        base -= h;
      });
      out.push('<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">Year ' + (i + 1) + '</text>');
      pts.push([cx, sy(Math.max(0, d.net))]);
    });
    out.push('<polyline fill="none" stroke="var(--chart-net)" stroke-width="2.5" points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>');
    pts.forEach(function (p, i) { out.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" fill="var(--chart-net)"><title>Net ' + money(yrs[i].net) + '</title></circle>'); });
    $("fiveChart").innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Revenue by type and net income over five years">' + out.join("") + '</svg>';
  }

  function resetAll() {
    G.forEach(function (g) { val[g.id] = g.v; $("g-" + g.id).value = g.v; });
    SRC.forEach(function (x, i) {
      x.r = DEF[i].r; x.c = DEF[i].c;
      document.querySelector('[data-s="' + i + '"][data-k="r"]').value = x.r;
      document.querySelector('[data-s="' + i + '"][data-k="c"]').value = x.c;
    });
    render();
  }
  [].forEach.call(document.querySelectorAll("[data-reset]"), function (b) { b.addEventListener("click", resetAll); });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset.g) { val[t.dataset.g] = parseFloat(t.value); render(); }
    else if (t.dataset.s) { SRC[+t.dataset.s][t.dataset.k] = parseFloat(t.value); render(); }
  });
  render();

  // ---------- photos (files in /leadhero/photos, listed here) ----------
  var PHOTOS = [
    { f: "kiosk-longs.jpg", c: "Devoted kiosk at Longs, carrier-sponsored" },
    { f: "iron-workers.jpg", c: "Iron Workers union event, Devoted table" },
    { f: "golf-devoted.jpg", c: "Golf tournament table with Devoted" },
    { f: "golf-humana.jpg", c: "Humana-sponsored tent at a golf tournament" },
    { f: "asing-park.jpg", c: "Medicare education session at Asing Park" },
    { f: "community-center.jpg", c: "Community center seminar" },
    { f: "event-signups.jpg", c: "Sign-ups at a community event" },
    { f: "sams-club.jpg", c: "Sam's Club enrollment table" },
    { f: "humana-bags.jpg", c: "Event bags packed with Humana" },
    { f: "medicarecon-wellcare.jpg", c: "MedicareCon, at the Wellcare booth" },
    { f: "medicarecon-humana.jpg", c: "MedicareCon, at the Humana booth" },
    { f: "medicarians-wellcare.jpg", c: "Medicarians, Las Vegas" },
    { f: "remote-devoted.jpg", c: "Plan research, wherever the day is" }
  ];
  if (PHOTOS.length) {
    $("photos").hidden = false; $("toc-photos").hidden = false;
    $("photoGrid").innerHTML = PHOTOS.map(function (p) {
      return '<figure><img src="/leadhero/photos/' + esc(p.f) + '" alt="' + esc(p.c) + '" loading="lazy"><figcaption>' + esc(p.c) + '</figcaption></figure>';
    }).join("");
  }
})();
