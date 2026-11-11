// /fit — Eric's training with London. Two Notion tables under Medicare Marketing / Fit (shared with the
// oggi integration): Workout Log (one row per set, Key = date__exercise__set dedupes) and Fit Check-ins
// (one row per Sunday: waist, photos taken, a note; never weight). The habits he ticks here (walk, protein,
// water, no sugary drinks, workout) go to the Daily Log through coach.js, the same row Roger reads.
// The program itself (sessions, rep ranges, cues) lives in public/fit-data.js, not Notion.

const N = require("./notion");
const coach = require("./coach");
const { _call: call, _read: baseRead, _rich: rich, _queryAll: queryAll, _queryDS: queryDS } = N;

const DS = {
  sets: process.env.NOTION_WORKOUT_LOG_DS || "7fca910a-ec4e-4e00-8e73-c324499ec5da",
  checkins: process.env.NOTION_FIT_CHECKINS_DS || "023b3518-48ec-4a97-9266-4d7267f2235e",
  log: process.env.NOTION_DAILYLOG_DS || "08faadad-0899-4b6e-ac63-46094d86303d",
};
const SESSIONS = ["Upper A", "Lower A", "Upper B", "Lower B", "Extra"];
// The Daily Log habits /fit shows; Roger's checkout still owns the rest.
const FIT_HABITS = ["Workout", "Walk", "Protein every meal", "No sugary drinks", "Veg at 2 meals", "Bed by 10"];

function read(p) {
  if (!p) return null;
  if (p.type === "checkbox") return !!p.checkbox;
  return baseRead(p);
}
const minus = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

function toSet(pg) {
  const p = pg.properties;
  return { id: pg.id, key: read(p["Key"]) || "", date: read(p["Date"]), session: read(p["Session"]), exercise: read(p["Exercise"]) || "",
    ex: read(p["Exercise id"]) || "", set: read(p["Set"]) || 0, weight: read(p["Weight"]), reps: read(p["Reps"]), week: read(p["Week"]) };
}
function toCheckin(pg) {
  const p = pg.properties;
  return { id: pg.id, day: read(p["Day"]) || "", date: read(p["Date"]), waist: read(p["Waist"]), photos: read(p["Photos taken"]) || false,
    note: read(p["Note"]) || "", london: read(p["London"]) || "" };
}
function toLogDay(pg) {
  const p = pg.properties, habits = {};
  for (const h of FIT_HABITS) habits[h] = read(p[h]) || false;
  return { day: read(p["Day"]) || "", habits, water: read(p["Water glasses"]), walkMin: read(p["Walk minutes"]) };
}

async function getAll(today) {
  const since = minus(today, 120);
  const [sets, checkins, logs] = await Promise.all([
    queryAll(DS.sets, { filter: { property: "Date", date: { on_or_after: since } }, sorts: [{ property: "Date", direction: "ascending" }] }),
    queryAll(DS.checkins, { sorts: [{ property: "Date", direction: "ascending" }] }),
    queryDS(DS.log, { filter: { property: "Day", title: { is_not_empty: true } }, sorts: [{ property: "Day", direction: "descending" }], page_size: 21 })
      .then((r) => r.results).catch((e) => { console.error("fit daily log", e.message); return []; }),
  ]);
  const days = logs.map(toLogDay).filter((d) => d.day <= today);
  return { sets: sets.map(toSet), checkins: checkins.map(toCheckin), today: days.find((d) => d.day === today) || null, days, version: "fit-1" };
}

async function findBy(ds, prop, value, type) {
  const r = await queryDS(ds, { filter: { property: prop, [type]: { equals: value } }, page_size: 1 });
  return r.results[0] || null;
}
async function saveSet(f) {
  const key = `${f.date}__${f.ex}__${f.set}`;
  const props = {
    Name: { title: rich(`${f.date} ${f.session} · ${f.exercise} · set ${f.set}`) },
    Key: { rich_text: rich(key) }, Date: { date: { start: f.date } }, Session: { select: { name: f.session } },
    Exercise: { rich_text: rich(f.exercise) }, "Exercise id": { rich_text: rich(f.ex) }, Set: { number: f.set },
    Weight: { number: f.weight }, Reps: { number: f.reps }, Week: { number: f.week || null },
    "Logged at": { date: { start: new Date().toISOString() } },
  };
  const existing = await findBy(DS.sets, "Key", key, "rich_text");
  const page = existing
    ? await call("PATCH", `/pages/${existing.id}`, { properties: props })
    : await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.sets }, properties: props });
  return toSet(page);
}
async function removeSet(key) {
  const existing = await findBy(DS.sets, "Key", key, "rich_text");
  if (existing) await call("PATCH", `/pages/${existing.id}`, { in_trash: true });
  return { ok: true };
}
async function saveCheckin(day, f) {
  const props = {};
  if ("waist" in f) props.Waist = { number: f.waist };
  if ("photos" in f) props["Photos taken"] = { checkbox: !!f.photos };
  if ("note" in f) props.Note = { rich_text: rich(f.note) };
  const existing = await findBy(DS.checkins, "Day", day, "title");
  const page = existing
    ? await call("PATCH", `/pages/${existing.id}`, { properties: props })
    : await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.checkins },
        properties: { ...props, Day: { title: rich(day) }, Date: { date: { start: day } } } });
  return toCheckin(page);
}
// Habits and water go to the Daily Log row Roger reads; coach.save creates the row if the day has none.
async function saveHabits(today, f) { return coach.save(today, f); }

module.exports = { getAll, saveSet, removeSet, saveCheckin, saveHabits, SESSIONS, FIT_HABITS };
