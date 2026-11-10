/* Oggi · /coach — Roger, Eric's coach. Morning: his note, last night's win, the day's screens with his pick.
   Afternoon: what's done since morning (read from today's brief), what's left, and one timed push on the next thing.
   Evening: a short checkout, one question at a time, saved to the Daily Log in Notion. Roger answers overnight. */
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
  const pad = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fmtDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2200); }
  async function api(method, url, body) {
    const r = await fetch(url, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { location.href = "/"; throw new Error("signin"); }
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  const HABITS = [["Bible reading", "Bible reading"], ["Walk", "Walk 30 min"], ["Workout", "Workout"], ["Italian", "Italian"],
    ["No phone first hour", "No phone 1st hour"], ["Bed by 10", "Bed by 10"], ["Reading", "Read my book"], ["Veg at 2 meals", "Veg at 2 meals"]];
  const GROW = /habit|discipline|mindset|productiv|leader|business|develop|sales|finance|money|focus|growth/i;
  const S = { data: null, screens: [], mode: (() => { const hr = new Date().getHours(); return hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening"; })(), step: 0, draft: {}, brief: null };

  function roger(text, label) {
    return h("div", { class: "roger" }, h("img", { src: "/icons/roger.svg", alt: "Roger" }), h("div", { class: "say" }, h("small", { text: label || "Roger" }), text));
  }
  function modes() {
    const m = $("#modes"); m.textContent = "";
    for (const [k, t] of [["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"]])
      m.append(h("button", { type: "button", "aria-pressed": String(S.mode === k), text: t, onclick: () => { S.mode = k; S.step = 0; render(); } }));
  }

  // ---------------- morning ----------------
  function pickOf() {
    const t = S.data.today, raw = (t && t.rogerPick) || "";
    const [kind, why] = raw.split("|");
    const fromJiro = S.screens.find((s) => s.pick);
    return kind ? { kind: kind.trim(), why: (why || "").trim() } : fromJiro ? { kind: fromJiro.kind, why: fromJiro.why || "" } : null;
  }
  function screensCard() {
    const card = h("div", { class: "co-card" }, h("h3", { text: "Today's XTEINK screens" }));
    if (!S.screens.length) { card.append(h("p", { class: "quiet", text: "No screens yet. The 4:41 job makes them." })); return card; }
    const pick = pickOf();
    const row = h("div", { class: "xt-row" });
    for (const s of S.screens) {
      const on = pick && pick.kind === s.kind;
      row.append(h("figure", { class: "xt-card" + (on ? " pick" : "") },
        on ? h("span", { class: "star", text: "★ Roger's pick" }) : null,
        h("img", { src: `/api/xteink/${s.kind}.png?d=${s.day}`, alt: s.label, loading: "lazy" }),
        h("figcaption", { text: s.label }),
        h("a", { class: "btn small" + (on ? "" : " ghost"), href: `/api/xteink/${s.kind}.bmp?d=${s.day}`, download: `${s.kind}-${s.day}.bmp`, text: "Download" })));
    }
    card.append(row);
    if (pick && pick.why) card.append(h("p", { class: "quiet", style: "margin-top:10px", text: "★ " + pick.why }));
    return card;
  }
  function morning(main) {
    const { today: t, yesterday: y, streaks } = S.data;
    const note = t && t.rogerMorning;
    const fallback = "Good morning, Eric. " + (y && y.win ? `Yesterday you managed this: ${y.win} Well done. ` : "") + (y && y.tomorrow ? `You said today's one thing is: ${y.tomorrow}` : "Pick one thing that moves the needle, and do that first.");
    main.append(roger(note || fallback, "Roger · " + fmtDay(today())));
    if (y && y.tomorrow) main.append(h("div", { class: "co-card" }, h("h3", { text: "Today's one thing" }), h("p", { text: y.tomorrow })));
    if (y && y.win) main.append(h("div", { class: "co-card co-win" }, h("h3", { text: "Yesterday's win" }), h("p", { text: y.win })));
    if (y && (y.notes || y.apply)) main.append(h("div", { class: "co-card" }, h("h3", { text: `Last night · ${y.book || "your book"}${y.chapter ? " · " + y.chapter : ""}` }),
      y.notes ? h("p", { text: y.notes }) : null, y.apply ? h("p", { class: "quiet", style: "margin-top:8px", text: "You'll use it: " + y.apply }) : null));
    main.append(screensCard());
    const st = Object.entries(streaks || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    main.append(h("div", { class: "co-card" }, h("h3", { text: "Streaks" }),
      st.length ? h("div", { class: "streaks" }, ...st.map(([k, n]) => h("span", null, (HABITS.find((x) => x[0] === k) || [k, k])[1] + " · ", h("b", { text: n + (n === 1 ? " day" : " days") })))) : h("p", { class: "quiet", text: "No streaks yet. Tonight's checkout starts them." })));
  }


  // ---------------- afternoon check-in ----------------
  // Reads today's brief (Brief Items + the day's events) and the Daily Log. Nothing new is stored:
  // finishing the push marks the item done the same way Today does, so the evening brief sees it.
  const GRIND_KEY = "oggi.coach.grind";
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(GRIND_KEY) || "null"); } catch { return null; } },
    set(v) { try { v ? localStorage.setItem(GRIND_KEY, JSON.stringify(v)) : localStorage.removeItem(GRIND_KEY); } catch {} },
  };
  const isJob = (i) => !String(i.key || "").startsWith("r-");
  const fmtTime = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const AREA = { CPA: "CPA", Medicare: "Medicare", Money: "Money", Personal: "Personal" };
  function dayState() {
    const b = S.brief || { day: null, items: [] }, t = today();
    const all = (b.items || []).concat(b.recent || []);
    const doneToday = all.filter((i) => isJob(i) && i.status === "Closed" && (i.closedOn === t || (!i.closedOn && i.lastSeen === t && b.day && b.day.date === t)));
    const closedForYou = (b.items || []).filter((i) => !isJob(i) && i.status === "Closed" && b.day && b.day.date === t);
    const open = (b.items || []).filter((i) => isJob(i) && i.status !== "Closed" && i.list !== "Resolved" && !i.delegatedTo && i.decision !== "Let go");
    const ready = open.filter((i) => !i.waitingOn);
    const waiting = open.filter((i) => i.waitingOn);
    const now = Date.now();
    const events = ((b.day && b.day.events) || []).filter((e) => e.start && Date.parse(e.start) > now && !/optional/i.test(e.title || "")).sort((a, c) => Date.parse(a.start) - Date.parse(c.start));
    return { doneToday, closedForYou, ready, waiting, next: events[0] || null, stale: !b.day || b.day.date !== t };
  }
  // Roger's pick for the next push: a lit supernova first, then the brief's own order.
  function suggest(ready) {
    const lit = ready.filter((i) => i.novaStart && !i.novaCooled);
    const pool = lit.length ? lit : ready;
    return pool.slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99))[0] || null;
  }
  function names(list, n) {
    const ts = list.slice(0, n).map((i) => i.mapLabel || i.title);
    if (list.length > n) ts.push(`${list.length - n} more`);
    return ts.length < 2 ? ts.join("") : ts.slice(0, -1).join(", ") + " and " + ts[ts.length - 1];
  }
  function afternoonNote(st) {
    const y = S.data.yesterday, td = S.data.today;
    const parts = ["Good afternoon, Eric."];
    if (st.doneToday.length) parts.push(`${["", "One thing", "Two things", "Three things", "Four things", "Five things", "Six things"][st.doneToday.length] || st.doneToday.length + " things"} off the list since this morning: ${names(st.doneToday, 3)}. Splendid.`);
    else if (td && td.win) parts.push(`You've a win on the board already: ${td.win}`);
    else parts.push("Nothing crossed off yet, which only means the best of the day is still ahead of you.");
    if (y && y.tomorrow) parts.push(`This morning's one thing was ${y.tomorrow.replace(/[.\s]+$/, "")}.`);
    if (st.next) {
      const mins = Math.round((Date.parse(st.next.start) - Date.now()) / 60000);
      parts.push(mins >= 20 ? `You've clear runway until ${fmtTime(new Date(st.next.start))}. Let's spend it on one thing.` : `${st.next.title} is in ${mins} minutes, so let's keep the next push short.`);
    } else if (st.ready.length) parts.push("Nothing else on the calendar today. One proper push now, and the evening is yours.");
    return parts.join(" ");
  }
  function itemLine(i, extra) {
    return h("li", null, h("span", { class: "t", text: i.mapLabel || i.title }), i.area ? h("span", { class: "tag", text: AREA[i.area] || i.area }) : null, extra || null);
  }
  function afternoon(main) {
    const st = dayState();
    const g = store.get();
    if (g && g.day === today()) { grind(main, g, st); return; }
    main.append(roger(afternoonNote(st), "Roger · " + fmtTime(new Date())));
    if (st.stale) main.append(h("p", { class: "quiet", style: "margin:-8px 0 18px", text: "Today's brief hasn't run yet, so I'm working from yesterday's list." }));

    const done = h("div", { class: "co-card co-win" }, h("h3", { text: "Done today" }));
    if (st.doneToday.length) done.append(h("ul", { class: "co-list" }, ...st.doneToday.map((i) => itemLine(i, h("span", { class: "ok", text: "✓" })))));
    else done.append(h("p", { class: "quiet", text: "Nothing marked done in Oggi yet. If you've finished something, tick it on Today and it shows here." }));
    if (st.closedForYou.length) done.append(h("p", { class: "quiet", style: "margin-top:10px", text: `Also off your plate without you: ${names(st.closedForYou, 3)}.` }));
    main.append(done);

    const pick = suggest(st.ready);
    const push = h("div", { class: "co-card co-push" }, h("h3", { text: "Next push" }));
    if (!pick) {
      push.append(h("p", { text: st.waiting.length ? `Everything left is waiting on someone else (${names(st.waiting, 3)}). Take a breather, or get ahead on tomorrow.` : "The list is clear. Well done, old chap." }));
      main.append(push); return;
    }
    let chosen = pick;
    const title = h("p", { class: "push-t", text: pick.title });
    const why = h("p", { class: "quiet", style: "margin-top:6px", text: pick.sentence || "" });
    push.append(title, why);
    const left = st.next ? Math.round((Date.parse(st.next.start) - Date.now()) / 60000) - 5 : 0;
    const lens = [25, 45]; if (left >= 15 && !lens.includes(left) && left < 120) lens.push(left);
    const row = h("div", { class: "push-go" }, ...lens.sort((a, b) => a - b).map((m) =>
      h("button", { class: m === 25 ? "btn" : "btn ghost", type: "button", text: m === left ? `Until ${fmtTime(new Date(Date.parse(st.next.start) - 5 * 60000))}` : `${m} min`,
        onclick: () => { store.set({ day: today(), id: chosen.id, title: chosen.title, mins: m, start: Date.now() }); render(); } })));
    push.append(row);
    if (st.ready.length > 1) {
      const sel = h("select", { class: "co-field", "aria-label": "Choose another" },
        ...st.ready.map((i) => { const o = h("option", { value: i.id, text: (i.mapLabel || i.title) + (i.area ? " · " + i.area : "") }); if (i.id === pick.id) o.selected = true; return o; }));
      sel.addEventListener("change", () => { chosen = st.ready.find((i) => i.id === sel.value) || pick; title.textContent = chosen.title; why.textContent = chosen.sentence || ""; });
      push.append(h("p", { class: "quiet", style: "margin:14px 0 6px", text: "Or pick another" }), sel);
    }
    main.append(push);

    const rest = st.ready.filter((i) => i.id !== pick.id);
    if (rest.length || st.waiting.length) {
      const c = h("div", { class: "co-card" }, h("h3", { text: `Still open · ${st.ready.length}` }));
      if (rest.length) c.append(h("ul", { class: "co-list" }, ...rest.map((i) => itemLine(i, i.carries > 2 ? h("span", { class: "carry", text: `carried ${i.carries} days` }) : null))));
      if (st.waiting.length) c.append(h("p", { class: "quiet", style: "margin-top:10px", text: "Waiting on others: " + st.waiting.map((i) => `${i.mapLabel || i.title} (${i.waitingOn})`).join(", ") + "." }));
      main.append(c);
    }
  }
  function grind(main, g, st) {
    const end = g.start + g.mins * 60000;
    const over = Date.now() >= end;
    const clock = h("div", { class: "grind-clock", "aria-live": "off" });
    const tick = () => {
      const ms = Math.max(0, end - Date.now()), m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      clock.textContent = `${m}:${pad(s)}`;
      if (ms <= 0) { clearInterval(grind.t); if (!over) { try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {} render(); } }
    };
    clearInterval(grind.t); tick(); if (!over) grind.t = setInterval(tick, 1000);
    main.append(roger(over ? "Time, Eric. How did that go?" : g.mins >= 45 ? "Heads down. Phone face-down, one tab open. I'll keep the clock." : "Twenty-five good minutes. Just this one thing; everything else can wait. I'll keep the clock.", "Roger"));
    main.append(h("div", { class: "co-card grind" }, h("h3", { text: over ? "Push finished" : `Pushing · ${g.mins} min` }), h("p", { class: "push-t", text: g.title }), over ? null : clock,
      h("p", { class: "quiet", style: "margin-top:6px", text: `Started ${fmtTime(new Date(g.start))} · ends ${fmtTime(new Date(end))}` })));
    const finish = async () => {
      try {
        await api("PATCH", "/api/item/" + encodeURIComponent(g.id) + "?d=" + today(), { status: "Closed", dayId: S.brief && S.brief.day && S.brief.day.id, d: today() });
        const it = (S.brief.items || []).find((i) => i.id === g.id); if (it) { it.status = "Closed"; it.closedOn = today(); }
        store.set(null); clearInterval(grind.t); toast("Crossed off. Well done."); render(); window.scrollTo(0, 0);
      } catch { toast("Couldn't reach Notion. Try again in a moment."); }
    };
    const stop = () => { store.set(null); clearInterval(grind.t); render(); };
    const again = () => { store.set({ ...g, start: Date.now() }); render(); };
    main.append(h("div", { class: "push-go" },
      h("button", { class: "btn", type: "button", text: "Done, cross it off", onclick: finish }),
      over ? h("button", { class: "btn ghost", type: "button", text: "Another round", onclick: again }) : null,
      h("button", { class: "btn ghost", type: "button", text: over ? "Not yet, back to the list" : "Stop early", onclick: stop })));
  }

  // ---------------- evening checkout ----------------
  function steps() {
    const book = (S.data.books || [])[0];
    const list = [
      { k: "mood", say: "Good evening, Eric. How was today, honestly?" },
      { k: "win", say: "What was today's win? One thing that moved the needle. Small counts." },
    ];
    if (book) {
      list.push({ k: "book", say: `And ${book.title}. How was it tonight? Tell me as you would at a book club: what did the chapter say, and what stuck with you?` });
      if (GROW.test((book.themes || []).join(" ") + " " + book.title)) list.push({ k: "apply", say: "Splendid. Now, how will you put that to work this week? And is there someone you could try it with: Hazel, a client, a friend?" });
    }
    list.push({ k: "habits", say: "Let's tick the chain. What did you get done today?" });
    list.push({ k: "grateful", say: "What are you grateful for today?" });
    list.push({ k: "tomorrow", say: "Last one. What's the one thing for tomorrow? I'll put it first in the morning." });
    list.push({ k: "done" });
    return list;
  }
  async function saveDraft(fields) {
    Object.assign(S.draft, fields);
    try { await api("POST", "/api/coach?d=" + today(), { ...fields, d: today() }); }
    catch (e) { toast("Couldn't save to Notion. Your answer is kept here."); throw e; }
  }
  function evening(main) {
    const t = S.data.today || {}, list = steps(), st = list[S.step];
    const val = (k) => (k in S.draft ? S.draft[k] : t[k]) || "";
    if (t.checkedOut && S.step === 0 && !S.again) {
      main.append(roger("You've already checked out tonight, old chap. Rest well; I'll have a word with you in the morning.", "Roger"));
      main.append(h("button", { class: "btn ghost", type: "button", text: "Go through it again", onclick: () => { S.again = true; render(); } }));
      return;
    }
    main.append(h("div", { class: "prog" }, ...list.slice(0, -1).map((_, i) => h("i", { class: i <= S.step ? "on" : "" }))));
    const box = h("div", { class: "step" });
    const next = async (fields) => { try { if (fields) await saveDraft(fields); S.step++; render(); window.scrollTo(0, 0); } catch {} };
    const back = S.step > 0 ? h("button", { class: "textlink", type: "button", text: "← Back", onclick: () => { S.step--; render(); } }) : h("span");
    if (st.k === "done") {
      saveDraft({ checkedOut: true }).catch(() => {});
      const d = { ...t, ...S.draft };
      box.append(roger("Thank you, Eric. That's the day put away properly. Rest well, and I'll have a word with you in the morning.", "Roger"));
      box.append(h("div", { class: "co-card done-list" }, h("h3", { text: "Tonight" }),
        d.win ? h("p", null, h("b", { text: "Win" }), d.win) : null,
        d.notes ? h("p", null, h("b", { text: (d.book || "Book") + (d.chapter ? " · " + d.chapter : "") }), d.notes) : null,
        d.apply ? h("p", null, h("b", { text: "You'll use it" }), d.apply) : null,
        d.grateful ? h("p", null, h("b", { text: "Grateful for" }), d.grateful) : null,
        d.tomorrow ? h("p", null, h("b", { text: "Tomorrow's one thing" }), d.tomorrow) : null));
      main.append(box); return;
    }
    box.append(roger(st.say));
    if (st.k === "mood") {
      const cur = val("mood");
      box.append(h("div", { class: "moods" }, ...["Great", "Good", "Okay", "Rough"].map((m) => h("button", { type: "button", "aria-pressed": String(cur === m), text: m, onclick: () => next({ mood: m }) }))));
      box.append(h("div", { class: "co-acts" }, back, h("button", { class: "textlink", type: "button", text: "Skip", onclick: () => next() })));
    } else if (st.k === "habits") {
      const cur = { ...(t.habits || {}), ...(S.draft.habits || {}) };
      const grid = h("div", { class: "habits" });
      for (const [k, label] of HABITS) {
        const cb = h("input", { type: "checkbox" }); cb.checked = !!cur[k]; cb.dataset.k = k;
        grid.append(h("label", null, cb, label));
      }
      const water = h("input", { class: "co-field", type: "number", min: "0", max: "20", inputmode: "numeric", placeholder: "Glasses of water", value: val("water") === "" ? "" : String(val("water")) });
      box.append(grid, h("p", { class: "quiet", style: "margin:14px 0 6px", text: "Water (goal 8)" }), water);
      box.append(h("div", { class: "co-acts" }, back, h("button", { class: "btn", type: "button", text: "Next", onclick: () => {
        const hb = {}; grid.querySelectorAll("input").forEach((c) => (hb[c.dataset.k] = c.checked));
        next({ habits: hb, water: water.value });
      } })));
    } else if (st.k === "book") {
      const book = S.data.books[0];
      const ch = h("input", { class: "co-field", type: "text", placeholder: "Chapter or pages (e.g. Ch. 3)", value: val("chapter") });
      const ta = h("textarea", { class: "co-field", placeholder: "What did it say? What stuck with you? Tap the mic on your keyboard to talk." }, val("notes"));
      box.append(ch, h("div", { style: "height:10px" }), ta);
      box.append(h("div", { class: "co-acts" }, back, h("span", null,
        h("button", { class: "textlink", type: "button", text: "Didn't read today", onclick: () => { S.step += steps()[S.step + 1] && steps()[S.step + 1].k === "apply" ? 2 : 1; render(); } }), "  ",
        h("button", { class: "btn", type: "button", text: "Next", onclick: () => next({ book: book.title, chapter: ch.value.trim(), notes: ta.value.trim(), habits: { ...(S.draft.habits || {}), Reading: !!ta.value.trim() } }) }))));
    } else {
      const ta = h("textarea", { class: "co-field", placeholder: "Type or tap the mic to talk." }, val(st.k));
      box.append(ta, h("div", { class: "co-acts" }, back, h("button", { class: "btn", type: "button", text: "Next", onclick: () => next({ [st.k]: ta.value.trim() }) })));
    }
    main.append(box);
  }

  function render() {
    modes();
    const main = $("#main"); main.textContent = "";
    if (!S.data) { main.append(h("p", { class: "quiet", text: "One moment…" })); return; }
    if (S.data.error === "share") {
      main.append(roger("I can't see your Daily Log yet. In Notion, open Daily Log → ••• → Connections → add oggi, then refresh.", "Roger"));
      return;
    }
    if (S.data.error) { main.append(roger("I couldn't reach Notion just now. Pull to refresh in a moment.", "Roger")); return; }
    if (S.mode === "morning") morning(main); else if (S.mode === "afternoon") afternoon(main); else evening(main);
  }
  async function load() {
    try {
      const me = await (await fetch("/auth/me", { credentials: "same-origin" })).json();
      if (!me.signedIn) { location.href = "/"; return; }
      const [d, sc, br] = await Promise.all([api("GET", "/api/coach?d=" + today()), api("GET", "/api/xteink/screens").catch(() => []), api("GET", "/api/brief?d=" + today()).catch(() => null)]);
      S.data = d; S.screens = sc; S.brief = br;
    } catch (e) { if (e.message !== "signin") S.data = { error: "load" }; }
    render();
  }
  render(); load();
})();
