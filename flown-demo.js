// In-memory stand-in for flown.js (OGGI_DEMO=1): a session today with Tim and a few past ones,
// so the streak, the constellation and the Timeline have something to show.
const { cleanBlocks } = require("./flown");

let n = 0;
const at = (dayAdd, h, m) => { const d = new Date(); d.setDate(d.getDate() + dayAdd); d.setHours(h, m, 0, 0); return d.toISOString(); };
const blocks = (dayAdd, startH, lens, doneUpTo) => {
  let t = new Date(at(dayAdd, startH, 30)).getTime();
  return lens.map(([min, deep, intention], i) => {
    const b = { n: i + 1, min, deep, start: new Date(t).toISOString(), intention, items: [], done: i < doneUpTo, doneAt: i < doneUpTo ? new Date(t + min * 60000).toISOString() : null };
    t += (min + 10) * 60000;
    return b;
  });
};
const state = {
  sessions: [
    { id: "fs-1", title: "Morning Flow", start: at(-3, 8, 0), end: at(-3, 10, 0), host: "Tim Longhurst", join: null, word: "Kaizen", intention: "", gratitude: "Quiet house, early light.", breathwork: true, status: "Done", calendarId: null,
      blocks: blocks(-3, 8, [[25, false, "Inbox to zero"], [45, true, "Isaac's return"]], 2) },
    { id: "fs-2", title: "The Conditions", start: at(-2, 12, 0), end: at(-2, 16, 0), host: "Tim Longhurst", join: null, word: "Kaizen", intention: "", gratitude: "The group showing up.", breathwork: true, status: "Done", calendarId: null,
      blocks: blocks(-2, 12, [[25, false, "Kaylee's invoice"], [45, false, "Medicare follow-ups"], [45, true, "2027 cheat sheets"], [35, false, "GHL cleanup"]], 4) },
    { id: "fs-3", title: "Morning Flow", start: at(-1, 8, 0), end: at(-1, 10, 0), host: "Tim Longhurst", join: null, word: "Kaizen", intention: "", gratitude: "", breathwork: false, status: "Done", calendarId: null,
      blocks: blocks(-1, 8, [[25, false, "Bills"], [45, true, "Harvey's return"]], 1) },
    { id: "fs-4", title: "The Conditions", start: at(0, 12, 0), end: at(0, 16, 0), host: "Tim Longhurst", join: "https://flown.com", word: "Kaizen", intention: "Small, steady improvement: one better step in each block.", gratitude: "", breathwork: true, status: "Planned", calendarId: "demo-cal",
      blocks: blocks(0, 12, [[25, false, "LaRue's Plumbing: finish the 2025 return."], [45, false, "LaRue carry-over, then the contractor's licence."], [45, true, "Medicare: Jose's plan."], [35, false, "Medicare follow-ups in GHL."]], 0) },
  ],
  members: [
    { id: "fm-1", name: "Eric", word: "Kaizen", meaning: "Small, steady improvement.", role: "Me", since: at(0, 12, 0).slice(0, 10), note: "" },
    { id: "fm-2", name: "Tim Longhurst", word: "", meaning: "", role: "Host", since: null, note: "Hosts The Conditions." },
    { id: "fm-3", name: "Aisha", word: "Steady", meaning: "One thing at a time.", role: "Member", since: null, note: "" },
  ],
};
const copy = (x) => JSON.parse(JSON.stringify(x));
const pick = (f, keys) => Object.fromEntries(Object.entries(f).filter(([k]) => keys.includes(k)));
const SK = ["title", "start", "end", "host", "join", "word", "intention", "gratitude", "breathwork", "blocks", "status", "calendarId"];
const MK = ["name", "word", "meaning", "role", "since", "note"];

async function getAll() { return copy(state); }
async function getDay(date) {
  return copy(state.sessions.filter((s) => s.status !== "Skipped" && Math.abs(Date.parse(s.start) - Date.parse(date + "T12:00:00")) < 36 * 3600000));
}
async function createSession(f) {
  const s = { id: "fs-n" + ++n, title: "FLOWN session", start: null, end: null, host: "", join: null, word: "", intention: "", gratitude: "", breathwork: false, blocks: [], status: "Planned", calendarId: null, ...pick(f, SK) };
  s.blocks = cleanBlocks(s.blocks);
  state.sessions.push(s);
  state.sessions.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return copy(s);
}
async function updateSession(id, f) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) throw Object.assign(new Error("not found"), { status: 404 });
  Object.assign(s, pick(f, SK));
  if ("blocks" in f) s.blocks = cleanBlocks(f.blocks);
  return copy(s);
}
async function removeSession(id) { state.sessions = state.sessions.filter((x) => x.id !== id); return { ok: true }; }
async function createMember(f) { const m = { id: "fm-n" + ++n, name: "", word: "", meaning: "", role: "Member", since: null, note: "", ...pick(f, MK) }; state.members.push(m); return copy(m); }
async function updateMember(id, f) {
  const m = state.members.find((x) => x.id === id);
  if (!m) throw Object.assign(new Error("not found"), { status: 404 });
  Object.assign(m, pick(f, MK));
  return copy(m);
}
async function removeMember(id) { state.members = state.members.filter((x) => x.id !== id); return { ok: true }; }

module.exports = { getAll, getDay, createSession, updateSession, removeSession, createMember, updateMember, removeMember };
