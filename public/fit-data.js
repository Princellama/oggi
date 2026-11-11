/* Oggi · /fit — the program London coaches. Lean & Aesthetic, 4 days (Notion: Health and Wellness → Lean & Aesthetic: 4-Day Plan).
   Edit here, not in Notion: sessions, rep ranges, increments, cues and swaps. Exercise ids are stored on every Workout Log
   row, so never reuse an id for a different movement; add a new one instead.
   Loaded by the page (window.FIT) and by fit-demo.js (require). */
(function (root) {
  "use strict";
  // kind: big = compound, longer rest; small = isolation. inc = the jump in pounds when the reps say go up.
  const X = (id, name, sets, lo, hi, kind, inc, cues, alts) => ({ id, name, sets, lo, hi, kind, inc, cues, alts: alts || [] });
  const FIT = {
    start: "2026-11-16",          // Monday of week 1
    weeks: 12,
    deload: [6, 12],              // lighter weeks: 2 sets, about 10% off
    ramp: [1, 2],                 // first two weeks back: 2 sets, 3 reps in the tank
    rest: { big: 150, small: 75 },
    // getDay(): 0 Sunday … 6 Saturday
    schedule: { 1: "UA", 2: "LA", 3: "walk", 4: "UB", 5: "LB", 6: "walk45", 0: "checkin" },
    walkGoal: (dow) => (dow === 6 ? 45 : 30),
    // Meals. Plate rules first; numbers only when he has them. proteinGoal is a starting default
    // (about four 30–40 g meals); change it here if Eric's doctor or a weigh-in says otherwise.
    fuel: {
      proteinGoal: 140,
      // one hand-size portion, roughly: palm of protein, fist of veg, cupped hand of carbs, thumb of fat
      hand: {
        protein: { label: "Protein", unit: "palm", cal: 120, protein: 24, carbs: 0, fat: 3, fiber: 0 },
        veg: { label: "Veg", unit: "fist", cal: 25, protein: 1, carbs: 5, fat: 0, fiber: 2 },
        carbs: { label: "Carbs", unit: "cupped hand", cal: 110, protein: 3, carbs: 25, fat: 1, fiber: 2 },
        fat: { label: "Fat", unit: "thumb", cal: 100, protein: 0, carbs: 0, fat: 11, fiber: 0 },
      },
    },
    sessions: {
      UA: { name: "Upper A", focus: "Chest and shoulders", minutes: 55, ex: [
        X("incline-db-press", "Incline dumbbell press", 3, 6, 10, "big", 5,
          ["Bench at about 30 degrees. Shoulder blades pinned back and down.", "Lower to the upper chest, elbows at about 45 degrees, not flared.", "Press up and slightly in. Stop just short of locking out."],
          [{ id: "incline-machine-press", name: "Incline machine press" }, { id: "incline-bb-press", name: "Incline barbell press" }]),
        X("chest-supported-row", "Chest-supported row", 3, 8, 12, "big", 5,
          ["Chest stays on the pad the whole set.", "Pull elbows to your back pockets and squeeze for a beat.", "Full stretch at the bottom; no shrugging."],
          [{ id: "seated-cable-row-ua", name: "Seated cable row" }, { id: "db-row", name: "One-arm dumbbell row" }]),
        X("lat-pulldown", "Lat pulldown", 3, 8, 12, "big", 10,
          ["Grip just outside shoulder width. Chest up toward the bar.", "Drive the elbows down to your sides; don't lean back more than a little.", "Control the bar all the way up."],
          [{ id: "assisted-pullup-ua", name: "Assisted pull-up" }]),
        X("seated-db-press", "Seated dumbbell shoulder press", 2, 8, 12, "big", 5,
          ["Back flat to the bench, ribs down.", "Dumbbells start at ear height, press straight up.", "Don't bang them together at the top."],
          [{ id: "machine-shoulder-press", name: "Machine shoulder press" }]),
        X("lateral-raise", "Lateral raise", 3, 12, 20, "small", 2.5,
          ["Lead with the elbows, slight bend in the arm.", "Raise to shoulder height, no higher. No swinging.", "Three seconds down. This is the one that builds the shape."],
          [{ id: "cable-lateral-ua", name: "Cable lateral raise" }, { id: "machine-lateral", name: "Machine lateral raise" }]),
        X("cable-curl", "Cable curl", 2, 10, 15, "small", 5,
          ["Elbows pinned at your sides.", "Squeeze at the top, slow on the way down."],
          [{ id: "db-curl", name: "Dumbbell curl" }]),
        X("triceps-pushdown", "Triceps pushdown", 2, 10, 15, "small", 5,
          ["Elbows tucked; only the forearms move.", "Lock out hard and hold a beat at the bottom."],
          [{ id: "rope-pushdown", name: "Rope pushdown" }]),
      ] },
      LA: { name: "Lower A", focus: "Quads", minutes: 55, ex: [
        X("squat", "Squat or hack squat", 3, 6, 10, "big", 10,
          ["Brace before you descend: big breath, tight stomach.", "Knees track over the toes; sit between your heels.", "Go as deep as you can with a flat back, then drive up."],
          [{ id: "hack-squat", name: "Hack squat" }, { id: "goblet-squat", name: "Goblet squat" }]),
        X("rdl", "Romanian deadlift", 3, 8, 10, "big", 10,
          ["Soft knees, push the hips back like closing a car door with your backside.", "Bar or dumbbells slide down the thighs.", "Stop when the hamstrings pull, flat back. Stand tall by squeezing the glutes."],
          [{ id: "db-rdl", name: "Dumbbell Romanian deadlift" }]),
        X("leg-press", "Leg press", 2, 10, 15, "big", 10,
          ["Feet mid-platform, shoulder width.", "Lower until the knees reach about 90 degrees, lower back stays on the pad.", "Don't lock the knees at the top."], []),
        X("lying-leg-curl", "Lying leg curl", 3, 10, 15, "small", 5,
          ["Hips pressed into the pad.", "Curl hard, two seconds down."],
          [{ id: "seated-leg-curl-la", name: "Seated leg curl" }]),
        X("standing-calf", "Standing calf raise", 3, 10, 15, "small", 10,
          ["Full stretch at the bottom, pause a second.", "Up onto the big toe, pause at the top."],
          [{ id: "leg-press-calf", name: "Calf press on the leg press" }]),
        X("cable-crunch", "Cable crunch", 3, 10, 15, "small", 5,
          ["Hips stay still; curl the ribs toward the hips.", "Exhale hard at the bottom."],
          [{ id: "ab-machine", name: "Ab crunch machine" }]),
      ] },
      UB: { name: "Upper B", focus: "Back width", minutes: 55, ex: [
        X("pullup", "Pull-up or pulldown", 3, 6, 10, "big", 10,
          ["Start from a dead hang, shoulders down first.", "Chest to the bar, elbows to the ribs.", "Assisted is fine: put the assist as a minus number (−40), and London counts less assist as progress."],
          [{ id: "assisted-pullup", name: "Assisted pull-up" }, { id: "lat-pulldown-ub", name: "Lat pulldown" }]),
        X("bench-press", "Machine or barbell bench press", 3, 6, 10, "big", 5,
          ["Feet planted, shoulder blades squeezed together.", "Bar to the lower chest, forearms vertical.", "Press back toward your face, not straight up."],
          [{ id: "machine-chest-press", name: "Machine chest press" }, { id: "db-bench", name: "Dumbbell bench press" }]),
        X("seated-cable-row", "Seated cable row", 3, 10, 12, "big", 10,
          ["Sit tall; don't rock.", "Pull to the belly button, squeeze the shoulder blades.", "Let the shoulders stretch forward on the way back."],
          [{ id: "machine-row", name: "Machine row" }]),
        X("cable-lateral", "Cable lateral raise", 3, 12, 20, "small", 2.5,
          ["Cable at hand height, behind you.", "Lead with the elbow, stop at shoulder height.", "Slow negative; the stretch at the bottom is the point."],
          [{ id: "lateral-raise-ub", name: "Dumbbell lateral raise" }]),
        X("rear-delt-fly", "Rear-delt fly", 3, 15, 20, "small", 5,
          ["Arms nearly straight, pull wide, not back.", "Think of pushing your hands to the walls."],
          [{ id: "face-pull", name: "Face pull" }]),
        X("incline-db-curl", "Incline dumbbell curl", 2, 10, 15, "small", 5,
          ["Let the arms hang behind you for the stretch.", "Don't let the elbows drift forward."],
          [{ id: "preacher-curl", name: "Preacher curl" }]),
        X("overhead-triceps", "Overhead triceps extension", 2, 10, 15, "small", 5,
          ["Elbows point forward and stay narrow.", "Deep stretch behind the head, then lock out."],
          [{ id: "skull-crusher", name: "EZ-bar skull crusher" }]),
      ] },
      LB: { name: "Lower B", focus: "Glutes and hamstrings", minutes: 55, ex: [
        X("hip-thrust", "Hip thrust", 3, 8, 12, "big", 10,
          ["Upper back on the bench edge, chin tucked.", "Drive through the heels; ribs down at the top.", "Hold the top for a full second."],
          [{ id: "glute-bridge", name: "Barbell glute bridge" }, { id: "hip-thrust-machine", name: "Hip thrust machine" }]),
        X("bulgarian", "Bulgarian split squat (each leg)", 2, 8, 12, "big", 5,
          ["Back foot laces-down on the bench.", "Drop straight down; front heel stays planted.", "Weaker leg first. Weight is per dumbbell."],
          [{ id: "walking-lunge", name: "Walking lunge" }]),
        X("seated-leg-curl", "Seated leg curl", 3, 10, 15, "small", 5,
          ["Lean forward slightly for a bigger stretch.", "Pause with the pad at the bottom."],
          [{ id: "lying-leg-curl-lb", name: "Lying leg curl" }]),
        X("leg-extension", "Leg extension", 2, 12, 15, "small", 5,
          ["Squeeze the quads hard at the top for one second.", "Three seconds down."], []),
        X("seated-calf", "Seated calf raise", 3, 12, 15, "small", 10,
          ["Full stretch, pause.", "Squeeze up, pause."], [{ id: "standing-calf-lb", name: "Standing calf raise" }]),
        X("hanging-knee-raise", "Hanging knee raise", 3, 10, 15, "small", 0,
          ["No swinging; curl the pelvis up.", "Bodyweight: put 0 in the pounds box."],
          [{ id: "captain-chair", name: "Captain's chair knee raise" }]),
      ] },
    },
  };
  // Week number from the start date (week 0 is the reset week before it).
  FIT.weekOf = function (iso) {
    const a = Date.UTC(+FIT.start.slice(0, 4), +FIT.start.slice(5, 7) - 1, +FIT.start.slice(8, 10));
    const b = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    const d = Math.floor((b - a) / 86400000);
    return d < 0 ? 0 : Math.floor(d / 7) + 1;
  };
  FIT.phase = function (week) {
    if (week <= 0) return { k: "reset", sets: 0, rir: 3, label: "Reset week" };
    if (FIT.deload.includes(week)) return { k: "deload", sets: 2, rir: 3, label: "Lighter week" };
    if (FIT.ramp.includes(week)) return { k: "ramp", sets: 2, rir: 3, label: "Coming back" };
    if (week > FIT.weeks) return { k: "full", sets: null, rir: 2, label: "Keep going" };
    return { k: "full", sets: null, rir: 2, label: "Building" };
  };
  FIT.allExercises = function () {
    const out = {};
    for (const [sk, s] of Object.entries(FIT.sessions)) for (const e of s.ex) {
      out[e.id] = { ...e, session: sk };
      for (const a of e.alts) out[a.id] = { ...e, id: a.id, name: a.name, alts: [], session: sk, slot: e.id };
    }
    return out;
  };
  if (typeof module !== "undefined" && module.exports) module.exports = FIT; else root.FIT = FIT;
})(typeof window !== "undefined" ? window : this);
