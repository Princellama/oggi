// /flown — Eric's FLOWN focus sessions and the community words, kept in two Notion tables.
// Oggi writes everything here: sessions, the blocks inside them (as JSON in one text property),
// the tasks he pulls in from the brief, his word, intention and gratitude, and the members' words.

const N = require("./notion");
const { _call: call, _read: baseRead, _rich: rich, _queryAll: queryAll } = N;

const DS = {
  sessions: process.env.NOTION_FLOWN_SESSIONS_DS || "67565499-243d-4025-8275-61db76180e97",
  members: process.env.NOTION_FLOWN_MEMBERS_DS || "92955446-215a-484b-b376-6a3a70721160",
};

const read = (p) => (p && p.type === "checkbox" ? !!p.checkbox : baseRead(p));
const dateEnd = (p) => (p && p.type === "date" && p.date ? p.date.end : null);
const sel = (v) => (v ? { select: { name: v } } : { select: null });

// Blocks are JSON in a text property. A short prefix ("blocks: ") is allowed before the array,
// because some tools won't write text that starts with "[".
function parseBlocks(s) {
  const txt = String(s || "");
  const i = txt.indexOf("[");
  if (i < 0) return [];
  try { const a = JSON.parse(txt.slice(i)); return Array.isArray(a) ? a : []; } catch { return []; }
}
// Only the fields the page uses, so a stray value can't grow the row.
function cleanBlocks(list) {
  return (Array.isArray(list) ? list : []).slice(0, 12).map((b, i) => ({
    n: i + 1,
    min: Math.max(5, Math.min(180, Math.round(Number(b.min) || 25))),
    deep: !!b.deep,
    start: b.start && !isNaN(Date.parse(b.start)) ? new Date(b.start).toISOString() : null,
    intention: String(b.intention || "").slice(0, 400),
    items: (Array.isArray(b.items) ? b.items : []).slice(0, 6).map((x) => ({ id: String(x.id || ""), key: String(x.key || ""), title: String(x.title || "").slice(0, 160) })),
    done: !!b.done,
    doneAt: b.done && b.doneAt && !isNaN(Date.parse(b.doneAt)) ? new Date(b.doneAt).toISOString() : null,
  }));
}

function toSession(pg) {
  const p = pg.properties;
  return {
    id: pg.id,
    title: read(p["Name"]) || "FLOWN session",
    start: read(p["When"]),
    end: dateEnd(p["When"]),
    host: read(p["Host"]) || "",
    join: read(p["Join"]),
    word: read(p["Word"]) || "",
    intention: read(p["Intention"]) || "",
    gratitude: read(p["Gratitude"]) || "",
    breathwork: !!read(p["Breathwork"]),
    blocks: parseBlocks(read(p["Blocks"])),
    status: read(p["Status"]) || "Planned",
    calendarId: read(p["Calendar ID"]) || null,
  };
}
function toMember(pg) {
  const p = pg.properties;
  return {
    id: pg.id,
    name: read(p["Name"]) || "",
    word: read(p["Word"]) || "",
    meaning: read(p["Meaning"]) || "",
    role: read(p["Role"]) || "Member",
    since: read(p["Since"]),
    note: read(p["Note"]) || "",
  };
}

function sessionProps(f) {
  const props = {};
  if ("title" in f) props["Name"] = { title: rich(f.title) };
  if ("start" in f) props["When"] = f.start ? { date: { start: f.start, end: f.end || null } } : { date: null };
  if ("host" in f) props["Host"] = { rich_text: rich(f.host) };
  if ("join" in f) props["Join"] = { url: f.join || null };
  if ("word" in f) props["Word"] = { rich_text: rich(f.word) };
  if ("intention" in f) props["Intention"] = { rich_text: rich(f.intention) };
  if ("gratitude" in f) props["Gratitude"] = { rich_text: rich(f.gratitude) };
  if ("breathwork" in f) props["Breathwork"] = { checkbox: !!f.breathwork };
  if ("blocks" in f) props["Blocks"] = { rich_text: rich(JSON.stringify(cleanBlocks(f.blocks))) };
  if ("status" in f) props["Status"] = sel(f.status);
  if ("calendarId" in f) props["Calendar ID"] = { rich_text: rich(f.calendarId || "") };
  return props;
}
function memberProps(f) {
  const props = {};
  if ("name" in f) props["Name"] = { title: rich(f.name) };
  if ("word" in f) props["Word"] = { rich_text: rich(f.word) };
  if ("meaning" in f) props["Meaning"] = { rich_text: rich(f.meaning) };
  if ("role" in f) props["Role"] = sel(f.role);
  if ("since" in f) props["Since"] = f.since ? { date: { start: f.since } } : { date: null };
  if ("note" in f) props["Note"] = { rich_text: rich(f.note) };
  return props;
}

const isoDay = (s, add) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + add); return d.toISOString().slice(0, 10); };

// The last four months of sessions (streak, constellation, history) and everything ahead.
async function getAll(today) {
  const [s, m] = await Promise.all([
    queryAll(DS.sessions, { filter: { property: "When", date: { on_or_after: isoDay(today, -120) } }, sorts: [{ property: "When", direction: "ascending" }] }),
    queryAll(DS.members, { sorts: [{ property: "Name", direction: "ascending" }] }),
  ]);
  return { sessions: s.map(toSession), members: m.map(toMember) };
}
// The day's sessions, for the sky's Timeline. Light: a day either side so time zones can't drop one.
async function getDay(date) {
  const rows = await queryAll(DS.sessions, { filter: { and: [
    { property: "When", date: { on_or_after: isoDay(date, -1) } },
    { property: "When", date: { on_or_before: isoDay(date, 1) } },
  ] } });
  return rows.map(toSession).filter((x) => x.status !== "Skipped");
}
async function createSession(f) {
  return toSession(await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.sessions }, properties: sessionProps({ status: "Planned", ...f }) }));
}
async function updateSession(id, f) { return toSession(await call("PATCH", `/pages/${id}`, { properties: sessionProps(f) })); }
async function removeSession(id) { await call("PATCH", `/pages/${id}`, { in_trash: true }); return { ok: true }; }
async function createMember(f) {
  return toMember(await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.members }, properties: memberProps({ role: "Member", ...f }) }));
}
async function updateMember(id, f) { return toMember(await call("PATCH", `/pages/${id}`, { properties: memberProps(f) })); }
async function removeMember(id) { await call("PATCH", `/pages/${id}`, { in_trash: true }); return { ok: true }; }

module.exports = { getAll, getDay, createSession, updateSession, removeSession, createMember, updateMember, removeMember, cleanBlocks, parseBlocks };
