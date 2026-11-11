// In-memory stand-in for fit.js (OGGI_DEMO=1): two and a bit weeks of training so London has history to coach from.
const FIT = require("./public/fit-data");

const iso = (d) => d.toISOString().slice(0, 10);
const add = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
let sets = [], checkins = [], logDays = {}, meals = [], n = 0, start = null;

function seed(today) {
  // Start the demo program on the Monday 15–21 days ago, so today sits in week 3.
  const d = new Date(today + "T12:00:00Z"), dow = d.getUTCDay();
  start = add(today, -((dow + 6) % 7) - 14);
  const base = { "incline-db-press": 40, "chest-supported-row": 55, "lat-pulldown": 100, "seated-db-press": 30, "lateral-raise": 12.5, "cable-curl": 35, "triceps-pushdown": 45,
    squat: 135, rdl: 115, "leg-press": 230, "lying-leg-curl": 70, "standing-calf": 120, "cable-crunch": 60,
    pullup: -50, "bench-press": 135, "seated-cable-row": 100, "cable-lateral": 10, "rear-delt-fly": 60, "incline-db-curl": 20, "overhead-triceps": 40,
    "hip-thrust": 135, bulgarian: 25, "seated-leg-curl": 70, "leg-extension": 80, "seated-calf": 70, "hanging-knee-raise": 0 };
  const order = ["UA", "LA", null, "UB", "LB", null, null];
  for (let w = 0; w < 3; w++) for (let i = 0; i < 7; i++) {
    const day = add(start, w * 7 + i); if (day >= today) break;
    const sk = order[i]; const walk = i === 5 ? 50 : 30 + ((w + i) % 3) * 6;
    logDays[day] = { day, habits: { Workout: !!sk, Walk: true, "Protein every meal": (w + i) % 4 !== 0, "No sugary drinks": true, "Veg at 2 meals": i % 2 === 0, "Bed by 10": i % 3 !== 0 }, water: 7, walkMin: walk };
    if (!sk || (w === 1 && sk === "UB")) continue;   // one missed session, so the make-up offer shows
    const week = w + 1, ph = FIT.phase(week);
    for (const e of FIT.sessions[sk].ex) {
      const ns = ph.sets || e.sets, wgt = base[e.id] + (week >= 2 ? e.inc : 0) + (week >= 3 ? e.inc : 0) * 0;
      for (let s = 1; s <= ns; s++) {
        const reps = Math.max(e.lo, e.hi - (s - 1) - (week === 1 ? 0 : 1) + (e.id === "lat-pulldown" ? 1 : 0));
        sets.push({ id: "s" + ++n, key: `${day}__${e.id}__${s}`, date: day, session: FIT.sessions[sk].name, exercise: e.name, ex: e.id, set: s, weight: wgt, reps: Math.min(reps, e.hi), week });
      }
    }
  }
  checkins = [
    { id: "c1", day: add(start, -1), date: add(start, -1), waist: 36.5, photos: true, note: "Day after the cruise.", london: "" },
    { id: "c2", day: add(start, 6), date: add(start, 6), waist: 36.25, photos: true, note: "", london: "" },
    { id: "c3", day: add(start, 13), date: add(start, 13), waist: 36, photos: false, note: "", london: "" },
  ].filter((c) => c.day < today);
  const shake = { name: "Banana PB protein shake", meal: "Shake", items: "Wyman's protein blend 1 cup; oat milk 1 cup; EarthChimp 2 scoops; creatine 5 g", cal: 490, protein: 32, carbs: 61, fat: 15.5, fiber: 11, sugar: 43, added: 16, how: "Claude", saved: true,
    london: "Good protein, too much sugar for a fat-loss shake. Unsweetened milk and half the fruit blend makes it about 300 calories with nearly the same protein." };
  meals = [
    { id: "m1", ...shake, at: add(today, -1) + "T08:10:00-10:00" },
    { id: "m2", name: "Poke bowl, half rice", meal: "Lunch", items: "2 palms protein, 1 fist veg, 1 hand carbs, 1 thumb fat", cal: 485, protein: 48, carbs: 25, fat: 9, fiber: 2, sugar: 0, added: 0, how: "Plate", saved: true, london: "48 grams of protein. That's a meal.", at: add(today, -1) + "T12:30:00-10:00" },
    { id: "m3", ...shake, at: today + "T07:45:00-10:00", saved: false },
  ];
}

async function getAll(today) {
  if (!start) seed(today);
  const days = Object.values(logDays).filter((d) => d.day <= today).sort((a, b) => (a.day < b.day ? 1 : -1));
  const usual = [...meals].reverse().filter((m, i, a) => m.saved && a.findIndex((x) => x.saved && x.name === m.name) === i);
  return { sets: [...sets].sort((a, b) => (a.date < b.date ? -1 : 1)), checkins, today: logDays[today] || null, days, start, meals: [...meals].sort((a, b) => (a.at < b.at ? -1 : 1)), usual, version: "fit-demo" };
}
async function saveSet(f) {
  const key = `${f.date}__${f.ex}__${f.set}`;
  let r = sets.find((x) => x.key === key);
  if (!r) { r = { id: "s" + ++n, key }; sets.push(r); }
  Object.assign(r, { date: f.date, session: f.session, exercise: f.exercise, ex: f.ex, set: f.set, weight: f.weight, reps: f.reps, week: f.week });
  return r;
}
async function removeSet(key) { sets = sets.filter((x) => x.key !== key); return { ok: true }; }
async function saveCheckin(day, f) {
  let c = checkins.find((x) => x.day === day);
  if (!c) { c = { id: "c" + ++n, day, date: day, waist: null, photos: false, note: "", london: "" }; checkins.push(c); }
  Object.assign(c, f); return c;
}
async function saveHabits(today, f) {
  const d = logDays[today] || (logDays[today] = { day: today, habits: {}, water: null, walkMin: null });
  if (f.habits) Object.assign(d.habits, f.habits);
  if ("water" in f) d.water = f.water; if ("walkMin" in f) d.walkMin = f.walkMin;
  return d;
}
async function addMeal(f) { const m = { id: "m" + ++n, ...f }; meals.push(m); return m; }
async function updateMeal(id, f) { const m = meals.find((x) => x.id === id); if (!m) throw Object.assign(new Error("not found"), { status: 404 }); Object.assign(m, f); return m; }
async function removeMeal(id) { meals = meals.filter((x) => x.id !== id); return { ok: true }; }
module.exports = { getAll, saveSet, removeSet, saveCheckin, saveHabits, addMeal, updateMeal, removeMeal };
