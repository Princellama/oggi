// /feeding — the Nov 11 SCE lunch. Reads and writes the Feeding table through /api/feeding.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const STATUS = ["asked", "confirmed", "cooking", "delivered"];
  const STLBL = { asked: "Not confirmed", confirmed: "Confirmed", cooking: "Cooking", delivered: "Dropped off ✓" };
  const CHECKS = [["qty", "Amount for 70"], ["pans", "Pans & lids"], ["utensil", "Serving utensil"], ["drop", "Drop-off 11:00"], ["allergy", "Allergens / label"], ["warm", "Keep warm or cold"]];
  const SRC = { costco: "Costco", borrow: "Borrow", have: "Have it", cook: "Cooks bring" };
  const S = { dishes: [], items: [], steps: [], notes: [] };
  let filter = "all";

  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
    if (r.status === 401) { location.href = "/"; throw new Error("signin"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `failed (${r.status})`);
    return j;
  }
  function note(t) { $("banner").textContent = t; $("banner").hidden = !t; }
  // One write at a time per row, so quick taps land in order.
  const chain = {};
  function save(id, data) {
    chain[id] = (chain[id] || Promise.resolve()).then(() => api("PATCH", "/api/feeding/" + id, data)).then(() => note("")).catch((e) => { if (e.message !== "signin") note("Couldn't save just now: " + e.message); });
    return chain[id];
  }

  // countdown to Wed Nov 11 2026, Hawaii time
  (() => {
    const d = Math.ceil((Date.UTC(2026, 10, 11, 10) - Date.now()) / 864e5);
    $("days").textContent = d > 0 ? d : d === 0 ? "Today" : "Done";
    $("daysLbl").textContent = d > 1 ? "days to go" : d === 1 ? "day to go" : d === 0 ? "lunch day" : "event over";
  })();

  const TABS = ["dishes", "supplies", "dayof", "notes"];
  function showTab(t) {
    if (!TABS.includes(t)) t = "dishes";
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
    TABS.forEach((k) => ($("tab-" + k).hidden = k !== t));
  }
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { showTab(b.dataset.tab); history.replaceState(null, "", "#" + b.dataset.tab); }));
  showTab(location.hash.slice(1));

  // Hold a re-render while someone is typing in that list.
  const held = {};
  function guarded(id, fn) {
    const el = $(id);
    if (el && el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { held[id] = fn; return; }
    fn();
  }
  document.addEventListener("focusout", () => setTimeout(() => {
    Object.keys(held).forEach((id) => { if (!$(id).contains(document.activeElement)) { const f = held[id]; delete held[id]; f(); } });
  }, 0));

  function progress() {
    const d = S.dishes, c = d.filter((x) => x.status !== "asked").length;
    $("pDish").textContent = c + "/" + d.length; $("bDish").style.width = (d.length ? (c / d.length) * 100 : 0) + "%";
    const it = S.items.filter((x) => x.source !== "cook"), g = it.filter((x) => x.got).length;
    $("pItem").textContent = g + "/" + it.length; $("bItem").style.width = (it.length ? (g / it.length) * 100 : 0) + "%";
    const b = S.items.filter((x) => x.source === "borrow"), r = b.filter((x) => x.returned).length;
    $("pRet").textContent = b.length - r; $("bRet").style.width = (b.length ? (r / b.length) * 100 : 0) + "%";
  }

  function renderDishes() {
    const L = $("dishList");
    if (!S.dishes.length) { L.innerHTML = '<div class="empty">No dishes yet.</div>'; }
    else L.innerHTML = S.dishes.map((d) =>
      '<article class="dish" data-id="' + d.id + '">'
      + '<div class="top"><div><h3>' + esc(d.name) + '</h3><div class="cook">👩‍🍳 ' + esc(d.who) + "</div></div>"
      + '<button class="status st-' + esc(d.status) + '" data-act="status" title="Tap to change">' + STLBL[d.status] + "</button></div>"
      + '<label class="f">Amount<input type="text" data-field="amount" value="' + esc(d.amount) + '" placeholder="e.g. 2 full trays"></label>'
      + '<div class="checks">' + CHECKS.map(([k, l]) => '<button class="chk' + (d.checks.includes(k) ? " on" : "") + '" data-act="chk" data-k="' + k + '">' + esc(l) + "</button>").join("") + "</div>"
      + '<label class="f needs">Needs from us<input type="text" data-field="needs" value="' + esc(d.needs) + '" placeholder="e.g. foil pans, a ride, reimburse"></label>'
      + '<label class="f">Notes<input type="text" data-field="notes" value="' + esc(d.notes) + '" placeholder="Allergens, pickup, anything else"></label>'
      + "</article>").join("");
    const flags = [];
    if (!S.dishes.some((d) => /rice/i.test(d.name))) flags.push("<b>Rice isn't on the menu.</b> Ask the cooks if anyone is bringing it, or add it to the Costco list (about 2 large trays, or 15–18 cups uncooked, for 70).");
    $("flags").innerHTML = flags.map((f) => '<div class="flag">' + f + "</div>").join("");
  }
  $("dishList").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const d = S.dishes.find((x) => x.id === b.closest(".dish").dataset.id); if (!d) return;
    if (b.dataset.act === "status") { d.status = STATUS[(STATUS.indexOf(d.status) + 1) % STATUS.length]; save(d.id, { status: d.status }); renderDishes(); progress(); }
    if (b.dataset.act === "chk") { const k = b.dataset.k; d.checks = d.checks.includes(k) ? d.checks.filter((x) => x !== k) : [...d.checks, k]; save(d.id, { checks: d.checks }); b.classList.toggle("on", d.checks.includes(k)); }
  });
  $("dishList").addEventListener("change", (e) => {
    const i = e.target; if (!i.dataset.field) return;
    const d = S.dishes.find((x) => x.id === i.closest(".dish").dataset.id); d[i.dataset.field] = i.value; save(d.id, { [i.dataset.field]: i.value });
  });
  const nextOrder = (list) => Math.max(0, ...list.map((x) => x.order || 0)) + 1;
  $("addDish").addEventListener("submit", async (e) => {
    e.preventDefault(); const n = $("dName").value.trim(); if (!n) return;
    try { const r = await api("POST", "/api/feeding", { kind: "Dish", name: n, who: $("dWho").value.trim(), status: "asked", order: nextOrder(S.dishes) }); S.dishes.push(r); $("dName").value = ""; $("dWho").value = ""; renderDishes(); progress(); }
    catch (err) { note("Couldn't add: " + err.message); }
  });

  function renderItems() {
    const L = $("itemList");
    let list = S.items.slice();
    if (filter === "open") list = list.filter((x) => !x.got && x.source !== "cook");
    else if (filter !== "all") list = list.filter((x) => x.source === filter);
    if (!S.items.length) { L.innerHTML = '<div class="empty">No supplies yet. Add the first one below.</div>'; return; }
    if (!list.length) { L.innerHTML = '<div class="empty">Nothing here. ' + (filter === "open" ? "Everything is in hand. 🎉" : "") + "</div>"; return; }
    const cats = [...new Set(list.map((x) => x.cat || "Other"))];
    L.innerHTML = cats.map((c) => '<div class="group"><h4>' + esc(c) + "</h4>" + list.filter((x) => (x.cat || "Other") === c).map((x) => {
      const bor = x.source === "borrow";
      return '<div class="row' + (x.got ? " got" : "") + '" data-id="' + x.id + '">'
        + '<input type="checkbox" ' + (x.got ? "checked" : "") + ' data-act="got" aria-label="In hand" title="In hand">'
        + '<input type="text" class="nm" data-field="name" value="' + esc(x.name) + '" aria-label="Item">'
        + '<input type="text" class="mono" data-field="amount" value="' + esc(x.amount) + '" aria-label="Quantity">'
        + '<select class="src" data-field="source" aria-label="Source">' + Object.entries(SRC).map(([k, v]) => '<option value="' + k + '"' + (x.source === k ? " selected" : "") + ">" + v + "</option>").join("") + "</select>"
        + '<input type="text" class="who" data-field="who" value="' + esc(x.who) + '" placeholder="' + (bor ? "Borrow from…" : "Who / note") + '" aria-label="Who">'
        + '<button class="del" data-act="del" aria-label="Remove ' + esc(x.name) + '">×</button>'
        + (bor ? '<div class="ret"><label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ' + (x.returned ? "checked" : "") + ' data-act="ret"> Returned after the event</label><span class="tag ' + (x.returned ? "done" : "todo") + '">' + (x.returned ? "Returned" : "Return it") + "</span></div>" : "")
        + "</div>";
    }).join("") + "</div>").join("");
  }
  $("filters").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return; filter = b.dataset.f;
    document.querySelectorAll("#filters button").forEach((x) => x.classList.toggle("on", x === b)); renderItems();
  });
  $("itemList").addEventListener("change", (e) => {
    const i = e.target, row = i.closest(".row"); if (!row) return; const x = S.items.find((y) => y.id === row.dataset.id); if (!x) return;
    if (i.dataset.act === "got") { x.got = i.checked; save(x.id, { got: i.checked }); }
    else if (i.dataset.act === "ret") { x.returned = i.checked; save(x.id, { returned: i.checked }); }
    else if (i.dataset.field) { x[i.dataset.field] = i.value; save(x.id, { [i.dataset.field]: i.value }); }
    renderItems(); progress();
  });
  let delArm = null;
  async function del(list, id, render) {
    try { await api("DELETE", "/api/feeding/" + id); } catch (err) { note("Couldn't remove: " + err.message); return; }
    S[list] = S[list].filter((x) => x.id !== id); render(); progress();
  }
  $("itemList").addEventListener("click", (e) => {
    const b = e.target.closest('[data-act="del"]'); if (!b) return; const id = b.closest(".row").dataset.id;
    if (delArm !== id) { delArm = id; b.textContent = "Remove?"; b.style.fontSize = "12px"; setTimeout(() => { if (delArm === id) { delArm = null; renderItems(); } }, 3000); return; }
    delArm = null; del("items", id, renderItems);
  });
  $("addItem").addEventListener("submit", async (e) => {
    e.preventDefault(); const n = $("newName").value.trim(); if (!n) return;
    try {
      const r = await api("POST", "/api/feeding", { kind: "Supply", name: n, amount: $("newQty").value.trim(), source: $("newSrc").value, cat: "Added", order: nextOrder(S.items) });
      S.items.push(r); $("newName").value = ""; $("newQty").value = ""; renderItems(); progress();
    } catch (err) { note("Couldn't add: " + err.message); }
  });

  const DAYS = [["prep", "Before the event"], ["event", "Wed, Nov 11"], ["after", "After"]];
  function renderSteps() {
    const L = $("tlList");
    if (!S.steps.length) { L.innerHTML = '<div class="empty">No steps yet. Add the first one below.</div>'; return; }
    L.innerHTML = DAYS.map(([k, l]) => {
      const st = S.steps.filter((s) => s.day === k); if (!st.length) return "";
      return '<div class="daylbl">' + l + "</div>" + st.map((s) => '<div class="step' + (s.fixed ? " fixed" : "") + (s.done ? " done" : "") + '" data-id="' + s.id + '">'
        + '<input type="checkbox" ' + (s.done ? "checked" : "") + ' data-act="done" aria-label="Done">'
        + '<input type="text" class="tm mono" data-field="time" value="' + esc(s.time) + '" aria-label="Time">'
        + '<input type="text" class="wt" data-field="name" value="' + esc(s.name) + '" aria-label="Step">'
        + '<input type="text" class="who" data-field="who" value="' + esc(s.who) + '" placeholder="Who" aria-label="Who">'
        + '<button class="del" data-act="del" aria-label="Remove step">×</button></div>').join("");
    }).join("");
  }
  $("tlList").addEventListener("change", (e) => {
    const i = e.target, r = i.closest(".step"); if (!r) return; const s = S.steps.find((x) => x.id === r.dataset.id);
    if (i.dataset.act === "done") { s.done = i.checked; save(s.id, { done: i.checked }); renderSteps(); }
    else if (i.dataset.field) { s[i.dataset.field] = i.value; save(s.id, { [i.dataset.field]: i.value }); }
  });
  let delStep = null;
  $("tlList").addEventListener("click", (e) => {
    const b = e.target.closest('[data-act="del"]'); if (!b) return; const id = b.closest(".step").dataset.id;
    if (delStep !== id) { delStep = id; b.textContent = "?"; setTimeout(() => { if (delStep === id) { delStep = null; renderSteps(); } }, 3000); return; }
    delStep = null; del("steps", id, renderSteps);
  });
  $("addStep").addEventListener("submit", async (e) => {
    e.preventDefault(); const w = $("stWhat").value.trim(); if (!w) return;
    try {
      const r = await api("POST", "/api/feeding", { kind: "Step", name: w, time: $("stTime").value.trim(), day: $("stDay").value, order: nextOrder(S.steps) });
      S.steps.push(r); S.steps.sort((a, b) => a.order - b.order); $("stWhat").value = ""; $("stTime").value = ""; renderSteps();
    } catch (err) { note("Couldn't add: " + err.message); }
  });

  // Notes: three rows (cooks, venue, money), saved as he types.
  const NOTE_KEYS = ["cooks", "venue", "money"]; const nT = {};
  NOTE_KEYS.forEach((k) => $("note-" + k).addEventListener("input", () => {
    clearTimeout(nT[k]);
    nT[k] = setTimeout(async () => {
      const v = $("note-" + k).value; let row = S.notes.find((n) => n.name === k);
      try {
        if (row) { row.notes = v; await save(row.id, { notes: v }); }
        else { row = await api("POST", "/api/feeding", { kind: "Note", name: k, notes: v, order: NOTE_KEYS.indexOf(k) + 1 }); S.notes.push(row); }
        $("noteSaved").textContent = "Saved"; setTimeout(() => ($("noteSaved").textContent = ""), 1500);
      } catch (err) { note("Couldn't save the note: " + err.message); }
    }, 800);
  }));
  function renderNotes() { NOTE_KEYS.forEach((k) => { const el = $("note-" + k); if (document.activeElement !== el) el.value = (S.notes.find((n) => n.name === k) || {}).notes || ""; }); }

  async function load(first) {
    try {
      const d = await api("GET", "/api/feeding");
      Object.assign(S, d);
      guarded("dishList", renderDishes); guarded("itemList", renderItems); guarded("tlList", renderSteps); renderNotes(); progress();
    } catch (e) { if (e.message !== "signin" && first) $("dishList").innerHTML = '<div class="empty">Couldn\'t load the plan: ' + esc(e.message) + "</div>"; }
  }
  load(true);
  // Others (and Claude) may edit the table: re-read every minute while the page is open and idle.
  setInterval(() => { if (!document.hidden) load(false); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(false); });
})();
