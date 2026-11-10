// /coach — Roger, Eric's coach. Evening checkout and morning note, stored on the Daily Log (one row per day).
// Roger's replies are written overnight by the 4:41 job into "Roger morning" and "Roger pick"; Oggi only reads them.
const N = require("./notion");
const { _call: call, _read: baseRead, _rich: rich, _queryDS: queryDS } = N;

const DS = {
  log: process.env.NOTION_DAILYLOG_DS || "08faadad-0899-4b6e-ac63-46094d86303d",
  books: process.env.NOTION_BOOKS_DS || "18172872-c5a3-4efc-9592-0de4ea449261",
};
const HABITS = ["Bible reading", "Walk", "Workout", "Italian", "No phone first hour", "Bed by 10", "Reading", "Veg at 2 meals", "No sugary drinks"];
const TEXT = { win: "Win", grateful: "Grateful for", book: "Book", chapter: "Chapter", notes: "Book notes", apply: "Apply", tomorrow: "Tomorrow" };

function read(p) {
  if (!p) return null;
  if (p.type === "checkbox") return !!p.checkbox;
  return baseRead(p);
}
function toDay(pg) {
  if (!pg) return null;
  const p = pg.properties, out = { id: pg.id, day: read(p["Day"]), habits: {} };
  for (const [k, name] of Object.entries(TEXT)) out[k] = read(p[name]) || "";
  for (const h of HABITS) out.habits[h] = read(p[h]) || false;
  out.water = read(p["Water glasses"]); out.walkMin = read(p["Walk minutes"]); out.mood = read(p["Mood"]);
  out.rogerMorning = read(p["Roger morning"]) || ""; out.rogerPick = read(p["Roger pick"]) || "";
  out.checkedOut = read(p["Checked out"]) || false;
  return out;
}
const minus = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

async function findDay(day) {
  const r = await queryDS(DS.log, { filter: { property: "Day", title: { equals: day } }, page_size: 1 });
  return r.results[0] || null;
}
async function streaks(today) {
  const r = await queryDS(DS.log, { filter: { property: "Day", title: { is_not_empty: true } }, sorts: [{ property: "Day", direction: "descending" }], page_size: 30 });
  const rows = r.results.map(toDay).filter((d) => d.day <= today);
  const s = {};
  for (const h of HABITS) {
    let n = 0;
    for (const d of rows) { if (d.day === today && !d.habits[h]) continue; if (d.habits[h]) n++; else break; }
    s[h] = n;
  }
  return s;
}
async function getAll(today) {
  const [t, y, books, st] = await Promise.all([
    findDay(today), findDay(minus(today, 1)),
    queryDS(DS.books, { filter: { property: "Status", select: { equals: "Reading" } }, page_size: 10 }).catch(() => ({ results: [] })),
    streaks(today).catch(() => ({})),
  ]);
  return {
    today: toDay(t), yesterday: toDay(y), streaks: st,
    books: books.results.map((b) => ({ id: b.id, title: read(b.properties["Title"]) || "", author: read(b.properties["Author"]) || "",
      chapter: read(b.properties["Current chapter"]) || "", themes: read(b.properties["Themes"]) || [] })),
  };
}
async function save(today, f) {
  const props = {};
  for (const [k, name] of Object.entries(TEXT)) if (k in f) props[name] = { rich_text: rich(String(f[k] || "").slice(0, 4000)) };
  if (f.habits) for (const h of HABITS) if (h in f.habits) props[h] = { checkbox: !!f.habits[h] };
  if ("water" in f) props["Water glasses"] = { number: f.water == null || f.water === "" ? null : Number(f.water) };
  if ("mood" in f) props["Mood"] = { select: f.mood ? { name: f.mood } : null };
  if ("checkedOut" in f) props["Checked out"] = { checkbox: !!f.checkedOut };
  const existing = await findDay(today);
  const page = existing
    ? await call("PATCH", `/pages/${existing.id}`, { properties: props })
    : await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.log },
        properties: { ...props, Day: { title: rich(today) }, Date: { date: { start: today } } } });
  return toDay(page);
}
module.exports = { getAll, save, HABITS };
