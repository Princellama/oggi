// In-memory stand-in for notion.js, used when OGGI_DEMO=1 or no NOTION_TOKEN.
// Same interface, seeded with sample data, so the app can be run and checked anywhere.
const sample = require("./data/sample.json");

const state = JSON.parse(JSON.stringify(sample));
let n = 0;

async function getBrief() {
  return { day: { ...state.day }, items: state.items.map((i) => ({ ...i })) };
}
async function updateItem(id, fields) {
  const it = state.items.find((i) => i.id === id);
  if (!it) throw Object.assign(new Error("not found"), { status: 404 });
  Object.assign(it, fields);
  if ("decision" in fields) it.decidedAt = fields.decision ? new Date().toISOString() : null;
  return { ...it };
}
async function updateDay(id, fields) {
  Object.assign(state.day, fields);
  return { ...state.day };
}
async function logEdit(id, line, mergeKey) {
  const cur = state.day.edits;
  let lines = cur ? cur.split("\n") : [];
  // A note typed in bursts saves several times; keep only its latest wording.
  if (mergeKey && lines.length && lines[lines.length - 1].includes(mergeKey)) lines.pop();
  lines = lines.concat(line).slice(-60);
  state.day.edits = lines.join("\n");
  return state.day.edits;
}
async function applyDecisionToTask() {}
async function createTask(text) {
  n += 1;
  return { id: "demo-task-" + n, url: null };
}
async function getPage(id) {
  const it = state.items.find((i) => i.id === id);
  return it ? { id, demo: it } : null;
}
function toItem(p) { return p.demo; }

module.exports = { getBrief, updateItem, updateDay, logEdit, applyDecisionToTask, createTask, getPage, toItem };
