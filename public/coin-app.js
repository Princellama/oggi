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
    const rank = { warn: 0, watch: 1, ok: 2 };
    notes.sort((a, b) => rank[a.level] - rank[b.level]);
    if (!notes.length) notes.push({ level: "ok", text: ["All clear. Cards paid, nothing owed back. That's how it should look."] });
    return notes;
  }
  function covey(d) {
    const ul = h("ul");
    coveyNotes(d).forEach((n) => ul.append(h("li", { class: n.level }, ...n.text.flat().map((x) => (x && x.b ? h("b", { text: x.b }) : x)))));
    return h("section", { class: "covey" }, h("img", { src: "/icons/covey.svg", alt: "Covey" }),
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
  function cardsSec(d) {
    const box = h("section", { class: "cn-sec" }, h("div", { class: "cn-head" }, h("h2", { text: "Cards" }), h("small", { text: "Balances as of the last update" })));
    const order = (c) => (c.balance || 0);
    (d.cards || []).slice().sort((a, b) => order(b) - order(a)).forEach((c) => {
      const auto = c.autopay === "Minimum" ? h("span", { class: "chip bad", text: "autopay: minimum" }) : /statement|full/i.test(c.autopay) ? h("span", { class: "chip good", text: "autopay: " + c.autopay.toLowerCase() }) : h("span", { class: "chip", text: "autopay: " + c.autopay.toLowerCase() });
      const dd = daysTo(c.due);
      const dueTxt = c.statement > 0 && c.due ? `Statement ${money(c.statement)} · min ${money(c.minimum)} · due ${md(c.due)}${dd != null && dd <= 3 && dd >= 0 ? (dd === 0 ? " (today)" : dd === 1 ? " (tomorrow)" : ` (in ${dd} days)`) : ""}` : (c.balance || 0) === 0 ? "Paid off" : "No statement balance due";
      const row = h("div", { class: "card" },
        h("div", { class: "nm" }, c.name, h("small", { text: `${c.issuer} ···${c.last4}` }), auto),
        h("div", { class: "bal num", text: money(c.balance) }),
        h("div", { class: "meta", text: dueTxt + (c.note ? " · " + c.note : "") }),
        h("div", { class: "right", text: c.limit ? `of ${money(c.limit, false)}` : "" }));
      if (c.limit) { const p = Math.min(100, (c.balance / c.limit) * 100); row.append(h("div", { class: "util" }, h("i", { class: p > 50 ? "hi" : p > 30 ? "mid" : "", style: `width:${p.toFixed(1)}%` }))); }
      box.append(row);
    });
    const asOf = (d.cards || []).map((c) => c.asOf).filter(Boolean).sort().pop();
    if (asOf) $("#asof").textContent = "Updated " + md(asOf);
    return box;
  }
  function paysSec(d) {
    const box = h("section", { class: "cn-sec" }, h("div", { class: "cn-head" }, h("h2", { text: "Payments" }), h("small", { text: "Made and scheduled" })));
    if (!(d.payments || []).length) box.append(h("p", { class: "quiet", text: "No payments logged yet." }));
    (d.payments || []).forEach((p) => box.append(h("div", { class: "pay" },
      h("span", { class: "d", text: md(p.date) }),
      h("span", { class: "w" }, p.name, h("small", { text: [p.card, p.from && "from " + p.from, p.confirmation && "conf. " + p.confirmation, p.kind === "Autopay" && "scheduled autopay"].filter(Boolean).join(" · ") })),
      h("span", { class: "a num", text: money(p.amount) }))));
    return box;
  }
  function spendSec(d) {
    const cats = (d.spending || []).slice().sort((a, b) => b.amount - a.amount);
    const total = cats.reduce((a, c) => a + c.amount, 0), max = cats[0] ? cats[0].amount : 1;
    const btn = h("button", { class: "tbtn", type: "button", text: S.all ? "Hide all detail" : "Show all detail" });
    const box = h("section", { class: "cn-sec" }, h("div", { class: "cn-head" }, h("h2", { text: "Spending by category" }),
      h("small", { text: `${money(total, false)} · ${cats[0] ? cats[0].period : ""}` }), btn));
    const rows = [];
    cats.forEach((c) => {
      const open = S.all || !!S.open[c.id];
      const merch = h("div", { class: "merch", hidden: !open }, c.top.map((m) => h("div", {}, h("span", { text: m.m }), h("span", { text: m.n > 1 ? m.n + "×" : "" }), h("span", { class: "num", text: money(m.a) }))));
      const big = !/travel|interest/i.test(c.name) && c.amount / total >= 0.15;
      const row = h("button", { class: "cat", type: "button", "aria-expanded": open ? "true" : "false", onclick: () => { S.open[c.id] = !(merch.hidden === false); merch.hidden = !S.open[c.id]; row.setAttribute("aria-expanded", S.open[c.id] ? "true" : "false"); } },
        h("span", { class: "chev", "aria-hidden": "true", text: "›" }),
        h("span", {}, h("span", { class: "t", text: c.name }), h("div", { class: "bar" + (big || /interest/i.test(c.name) ? " big" : ""), style: `width:${Math.max(2, (c.amount / max) * 100).toFixed(1)}%` })),
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
    const box = h("section", { class: "cn-sec" }, h("div", { class: "cn-head" }, h("h2", { text: "Reimbursements" }), h("small", { text: "Paid by you, owed back" })));
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

  function render() {
    const d = S.data, main = $("#main");
    main.replaceChildren(h("h1", { class: "cn-title", text: "Coin" }), h("p", { class: "cn-sub quiet", text: "Your cards, where the money goes, and what you're owed." }),
      covey(d), tiles(d), cardsSec(d), spendSec(d), paysSec(d), reimbSec(d));
  }
  async function load() {
    try { S.data = await api("GET", "/api/coin"); render(); }
    catch (e) { if (e.message !== "signin") $("#main").replaceChildren(h("p", { class: "cn-err", text: "Couldn't load Coin: " + e.message })); }
  }
  load();
})();
