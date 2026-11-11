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
  fuel: process.env.NOTION_FUEL_LOG_DS || "964f3b3d-0da1-4071-a069-38c9d5cee37d",
};
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack", "Shake"];
const HOWS = ["Plate", "Numbers", "Saved", "Claude"];
const MACROS = { cal: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat", fiber: "Fiber", sugar: "Sugar", added: "Added sugar" };
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
function toMeal(pg) {
  const p = pg.properties, m = { id: pg.id, url: pg.url, name: read(p["Name"]) || "", at: read(p["Date"]), meal: read(p["Meal"]), items: read(p["Items"]) || "",
    london: read(p["London"]) || "", saved: read(p["Saved"]) || false, how: read(p["How"]) };
  for (const [k, name] of Object.entries(MACROS)) m[k] = read(p[name]);
  return m;
}
function toLogDay(pg) {
  const p = pg.properties, habits = {};
  for (const h of FIT_HABITS) habits[h] = read(p[h]) || false;
  return { day: read(p["Day"]) || "", habits, water: read(p["Water glasses"]), walkMin: read(p["Walk minutes"]) };
}

async function getAll(today) {
  const since = minus(today, 120);
  const [sets, checkins, logs, meals, saved] = await Promise.all([
    queryAll(DS.sets, { filter: { property: "Date", date: { on_or_after: since } }, sorts: [{ property: "Date", direction: "ascending" }] }),
    queryAll(DS.checkins, { sorts: [{ property: "Date", direction: "ascending" }] }),
    queryDS(DS.log, { filter: { property: "Day", title: { is_not_empty: true } }, sorts: [{ property: "Day", direction: "descending" }], page_size: 21 })
      .then((r) => r.results).catch((e) => { console.error("fit daily log", e.message); return []; }),
    queryAll(DS.fuel, { filter: { property: "Date", date: { on_or_after: minus(today, 14) } }, sorts: [{ property: "Date", direction: "ascending" }] })
      .catch((e) => { console.error("fuel", e.message); return []; }),
    queryDS(DS.fuel, { filter: { property: "Saved", checkbox: { equals: true } }, sorts: [{ property: "Date", direction: "descending" }], page_size: 40 })
      .then((r) => r.results).catch(() => []),
  ]);
  const days = logs.map(toLogDay).filter((d) => d.day <= today);
    // a usual is the latest row of each saved name
  const usual = [], seen = new Set();
  for (const m of saved.map(toMeal)) { const k = m.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); usual.push(m); } }
  return { sets: sets.map(toSet), checkins: checkins.map(toCheckin), today: days.find((d) => d.day === today) || null, days,
    meals: meals.map(toMeal), usual, version: "fit-2" };
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
function mealProps(f) {
  const props = {};
  if ("name" in f) props.Name = { title: rich(f.name) };
  if ("at" in f) props.Date = { date: { start: f.at } };
  if ("meal" in f) props.Meal = { select: f.meal ? { name: f.meal } : null };
  if ("items" in f) props.Items = { rich_text: rich(f.items) };
  if ("london" in f) props.London = { rich_text: rich(f.london) };
  if ("saved" in f) props.Saved = { checkbox: !!f.saved };
  if ("how" in f) props.How = { select: f.how ? { name: f.how } : null };
  for (const [k, name] of Object.entries(MACROS)) if (k in f) props[name] = { number: f[k] };
  return props;
}
async function addMeal(f) {
  return toMeal(await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.fuel }, properties: mealProps(f) }));
}
async function updateMeal(id, f) { return toMeal(await call("PATCH", `/pages/${id}`, { properties: mealProps(f) })); }
async function removeMeal(id) { await call("PATCH", `/pages/${id}`, { in_trash: true }); return { ok: true }; }
// Habits and water go to the Daily Log row Roger reads; coach.save creates the row if the day has none.
async function saveHabits(today, f) { return coach.save(today, f); }

module.exports = { getAll, saveSet, removeSet, saveCheckin, saveHabits, addMeal, updateMeal, removeMeal, SESSIONS, FIT_HABITS, MEALS, HOWS, MACROS };
