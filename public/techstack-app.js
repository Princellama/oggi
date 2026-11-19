/* Oggi · /techstack — Claude skills (each with its flow diagram), the apps Eric built, and his software and SaaS.
   Everything is read live from Notion (Apps & AI Projects, Tech Stack Inventory), so a skill Claude adds or changes
   shows up here by itself. A thumbnail opens the diagram full screen: tap it for actual size, ← → for the next one. */
(function () {
  "use strict";
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
  function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2200); }
  async function api(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (r.status === 401) { location.href = "/"; throw new Error("signin"); }
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  const imgUrl = (r) => `/api/techstack/img/${encodeURIComponent(r.id)}?v=${encodeURIComponent(r.edited || "")}`;
  const AREAS = ["Medicare", "Daily work", "Personal & JIRO"];
  const S = { data: null, tab: "all", q: "" };
  try { S.tab = localStorage.getItem("ts-tab") || "all"; } catch (e) { /* private window */ }

  const fmtAgo = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); };
  const money = (n) => (n == null ? "" : "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "/mo");
  const fmtDay = (iso) => (iso ? new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
  const hit = (r) => !S.q || [r.title, r.name, r.slug, r.what, r.triggers, r.purpose, r.category, (r.stack || []).join(" ")].join(" ").toLowerCase().includes(S.q);

  // ---------- cards ----------
  function card(r, gallery) {
    const thumb = r.hasImg
      ? h("button", { class: "ts-thumb", type: "button", "aria-label": `Open the ${r.title} diagram`, onclick: () => openLb(gallery, gallery.indexOf(r)) },
          h("img", { src: imgUrl(r), alt: "", loading: "lazy", decoding: "async" }), h("span", { class: "zoom", text: "⤢ View" }))
      : h("div", { class: "ts-thumb none" }, h("span", { text: (r.title || "?").slice(0, 1) }));
    return h("article", { class: "ts-card" }, thumb,
      h("div", { class: "ts-body" },
        h("h4", { text: r.title }),
        r.slug ? h("code", { class: "ts-slug", text: r.slug }) : null,
        r.what ? h("p", { text: r.what }) : null,
        r.triggers ? h("p", { class: "ts-trig", text: "Say: " + r.triggers }) : null,
        h("div", { class: "ts-meta" },
          r.stage ? h("span", { class: "ts-chip" + (r.stage === "Live" ? " live" : ""), text: r.stage }) : null,
          (r.stack || []).slice(0, 4).map((s) => h("span", { class: "ts-chip", text: s }))),
        h("div", { class: "ts-links" },
          r.live ? h("a", { href: r.live, target: "_blank", rel: "noopener", text: "Open ↗" }) : null,
          r.notion ? h("a", { href: r.notion, target: "_blank", rel: "noopener", text: "Notion ↗" }) : null)));
  }

  function render() {
    const main = $("#main");
    main.replaceChildren();
    const d = S.data;
    const skills = d.skills.filter(hit), apps = d.apps.filter(hit), sw = d.software.filter(hit);
    main.append(h("div", { class: "ts-head" },
      h("div", null, h("h1", { text: "Tech stack" }),
        h("p", { text: `${d.skills.length} Claude skills · ${d.apps.length} apps · ${d.software.length} software & SaaS` })),
      h("div", { class: "r" }, h("span", { text: "Updated " + fmtAgo(d.at) }),
        h("button", { class: "ts-btn", type: "button", onclick: () => load(true), text: "↻ Refresh" }))));

    const search = h("input", { class: "ts-search", type: "search", placeholder: "Search skills, apps, software…", "aria-label": "Search", value: S.q });
    search.value = S.q;
    search.addEventListener("input", () => { S.q = search.value.trim().toLowerCase(); const pos = search.selectionStart; render(); const s = $(".ts-search"); s.focus(); try { s.setSelectionRange(pos, pos); } catch (e) { /* ok */ } });
    const tab = (k, label, n) => h("button", { type: "button", "aria-pressed": String(S.tab === k), onclick: () => { S.tab = k; try { localStorage.setItem("ts-tab", k); } catch (e) { /* ok */ } render(); } }, label, n != null ? h("b", { text: n }) : null);
    main.append(h("div", { class: "ts-bar" }, search,
      h("div", { class: "ts-tabs", role: "group", "aria-label": "Show" }, tab("all", "All"), tab("skills", "Skills", skills.length), tab("apps", "Apps", apps.length), tab("software", "Software & SaaS", sw.length))));

    for (const e of d.errors || []) main.append(h("p", { class: "ts-note", text: e }));

    if (S.tab === "all" || S.tab === "skills") {
      main.append(h("h2", { class: "sec" }, "Claude skills", h("small", { text: "tap a diagram to view it" })));
      if (!skills.length) main.append(h("p", { class: "ts-empty", text: S.q ? "No skill matches." : "No skills yet." }));
      const gallery = skills.filter((r) => r.hasImg);
      const areas = AREAS.concat([...new Set(skills.map((s) => s.area))].filter((a) => !AREAS.includes(a)));
      for (const a of areas) {
        const list = skills.filter((s) => s.area === a);
        if (!list.length) continue;
        main.append(h("h3", { class: "grp", text: a }), h("div", { class: "ts-grid" }, list.map((r) => card(r, gallery))));
      }
    }
    if (S.tab === "all" || S.tab === "apps") {
      main.append(h("h2", { class: "sec" }, "Apps I built"));
      if (!apps.length) main.append(h("p", { class: "ts-empty", text: S.q ? "No app matches." : "No apps yet." }));
      else { const gallery = apps.filter((r) => r.hasImg); main.append(h("div", { class: "ts-grid" }, apps.map((r) => card(r, gallery)))); }
    }
    if (S.tab === "all" || S.tab === "software") {
      main.append(h("h2", { class: "sec" }, "Software & SaaS", h("small", { text: "from Tech Stack Inventory" })));
      if (!sw.length) main.append(h("p", { class: "ts-empty", text: S.q ? "Nothing matches." : "Nothing listed yet." }));
      else {
        const box = h("div", { class: "ts-sw" });
        for (const cat of [...new Set(sw.map((t) => t.category))]) {
          box.append(h("div", { class: "cat", text: cat }));
          for (const t of sw.filter((x) => x.category === cat))
            box.append(h("div", { class: "row" },
              h("b", null, t.notion ? h("a", { href: t.notion, target: "_blank", rel: "noopener", text: t.name }) : t.name),
              h("span", { text: t.purpose || "" }),
              h("em", { text: [money(t.cost), t.renews ? "renews " + fmtDay(t.renews) : ""].filter(Boolean).join(" · ") })));
        }
        main.append(box);
        const total = sw.reduce((n, t) => n + (Number(t.cost) || 0), 0);
        if (total) main.append(h("p", { class: "ts-total", text: `About ${money(total)} across the ones with a cost filled in.` }));
      }
    }
  }

  // ---------- the lightbox ----------
  const LB = { list: [], i: 0, last: null };
  function openLb(list, i) { LB.list = list; LB.i = i; LB.last = document.activeElement; drawLb(); $("#lb").hidden = false; document.body.style.overflow = "hidden"; $("#lb .close").focus(); }
  function closeLb() { $("#lb").hidden = true; document.body.style.overflow = ""; if (LB.last) LB.last.focus(); }
  function step(n) { if (LB.list.length < 2) return; LB.i = (LB.i + n + LB.list.length) % LB.list.length; drawLb(); }
  function drawLb() {
    const r = LB.list[LB.i];
    const stage = h("div", { class: "stage" });
    const img = h("img", { src: imgUrl(r), alt: `${r.title} flow diagram`, title: "Click for actual size" });
    img.addEventListener("click", () => { stage.classList.toggle("full"); img.title = stage.classList.contains("full") ? "Click to fit" : "Click for actual size"; });
    stage.append(img);
    const many = LB.list.length > 1;
    $("#lb").replaceChildren(
      h("div", { class: "top" },
        h("h2", { text: r.title }),
        many ? h("span", { class: "hide-sm", text: `${LB.i + 1} of ${LB.list.length}` }) : null,
        h("a", { class: "hide-sm", href: imgUrl(r), target: "_blank", rel: "noopener", text: "Open image ↗" }),
        r.notion ? h("a", { href: r.notion, target: "_blank", rel: "noopener", text: "Notion ↗" }) : null,
        h("button", { class: "close", type: "button", onclick: closeLb, text: "✕ Close" })),
      stage,
      many ? h("button", { class: "nav2 prev", type: "button", "aria-label": "Previous diagram", onclick: () => step(-1), text: "‹" }) : null,
      many ? h("button", { class: "nav2 next", type: "button", "aria-label": "Next diagram", onclick: () => step(1), text: "›" }) : null,
      h("div", { class: "foot" }, r.what ? h("p", { text: r.what }) : null, r.triggers ? h("small", { text: "Say: " + r.triggers }) : null));
  }
  document.addEventListener("keydown", (e) => {
    if ($("#lb").hidden) return;
    if (e.key === "Escape") closeLb();
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  });
  $("#lb").addEventListener("click", (e) => { if (e.target.id === "lb" || e.target.classList.contains("stage")) closeLb(); });

  // ---------- load ----------
  async function load(fresh) {
    try {
      S.data = await api("/api/techstack" + (fresh ? "?fresh=1" : ""));
      render();
      if (fresh) toast("Up to date with Notion");
    } catch (e) {
      if (e.message !== "signin") $("#main").replaceChildren(h("p", { class: "ts-note", text: "Couldn't load the tech stack. " + e.message }));
    }
  }
  load(false);
  // Pick up skills Claude adds or changes while the page sits open.
  setInterval(() => { if (document.visibilityState === "visible" && $("#lb").hidden && !S.q) load(false); }, 5 * 60_000);
})();
