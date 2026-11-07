// In-memory stand-in for feeding.js (OGGI_DEMO=1).
const { CHECKS } = require("./feeding");

let n = 0;
const row = (kind, f) => ({ id: "fd-" + ++n, kind, name: "", order: n, who: "", status: "asked", amount: "", source: "costco", cat: "", got: false, returned: false, day: "event", time: "", fixed: false, done: false, needs: "", notes: "", checks: [], ...f });
const rows = [
  row("Dish", { name: "Chicken", who: "Danaos" }),
  row("Dish", { name: "Beef Stew", who: "Keppa & Kaitlyn", needs: "Asked for another $50" }),
  row("Dish", { name: "Fruit", who: "Fowler", status: "confirmed", checks: ["qty", "pans"] }),
  row("Supply", { name: "Sturdy dinner plates", amount: "80", cat: "Plates & utensils" }),
  row("Supply", { name: "Chafing racks", amount: "4", source: "borrow", cat: "Serving line" }),
  row("Step", { name: "Costco run", day: "prep", time: "Mon 11/9", who: "Eric" }),
  row("Step", { name: "Lunch is served", time: "12:00 pm", fixed: true }),
  row("Note", { name: "cooks", notes: "" }), row("Note", { name: "venue" }), row("Note", { name: "money", notes: "Keppa asked for another $50." }),
];

async function getAll() {
  const s = [...rows].sort((a, b) => a.order - b.order);
  return { dishes: s.filter((r) => r.kind === "Dish"), items: s.filter((r) => r.kind === "Supply"), steps: s.filter((r) => r.kind === "Step"), notes: s.filter((r) => r.kind === "Note") };
}
async function create(f) { const r = row(f.kind, f); rows.push(r); return r; }
async function update(id, f) {
  const r = rows.find((x) => x.id === id); if (!r) throw Object.assign(new Error("not found"), { status: 404 });
  Object.assign(r, f); if (f.checks) r.checks = f.checks.filter((c) => CHECKS.includes(c)); return r;
}
async function remove(id) { const i = rows.findIndex((x) => x.id === id); if (i >= 0) rows.splice(i, 1); return { ok: true }; }

module.exports = { getAll, create, update, remove };
