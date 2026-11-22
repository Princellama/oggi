/* Oggi · /coin — Eric's credit cards, spending and reimbursements, with Covey.
   Plain JS, no build step. Everything from Notion is rendered with textContent. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "value") el.value = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const money = (v, cents = true) => (v == null ? "—" : (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }));
  const md = (iso) => (iso ? new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
  const daysTo = (iso) => (iso ? Math.round((new Date(String(iso).slice(0, 10) + "T12:00:00") - new Date(new Date().toDateString() + " 12:00")) / 86400000) : null);
  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
    if (r.status === 401) { location.href = "/"; throw new Error("signin"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `failed (${r.status})`);
    return j;
  }
  function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2400); }

  const S = { data: null, open: {}, all: false };

  // ---------------- Covey ----------------
  // Plain rules over the numbers. Each note: { level: "warn" | "watch" | "ok", text: [strings and {b}] }.
  function coveyNotes(d) {
    const notes = [];
    const cards = d.cards || [];
    const owed = cards.reduce((a, c) => a + (c.balance || 0), 0);
    const interest = cards.reduce((a, c) => a + (c.interestYtd || 0), 0);
    const spend = d.spending || [];
    const total = spend.reduce((a, c) => a + c.amount, 0);
    const interestCat = spend.find((c) => /interest/i.test(c.name));
    const paidInterest = Math.max(interest, interestCat ? (interestCat.top.find((m) => /interest/i.test(m.m)) || {}).a || 0 : 0);

    // autopay pays only the minimum: the most urgent card named, the rest counted
    const mins = cards.filter((c) => (c.statement || 0) > 0 && c.autopay === "Minimum").sort((a, b) => (daysTo(a.due) ?? 99) - (daysTo(b.due) ?? 99));
    if (mins.length) {
      const c = mins[0], dd = daysTo(c.due);
      const when = dd == null ? "" : dd <= 0 ? ", due today" : dd === 1 ? ", due tomorrow" : `, due ${md(c.due)}`;
      const more = mins.length > 1 ? ` ${mins.length - 1} more card${mins.length > 2 ? "s are" : " is"} set the same way.` : "";
      notes.push({ level: dd != null && dd <= 3 ? "warn" : "watch", text: [`${c.name} autopay pays only `, { b: money(c.minimum, false) }, ` of a `, { b: money(c.statement, false) }, ` statement${when}. The rest gets charged interest. Pay it in full.${more}`] });
    }
    if (paidInterest > 0) notes.push({ level: "warn", text: ["You've paid ", { b: money(paidInterest, false) }, " in card interest this year. Flip it around: pay cards in full, and let spare cash earn interest in high-yield savings."] });

    // utilisation
    cards.filter((c) => c.limit && c.balance / c.limit > 0.3).forEach((c) => {
      const pct = Math.round((c.balance / c.limit) * 100);
      notes.push({ level: pct > 50 ? "warn" : "watch", text: [`${c.name} is at `, { b: pct + "%" }, ` of its limit. Keep each card under 30%.`] });
    });
    

    // categories
    if (total > 0) {
      spend.filter((c) => !/interest|travel/i.test(c.name) && c.amount / total >= 0.15).forEach((c) => {
        notes.push({ level: "watch", text: [`${c.name} is `, { b: Math.round((c.amount / total) * 100) + "%" }, ` of your card spending this year (${money(c.amount, false)}). Worth a look.`] });
      });
      const habit = spend.flatMap((c) => c.top.map((m) => ({ ...m, cat: c.name }))).filter((m) => m.n >= 20 && !/interest/i.test(m.m)).sort((a, b) => b.a - a.a)[0];
      if (habit) notes.push({ level: "watch", text: [`${habit.m}: ${habit.n} charges this year, `, { b: money(habit.a, false) }, `. Small habits add up.`] });
    }

    // reimbursements
    const owedBack = (d.reimbursements || []).filter((r) => r.status !== "Paid back");
    if (owedBack.length) {
      const sum = owedBack.reduce((a, r) => a + (r.amount || 0), 0);
      const names = [...new Set(owedBack.map((r) => r.owedBy).filter(Boolean))].join(", ");
      notes.push({ level: "watch", text: [`${owedBack.length} reimbursement${owedBack.length === 1 ? "" : "s"} still open`, sum ? [", ", { b: money(sum) }] : "", names ? ` (${names})` : "", ". Send the ask the same week you spend."] });
    }
    // points & miles
    const pg = pointsGroups(d).filter((e) => e.points != null);
    if (pg.length) {
      const val = pg.reduce((a, e) => a + (e.value ? (e.points * e.value) / 100 : 0), 0);
      const top = pg[0];
      const vs = paidInterest > val && val > 0 ? ` That's less than the ${money(paidInterest, false)} in interest you paid, so the points don't make up for carrying a balance.` : "";
      notes.push({ level: paidInterest > val && val > 0 ? "watch" : "ok", text: ["You have about ", { b: money(val, false) }, ` in points and miles; the biggest pile is ${top.program} (${top.points.toLocaleString()}).${vs}`] });
      const stale = pg.filter((e) => { const dd = daysTo(e.asOf); return dd != null && dd < -45; });
      if (stale.length) notes.push({ level: "ok", text: [`${stale.map((e) => e.program).join(", ")} balance is over 45 days old. Send me a fresh screenshot when you can.`] });
    }
    const rank = { warn: 0, watch: 1, ok: 2 };
    notes.sort((a, b) => rank[a.level] - rank[b.level]);
    if (!notes.length) notes.push({ level: "ok", text: ["All clear. Cards paid, nothing owed back. That's how it should look."] });
    return notes;
  }
  function covey(d) {
    const ul = h("ul");
    coveyNotes(d).forEach((n) => ul.append(h("li", { class: n.level }, ...n.text.flat().map((x) => (x && x.b ? h("b", { text: x.b }) : x)))));
    return h("section", { class: "covey", id: "overview" }, h("img", { src: "/icons/covey.svg", alt: "Covey" }),
      h("div", {}, h("h3", { text: "Covey" }), h("p", { class: "role", text: "Your money coach · reads your cards and statements" }), ul));
  }

  // ---------------- sections ----------------
  function tiles(d) {
    const cards = d.cards || [];
    const owed = cards.reduce((a, c) => a + (c.balance || 0), 0);
    const due = cards.reduce((a, c) => a + (c.statement || 0), 0);
    const lim = cards.filter((c) => c.limit).reduce((a, c) => a + c.limit, 0);
    const limBal = cards.filter((c) => c.limit).reduce((a, c) => a + (c.balance || 0), 0);
    const interest = (d.spending || []).flatMap((c) => c.top).filter((m) => /interest/i.test(m.m)).reduce((a, m) => a + m.a, 0) || cards.reduce((a, c) => a + (c.interestYtd || 0), 0);
    const util = lim ? Math.round((limBal / lim) * 100) : null;
    return h("div", { class: "tiles" },
      h("div", { class: "tile" }, h("span", { text: "Owed on cards" }), h("b", { class: "num", text: money(owed, false) })),
      h("div", { class: "tile" }, h("span", { text: "Statement balances" }), h("b", { class: "num", text: money(due, false) })),
      h("div", { class: "tile" + (interest > 0 ? " bad" : "") }, h("span", { text: "Interest paid this year" }), h("b", { class: "num", text: money(interest, false) })),
      h("div", { class: "tile" + (util > 30 ? " bad" : "") }, h("span", { text: "Credit used" }), h("b", { class: "num", text: util == null ? "—" : util + "%" })));
  }
  // ---------------- card art and icons (drawn here, no images to download) ----------------
  const ICONS = {
    dining: ["M7 2v20", "M4 2v6a3 3 0 0 0 6 0V2", "M18 2c-2 1-3.5 3.5-3.5 7v4H18v9"],
    cart: ["M2 3h3l2.6 11.4a1 1 0 0 0 1 .8h9.3a1 1 0 0 0 1-.8L21 7H6.2", "C9 20 1.5", "C18 20 1.5"],
    box: ["M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z", "M3 7.5l9 4.5 9-4.5", "M12 12v9"],
    fuel: ["M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16", "M3 21h12", "M7 8h4", "M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"],
    pill: ["M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z", "M7 7l10 10"],
    tv: ["M3 7h18v13H3z", "M8 2l4 5 4-5"],
    laptop: ["M4 5h16v11H4z", "M2 20h20", "M10 8.5l-2 2 2 2", "M14 8.5l2 2-2 2"],
    plane: ["M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"],
    bed: ["M2 20V7", "M2 15h20v5", "M22 15v-2a3 3 0 0 0-3-3h-8v5", "C6.5 12 1.8"],
    globe: ["C12 12 9", "M3 12h18", "M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9", "M12 3C9.5 5.6 8.2 8.6 8.2 12s1.3 6.4 3.8 9"],
    star: ["M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5l-5.4 3 1.2-6-4.5-4.2 6.1-.7z"],
  };
  const USE_ICON = { "Dining": "dining", "US groceries": "cart", "Amazon and Whole Foods": "box", "Gas and transit": "fuel", "Drugstores": "pill", "Streaming": "tv", "Software and subscriptions": "laptop", "Delta flights": "plane", "United flights": "plane", "Other flights": "plane", "Hotels and car rentals": "bed", "Overseas": "globe", "Everything else": "star" };
  function icon(name, cls) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("class", "ico " + (cls || ""));
    (ICONS[name] || ICONS.star).forEach((d) => {
      let el;
      if (d[0] === "C") { const [x, y, r] = d.slice(1).trim().split(" "); el = document.createElementNS(SVGNS, "circle"); el.setAttribute("cx", x); el.setAttribute("cy", y); el.setAttribute("r", r); }
      else { el = document.createElementNS(SVGNS, "path"); el.setAttribute("d", d); }
      svg.append(el);
    });
    return svg;
  }
  // Each card gets its colours from its name; anything unknown falls back to the issuer.
  function artKey(c) {
    const n = (c.name || "").toLowerCase();
    if (/gold/.test(n)) return "gold";
    if (/reserve/.test(n)) return "graphite";
    if (/delta|skymiles/.test(n)) return "delta";
    if (/sapphire/.test(n)) return "sapphire";
    if (/prime|amazon/.test(n)) return "prime";
    if (/freedom/.test(n)) return "freedom";
    if (/united/.test(n)) return "united";
    if (/venture|capital/.test(n)) return "venture";
    if (/ink/.test(n)) return "ink";
    return (c.issuer || "other").toLowerCase();
  }
  function cardArt(c, small) {
    const short = (c.name || "").replace(/^(Delta SkyMiles|Capital One|Amex)\s*/i, "").split(" ")[0] || c.name;
    return h("div", { class: `art art-${artKey(c)}${small ? " sm" : ""}`, "aria-hidden": "true" },
      h("span", { class: "chip-ic" }), h("span", { class: "iss", text: c.issuer === "Other" ? "" : c.issuer }),
      small ? "" : h("span", { class: "cn", text: short }), h("span", { class: "l4", text: "···" + (c.last4 || "") }));
  }
  function cardsSec(d) {
    const box = h("section", { class: "cn-sec", id: "cards" }, h("div", { class: "cn-head" }, h("h2", { text: "Cards" }), h("small", { text: "Balances as of the last update" })));
    const order = (c) => (c.balance || 0);
    (d.cards || []).slice().sort((a, b) => order(b) - order(a)).forEach((c) => {
      const auto = c.autopay === "Minimum" ? h("span", { class: "chip bad", text: "autopay: minimum" }) : /statement|full/i.test(c.autopay) ? h("span", { class: "chip good", text: "autopay: " + c.autopay.toLowerCase() }) : h("span", { class: "chip", text: "autopay: " + c.autopay.toLowerCase() });
      const dd = daysTo(c.due);
      const dueTxt = c.statement > 0 && c.due ? `Statement ${money(c.statement)} · min ${money(c.minimum)} · due ${md(c.due)}${dd != null && dd <= 3 && dd >= 0 ? (dd === 0 ? " (today)" : dd === 1 ? " (tomorrow)" : ` (in ${dd} days)`) : ""}` : (c.balance || 0) === 0 ? "Paid off" : "No statement balance due";
      const aprChip = c.apr == null ? h("span", { class: "chip", text: "APR ?" }) : h("span", { class: "chip apr" + (c.apr === 0 ? " zero" : c.apr >= 25 ? " hot" : ""), text: `APR ${c.apr}%` });
      const row = h("div", { class: "card" },
        cardArt(c),
        h("div", { class: "mid" },
          h("div", { class: "nm" }, c.name, h("small", { text: `${c.issuer} ···${c.last4}` })),
          h("div", { class: "chips" }, aprChip, auto, c.annualFee != null ? h("span", { class: "chip", text: c.annualFee ? `${money(c.annualFee, false)}/yr` : "no annual fee" }) : ""),
          h("div", { class: "meta", text: [dueTxt, c.note].filter(Boolean).join(" · ") }),
          c.perks ? h("div", { class: "perks", text: c.perks }) : ""),
        h("div", { class: "side" },
          h("div", { class: "bal num", text: money(c.balance) }),
          h("div", { class: "right", text: c.limit ? `of ${money(c.limit, false)}` : "" }),
          /^https:\/\//.test(c.loginUrl) ? h("a", { class: "login", href: c.loginUrl, target: "_blank", rel: "noopener noreferrer", text: "Log in ↗" }) : ""));
      if (c.limit) { const p = Math.min(100, (c.balance / c.limit) * 100); row.append(h("div", { class: "util" }, h("i", { class: p > 50 ? "hi" : p > 30 ? "mid" : "", style: `width:${p.toFixed(1)}%` }))); }
      box.append(row);
    });
    const asOf = (d.cards || []).map((c) => c.asOf).filter(Boolean).sort().pop();
    if (asOf) $("#asof").textContent = "Updated " + md(asOf);
    return box;
  }
  function paysSec(d) {
    const box = h("section", { class: "cn-sec", id: "payments" }, h("div", { class: "cn-head" }, h("h2", { text: "Payments" }), h("small", { text: "Made and scheduled" })));
    if (!(d.payments || []).length) box.append(h("p", { class: "quiet", text: "No payments logged yet." }));
    (d.payments || []).forEach((p) => box.append(h("div", { class: "pay" },
      h("span", { class: "d", text: md(p.date) }),
      h("span", { class: "w" }, p.name, h("small", { text: [p.card, p.from && "from " + p.from, p.confirmation && "conf. " + p.confirmation, p.kind === "Autopay" && "scheduled autopay"].filter(Boolean).join(" · ") })),
      h("span", { class: "a num", text: money(p.amount) }))));
    return box;
  }
  // ---------------- spending flow (all cards → categories → merchants) ----------------
  const FLOW_COLORS = ["#3E6A8A", "#B8862F", "#2F5D46", "#A8402B", "#7A5A8C", "#4F8C8A", "#C06A3E", "#5C6F2E", "#8A4F6A", "#6B7FA8", "#9A7B4F", "#5E5E5E"];
  const SVGNS = "http://www.w3.org/2000/svg";
  function sv(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
    for (const kid of kids) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const band = (x0, a0, a1, x1, b0, b1) => { const m = (x0 + x1) / 2; return `M${x0},${a0} C${m},${a0} ${m},${b0} ${x1},${b0} L${x1},${b1} C${m},${b1} ${m},${a1} ${x0},${a1} Z`; };
  function drawFlow(holder, cats, total, onPick) {
    const W = Math.max(300, Math.round(holder.clientWidth || 800));
    const wide = W >= 620, BAR = 10, GAP = 8;
    const fs = wide ? 12.5 : 12;
    // node heights: proportional, with a floor so every category keeps a readable label
    const CAT_MIN = 18, H0 = wide ? 440 : 420;
    const k = (H0 - GAP * (cats.length - 1)) / total;
    const catH = cats.map((c) => Math.max(CAT_MIN, c.amount * k));
    let y = 0;
    const cn = cats.map((c, i) => { const n = { c, i, y0: y, y1: y + catH[i], color: FLOW_COLORS[i % FLOW_COLORS.length] }; y += catH[i] + GAP; return n; });
    const catTotalH = y - GAP;
    // merchants: the big ones per category, the rest folded into "Other"
    const mn = [];
    if (wide) {
      let my = 0;
      cn.forEach((n) => {
        const scale = (n.y1 - n.y0) / n.c.amount;
        const big = n.c.top.filter((m) => m.a > 0 && m.a * scale >= 13).slice(0, 4);
        const rest = n.c.amount - big.reduce((a, m) => a + m.a, 0);
        const list = big.map((m) => ({ ...m })); if (rest > n.c.amount * 0.01) list.push({ m: big.length ? "Other " + n.c.name.toLowerCase() : "Various", a: rest, n: null, other: true });
        let src = n.y0;
        list.forEach((m, j) => {
          const hgt = Math.max(1.5, m.a * scale);
          mn.push({ ...m, cat: n, s0: src, s1: src + m.a * scale, y0: my, y1: my + hgt });
          src += m.a * scale; my += hgt + (j === list.length - 1 ? GAP + 4 : 3);
        });
      });
    }
    const mTotalH = mn.length ? mn[mn.length - 1].y1 : 0;
    const H = Math.ceil(Math.max(catTotalH, mTotalH)) + 4;
    // columns
    const xL = 0, xC = wide ? Math.round(W * 0.46) : W - BAR, xM = W - BAR;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "flow-svg", role: "img", "aria-label": `Card spending ${money(total, false)} split by category` + (wide ? " and top merchants" : "") });
    // links: all cards → category
    let ly = 0;
    cn.forEach((n) => {
      const share = (n.c.amount / total) * catTotalH;
      svg.append(sv("path", { d: band(xL + BAR, ly, ly + share, xC, n.y0, n.y1), fill: n.color, opacity: ".22" }));
      ly += share;
    });
    // links: category → merchant
    mn.forEach((m) => svg.append(sv("path", { d: band(xC + BAR, m.s0, m.s1, xM, m.y0, m.y1), fill: m.cat.color, opacity: m.other ? ".12" : ".24" })));
    // bars
    svg.append(sv("rect", { x: xL, y: 0, width: BAR, height: catTotalH, rx: 2, fill: "#1F3350" }));
    cn.forEach((n) => svg.append(sv("rect", { x: xC, y: n.y0, width: BAR, height: n.y1 - n.y0, rx: 2, fill: n.color })));
    mn.forEach((m) => svg.append(sv("rect", { x: xM, y: m.y0, width: BAR, height: m.y1 - m.y0, rx: 1.5, fill: m.cat.color, opacity: m.other ? ".55" : "1" })));
    // labels
    const lab = (x, yy, anchor, lines, cls) => {
      const t = sv("text", { x, y: yy, "text-anchor": anchor, class: cls || "fl" });
      lines.forEach((ln, i) => t.append(sv("tspan", { x, dy: i ? fs + 3 : 0, class: ln.b ? "fb" : null }, ln.t)));
      return t;
    };
    svg.append(lab(xL + BAR + 10, 20, "start", [{ t: "All cards" }, { t: money(total, false), b: true }]));
    cn.forEach((n) => {
      const pct = Math.round((n.c.amount / total) * 100);
      const hgt = n.y1 - n.y0, mid = (n.y0 + n.y1) / 2;
      const g = sv("g", { class: "fnode", tabindex: "0", role: "button", "aria-label": `${n.c.name} ${money(n.c.amount, false)}, ${pct}%. Show merchants` });
      g.append(sv("title", {}, `${n.c.name}: ${money(n.c.amount)} · ${n.c.count} charges`));
      const lines = hgt >= 34 ? [{ t: n.c.name }, { t: `${money(n.c.amount, false)} (${pct}%)`, b: true }] : [{ t: `${n.c.name} · ${money(n.c.amount, false)} (${pct}%)`, b: true }];
      g.append(lab(xC - 8, mid + (lines.length === 2 ? -2 : 4), "end", lines));
      g.append(sv("rect", { x: xC - 4, y: n.y0, width: BAR + 8, height: hgt, fill: "transparent" }));
      g.addEventListener("click", () => onPick(n.c));
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(n.c); } });
      svg.append(g);
    });
    mn.forEach((m) => {
      const hgt = m.y1 - m.y0; if (hgt < 13) { svg.append(sv("title", {}, `${m.m}: ${money(m.a)}`)); return; }
      const lines = hgt >= 32 ? [{ t: m.m }, { t: money(m.a, false), b: true }] : [{ t: `${m.m} · ${money(m.a, false)}` }];
      svg.append(lab(xM - 8, (m.y0 + m.y1) / 2 + (lines.length === 2 ? -2 : 4), "end", lines, "fl fm" + (m.other ? " fo" : "")));
    });
    holder.replaceChildren(svg);
  }
  function flowSec(cats, total, onPick) {
    const holder = h("div", { class: "flow" });
    let last = 0;
    const paint = () => { const w = holder.clientWidth; if (w && Math.abs(w - last) > 4) { last = w; drawFlow(holder, cats, total, onPick); } };
    if ("ResizeObserver" in window) new ResizeObserver(paint).observe(holder);
    requestAnimationFrame(paint);
    return holder;
  }

  function spendSec(d) {
    const cats = (d.spending || []).slice().sort((a, b) => b.amount - a.amount);
    const total = cats.reduce((a, c) => a + c.amount, 0), max = cats[0] ? cats[0].amount : 1;
    const btn = h("button", { class: "tbtn", type: "button", text: S.all ? "Hide all detail" : "Show all detail" });
    const box = h("section", { class: "cn-sec", id: "spending" }, h("div", { class: "cn-head" }, h("h2", { text: "Spending by category" }),
      h("small", { text: `${money(total, false)} · ${cats[0] ? cats[0].period : ""}` }), btn));
    const rows = [];
    const pick = (c) => {
      const r = rows.find((x) => x[2] === c); if (!r) return;
      const [row, merch] = r;
      S.open[c.id] = true; merch.hidden = false; row.setAttribute("aria-expanded", "true");
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("flash"); setTimeout(() => row.classList.remove("flash"), 1200);
    };
    const flowCats = cats.filter((c) => c.amount > 0);
    if (flowCats.length && total > 0) box.append(flowSec(flowCats, flowCats.reduce((a, c) => a + c.amount, 0), pick),
      h("p", { class: "flow-hint", text: "Tap a category to see its merchants below." }));
    cats.forEach((c) => {
      const open = S.all || !!S.open[c.id];
      const merch = h("div", { class: "merch", hidden: !open }, c.top.map((m) => h("div", {}, h("span", { text: m.m }), h("span", { text: m.n > 1 ? m.n + "×" : "" }), h("span", { class: "num", text: money(m.a) }))));
      const big = !/travel|interest/i.test(c.name) && c.amount / total >= 0.15;
      const row = h("button", { class: "cat", type: "button", "aria-expanded": open ? "true" : "false", onclick: () => { S.open[c.id] = !(merch.hidden === false); merch.hidden = !S.open[c.id]; row.setAttribute("aria-expanded", S.open[c.id] ? "true" : "false"); } },
        h("span", { class: "chev", "aria-hidden": "true", text: "›" }),
        h("span", {}, h("span", { class: "t", text: c.name }), h("div", { class: "bar" + (big || /interest/i.test(c.name) ? " big" : ""), style: `width:${Math.max(2, (c.amount / max) * 100).toFixed(1)}%;background:${FLOW_COLORS[cats.filter((x) => x.amount > 0).indexOf(c) % FLOW_COLORS.length] || "var(--navy)"}` })),
        h("span", { class: "amt num", text: money(c.amount, false) }),
        h("span", { class: "pct num", text: `${Math.round((c.amount / total) * 100)}% · ${c.count}` }));
      rows.push([row, merch, c]);
      box.append(row, merch);
    });
    btn.onclick = () => { S.all = !S.all; rows.forEach(([row, merch, c]) => { S.open[c.id] = S.all; merch.hidden = !S.all; row.setAttribute("aria-expanded", S.all ? "true" : "false"); }); btn.textContent = S.all ? "Hide all detail" : "Show all detail"; };
    const src = cats[0] && cats[0].sources;
    box.append(h("p", { class: "buckets", text: `All cards together${src ? " · from " + src : ""}. Not yet split into Personal, CPA Practice and Medicare.` }));
    return box;
  }
  function reimbSec(d) {
    const box = h("section", { class: "cn-sec", id: "reimbursements" }, h("div", { class: "cn-head" }, h("h2", { text: "Reimbursements" }), h("small", { text: "Paid by you, owed back" })));
    const list = (d.reimbursements || []).slice().sort((a, b) => (a.status === "Paid back") - (b.status === "Paid back"));
    if (!list.length) box.append(h("p", { class: "quiet", text: "Nothing owed back." }));
    list.forEach((r) => {
      const st = h("div", { class: "st" }, ["Owed", "Requested", "Paid back"].map((s) => h("button", { type: "button", "aria-pressed": r.status === s ? "true" : "false", text: s, onclick: async () => {
        try { Object.assign(r, await api("PATCH", "/api/coin/reimb/" + r.id, { status: s })); toast(`${r.name}: ${s.toLowerCase()}`); render(); } catch (e) { toast("Couldn't save: " + e.message); }
      } })));
      box.append(h("div", { class: "rb" + (r.status === "Paid back" ? " done" : "") },
        h("div", {}, h("div", { class: "nm", text: r.name }), h("div", { class: "meta", text: [r.owedBy && "Owed by " + r.owedBy, r.amount != null ? money(r.amount) : "amount to add", r.spentOn && md(r.spentOn), r.card, r.note].filter(Boolean).join(" · ") })),
        st));
    });
    const nm = h("input", { placeholder: "What you paid for", "aria-label": "What you paid for" });
    const amt = h("input", { placeholder: "Amount", inputmode: "decimal", "aria-label": "Amount" });
    const who = h("input", { placeholder: "Who owes it", "aria-label": "Who owes it" });
    const add = h("button", { type: "button", text: "Add" });
    add.onclick = async () => {
      if (!nm.value.trim()) { nm.focus(); toast("Add what it was for"); return; }
      try { d.reimbursements.push(await api("POST", "/api/coin/reimb", { name: nm.value.trim(), amount: amt.value.replace(/[$,]/g, ""), owedBy: who.value.trim(), spentOn: new Date().toISOString().slice(0, 10) })); toast("Added"); render(); } catch (e) { toast("Couldn't save: " + e.message); }
    };
    box.append(h("div", { class: "addr" }, nm, amt, who, add));
    return box;
  }

  function pointsGroups(d) {
    const g = new Map();
    (d.cards || []).filter((c) => c.program).forEach((c) => {
      const k = c.program, e = g.get(k) || { program: k, points: null, asOf: null, value: null, cards: [] };
      e.cards.push(`${c.name} ···${c.last4}`);
      if (c.points != null && (e.points == null || c.points > e.points)) { e.points = c.points; e.asOf = c.pointsAsOf; e.value = c.pointValue; }
      if (e.value == null && c.pointValue != null) e.value = c.pointValue;
      g.set(k, e);
    });
    return [...g.values()].sort((a, b) => (b.points || -1) - (a.points || -1));
  }
  function pointsSec(d) {
    const groups = pointsGroups(d);
    if (!groups.length) return "";
    const box = h("section", { class: "cn-sec", id: "points" }, h("div", { class: "cn-head" }, h("h2", { text: "Points & miles" }), h("small", { text: "Cards on the same program share one balance" })));
    let est = 0;
    groups.forEach((e) => {
      const v = e.points != null && e.value ? (e.points * e.value) / 100 : null;
      if (v) est += v;
      box.append(h("div", { class: "card" },
        h("div", { class: "nm" }, e.program, h("small", { text: e.cards.join(" · ") })),
        h("div", { class: "bal num", text: e.points == null ? "—" : e.points.toLocaleString() }),
        h("div", { class: "meta", text: e.points == null ? "Balance not on file yet" : `as of ${md(e.asOf)}` + (v ? ` · about ${money(v, false)} at ${e.value}¢ each` : "") }),
        h("div", { class: "right", text: "" })));
    });
    if (est) box.append(h("p", { class: "quiet", style: "margin:.4rem 0 0;font-size:.85rem", text: `Rough value of what's on file: ${money(est, false)}. Estimates only; transfers to partners can be worth more.` }));
    return box;
  }
  // ---------------- which card for what (from each card's "Use for") ----------------
  const USE_ORDER = ["Dining", "US groceries", "Amazon and Whole Foods", "Gas and transit", "Drugstores", "Streaming", "Software and subscriptions", "Delta flights", "United flights", "Other flights", "Hotels and car rentals", "Overseas", "Everything else"];
  function whichSec(d) {
    const by = new Map();
    (d.cards || []).forEach((c) => (c.useFor || []).forEach((u) => { if (!by.has(u)) by.set(u, []); by.get(u).push(c); }));
    if (!by.size) return "";
    const keys = [...by.keys()].sort((a, b) => (USE_ORDER.indexOf(a) + 1 || 99) - (USE_ORDER.indexOf(b) + 1 || 99));
    const box = h("section", { class: "cn-sec", id: "which" }, h("div", { class: "cn-head" }, h("h2", { text: "Which card for what" }), h("small", { text: "Best rewards for each kind of spending" })));
    keys.forEach((k) => box.append(h("div", { class: "use" },
      h("span", { class: "ic" }, icon(USE_ICON[k] || "star")),
      h("span", { class: "k", text: k }),
      h("span", { class: "v" }, ...by.get(k).map((c) => h("span", { class: "pick" }, cardArt(c, true), `${c.name} ···${c.last4}`))))));
    const idle = (d.cards || []).filter((c) => !(c.useFor || []).length);
    if (idle.length) box.append(h("p", { class: "quiet", style: "margin:.4rem 0 0;font-size:.85rem", text: "Keep open, don't use: " + idle.map((c) => `${c.name} ···${c.last4}`).join(", ") + "." }));
    return box;
  }
  function render() {
    const d = S.data, main = $("#main");
    main.replaceChildren(h("h1", { class: "cn-title", text: "Coin" }), h("p", { class: "cn-sub quiet", text: "Your cards, where the money goes, and what you're owed." }),
      covey(d), tiles(d), cardsSec(d), whichSec(d), pointsSec(d), spendSec(d), paysSec(d), reimbSec(d));
    menu();
  }
  // ---------------- menu ----------------
  let spy;
  function menu() {
    const links = [...document.querySelectorAll("#tabs a")];
    const secs = links.map((a) => document.getElementById(a.dataset.sec));
    links.forEach((a, i) => { a.hidden = !secs[i]; });
    const mark = (id) => links.forEach((a) => (a.dataset.sec === id ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    if (spy) spy.disconnect();
    if (!("IntersectionObserver" in window)) return;
    const seen = new Map();
    spy = new IntersectionObserver((ents) => {
      ents.forEach((e) => seen.set(e.target.id, e.isIntersecting));
      const first = secs.find((s) => s && seen.get(s.id));
      if (first) { mark(first.id); const a = links.find((x) => x.dataset.sec === first.id); const nav = $("#tabs"); if (a && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, a.offsetLeft - 24); }
    }, { rootMargin: "-110px 0px -55% 0px" });
    secs.forEach((s) => s && spy.observe(s));
    if (!document.querySelector("#tabs a[aria-current]")) mark("overview");
  }

  async function load() {
    try { S.data = await api("GET", "/api/coin"); render(); }
    catch (e) { if (e.message !== "signin") $("#main").replaceChildren(h("p", { class: "cn-err", text: "Couldn't load Coin: " + e.message })); }
  }
  load();
})();
