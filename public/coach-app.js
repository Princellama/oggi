/* Oggi · /coach — Roger, Eric's coach. Morning: his note, last night's win, the day's screens with his pick.
   Afternoon: half-time with Roger. The one thing for today (a timed push if it isn't done), then one habit still in reach.
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
  const S = { data: null, screens: [], mode: (() => { const hr = new Date().getHours(); return hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening"; })(), step: 0, draft: {} };

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
  // Not another Today. Roger asks about two things only: the one thing Eric chose for today (his goal),
  // and one habit still in reach this afternoon (his character). The habit tick saves to the Daily Log.
  const GRIND_KEY = "oggi.coach.grind";
  const keep = {
    get() { try { return JSON.parse(localStorage.getItem(GRIND_KEY) || "null"); } catch { return null; } },
    set(v) { try { v ? localStorage.setItem(GRIND_KEY, JSON.stringify(v)) : localStorage.removeItem(GRIND_KEY); } catch {} },
  };
  const fmtTime = (d) => d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", "").toLowerCase();
  // Habits that can still be kept after lunch, and how Roger raises each.
  // Training is London's (/fit), so Roger leaves Workout alone.
  const PM = {
    "Walk": "Have you had your walk today?",
    "Bible reading": "Have you had your Bible reading today?",
    "Italian": "Have you done your Italian today?",
    "Reading": "Have you read any of your book today?",
    "Veg at 2 meals": "Have you had your veg at two meals today?",
    "No sugary drinks": "Have you stayed off the sugary drinks today?",
  };
  const lc = (t) => t.replace(/[.\s]+$/, "").replace(/^([A-Z])(?=[a-z])/, (m) => m.toLowerCase());
  function oneThing() {
    const y = S.data.yesterday, t = S.data.today;
    return (y && y.tomorrow ? y.tomorrow : "").trim() || (S.pmThing || "");
  }
  function habitToAsk() {
    const done = { ...((S.data.today && S.data.today.habits) || {}), ...(S.draft.habits || {}) };
    const streaks = S.data.streaks || {};
    const open = Object.keys(PM).filter((k) => !done[k] && !(S.pmSkipped || []).includes(k));
    // the one with the longest chain to protect comes first; a habit at nought is still worth starting
    return open.sort((a, b) => (streaks[b] || 0) - (streaks[a] || 0))[0] || null;
  }
  function afternoon(main) {
    let g = keep.get();
    if (g && !g.thing) { keep.set(null); g = null; }   // a push saved by the first version of this tab
    if (g && g.day === today()) { grind(main, g); return; }
    const step = S.pmStep || "goal", thing = oneThing(), y = S.data.yesterday || {};
    const go = (k) => { S.pmStep = k; render(); window.scrollTo(0, 0); };
    const box = h("div", { class: "step" });

    if (step === "goal") {
      if (!thing) {
        box.append(roger("Right then, Eric, it's half-time. Before the afternoon gets away from you: what's the one thing that would make today count?", "Roger · " + fmtTime(new Date())));
        const ta = h("textarea", { class: "co-field", placeholder: "One thing. Type it, or tap the mic and say it." });
        box.append(ta, h("div", { class: "co-acts" }, h("span"), h("button", { class: "btn", type: "button", text: "That's the one", onclick: () => { if (!ta.value.trim()) return; S.pmThing = ta.value.trim(); go("block"); } })));
      } else {
        box.append(roger(`Right then, Eric, it's half-time. This morning you chose one thing for today: ${lc(thing)}. Is it done?`, "Roger · " + fmtTime(new Date())));
        box.append(h("div", { class: "pm-choices" },
          h("button", { class: "btn", type: "button", text: "Yes, it's done", onclick: () => go("goal-done") }),
          h("button", { class: "btn ghost", type: "button", text: "Not yet", onclick: () => go("block") })));
      }
    } else if (step === "goal-done") {
      box.append(roger("Well done, you. That's the day earned, whatever else happens. Everything from here is a bonus, so let's spend a minute on the man rather than the list.", "Roger"));
      box.append(h("div", { class: "co-acts" }, h("span"), h("button", { class: "btn", type: "button", text: "Go on", onclick: () => go("habit") })));
    } else if (step === "block") {
      box.append(roger("Then that's the whole afternoon, as far as I'm concerned. The rest can wait. What's in the way?", "Roger"));
      const why = {
        start: "That's usually all it is. Nobody feels like starting; you start, and then you feel like it. Twenty-five minutes, just the opening move.",
        big: "Then we won't try to finish it. What's the first piece you could finish in twenty-five minutes? Do that piece, nothing more.",
        pulled: "Things will always come up, and most of them can wait an hour. Close the other tabs, put the phone face down, and give this one twenty-five minutes before anything else.",
      };
      box.append(h("div", { class: "pm-choices col" },
        ...[["start", "I just haven't started"], ["big", "It's bigger than I thought"], ["pulled", "Other things keep pulling at me"]].map(([k, t]) =>
          h("button", { class: "btn ghost", type: "button", text: t, onclick: () => { S.pmWhy = why[k]; go("commit"); } }))));
    } else if (step === "commit") {
      box.append(roger(S.pmWhy || "Twenty-five minutes, just the opening move.", "Roger"));
      box.append(h("div", { class: "co-card co-push" }, h("h3", { text: "The one thing" }), h("p", { class: "push-t", text: thing })));
      box.append(h("div", { class: "pm-choices" },
        ...[25, 45].map((m) => h("button", { class: m === 25 ? "btn" : "btn ghost", type: "button", text: `Start ${m} minutes`, onclick: () => { keep.set({ day: today(), thing, mins: m, start: Date.now() }); render(); } })),
        h("button", { class: "textlink", type: "button", text: "Not now", onclick: () => go("habit") })));
    } else if (step === "habit") {
      const k = habitToAsk();
      if (!k) { go("book"); return; }
      const n = (S.data.streaks || {})[k] || 0;
      const chain = n >= 2 ? ` You're ${n} days running on it. Shame to break the chain.` : n === 1 ? " You kept it yesterday. Two in a row is how a habit starts." : " It doesn't need to be much. A small one still counts.";
      box.append(roger(PM[k] + chain, "Roger"));
      const save = async (v) => {
        if (v) { try { await saveDraft({ habits: { ...(S.draft.habits || {}), [k]: true } }); toast("Ticked on your Daily Log."); } catch { return; } }
        else S.pmSkipped = (S.pmSkipped || []).concat(k);
        go(v ? "book" : "habit-later");
      };
      box.append(h("div", { class: "pm-choices" },
        h("button", { class: "btn", type: "button", text: "Yes, done", onclick: () => save(true) }),
        h("button", { class: "btn ghost", type: "button", text: "Not yet", onclick: () => save(false) })));
      S.pmHabit = k;
    } else if (step === "habit-later") {
      const later = { "Walk": "Do it before supper, then. Twenty minutes round the block clears the head better than another coffee.",
        "Workout": "Fit it in before supper, then. Even a short session keeps the promise.",
        "Bible reading": "Ten quiet minutes before supper, then. It steadies the rest of the evening.",
        "Italian": "Ten minutes before supper, then. A little each day beats a lot on Saturday.",
        "Reading": "A chapter tonight, then, and you can tell me about it at checkout.",
        "Veg at 2 meals": "Make supper the one with the veg on it, then. That'll do nicely.",
        "No sugary drinks": "Water or tea for the rest of the day, then. You'll sleep better for it." };
      box.append(roger(later[S.pmHabit] || "Before supper, then.", "Roger"));
      box.append(h("div", { class: "co-acts" }, h("span"), h("button", { class: "btn", type: "button", text: "Right", onclick: () => go("book") })));
    } else if (step === "book") {
      // One idea from the chapter he's on, in Roger's words, and a light nudge to use it today.
      const b = (S.data.books || []).find((x) => x.takeaways && x.takeaways.length);
      if (!b) { go("close"); return; }
      const day = Math.floor(Date.now() / 864e5), t = b.takeaways[day % b.takeaways.length];
      const tk = typeof t === "string" ? { text: t, mine: false } : t;
      const lead = ["The point I keep coming back to", "The bit I liked", "What stuck with me"][day % 3];
      const point = tk.mine
        ? `You marked this one yourself: “${tk.text.replace(/^["“]|["”]$/g, "")}” Rather good, that.`
        : `${lead}: ${tk.text.charAt(0).toLowerCase() + tk.text.slice(1)}`;
      box.append(roger(`You're on chapter ${b.chapterNo} of ${b.title}, I see. ${point} So, where could you put that to work before the day's out? Something small will do.`, "Roger"));
      const ta = h("textarea", { class: "co-field", placeholder: "One small thing, today. Type it, or tap the mic and say it." }, (S.draft.apply || (S.data.today && S.data.today.apply) || ""));
      box.append(ta, h("div", { class: "co-acts" },
        h("button", { class: "textlink", type: "button", text: "Not today", onclick: () => { S.pmApplied = false; go("close"); } }),
        h("button", { class: "btn", type: "button", text: "That's my vote", onclick: async () => {
          const v = ta.value.trim(); if (!v) return;
          try { await saveDraft({ apply: v, book: b.title, chapter: "Ch. " + b.chapterNo }); } catch { return; }
          S.pmApplied = v; go("close");
        } })));
    } else {
      const apply = (y.apply || "").trim();
      box.append(roger(S.pmApplied
        ? `Good man. That's the vote cast: ${lc(S.pmApplied)}. Now crack on, and tell me at checkout how it went.`
        : apply
        ? `One last thing. Last night you said you'd put your reading to work: ${lc(apply)}. If the chance comes up this afternoon, take it. Now, get on with it, and I'll see you at checkout.`
        : "That's all from me. Keep it simple this afternoon: the one thing first, then the habit. I'll see you at checkout.", "Roger"));
      box.append(h("div", { class: "co-acts" }, h("button", { class: "textlink", type: "button", text: "↺ Start over", onclick: () => { S.pmStep = "goal"; S.pmSkipped = []; render(); } }), h("span")));
    }
    main.append(box);
    if (step !== "goal" && step !== "close") main.append(h("p", { class: "pm-restart" }, h("button", { class: "textlink", type: "button", text: "↺ Start over", onclick: () => { S.pmStep = "goal"; S.pmSkipped = []; S.pmApplied = null; render(); } })));
  }
  function grind(main, g) {
    const end = g.start + g.mins * 60000;
    const over = Date.now() >= end;
    const clock = h("div", { class: "grind-clock", "aria-live": "off" });
    const tick = () => {
      const ms = Math.max(0, end - Date.now()), m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      clock.textContent = `${m}:${pad(s)}`;
      if (ms <= 0) { clearInterval(grind.t); if (!over) { try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {} render(); } }
    };
    clearInterval(grind.t); tick(); if (!over) grind.t = setInterval(tick, 1000);
    main.append(roger(over ? "Time's up, Eric. Did you get it done?" : "Heads down. Phone face down, one window open. I'll keep an eye on the clock.", "Roger"));
    main.append(h("div", { class: "co-card grind" }, h("h3", { text: over ? "Time's up" : `${g.mins} minutes` }), h("p", { class: "push-t", text: g.thing }), over ? null : clock,
      h("p", { class: "quiet", style: "margin-top:6px", text: `Started ${fmtTime(new Date(g.start))} · ends ${fmtTime(new Date(end))}` })));
    const leave = (next) => { keep.set(null); clearInterval(grind.t); S.pmStep = next; render(); window.scrollTo(0, 0); };
    main.append(h("div", { class: "pm-choices" },
      h("button", { class: "btn", type: "button", text: over ? "Yes, done" : "Done already", onclick: () => leave("goal-done") }),
      over ? h("button", { class: "btn ghost", type: "button", text: "Another round", onclick: () => { keep.set({ ...g, start: Date.now() }); render(); } }) : null,
      h("button", { class: "textlink", type: "button", text: over ? "Not yet, and that's enough for now" : "Stop", onclick: () => leave("habit") })));
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
      const [d, sc] = await Promise.all([api("GET", "/api/coach?d=" + today()), api("GET", "/api/xteink/screens").catch(() => [])]);
      S.data = d; S.screens = sc;
    } catch (e) { if (e.message !== "signin") S.data = { error: "load" }; }
    render();
  }
  render(); load();
})();
