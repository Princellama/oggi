// /italian — Eric's Italian lessons with his teacher (Wednesday night, Sunday morning).
// Two Notion tables under Medicare Marketing / Italian (shared with the oggi integration):
// Italian Words (the index: one row per word or phrase, Key dedupes, Times seen counts days)
// and Italian Lessons (one row per lesson). Claude fills meanings, forms and links ("Needs Claude").

const N = require("./notion");
const { _call: call, _read: baseRead, _rich: rich, _queryAll: queryAll } = N;

const DS = {
  words: process.env.NOTION_ITALIAN_WORDS_DS || "18a90bd5-ea28-4fb6-b40e-952336a816f2",
  lessons: process.env.NOTION_ITALIAN_LESSONS_DS || "2dd22fd4-f3b1-4ffe-b11c-495b8314b586",
};

function read(p) {
  if (!p) return null;
  if (p.type === "relation") return (p.relation || []).map((r) => r.id);
  if (p.type === "checkbox") return !!p.checkbox;
  return baseRead(p);
}
// The dedupe key: lowercase, accents kept, curly apostrophes straightened, single spaces.
const keyOf = (s) => String(s || "").normalize("NFC").replace(/[’‘`´]/g, "'").toLowerCase().replace(/\s+/g, " ").trim();

function toWord(pg) {
  const p = pg.properties;
  return {
    id: pg.id, url: pg.url, italian: read(p["Italian"]) || "", key: read(p["Key"]) || "", english: read(p["English"]) || "",
    type: read(p["Type"]), forms: read(p["Forms"]) || "", example: read(p["Example"]) || "", note: read(p["Note"]) || "",
    times: read(p["Times seen"]) || 0, first: read(p["First seen"]), last: read(p["Last seen"]), status: read(p["Status"]) || "New",
    needsClaude: read(p["Needs Claude"]), lessons: read(p["Lessons"]) || [], phrases: read(p["Phrases"]) || [], parts: read(p["Words in it"]) || [],
  };
}
function toLesson(pg) {
  const p = pg.properties;
  return { id: pg.id, url: pg.url, name: read(p["Name"]) || "", date: read(p["Date"]), session: read(p["Session"]), note: read(p["Note"]) || "",
    plaud: read(p["Plaud"]) || "", processed: read(p["Processed"]), words: read(p["Words"]) || [] };
}

async function getAll() {
  const [words, lessons] = await Promise.all([
    queryAll(DS.words, { sorts: [{ property: "Last seen", direction: "descending" }] }),
    queryAll(DS.lessons, { sorts: [{ property: "Date", direction: "descending" }] }),
  ]);
  return { words: words.map(toWord), lessons: lessons.map(toLesson) };
}

const text = (v) => ({ rich_text: rich(v || "") });
const dateP = (v) => ({ date: v ? { start: v } : null });
function wordProps(f) {
  const o = {};
  if ("italian" in f) { o["Italian"] = { title: rich(f.italian) }; o["Key"] = text(keyOf(f.italian)); }
  for (const [k, name] of [["english", "English"], ["forms", "Forms"], ["example", "Example"], ["note", "Note"]]) if (k in f) o[name] = text(f[k]);
  if ("type" in f) o["Type"] = { select: f.type ? { name: f.type } : null };
  if ("status" in f) o["Status"] = { select: f.status ? { name: f.status } : null };
  if ("times" in f) o["Times seen"] = { number: f.times };
  if ("first" in f) o["First seen"] = dateP(f.first);
  if ("last" in f) o["Last seen"] = dateP(f.last);
  if ("needsClaude" in f) o["Needs Claude"] = { checkbox: !!f.needsClaude };
  if ("lessons" in f) o["Lessons"] = { relation: f.lessons.map((id) => ({ id })) };
  return o;
}
async function updateWord(id, f) { return toWord(await call("PATCH", `/pages/${id}`, { properties: wordProps(f) })); }
async function findWord(italian) {
  const rows = await queryAll(DS.words, { filter: { property: "Key", rich_text: { equals: keyOf(italian) } } });
  return rows.length ? toWord(rows[0]) : null;
}
// Count a word once per day: a word that came up today already isn't counted again.
function bump(w, today, lessonId) {
  const f = {};
  if (w.last !== today) { f.times = (w.times || 0) + 1; f.last = today; }
  if (lessonId && !w.lessons.includes(lessonId)) f.lessons = [...w.lessons, lessonId];
  return f;
}
// Quick add from the page: a new word is created (Claude fills the rest); a known one is counted.
async function addWord({ italian, english, lessonId }, today) {
  const w = await findWord(italian);
  if (w) {
    const f = bump(w, today, lessonId);
    if (english && !w.english) f.english = english;
    return { word: Object.keys(f).length ? await updateWord(w.id, f) : w, existed: true, counted: "times" in f };
  }
  const f = { italian: String(italian).trim(), times: 1, first: today, last: today, status: "New", needsClaude: true, lessons: lessonId ? [lessonId] : [] };
  if (english) f.english = english;
  if (/\s/.test(f.italian.trim())) f.type = "Phrase";
  const word = toWord(await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.words }, properties: wordProps(f) }));
  return { word, existed: false, counted: true };
}
// Words Eric used in something he wrote: count each once for today.
async function markSeen(ids, today) {
  const out = [];
  for (const id of ids) {
    const w = toWord(await call("GET", `/pages/${id}`));
    const f = bump(w, today, null);
    out.push(Object.keys(f).length ? await updateWord(id, f) : w);
  }
  return out;
}

function lessonProps(f) {
  const o = {};
  if ("name" in f) o["Name"] = { title: rich(f.name) };
  if ("date" in f) o["Date"] = dateP(f.date);
  if ("session" in f) o["Session"] = { select: f.session ? { name: f.session } : null };
  if ("note" in f) o["Note"] = text(f.note);
  return o;
}
// One lesson per day: return today's if it exists, otherwise create it.
async function lessonFor(today, session, name) {
  const rows = await queryAll(DS.lessons, { filter: { property: "Date", date: { equals: today } } });
  if (rows.length) return toLesson(rows[0]);
  return toLesson(await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.lessons }, properties: lessonProps({ name, date: today, session }) }));
}
async function updateLesson(id, f) { return toLesson(await call("PATCH", `/pages/${id}`, { properties: lessonProps(f) })); }

module.exports = { getAll, addWord, updateWord, markSeen, lessonFor, updateLesson, keyOf, DS };
