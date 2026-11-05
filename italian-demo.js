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

state.assignments = [
  { id: "as1", url: null, title: "Write 5 sentences about your weekend", kind: "Assignment", from: "Teacher", status: "Assigned", body: "Use the passato prossimo: sono andato, ho mangiato, abbiamo visto… Five short sentences.", quiz: "", answer: "", correction: "", feedback: "", due: "2026-11-08", score: null, doneOn: null, created: "2026-11-04T08:00:00Z" },
  { id: "as2", url: null, title: "Quiz: food and the café", kind: "Quiz", from: "Claude", status: "Assigned", body: "Eight questions on this week's words.", quiz: JSON.stringify({ questions: [
    { q: "“Ho fame” means…", options: ["I'm tired", "I'm hungry", "I'm cold", "I'm late"], answer: 1, explain: "Avere fame: literally “to have hunger”." },
    { q: "Which is “we eat”?", options: ["mangio", "mangiate", "mangiamo", "mangiano"], answer: 2, explain: "noi mangiamo." },
    { q: "Translate: “a coffee, please”", answer: "un caffè, per favore", explain: "Caffè keeps its accent." },
    { q: "“In bocca al lupo!” — the usual reply is…", options: ["Grazie", "Crepi!", "Prego", "Salute"], answer: 1, explain: "Crepi (il lupo)!" } ] }), answer: "", correction: "", feedback: "", due: null, score: null, doneOn: null, created: "2026-11-04T07:00:00Z" },
  { id: "as3", url: null, title: "Al mercato", kind: "Text", from: "Teacher", status: "Assigned", body: "Ogni domenica vado al mercato con mia figlia. Compriamo frutta, pane e formaggio. Poi prendiamo un caffè al bar. Ho sempre fame dopo il mercato!", quiz: "", answer: "", correction: "", feedback: "", due: null, score: null, doneOn: null, created: "2026-11-03T07:00:00Z" },
  { id: "as4", url: null, title: "A short dialogue at a restaurant", kind: "Request", from: "Eric", status: "Queued", body: "Make me a short dialogue at a restaurant using my learning words.", quiz: "", answer: "", correction: "", feedback: "", due: null, score: null, doneOn: null, created: "2026-11-04T09:00:00Z" },
];
state.events = [
  { id: "ev1", title: "Preply lesson - Andreino S.", start: "2026-10-21T21:00:00-10:00", end: "2026-10-21T21:50:00-10:00" },
  { id: "ev2", title: "Preply lesson - Andreino S.", start: "2026-10-28T21:00:00-10:00", end: "2026-10-28T21:50:00-10:00" },
  { id: "ev3", title: "Preply lesson - Andreino S.", start: "2026-11-01T08:00:00-10:00", end: "2026-11-01T08:50:00-10:00" },
  { id: "ev4", title: "Preply lesson - Andreino S.", start: "2026-11-04T21:00:00-10:00", end: "2026-11-04T21:50:00-10:00" },
  { id: "ev5", title: "Preply lesson - Andreino S.", start: "2026-11-11T21:00:00-10:00", end: "2026-11-11T21:50:00-10:00" },
];
state.lessons.push({ id: "les3", url: null, name: "Self-study · Mon Nov 2", date: "2026-11-02", session: "Self-study", note: "Duolingo + flashcards", plaud: "", processed: false, words: [], minutes: 20 });
let access = null;
async function getAll() { return copy(state); }
async function getAssign(i) { const a = state.assignments.find((x) => x.id === i); if (!a) throw Object.assign(new Error("not found"), { status: 404 }); return copy(a); }
async function createAssign(f) { const a = { id: id(), url: null, title: "", kind: null, from: null, status: null, body: "", quiz: "", answer: "", correction: "", feedback: "", due: null, score: null, doneOn: null, created: new Date().toISOString(), ...f }; state.assignments.unshift(a); return copy(a); }
async function updateAssign(i, f) { const a = state.assignments.find((x) => x.id === i); Object.assign(a, f); return copy(a); }
async function getAccess() { return access ? { id: "acc", hash: access } : null; }
async function setAccess(hash) { access = hash || null; }
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
async function lessonFor(today, session, name, extra = {}) {
  const self = session === "Self-study";
  let L = state.lessons.find((x) => x.date === today && (x.session === "Self-study") === self);
  if (L && self && extra.minutes) { L.minutes = (L.minutes || 0) + extra.minutes; if (extra.note) L.note = [L.note, extra.note].filter(Boolean).join(" · "); }
  if (!L) { L = { id: id(), url: null, name, date: today, session, note: "", plaud: "", processed: false, words: [], minutes: null, ...extra }; state.lessons.unshift(L); }
  return copy(L);
}
async function updateLesson(i, f) { const L = state.lessons.find((x) => x.id === i); Object.assign(L, f); return copy(L); }
module.exports = { getAll, addWord, updateWord, markSeen, lessonFor, updateLesson, getAssign, createAssign, updateAssign, getAccess, setAccess, keyOf };
