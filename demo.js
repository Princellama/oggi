// In-memory stand-in for notion.js, used when OGGI_DEMO=1 or no NOTION_TOKEN.
// Same interface, seeded with sample data, so the app can be run and checked anywhere.
const sample = require("./data/sample.json");

const state = JSON.parse(JSON.stringify(sample));
let n = 0;

// A few weeks of made-up past jobs, dated from today, so Star History and the faded
// recently-finished stars have something to show.
const iso = (add) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + add); return d.toISOString().slice(0, 10); };
const PAST = [
  ["Kono's amended return", "Kahala", "CPA", -40, -31], ["Renew the E&O policy", "Home", "Money", -26, -24],
  ["Mrs. Lau's Part D switch", "Kakaako", "Medicare", -21, -20], ["Quarterly estimates for Tom", "Kahala", "CPA", -17, -9],
  ["Fix the GHL calendar sync", "Hawaii Kai", "Personal", -15, -14], ["Kaimuki seminar flyers", "Kakaako", "Medicare", -12, -5],
  ["Dentist, reschedule", "Home", "Personal", -8, -8], ["Ana's 1099 question", "Kahala", "CPA", -6, -2],
  ["Pay the HMSA premium", "Home", "Money", -4, -1], ["Book the Seoul hotel", "Airport", "Personal", -9, null, "Let go"],
];
const past = PAST.map(([title, place, area, first, closed, decision], i) => ({
  id: "past-" + i, key: "past-" + i, title, mapLabel: title.split(" ").slice(0, 2).join(" "), place, area, list: "Needs attention",
  status: closed == null ? "Open" : "Closed", decision: decision || null, firstSeen: iso(first),
  lastSeen: iso(closed == null ? first + 3 : closed), closedOn: closed == null ? null : iso(closed),
}));

async function getBrief() {
  const recent = past.filter((i) => i.closedOn && i.closedOn >= iso(-3));
  return { day: { ...state.day }, items: state.items.map((i) => ({ ...i })), recent: recent.map((i) => ({ ...i })) };
}
async function getHistory(date, days) {
  const from = iso(-days);
  const today = state.items.map((i) => ({ firstSeen: iso(-(i.carries || 0)), lastSeen: iso(0), closedOn: i.status === "Closed" ? iso(0) : null, ...i }));
  return today.concat(past).filter((i) => (i.lastSeen || "") >= from || (i.closedOn || "") >= from).filter((i) => !String(i.key).startsWith("r-"));
}
async function updateItem(id, fields) {
  const it = state.items.find((i) => i.id === id);
  if (!it) throw Object.assign(new Error("not found"), { status: 404 });
  Object.assign(it, fields);
  if ("delegatedTo" in fields && !fields.delegatedTo) it.delegatedOn = null;
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

const outbox = (sample.outbox || []).map((r) => ({ pushed: null, ...r }));
async function getOutbox() { return outbox.filter((r) => !r.pushed).map((r) => ({ ...r })); }
async function setPushed(id, date) {
  const r = outbox.find((x) => x.id === id);
  if (!r) throw Object.assign(new Error("not found"), { status: 404 });
  r.pushed = date || null;
  return { ...r };
}

module.exports = { getHistory, getOutbox, setPushed, getBrief, updateItem, updateDay, logEdit, applyDecisionToTask, createTask, getPage, toItem };
