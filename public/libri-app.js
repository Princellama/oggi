/* Oggi · /libri — Eric's books. The shelf is a grid of covers; a cover opens the book:
   Takeaways (Claude's idea of each chapter, with what Eric told Roger when he applied it),
   My lines (the ones he captured, plus a box to add one), Notes (his evening reading notes) and a Quiz
   on the chapters he has finished. Claude's libri skill writes the takeaways, quizzes and covers. */
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
  const fmtDay = (iso) => iso ? new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
  const chNo = (t) => { const m = String(t || "").match(/(\d+)/); return m ? Number(m[1]) : 0; };
  function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2200); }
  async function api(method, url, body) {
    const r = await fetch(url, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { location.href = "/"; throw new Error("signin"); }
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  const S = { shelf: null, book: null, tab: "takeaways", quiz: null };
  const shortTitle = (t) => String(t || "").split(":")[0];

  // A cover: the image when there is one, otherwise a cloth-bound plain cover in a colour from the title.
  const HUES = ["#2F5F8C", "#7A3B2E", "#3E7A57", "#8C6A1F", "#5B4A7A", "#2E2C27", "#9A4F3A"];
  function cover(b, ribbon) {
    const hue = HUES[[...String(b.title)].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];
    const plain = h("div", { class: "plain", style: `background:${hue}` }, h("b", { text: shortTitle(b.title) }), h("small", { text: b.author || "" }));
    const box = h("div", { class: "cover" }, plain);
    if (b.cover) {
      const img = h("img", { src: b.cover, alt: "", loading: "lazy" });
      img.addEventListener("load", () => { if (img.naturalWidth > 2) plain.remove(); else img.remove(); });
      img.addEventListener("error", () => img.remove());
      box.prepend(img);
    }
    if (ribbon) box.append(h("span", { class: "ribbon", text: ribbon }));
    return box;
  }

  // ---------------- the shelf ----------------
  function shelf(main) {
    const books = S.shelf.books || [];
    if (!books.length) { main.append(h("p", { class: "empty", text: "No books yet. Tell Claude what you're reading and it will add it." })); return; }
    const groups = [["Reading", "Reading now"], ["Want to read", "Up next"], ["Finished", "Finished"], ["Set aside", "Set aside"]];
    for (const [st, label] of groups) {
      const list = books.filter((b) => b.status === st);
      if (!list.length) continue;
      main.append(h("h2", { class: "sec", text: label }));
      const grid = h("div", { class: "shelf" });
      for (const b of list) {
        const ribbon = st === "Reading" && b.chapterNo ? "Ch " + b.chapterNo : st === "Finished" ? "✓" : null;
        const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
        const counts = [b.takeaways ? pl(b.takeaways, "idea") : null, b.captured ? pl(b.captured, "line") : null, b.applied ? `${b.applied} applied` : null, b.quizCount ? "Quiz" : null].filter(Boolean);
        grid.append(h("a", { class: "book", href: "/libri/" + b.id, onclick: (ev) => { ev.preventDefault(); open(b.id); } },
          cover(b, ribbon),
          h("span", { class: "t", text: shortTitle(b.title) }),
          h("span", { class: "m", text: [b.author, b.format].filter(Boolean).join(" · ") }),
          counts.length ? h("span", { class: "counts" }, counts.map((c) => h("span", { text: c }))) : null));
      }
      main.append(grid);
    }
  }

  // ---------------- one book ----------------
  function bookPage(main) {
    const { book: b, quotes, log, quiz, quizLocked } = S.book;
    const takeaways = quotes.filter((q) => q.kind === "Takeaway");
    const mine = quotes.filter((q) => q.kind !== "Takeaway");
    main.append(h("div", { class: "bk-head" }, cover(b),
      h("div", null,
        h("h1", { text: b.title }),
        h("p", { text: b.author }),
        h("div", { class: "chips" },
          h("span", { class: "chip on", text: b.status }),
          b.status === "Reading" && b.chapter ? h("span", { class: "chip", text: b.chapter }) : null,
          b.format ? h("span", { class: "chip", text: b.format }) : null,
          b.quizBest != null ? h("span", { class: "chip", text: `Quiz best ${b.quizBest}%` }) : null))));
    const tabs = [["takeaways", "Ideas", takeaways.length], ["mine", "My lines", mine.length], ["notes", "Notes", log.length], ["quiz", "Quiz", quiz.length]];
    main.append(h("nav", { class: "tabs" }, tabs.map(([k, t, n]) => h("button", { type: "button", "aria-pressed": String(S.tab === k), onclick: () => { S.tab = k; S.quiz = null; render(); } }, t, n ? h("b", { text: String(n) }) : null))));
    if (S.tab === "takeaways") ideas(main, takeaways, b);
    else if (S.tab === "mine") lines(main, mine, b);
    else if (S.tab === "notes") notes(main, log);
    else quizView(main, quiz, quizLocked, b);
  }
  function appliedBox(a) {
    return h("div", { class: "applied" }, h("img", { src: "/icons/roger.svg", alt: "" }),
      h("div", null, h("small", { text: "You told Roger" + (a.day ? " · " + fmtDay(a.day) : "") }), a.text));
  }
  function point(q, mineKind) {
    const fav = h("button", { class: "fav", type: "button", title: "Favorite", "aria-pressed": String(!!q.favorite), text: q.favorite ? "★" : "☆",
      onclick: async () => { const v = !q.favorite; try { await api("PATCH", "/api/libri/quote/" + q.id, { favorite: v }); q.favorite = v; fav.textContent = v ? "★" : "☆"; fav.setAttribute("aria-pressed", String(v)); toast(v ? "Favorite: it'll come back more often." : "Unstarred."); } catch { toast("Couldn't save that."); } } });
    return h("div", { class: "pt" + (mineKind ? " mine" : "") }, fav,
      h("span", { class: "kind", text: mineKind ? (q.page ? `Your line · p. ${q.page}` : "Your line") : "The idea" }),
      h("p", { class: "idea", text: q.text }),
      q.speaker ? h("p", { class: "why", text: "— " + q.speaker }) : null,
      q.why ? h("p", { class: "why", text: q.why }) : null,
      (q.applied || []).map(appliedBox));
  }
  function byChapter(list) {
    const m = new Map();
    for (const q of list) { const k = chNo(q.chapter); if (!m.has(k)) m.set(k, []); m.get(k).push(q); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }
  function ideas(main, list, b) {
    if (!list.length) { main.append(h("p", { class: "empty", text: "No ideas yet. Ask Claude to summarize the chapters you've read, and one idea per chapter lands here." })); return; }
    for (const [ch, qs] of byChapter(list)) {
      main.append(h("section", { class: "ch" }, h("h3", { text: ch ? "Chapter " + ch : "Whole book" }, ch === b.chapterNo && b.status === "Reading" ? h("span", { class: "chip", text: "You're here" }) : null),
        qs.map((q) => point(q, false)),
        qs.some((q) => (q.applied || []).length) ? null : h("p", { class: "ask-roger", text: "Roger will ask how you used this one." })));
    }
  }
  function lines(main, list, b) {
    const ta = h("textarea", { class: "co-field", placeholder: "A line you want to keep, word for word." });
    const ch = h("input", { class: "co-field", placeholder: "Chapter", value: b.chapterNo ? String(b.chapterNo) : "", inputmode: "numeric" });
    const pg = h("input", { class: "co-field", placeholder: "Page or time" });
    const why = h("input", { class: "co-field", placeholder: "Why it hit (optional)" });
    main.append(h("div", { class: "add" }, ta, h("div", { class: "row" }, ch, pg), h("div", { style: "margin-top:8px" }, why),
      h("div", { class: "co-acts" }, h("span"), h("button", { class: "btn small", type: "button", text: "Keep it", onclick: async (ev) => {
        const text = ta.value.trim(); if (!text) { ta.focus(); return; }
        ev.target.disabled = true;
        try { const q = await api("POST", `/api/libri/${b.id}/quote`, { text, chapter: ch.value.trim(), page: pg.value.trim(), why: why.value.trim() }); S.book.quotes.push(q); toast("Kept."); render(); }
        catch { ev.target.disabled = false; toast("Couldn't save to Notion."); }
      } }))));
    if (!list.length) { main.append(h("p", { class: "empty", text: "Nothing captured yet. A line from the book goes here exactly as you write it." })); return; }
    for (const [c, qs] of byChapter(list)) main.append(h("section", { class: "ch" }, h("h3", { text: c ? "Chapter " + c : "Anywhere" }), qs.map((q) => point(q, true))));
  }
  function notes(main, log) {
    if (!log.length) { main.append(h("p", { class: "empty", text: "Your evening reading notes with Roger will collect here." })); return; }
    for (const d of log) main.append(h("div", { class: "note" },
      h("small", { text: [fmtDay(d.day), d.chapter && !/^\s*$/.test(d.chapter) ? (chNo(d.chapter) ? "Ch " + chNo(d.chapter) : d.chapter) : null].filter(Boolean).join(" · ") }),
      d.notes ? h("p", { text: d.notes }) : null,
      d.apply ? h("p", { class: "told" }, h("b", { text: d.point ? "Roger asked about: " : "You told Roger: " }), d.point ? d.point : d.apply) : null,
      d.apply && d.point ? h("p", { class: "told" }, h("b", { text: "You said: " }), d.apply) : null));
  }

  // ---------------- quiz ----------------
  function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
  function quizView(main, quiz, locked, b) {
    if (!quiz.length) {
      main.append(h("p", { class: "empty", text: locked ? `The quiz opens as you finish chapters. ${locked} question${locked === 1 ? "" : "s"} waiting.` : "No quiz yet. Ask Claude to write one for the chapters you've finished." }));
      return;
    }
    if (!S.quiz) {
      main.append(h("div", { class: "qz score" },
        h("p", { class: "big", text: String(quiz.length) }),
        h("p", { text: `questions on chapters ${[...new Set(quiz.map((q) => chNo(q.ch)))].sort((x, y) => x - y).join(", ")}` }),
        b.quizBest != null ? h("p", { class: "empty", text: `Best so far: ${b.quizBest}%${b.quizTaken ? " · " + fmtDay(b.quizTaken) : ""}` }) : null,
        locked ? h("p", { class: "empty", text: `${locked} more unlock as you read on.` }) : null,
        h("button", { class: "btn", type: "button", text: "Start", onclick: () => { S.quiz = { qs: shuffle(quiz), i: 0, marks: [], picked: null }; render(); } })));
      return;
    }
    const Q = S.quiz;
    if (Q.i >= Q.qs.length) {
      const right = Q.marks.filter(Boolean).length, pct = Math.round((right / Q.qs.length) * 100);
      if (!Q.saved) { Q.saved = true; api("POST", `/api/libri/${b.id}/quiz`, { pct, d: today() }).then((r) => { b.quizBest = r.best; b.quizTaken = today(); }).catch(() => toast("Score not saved.")); }
      const line = pct === 100 ? "Every one. You know this book." : pct >= 70 ? "Solid. The few you missed are worth a second listen." : "Good start. Listen back to the chapters you missed, then try again.";
      main.append(h("div", { class: "qz score" },
        h("div", { class: "dots" }, Q.marks.map((m) => h("i", { class: m ? "r" : "w" }))),
        h("p", { class: "big", text: pct + "%" }), h("p", { text: `${right} of ${Q.qs.length} · ${line}` }),
        h("div", { class: "co-acts" }, h("button", { class: "textlink", type: "button", text: "Back to the book", onclick: () => { S.quiz = null; S.tab = "takeaways"; render(); } }),
          h("button", { class: "btn", type: "button", text: "Again", onclick: () => { S.quiz = { qs: shuffle(quiz), i: 0, marks: [], picked: null }; render(); } }))));
      return;
    }
    const q = Q.qs[Q.i];
    const box = h("div", { class: "qz step" },
      h("div", { class: "dots" }, Q.qs.map((_, k) => h("i", { class: k < Q.i ? (Q.marks[k] ? "r" : "w") : k === Q.i ? "c" : "" }))),
      h("p", { class: "meta" }, h("span", { text: "Chapter " + chNo(q.ch) }), h("span", { text: `${Q.i + 1} of ${Q.qs.length}` })),
      h("h3", { text: q.q }));
    const opts = h("div", { class: "opts" });
    q.options.forEach((o, k) => opts.append(h("button", { type: "button", text: o, disabled: Q.picked != null,
      class: Q.picked == null ? null : k === q.answer ? "right" : k === Q.picked ? "wrong" : null,
      onclick: () => { if (Q.picked != null) return; Q.picked = k; Q.marks[Q.i] = k === q.answer; render(); } })));
    box.append(opts);
    if (Q.picked != null) {
      const ok = Q.picked === q.answer;
      box.append(h("p", { class: "because" }, h("b", { class: ok ? null : "no", text: ok ? "Right. " : "Not quite. " }), q.why || ""),
        h("div", { class: "co-acts" }, h("span"), h("button", { class: "btn", type: "button", text: Q.i + 1 < Q.qs.length ? "Next" : "See score", onclick: () => { Q.i++; Q.picked = null; render(); } })));
    }
    main.append(box);
  }

  // ---------------- routing ----------------
  function render() {
    const main = $("#main"); main.textContent = "";
    const back = $("#back");
    if (S.book) { back.textContent = "← Libri"; back.href = "/libri"; back.onclick = (ev) => { ev.preventDefault(); history.pushState(null, "", "/libri"); S.book = null; S.quiz = null; load(); }; bookPage(main); }
    else { back.textContent = "← Oggi"; back.href = "/"; back.onclick = null; shelf(main); }
  }
  async function open(id) {
    history.pushState(null, "", "/libri/" + id);
    S.tab = "takeaways"; S.quiz = null;
    await load();
    window.scrollTo(0, 0);
  }
  async function load() {
    const id = (location.pathname.match(/^\/libri\/([^/]+)/) || [])[1];
    try {
      if (id) { S.book = await api("GET", "/api/libri/" + encodeURIComponent(id)); document.title = shortTitle(S.book.book.title) + " · Libri"; }
      else { S.book = null; S.shelf = await api("GET", "/api/libri"); document.title = "Libri · Oggi"; }
      render();
    } catch (e) {
      if (e.message === "signin") return;
      $("#main").textContent = "";
      $("#main").append(h("p", { class: "empty", text: "I couldn't reach Notion just now. Pull to refresh in a moment." }));
    }
  }
  window.addEventListener("popstate", () => { S.quiz = null; load(); });
  load();
})();
