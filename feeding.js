// /feeding — the Nov 11 SCE lunch for 70 at Kingdom Hall C, kept in one Notion table ("Feeding").
// One row per dish, supply, timeline step or note (Kind). Oggi reads and writes it; Claude can too.

const N = require("./notion");
const { _call: call, _read: baseRead, _rich: rich, _queryAll: queryAll } = N;

const DS = process.env.NOTION_FEEDING_DS || "2cd7738e-1ecb-4904-a54c-58962864d29d";

const read = (p) => (p && p.type === "checkbox" ? !!p.checkbox : baseRead(p));
const sel = (v) => (v ? { select: { name: v } } : { select: null });
const CHECKS = ["qty", "pans", "utensil", "drop", "allergy", "warm"];

function toRow(pg) {
  const p = pg.properties;
  return {
    id: pg.id,
    kind: read(p["Kind"]) || "Supply",
    name: read(p["Name"]) || "",
    order: read(p["Order"]) || 0,
    who: read(p["Who"]) || "",
    status: read(p["Status"]) || "asked",
    amount: read(p["Amount"]) || "",
    source: read(p["Source"]) || "costco",
    cat: read(p["Category"]) || "",
    got: !!read(p["Got"]),
    returned: !!read(p["Returned"]),
    day: read(p["Day"]) || "event",
    time: read(p["Time"]) || "",
    fixed: !!read(p["Fixed"]),
    done: !!read(p["Done"]),
    needs: read(p["Needs"]) || "",
    notes: read(p["Notes"]) || "",
    checks: String(read(p["Checks"]) || "").split(",").map((s) => s.trim()).filter((s) => CHECKS.includes(s)),
  };
}

function props(f) {
  const o = {};
  if ("name" in f) o["Name"] = { title: rich(f.name) };
  if ("kind" in f) o["Kind"] = sel(f.kind);
  if ("order" in f) o["Order"] = { number: f.order };
  for (const [k, P] of [["who", "Who"], ["amount", "Amount"], ["cat", "Category"], ["time", "Time"], ["needs", "Needs"], ["notes", "Notes"]]) if (k in f) o[P] = { rich_text: rich(f[k]) };
  for (const [k, P] of [["status", "Status"], ["source", "Source"], ["day", "Day"]]) if (k in f) o[P] = sel(f[k]);
  for (const [k, P] of [["got", "Got"], ["returned", "Returned"], ["fixed", "Fixed"], ["done", "Done"]]) if (k in f) o[P] = { checkbox: !!f[k] };
  if ("checks" in f) o["Checks"] = { rich_text: rich(f.checks.filter((c) => CHECKS.includes(c)).join(",")) };
  return o;
}

async function getAll() {
  const rows = (await queryAll(DS, { sorts: [{ property: "Order", direction: "ascending" }] })).map(toRow);
  return {
    dishes: rows.filter((r) => r.kind === "Dish"),
    items: rows.filter((r) => r.kind === "Supply"),
    steps: rows.filter((r) => r.kind === "Step"),
    notes: rows.filter((r) => r.kind === "Note"),
  };
}
async function create(f) { return toRow(await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS }, properties: props(f) })); }
async function update(id, f) { return toRow(await call("PATCH", `/pages/${id}`, { properties: props(f) })); }
async function remove(id) { await call("PATCH", `/pages/${id}`, { in_trash: true }); return { ok: true }; }

module.exports = { getAll, create, update, remove, CHECKS };
