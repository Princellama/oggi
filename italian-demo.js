// Demo data for /italian (OGGI_DEMO=1). Same shapes as italian.js, kept in memory.
const { keyOf } = { keyOf: (s) => String(s || "").normalize("NFC").replace(/[’‘`´]/g, "'").toLowerCase().replace(/\s+/g, " ").trim() };
const copy = (x) => JSON.parse(JSON.stringify(x));
let n = 0;
const id = () => "it" + ++n;
const W = (italian, english, type, forms, times, first, last, status, extra = {}) =>
  ({ id: id(), url: null, italian, key: keyOf(italian), english, type, forms, example: "", note: "", times, first, last, status, needsClaude: false, lessons: [], phrases: [], parts: [], ...extra });
const state = {
  lessons: [
    { id: "les1", url: null, name: "Lesson · Sun Nov 1", date: "2026-11-01", session: "Sunday morning", note: "Food, the market, ordering at a café.", plaud: "", processed: true, words: [] },
    { id: "les2", url: null, name: "Lesson · Wed Oct 28", date: "2026-10-28", session: "Wednesday night", note: "Introductions and family.", plaud: "", processed: true, words: [] },
  ],
  words: [
    W("mangiare", "to eat", "Verb", "mangio, mangi, mangia, mangiamo, mangiate, mangiano, mangiato, mangiavo", 4, "2026-10-28", "2026-11-01", "Learning", { example: "Mangiamo insieme stasera? (Shall we eat together tonight?)", lessons: ["les1", "les2"] }),
    W("avere", "to have", "Verb", "ho, hai, ha, abbiamo, avete, hanno, avuto, avevo", 5, "2026-10-28", "2026-11-01", "Learning", { note: "Irregular. Used for age and hunger: ho fame, ho sessant'anni." }),
    W("fame", "hunger", "Noun", "", 2, "2026-11-01", "2026-11-01", "New"),
    W("ho fame", "I'm hungry", "Phrase", "", 2, "2026-11-01", "2026-11-01", "New", { example: "Ho fame, andiamo a mangiare! (I'm hungry, let's go eat!)" }),
    W("acqua", "water", "Noun", "acque", 3, "2026-10-28", "2026-11-01", "Known"),
    W("caffè", "coffee", "Noun", "caffe", 3, "2026-11-01", "2026-11-01", "Known"),
    W("per favore", "please", "Phrase", "", 4, "2026-10-28", "2026-11-01", "Known"),
    W("famiglia", "family", "Noun", "famiglie", 1, "2026-10-28", "2026-10-28", "New", { note: "Feminine: la famiglia." }),
    W("figlio", "son", "Noun", "figli, figlia, figlie", 1, "2026-10-28", "2026-10-28", "New"),
    W("andare", "to go", "Verb", "vado, vai, va, andiamo, andate, vanno, andato, andata", 2, "2026-10-28", "2026-11-01", "Learning"),
    W("in bocca al lupo", "good luck (lit. into the wolf's mouth)", "Expression", "", 1, "2026-11-01", "2026-11-01", "New", { note: "Answer: crepi (il lupo)!" }),
    W("allora", "so, well then", "Adverb", "", 1, "2026-11-04", "2026-11-04", "New", { needsClaude: true, english: "" }),
  ],
};
const ph = state.words.find((w) => w.key === "ho fame");
for (const k of ["avere", "fame"]) { const w = state.words.find((x) => x.key === k); w.phrases.push(ph.id); ph.parts.push(w.id); }
for (const w of state.words) for (const l of w.lessons) { const L = state.lessons.find((x) => x.id === l); if (L) L.words.push(w.id); }

async function getAll() { return copy(state); }
const find = (i) => { const w = state.words.find((x) => x.id === i); if (!w) throw Object.assign(new Error("not found"), { status: 404 }); return w; };
async function addWord({ italian, english, lessonId }, today) {
  const w = state.words.find((x) => x.key === keyOf(italian));
  if (w) {
    let counted = false;
    if (w.last !== today) { w.times++; w.last = today; counted = true; }
    if (lessonId && !w.lessons.includes(lessonId)) w.lessons.push(lessonId);
    if (english && !w.english) w.english = english;
    return { word: copy(w), existed: true, counted };
  }
  const nw = W(String(italian).trim(), english || "", /\s/.test(italian.trim()) ? "Phrase" : null, "", 1, today, today, "New", { needsClaude: true, lessons: lessonId ? [lessonId] : [] });
  state.words.unshift(nw);
  return { word: copy(nw), existed: false, counted: true };
}
async function updateWord(i, f) { return copy(Object.assign(find(i), f)); }
async function markSeen(ids, today) { return ids.map((i) => { const w = find(i); if (w.last !== today) { w.times++; w.last = today; } return copy(w); }); }
async function lessonFor(today, session, name) {
  let L = state.lessons.find((x) => x.date === today);
  if (!L) { L = { id: id(), url: null, name, date: today, session, note: "", plaud: "", processed: false, words: [] }; state.lessons.unshift(L); }
  return copy(L);
}
async function updateLesson(i, f) { const L = state.lessons.find((x) => x.id === i); Object.assign(L, f); return copy(L); }
module.exports = { getAll, addWord, updateWord, markSeen, lessonFor, updateLesson, keyOf };
