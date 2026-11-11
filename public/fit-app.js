/* Oggi · /fit — London, Eric's fitness coach. A former European gymnastics champion in his fifties: calm, direct, numbers first.
   Today: the day's session from public/fit-data.js, set by set, with London's call on every exercise (go up, hold, drop) worked out
   from the Workout Log, a rest timer, and a debrief when Eric finishes. Walk, protein, water and the rest go to the Daily Log.
   Week: the plan against what happened, make-ups, streaks. Progress: the Sunday check-in (waist, photos; never weight) and the lifts.
   Talk to London opens a Claude chat that answers as him, carrying this week's training. */
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
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoOf(new Date());
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoOf(d); };
  const dowOf = (iso) => new Date(iso + "T12:00:00").getDay();
  const dayName = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
  const fmtDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const fmtShort = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const mondayOf = (iso) => addDays(iso, -((dowOf(iso) + 6) % 7));
  function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2600); }
  async function api(method, url, body) {
    const r = await fetch(url, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { location.href = "/"; throw new Error("signin"); }
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  const keep = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem("oggi.fit." + k) || "null"); v === null ? localStorage.removeItem("oggi.fit." + k) : localStorage.setItem("oggi.fit." + k, JSON.stringify(v)); } catch { return null; } };

  const FIT = window.FIT;
  const LIFT = ["UA", "LA", "UB", "LB"];
  const MODES = [["today", "Today"], ["week", "Week"], ["progress", "Progress"]];
  const modeFromPath = () => { const m = location.pathname.split("/")[2]; return MODES.some(([k]) => k === m) ? m : "today"; };
  const S = { data: null, mode: modeFromPath(), pick: null, open: {}, swaps: keep("swaps") || {}, finished: false };

  function london(text, label) {
    return h("div", { class: "roger" }, h("img", { src: "/icons/london.svg", alt: "London" }), h("div", { class: "say" }, h("small", { text: label || "London" }), text));
  }
  function modes() {
    const m = $("#modes"); m.textContent = "";
    for (const [k, t] of MODES) m.append(h("button", { type: "button", "aria-pressed": String(S.mode === k), text: t, onclick: () => go(k) }));
  }
  function go(k) { S.mode = k; history.pushState(null, "", k === "today" ? "/fit" : "/fit/" + k); render(); window.scrollTo(0, 0); }
  addEventListener("popstate", () => { S.mode = modeFromPath(); render(); });

  // ---------------- reading the log ----------------
  const sets = () => S.data.sets || [];
  const setsOn = (iso) => sets().filter((s) => s.date === iso);
  const sessionOn = (iso) => { const s = setsOn(iso).find((x) => x.session && x.session !== "Extra"); return s ? s.session : null; };
  const keyByName = (name) => LIFT.find((k) => FIT.sessions[k].name === name) || null;
  const logDay = (iso) => (S.data.days || []).find((d) => d.day === iso) || null;
  const habitsToday = () => ({ ...((S.data.today && S.data.today.habits) || {}), ...(S.draftHabits || {}) });
  const fmtW = (w) => (w == null ? "" : w < 0 ? `assist ${-w}` : w === 0 ? "bodyweight" : `${w} lb`);
  const roundTo = (x, inc) => { const st = inc || 5; return Math.round(x / st) * st; };
  const e1rm = (w, r) => (w > 0 ? w * (1 + r / 30) : w + r);   // assisted/bodyweight: less assist and more reps both count

  // Sessions done in the program week that holds iso (by session name; a make-up counts for its own session).
  function doneInWeek(iso) {
    const mon = mondayOf(iso), out = new Set();
    for (let i = 0; i < 7; i++) { const s = sessionOn(addDays(mon, i)); if (s) out.add(s); }
    return out;
  }
  // Lifting days earlier this week whose session never happened.
  function missedThisWeek(iso) {
    const mon = mondayOf(iso), done = doneInWeek(iso), out = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i); if (d >= iso) break;
      const k = FIT.schedule[dowOf(d)];
      if (LIFT.includes(k) && !done.has(FIT.sessions[k].name) && d >= FIT.start) out.push({ day: d, key: k });
    }
    return out;
  }
  function todaysKey() {
    const t = today(), logged = sessionOn(t);
    if (logged) return keyByName(logged);
    if (S.pick) return S.pick;
    const k = FIT.schedule[dowOf(t)];
    return LIFT.includes(k) && FIT.weekOf(t) > 0 ? k : null;
  }
  function histOf(exId) {
    const t = today(), byDate = {};
    for (const s of sets()) if (s.ex === exId && s.date < t) (byDate[s.date] = byDate[s.date] || []).push(s);
    return Object.keys(byDate).sort().map((d) => ({ date: d, sets: byDate[d].sort((a, b) => a.set - b.set) }));
  }
  // London's call for one exercise: the weight to use today and why.
  function suggest(e, ph) {
    const hist = histOf(e.id), last = hist[hist.length - 1];
    const n = ph.sets || e.sets;
    if (!last) return { w: null, n, line: `First time on this one. Pick a weight you could lift ${e.hi + 3} times and stop at ${e.hi}. Write it down; that's our starting line.` };
    const lw = last.sets[0].weight, reps = last.sets.map((s) => s.reps), total = reps.reduce((a, b) => a + b, 0);
    const lastStr = `${fmtShort(last.date)}: ${fmtW(lw)} × ${reps.join(", ")}`;
    if (ph.k === "deload") {
      const w = lw > 0 ? roundTo(lw * 0.9, e.inc) : lw;
      return { w, n, last: lastStr, line: `Lighter week. ${fmtW(w)}, two sets, clean reps, nothing grinding.` };
    }
    if (reps.every((r) => r >= e.hi) && last.sets.length >= Math.min(n, e.sets)) {
      if (!e.inc) return { w: lw, n, last: lastStr, line: "Top of the range every set. Add a two-second pause at the top of each rep." };
      const w = lw + e.inc;
      return { w, n, last: lastStr, up: true, line: `${reps.join(", ")} last time: all at the top. Go ${fmtW(w)} today. The reps will drop; that's fine.` };
    }
    if (reps[0] < e.lo) {
      const w = lw > 0 ? Math.max(0, lw - (e.inc || 5)) : lw - (e.inc || 10);
      return { w, n, last: lastStr, warn: true, line: `First set fell short of ${e.lo} last time. Drop to ${fmtW(w)} and own the range.` };
    }
    return { w: lw, n, last: lastStr, line: `Same ${fmtW(lw)}. Beat ${total} reps in total. One more rep anywhere counts.` };
  }

  // ---------------- saving ----------------
  async function saveSet(sk, e, setNo, weight, reps) {
    const t = today(), body = { d: t, date: t, session: FIT.sessions[sk].name, ex: e.id, exercise: e.name, set: setNo, weight, reps, week: FIT.weekOf(t) };
    const row = await api("POST", "/api/fit/set?d=" + t, body);
    const i = S.data.sets.findIndex((s) => s.key === row.key);
    if (i >= 0) S.data.sets[i] = row; else S.data.sets.push(row);
  }
  async function removeSet(key) {
    await api("POST", "/api/fit/set/remove?d=" + today(), { key });
    S.data.sets = S.data.sets.filter((s) => s.key !== key);
  }
  let habitTimer = null;
  function saveHabits(fields) {
    S.draftHabits = { ...(S.draftHabits || {}), ...(fields.habits || {}) };
    if ("water" in fields) S.draftWater = fields.water;
    if ("walkMin" in fields) S.draftWalk = fields.walkMin;
    clearTimeout(habitTimer);
    S.pendingHabits = { ...(S.pendingHabits || {}), ...fields, habits: { ...((S.pendingHabits || {}).habits || {}), ...(fields.habits || {}) } };
    habitTimer = setTimeout(async () => {
      const f = S.pendingHabits; S.pendingHabits = null;
      try { await api("POST", "/api/fit/habits?d=" + today(), { ...f, d: today() }); }
      catch { toast("Couldn't save to your Daily Log. Try again in a moment."); }
    }, 500);
  }

  // ---------------- rest timer ----------------
  let restEnd = 0, restT = null;
  function startRest(sec) {
    restEnd = Date.now() + sec * 1000; $("#rest").hidden = false; $("#rest").classList.remove("over");
    clearInterval(restT); tickRest(); restT = setInterval(tickRest, 250);
  }
  function tickRest() {
    const left = Math.round((restEnd - Date.now()) / 1000), el = $("#rest");
    $("#clk").textContent = (left < 0 ? "+" : "") + Math.floor(Math.abs(left) / 60) + ":" + pad(Math.abs(left) % 60);
    if (left <= 0 && !el.classList.contains("over")) { el.classList.add("over"); el.firstChild.textContent = "Go"; try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {} }
    if (left > 0) el.firstChild.textContent = "Rest";
    if (left < -90) stopRest();
  }
  function stopRest() { clearInterval(restT); $("#rest").hidden = true; }
  $("#restSkip").onclick = stopRest;
  $("#restPlus").onclick = () => { restEnd = Math.max(restEnd, Date.now()) + 30000; $("#rest").classList.remove("over"); tickRest(); };

  // ---------------- today ----------------
  function exercisesFor(sk) {
    const all = FIT.allExercises();
    return FIT.sessions[sk].ex.map((e) => {
      const alt = S.swaps[e.id]; return alt && all[alt] ? { ...all[alt], slot: e.id } : { ...e, slot: e.id };
    });
  }
  function sessionStreak() {
    // Lifting days in a row, going back from the last planned one, where the week's session happened.
    let n = 0, d = addDays(today(), sessionOn(today()) ? 0 : -1);
    for (let i = 0; i < 70; i++, d = addDays(d, -1)) {
      if (d < FIT.start) break;
      const k = FIT.schedule[dowOf(d)];
      if (!LIFT.includes(k)) continue;
      if (doneInWeek(d).has(FIT.sessions[k].name)) n++; else break;
    }
    return n;
  }
  function daysSinceLast() {
    const t = today(), past = sets().filter((s) => s.date < t).map((s) => s.date).sort();
    if (!past.length) return null;
    return Math.round((new Date(t + "T12:00:00") - new Date(past[past.length - 1] + "T12:00:00")) / 86400000);
  }
  function greeting(sk, ph, week) {
    const t = today(), hr = new Date().getHours(), s = FIT.sessions[sk];
    const logged = setsOn(t).length, gap = daysSinceLast(), streak = sessionStreak();
    if (logged) return `${s.name} under way. Keep the rests honest: two and a half minutes on the big lifts, a minute and a quarter on the small ones.`;
    let line;
    if (ph.k === "ramp") line = `${s.name} today. Week ${week}: two sets of each, and stop with three reps left in you. We are building the habit, not testing you.`;
    else if (ph.k === "deload") line = `Lighter week. ${s.name}, two sets, about ten per cent off, nothing grinding. This is where the last five weeks settle in.`;
    else line = `${s.name} today, week ${week}. Full sets now; stop with one or two left. ${s.focus} first, while you're fresh.`;
    if (gap != null && gap > 6) line += ` It's been ${gap} days. No guilt. We start where you are, a little lighter if you need it.`;
    else if (streak >= 4) line += ` That's ${streak} sessions in a row. Protect it.`;
    if (hr >= 19) line += " Late now. If it doesn't happen tonight, we move it to tomorrow; no harm done.";
    return line;
  }
  function sessionHead(sk, ph, week) {
    const s = FIT.sessions[sk], ex = exercisesFor(sk), t = today();
    const done = ex.filter((e) => setsOn(t).filter((x) => x.ex === e.id).length >= (ph.sets || e.sets)).length;
    return h("div", { class: "co-card" }, h("h3", null, "Today's session", h("span", { text: `about ${s.minutes} min` })),
      h("p", { class: "fit-title", text: s.name }), h("div", { class: "fit-sub", text: `${s.focus} · ${ex.length} exercises` }),
      h("span", { class: "fit-chip", text: `Week ${week} · ${ph.label}${ph.k === "full" ? "" : " · " + (ph.sets || "") + " sets"}` }),
      h("div", { class: "prog", style: "margin:12px 0 0" }, ...ex.map((e, i) => h("i", { class: i < done ? "on" : "" }))));
  }
  function exerciseCard(sk, e, ph, idx) {
    const t = today(), sug = suggest(e, ph), mine = setsOn(t).filter((x) => x.ex === e.id);
    const n = Math.max(sug.n + ((S.extra || {})[e.id] || 0), mine.length ? Math.max(...mine.map((x) => x.set)) : 0);
    const wrap = h("div", { class: "fx" + (mine.length >= sug.n ? " done" : "") });
    const slot = FIT.sessions[sk].ex.find((x) => x.id === e.slot) || e;
    wrap.append(h("div", { class: "fx-h" }, h("span", { class: "fx-n", text: e.name }), h("span", { class: "fx-t", text: `${sug.n} × ${e.lo}–${e.hi}` })));
    if (sug.last) wrap.append(h("div", { class: "fx-last", text: "Last · " + sug.last }));
    const note = h("div", { class: "fx-tip" + (sug.warn ? " warn" : ""), text: sug.line });
    wrap.append(note);
    const cueOpen = !!S.open[e.id];
    const links = h("div", { class: "fx-links" },
      h("button", { class: "textlink", type: "button", text: cueOpen ? "Hide how" : "How to do it", onclick: () => { S.open[e.id] = !cueOpen; render(); } }),
      slot.alts.length ? h("button", { class: "textlink", type: "button", text: "Swap", onclick: () => {
        const opts = [slot.id, ...slot.alts.map((a) => a.id)], cur = S.swaps[slot.id] || slot.id;
        const next = opts[(opts.indexOf(cur) + 1) % opts.length];
        if (next === slot.id) delete S.swaps[slot.id]; else S.swaps[slot.id] = next;
        keep("swaps", S.swaps); render();
      } }) : null);
    wrap.append(links);
    if (cueOpen) wrap.append(h("div", { class: "fx-cue" }, h("ul", null, ...e.cues.map((c) => h("li", { text: c })))));
    wrap.append(h("div", { class: "flbl" }, h("span", { text: "Set" }), h("span", { text: e.inc === 0 ? "lb (0 = body)" : "lb" }), h("span", { text: "Reps" }), h("span")));
    const box = h("div", { class: "fsets" });
    for (let i = 1; i <= n; i++) {
      const got = mine.find((x) => x.set === i);
      const w = h("input", { inputmode: "decimal", type: "text", "aria-label": `Set ${i} pounds`, value: got ? String(got.weight) : sug.w == null ? "" : String(sug.w), placeholder: "lb" });
      const r = h("input", { inputmode: "numeric", type: "text", "aria-label": `Set ${i} reps`, value: got ? String(got.reps) : "", placeholder: `${e.lo}–${e.hi}` });
      const tick = h("button", { class: "ftick" + (got ? " on" : ""), type: "button", "aria-label": got ? `Undo set ${i}` : `Log set ${i}`, text: "✓" });
      tick.onclick = async () => {
        tick.disabled = true;
        try {
          if (got) { await removeSet(got.key); render(); return; }
          const wv = Number(String(w.value).replace(/[^\d.-]/g, "")), rv = parseInt(r.value, 10);
          if (!Number.isFinite(wv) || String(w.value).trim() === "") { toast("Put the weight in first."); w.focus(); return; }
          if (!Number.isFinite(rv)) { toast("How many reps?"); r.focus(); return; }
          await saveSet(sk, e, i, wv, rv);
          S.live = { id: e.id, line: liveLine(e, sug, i, wv, rv) };
          if (i < n || idx < exercisesFor(sk).length - 1) startRest(e.kind === "big" ? FIT.rest.big : FIT.rest.small);
          render();
        } catch { toast("Couldn't save that set. Check the signal and tap again."); }
        finally { tick.disabled = false; }
      };
      // carry this set's weight into the empty ones below as he types
      w.addEventListener("change", () => { box.querySelectorAll(".fset").forEach((row, j) => { if (j + 1 > i) { const inp = row.querySelector("input"); if (!row.querySelector(".ftick.on")) inp.value = w.value; } }); });
      box.append(h("div", { class: "fset" }, h("b", { text: String(i) }), w, r, tick));
    }
    wrap.append(box);
    if (S.live && S.live.id === e.id && S.live.line) wrap.append(h("div", { class: "fx-tip", style: "margin:10px 0 0", text: S.live.line }));
    wrap.append(h("div", { style: "margin-top:8px" }, h("button", { class: "textlink", type: "button", text: "+ another set", onclick: () => {
      S.extra = { ...(S.extra || {}), [e.id]: ((S.extra || {})[e.id] || 0) + 1 }; render();
    } })));
    return wrap;
  }
  function liveLine(e, sug, setNo, w, r) {
    if (r > e.hi + 2 && e.inc) return `${r} is too easy. Add ${e.inc} for the next set.`;
    if (r < e.lo && setNo === 1) return `Heavy today. Take ${e.inc || 5} off and stay inside ${e.lo}–${e.hi}.`;
    if (r < e.lo) return `Fine. Fatigue is normal by set ${setNo}. Keep the weight; next time we beat it.`;
    if (r >= e.hi && setNo === 1 && sug.up === undefined) return `Top of the range on the first set. If the next ones get there too, we go up next time.`;
    return ["Good set.", "Clean. Breathe and go again.", "That's it. Same again.", "Solid."][(setNo + r) % 4];
  }
  // A finished session: what moved, against the last time he did it.
  function debrief(sk) {
    const t = today(), mine = setsOn(t), name = FIT.sessions[sk].name;
    const prev = sets().filter((s) => s.session === name && s.date < t);
    const lastDate = prev.length ? prev.map((s) => s.date).sort().pop() : null;
    const vol = (arr) => arr.reduce((a, s) => a + Math.max(0, s.weight) * s.reps, 0);
    const prs = [];
    const exIds = [...new Set(mine.map((s) => s.ex))];
    for (const id of exIds) {
      const best = Math.max(...mine.filter((s) => s.ex === id).map((s) => e1rm(s.weight, s.reps)));
      const before = sets().filter((s) => s.ex === id && s.date < t);
      if (before.length && best > Math.max(...before.map((s) => e1rm(s.weight, s.reps))) + 0.01) prs.push(mine.find((s) => s.ex === id).exercise);
    }
    const parts = [`That's ${name} done: ${mine.length} sets.`];
    if (prs.length) parts.push(`New bests on ${prs.length === 1 ? prs[0].toLowerCase() : prs.slice(0, -1).map((p) => p.toLowerCase()).join(", ") + " and " + prs[prs.length - 1].toLowerCase()}.`);
    if (lastDate) {
      const v1 = vol(mine), v0 = vol(prev.filter((s) => s.date === lastDate));
      if (v0 > 0) { const pct = Math.round((v1 / v0 - 1) * 100); parts.push(pct >= 2 ? `You moved ${pct}% more than last ${dayName(lastDate)}.` : pct <= -5 ? `A bit less than last ${dayName(lastDate)}; some days are like that. Showing up is the work.` : "Level with last time. Good."); }
    } else parts.push("First time through this one, so today is the line we beat.");
    const hb = habitsToday(), dow = dowOf(t);
    const todo = [];
    if (!hb["Walk"]) todo.push(`your ${FIT.walkGoal(dow)}-minute walk`);
    if (!hb["Protein every meal"]) todo.push("protein at dinner");
    if (todo.length) parts.push(`Still to do: ${todo.join(" and ")}.`);
    const nx = nextSession(t);
    if (nx) parts.push(`Next: ${FIT.sessions[nx.key].name} on ${dayName(nx.day)}.`);
    return parts.join(" ");
  }
  function nextSession(from) {
    for (let i = 1; i <= 7; i++) { const d = addDays(from, i), k = FIT.schedule[dowOf(d)]; if (LIFT.includes(k)) return { day: d, key: k }; }
    return null;
  }
  function habitsCard() {
    const t = today(), dow = dowOf(t), hb = habitsToday(), td = S.data.today || {};
    const walk = S.draftWalk != null ? S.draftWalk : td.walkMin || 0, water = S.draftWater != null ? S.draftWater : td.water || 0, goal = FIT.walkGoal(dow);
    const stepper = (val, goalN, step, max, onSet) => {
      const out = h("output", { class: val >= goalN ? "met" : "", text: String(val) });
      return h("div", { class: "step-n" },
        h("button", { type: "button", "aria-label": "Less", text: "−", onclick: () => onSet(Math.max(0, val - step)) }), out,
        h("button", { type: "button", "aria-label": "More", text: "+", onclick: () => onSet(Math.min(max, val + step)) }));
    };
    const card = h("div", { class: "co-card" }, h("h3", null, "Also today", h("span", { text: "saves to your Daily Log" })));
    card.append(h("div", { class: "fh-row" }, h("span", { class: "lab" }, "Walk", h("small", { text: `minutes · goal ${goal}` })),
      stepper(walk, goal, 5, 300, (v) => { saveHabits({ walkMin: v, habits: { Walk: v >= goal } }); render(); })));
    card.append(h("div", { class: "fh-row" }, h("span", { class: "lab" }, "Water", h("small", { text: "glasses · goal 8" })),
      stepper(water, 8, 1, 20, (v) => { saveHabits({ water: v }); render(); })));
    const grid = h("div", { class: "habits", style: "margin-top:12px" });
    for (const [k, label] of [["Protein every meal", "Protein every meal"], ["No sugary drinks", "No sugary drinks"], ["Veg at 2 meals", "Veg at 2 meals"], ["Bed by 10", "Bed by 10"]]) {
      const cb = h("input", { type: "checkbox" }); cb.checked = !!hb[k];
      cb.onchange = () => saveHabits({ habits: { [k]: cb.checked } });
      grid.append(h("label", null, cb, label));
    }
    card.append(grid);
    return card;
  }
  function today_(main) {
    const t = today(), week = FIT.weekOf(t), ph = FIT.phase(week), dow = dowOf(t), sk = todaysKey(), plan = FIT.schedule[dow];
    const label = "London · " + fmtDay(t);
    if (week <= 0 && !S.early) {
      const days = Math.round((new Date(FIT.start + "T12:00:00") - new Date(t + "T12:00:00")) / 86400000);
      main.append(london(`Welcome back, Eric. This week is the reset: walk every day, protein at every meal, eight glasses of water, no sugary drinks. Most of what the cruise put on is water and salt, and it leaves on its own. We lift ${days <= 1 ? "tomorrow" : "on Monday"}: Upper A, two easy sets of everything.`, label));
      main.append(habitsCard());
      const prev = h("div", { class: "co-card" }, h("h3", null, "Monday · Upper A", h("span", { text: "preview" })));
      for (const e of FIT.sessions.UA.ex) prev.append(h("p", { style: "margin:0 0 6px" }, h("b", { text: e.name }), h("span", { class: "fit-sub", text: ` · 2 × ${e.lo}–${e.hi}` })));
      prev.append(h("div", { class: "co-acts" }, h("span", { class: "quiet", text: "Itching to start?" }), h("button", { class: "btn ghost small", type: "button", text: "Train today anyway", onclick: () => { S.pick = "UA"; S.early = true; render(); } })));
      main.append(prev); talk(main); return;
    }
    const eff = week <= 0 ? FIT.phase(1) : ph;
    if (!sk) {
      const missed = missedThisWeek(t);
      let line;
      if (plan === "checkin") line = "Sunday. Before breakfast: tape at the navel, two photos, same spot, same light. Then rest. Rest is where you grow.";
      else line = `No lifting today. Walk ${FIT.walkGoal(dow)} minutes; it does more for the waist than any extra cardio. Easy pace, nose breathing.`;
      if (missed.length) line += ` You missed ${FIT.sessions[missed[missed.length - 1].key].name} on ${dayName(missed[missed.length - 1].day)}. If you have the hour, do it today; the walk can come after.`;
      main.append(london(line, label));
      if (missed.length) {
        const m = missed[missed.length - 1];
        main.append(h("div", { class: "co-card" }, h("h3", { text: "Make it up" }), h("p", { class: "fit-title", text: FIT.sessions[m.key].name }),
          h("div", { class: "fit-sub", text: `Missed ${fmtDay(m.day)} · ${FIT.sessions[m.key].focus}` }),
          h("div", { class: "co-acts" }, h("span"), h("button", { class: "btn teal", type: "button", text: "Do it today", onclick: () => { S.pick = m.key; render(); window.scrollTo(0, 0); } }))));
      }
      if (plan === "checkin") main.append(h("div", { class: "co-card" }, h("h3", { text: "Sunday check-in" }), h("p", { text: "Waist and photos take two minutes." }),
        h("div", { class: "co-acts" }, h("span"), h("button", { class: "btn teal", type: "button", text: "Open the check-in", onclick: () => go("progress") }))));
      main.append(habitsCard());
      talk(main); return;
    }
    const finishedNow = S.finished || (setsOn(t).length && habitsToday()["Workout"]);
    main.append(london(finishedNow ? debrief(sk) : greeting(sk, eff, Math.max(week, 1)), label));
    main.append(sessionHead(sk, eff, Math.max(week, 1)));
    const card = h("div", { class: "co-card" }, h("h3", null, "Lift", h("span", { text: "tick a set to start the rest" })));
    exercisesFor(sk).forEach((e, i) => card.append(exerciseCard(sk, e, eff, i)));
    main.append(card);
    main.append(habitsCard());
    main.append(h("div", { class: "co-acts" },
      S.pick && !setsOn(t).length ? h("button", { class: "textlink", type: "button", text: "Not today", onclick: () => { S.pick = null; S.early = false; render(); } }) : h("span"),
      h("button", { class: "btn teal", type: "button", text: finishedNow ? "Session saved ✓" : "Finish session", onclick: async () => {
        if (!setsOn(t).length) { toast("Log at least one set first."); return; }
        stopRest(); S.finished = true; saveHabits({ habits: { Workout: true } }); render(); window.scrollTo(0, 0);
      } })));
    talk(main);
  }

  // ---------------- week ----------------
  function weekTiles(mon, isThis) {
    const t = today(), grid = h("div", { class: "fweek" });
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i), k = FIT.schedule[dowOf(d)], ses = sessionOn(d), ld = logDay(d) || (d === t ? { walkMin: S.draftWalk ?? (S.data.today || {}).walkMin, habits: habitsToday() } : null);
      let s, m, cls = "fday";
      if (LIFT.includes(k)) {
        s = ses || FIT.sessions[k].name;
        if (ses) { m = "done"; cls += " done"; } else if (d < t && d >= FIT.start) { const made = doneInWeek(d).has(FIT.sessions[k].name); m = made ? "made up" : "missed"; cls += made ? " done" : " miss"; } else m = d === t ? "today" : "";
      } else if (k === "checkin") {
        s = "Check"; const c = (S.data.checkins || []).find((x) => x.day === d); m = c ? "done" : d < t ? "—" : ""; if (c) cls += " done";
        if (ses) { s = ses; m = "extra"; cls += " done"; }
      } else {
        s = k === "walk45" ? "Walk 45" : "Walk"; const wm = ld && ld.walkMin; m = wm ? wm + " min" : d < t ? "—" : `${FIT.walkGoal(dowOf(d))} min`;
        if (wm && wm >= FIT.walkGoal(dowOf(d))) cls += " done";
        if (ses) { s = ses; m = "made up"; cls += " done"; }
      }
      if (d === t) cls += " today";
      grid.append(h("div", { class: cls }, h("div", { class: "d", text: new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }) }), h("div", { class: "s", text: s }), h("div", { class: "m", text: m || "" })));
    }
    return grid;
  }
  function streakOf(habit) {
    let n = 0; const t = today();
    const days = [...(S.data.days || [])].sort((a, b) => (a.day < b.day ? 1 : -1));
    for (const d of days) { const v = d.day === t ? habitsToday()[habit] : d.habits[habit]; if (d.day === t && !v) continue; if (v) n++; else break; }
    return n;
  }
  function week_(main) {
    const t = today(), mon = mondayOf(t), lastMon = addDays(mon, -7), week = FIT.weekOf(t);
    const lastDone = doneInWeek(lastMon).size, walksLast = [...Array(7)].map((_, i) => addDays(lastMon, i)).filter((d) => { const l = logDay(d); return l && l.walkMin >= FIT.walkGoal(dowOf(d)); }).length;
    let line;
    if (week <= 0) line = "Nothing to count yet. This week is walks and protein; the lifting starts Monday.";
    else if (lastMon < FIT.start) line = `Week ${week}. Four sessions, two long walks, one check-in. That's the whole job.`;
    else if (lastDone >= 4) line = `${lastDone} for 4 last week${walksLast >= 5 ? ", and the walks were there too" : ""}. That's what a comeback looks like. Same again; the weights go up when the reps tell us to.`;
    else if (lastDone >= 2) line = `${lastDone} of 4 last week. Not bad, not the plan. Pick the day that broke and protect it this week.`;
    else line = `${lastDone} of 4 last week. Life happens. This week, just get the first two in and we'll build from there.`;
    main.append(london(line, `London · Week ${Math.max(week, 0)}${week > 0 ? " of " + FIT.weeks : ""}`));
    if (lastMon >= addDays(FIT.start, -7)) main.append(h("div", { class: "co-card" }, h("h3", null, "Last week", h("span", { text: `${fmtShort(lastMon)} – ${fmtShort(addDays(lastMon, 6))}` })), weekTiles(lastMon)));
    main.append(h("div", { class: "co-card" }, h("h3", null, "This week", h("span", { text: `${fmtShort(mon)} – ${fmtShort(addDays(mon, 6))}` })), weekTiles(mon, true)));
    const total = new Set(sets().map((s) => s.date)).size;
    const st = [["Sessions in a row", sessionStreak()], ["Sessions logged", total], ["Walk", streakOf("Walk")], ["Protein every meal", streakOf("Protein every meal")], ["No sugary drinks", streakOf("No sugary drinks")]];
    main.append(h("div", { class: "co-card" }, h("h3", { text: "Streaks" }), h("div", { class: "streaks" }, ...st.map(([k, n]) => h("span", null, k + " · ", h("b", { text: String(n) + (/Sessions/.test(k) ? "" : n === 1 ? " day" : " days") }))))));
    talk(main);
  }

  // ---------------- progress ----------------
  function waistChart(cs) {
    const pts = cs.filter((c) => c.waist != null);
    if (pts.length < 2) return null;
    const W = 320, H = 110, xs = (i) => 20 + (i * (W - 40)) / (pts.length - 1);
    const lo = Math.min(...pts.map((p) => p.waist)), hi = Math.max(...pts.map((p) => p.waist)), span = Math.max(0.5, hi - lo);
    const ys = (v) => 14 + ((hi + (span - (hi - lo)) / 2 - v) / span) * 70;
    const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", "100%"); svg.setAttribute("height", String(H)); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Waist over time");
    const el = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.append(e); return e; };
    el("polyline", { points: pts.map((p, i) => `${xs(i)},${ys(p.waist)}`).join(" "), fill: "none", stroke: "#1F5F63", "stroke-width": "3", "stroke-linecap": "round", "stroke-linejoin": "round" });
    const every = Math.ceil(pts.length / 6);
    pts.forEach((p, i) => {
      el("circle", { cx: xs(i), cy: ys(p.waist), r: "4.5", fill: "#fff", stroke: "#1F5F63", "stroke-width": "2.5" });
      if (i % every === 0 || i === pts.length - 1) { const tx = el("text", { x: xs(i), y: H - 2, "text-anchor": "middle", "font-size": "11", fill: "#B4B3A8" }); tx.textContent = fmtShort(p.day); }
    });
    return svg;
  }
  function progress_(main) {
    const t = today(), cs = [...(S.data.checkins || [])].sort((a, b) => (a.day < b.day ? -1 : 1)), withW = cs.filter((c) => c.waist != null);
    const first = withW[0], last = withW[withW.length - 1];
    let line;
    if (!withW.length) line = "No scale here, on purpose. Waist, photos and the bar tell the truth. Measure at the navel on Sunday morning before breakfast; that first number is our starting line.";
    else if (withW.length === 1) line = `Starting line: ${last.waist}″ on ${fmtShort(last.day)}. Same tape, same spot, next Sunday.`;
    else {
      const d = +(last.waist - first.waist).toFixed(2), recent = withW.slice(-3);
      const flat = recent.length === 3 && Math.abs(recent[2].waist - recent[0].waist) < 0.13;
      line = d < 0 ? `Waist is down ${Math.abs(d)}″ since ${fmtShort(first.day)}${liftsUp() ? ", and the main lifts are up. That's fat coming off, not muscle. Keep going." : ". Keep going."}` : `Waist is ${d === 0 ? "level" : "up " + d + "″"} since ${fmtShort(first.day)}.`;
      if (flat) line += " Three Sundays without a change, so one adjustment: carbs down to one hand on rest days, or ten more minutes of walking. Just one.";
    }
    main.append(london(line, "London · " + (dowOf(t) === 0 ? "Sunday check-in" : "Progress")));
    // the check-in form: this Sunday's row, or the coming one
    const sunday = dowOf(t) === 0 ? t : addDays(t, 7 - dowOf(t));
    const mine = cs.find((c) => c.day === t);
    const wIn = h("input", { class: "co-field", type: "text", inputmode: "decimal", placeholder: last ? `Last: ${last.waist}″` : "Waist at the navel, inches", value: mine && mine.waist != null ? String(mine.waist) : "" });
    const ph = h("input", { type: "checkbox" }); ph.checked = !!(mine && mine.photos);
    const note = h("input", { class: "co-field", type: "text", placeholder: "Anything worth noting (optional)", value: mine ? mine.note : "" });
    const card = h("div", { class: "co-card" }, h("h3", null, dowOf(t) === 0 ? "Today's check-in" : "Check-in", h("span", { text: dowOf(t) === 0 ? "before breakfast" : `next one ${fmtDay(sunday)}` })),
      h("div", { class: "fform" }, wIn, h("label", { class: "cb" }, ph, "Front and side photos taken (they stay on your phone)"), note,
        h("div", { class: "co-acts" }, h("span", { class: "quiet", text: "No weight here. On purpose." }), h("button", { class: "btn teal", type: "button", text: mine ? "Update" : "Save check-in", onclick: async () => {
          const v = String(wIn.value).replace(/[^\d.]/g, "");
          if (v && (+v < 15 || +v > 80)) { toast("That waist looks off. Inches at the navel."); return; }
          try {
            const row = await api("POST", "/api/fit/checkin?d=" + t, { d: t, day: t, waist: v === "" ? null : +v, photos: ph.checked, note: note.value.trim() });
            S.data.checkins = (S.data.checkins || []).filter((c) => c.day !== row.day).concat(row); toast("Saved. See you next Sunday."); render();
          } catch { toast("Couldn't save the check-in. Try again in a moment."); }
        } }))));
    main.append(card);
    if (last) {
      const chart = waistChart(cs);
      const delta = first && last !== first ? +(last.waist - first.waist).toFixed(2) : 0;
      main.append(h("div", { class: "co-card" }, h("h3", null, "Waist at the navel", h("span", { text: "Sunday mornings" })),
        h("div", { class: "fbig" }, `${last.waist}″`, delta ? h("small", { text: `${delta > 0 ? "+" : "−"}${Math.abs(delta)}″ since ${fmtShort(first.day)}` }) : null), chart));
    }
    const lifts = liftRows();
    if (lifts.length) main.append(h("div", { class: "co-card flifts" }, h("h3", null, "Main lifts", h("span", { text: "best set, first → latest" })),
      ...lifts.map((l) => h("p", null, h("span", { text: l.name }), h("em", { text: l.text })))));
    const photosDone = cs.filter((c) => c.photos).length;
    main.append(h("div", { class: "co-card" }, h("h3", { text: "Photos" }),
      h("p", { text: photosDone ? `${photosDone} Sunday${photosDone === 1 ? "" : "s"} of photos so far. Compare the first and the latest side by side in your camera roll, same light, every four weeks.` : "Front and side, same spot, same light, Sunday morning. They stay in your camera roll; nothing is uploaded." })));
    talk(main);
  }
  function liftRows() {
    const out = [];
    for (const sk of LIFT) for (const e of FIT.sessions[sk].ex.filter((x) => x.kind === "big").slice(0, 2)) {
      const hist = histOf(e.id).concat(setsOn(today()).filter((s) => s.ex === e.id).length ? [{ date: today(), sets: setsOn(today()).filter((s) => s.ex === e.id) }] : []);
      if (hist.length < 1) continue;
      const best = (hs) => hs.sets.reduce((b, s) => (e1rm(s.weight, s.reps) > e1rm(b.weight, b.reps) ? s : b));
      const a = best(hist[0]), z = best(hist[hist.length - 1]);
      out.push({ name: e.name.replace(/ \(.*\)/, ""), up: e1rm(z.weight, z.reps) > e1rm(a.weight, a.reps), text: hist.length === 1 ? `${fmtW(a.weight)} × ${a.reps}` : `${fmtW(a.weight)} × ${a.reps} → ${fmtW(z.weight)} × ${z.reps}` });
    }
    return out;
  }
  function liftsUp() { const r = liftRows(); return r.length && r.filter((x) => x.up).length >= Math.ceil(r.length / 2); }

  // ---------------- talk to London ----------------
  function talkPrompt() {
    const t = today(), week = FIT.weekOf(t), ph = FIT.phase(week), mon = mondayOf(t);
    const done = [...doneInWeek(t)].join(", ") || "none yet";
    const lastDate = sets().map((s) => s.date).sort().pop();
    let lastStr = "none yet";
    if (lastDate) {
      const by = {}; for (const s of setsOn(lastDate)) (by[s.exercise] = by[s.exercise] || []).push(`${fmtW(s.weight)}×${s.reps}`);
      lastStr = `${sessionOn(lastDate) || "session"} on ${fmtDay(lastDate)}: ` + Object.entries(by).map(([k, v]) => `${k} ${v.join(", ")}`).join("; ");
    }
    const cs = (S.data.checkins || []).filter((c) => c.waist != null).sort((a, b) => (a.day < b.day ? -1 : 1));
    const waist = cs.length ? cs.map((c) => `${fmtShort(c.day)} ${c.waist}″`).join(", ") : "no check-ins yet";
    const missed = missedThisWeek(t).map((m) => `${FIT.sessions[m.key].name} (${dayName(m.day)})`).join(", ") || "none";
    return [
      "You are London, Eric's fitness coach in his Oggi app: a former European gymnastics champion in his fifties, now a coach. Calm, direct, warm underneath, short sentences, numbers first, no hype and no emojis.",
      `Eric is on the Lean & Aesthetic 4-day plan (Notion: Health and Wellness → "Lean & Aesthetic: 4-Day Plan"): Upper A Monday, Lower A Tuesday, Upper B Thursday, Lower B Friday, walks Wednesday and Saturday (45 min), Sunday check-in with waist and photos, never the scale. Food is plate rules: 2 palms protein, 2 fists veg, 1–2 cupped hands carbs, 1 thumb fat.`,
      `Today is ${fmtDay(t)}, program week ${week} (${ph.label}). Sessions done this week: ${done}. Missed this week: ${missed}.`,
      `Last session: ${lastStr}.`,
      `Waist check-ins: ${waist}.`,
      "Answer Eric's question as London. If the advice changes the program (an exercise, sets, reps, schedule), say exactly what to change so Claude can update public/fit-data.js in the oggi repo. If he describes pain beyond normal soreness, tell him to stop that movement and see a doctor.",
      "Eric's question: ",
    ].join("\n\n");
  }
  function talk(main) {
    main.append(h("div", { class: "fit-talk" }, h("a", { class: "btn ghost", href: "https://claude.ai/new?q=" + encodeURIComponent(talkPrompt()), target: "_blank", rel: "noopener", text: "Talk to London" }),
      h("p", { text: "Opens a Claude chat that answers as London, with this week's training." })));
  }

  // ---------------- shell ----------------
  function render() {
    modes();
    const main = $("#main"); main.textContent = "";
    if (!S.data) { main.append(h("p", { class: "quiet", text: "One moment…" })); return; }
    if (S.data.error === "share") { main.append(london("I can't see the Workout Log yet. In Notion, open Medicare Marketing → Fit → ••• → Connections → add oggi, then refresh.")); return; }
    if (S.data.error) { main.append(london("I couldn't reach Notion just now. Pull to refresh in a moment.")); return; }
    if (S.mode === "week") week_(main); else if (S.mode === "progress") progress_(main); else today_(main);
  }
  async function load() {
    try {
      const me = await (await fetch("/auth/me", { credentials: "same-origin" })).json();
      if (!me.signedIn) { location.href = "/"; return; }
      S.data = await api("GET", "/api/fit?d=" + today());
      if (S.data.start) FIT.start = S.data.start;   // demo data runs its own calendar
    } catch (e) { if (e.message !== "signin") S.data = { error: "load" }; }
    render();
  }
  render(); load();
})();
