// Demo data for /libri (OGGI_DEMO=1). Same shapes as libri.js, kept in memory.
const copy = (x) => JSON.parse(JSON.stringify(x));
const books = [
  { id: "bk1", title: "Istanbul: City of Majesty at the Crossroads of the World", author: "Thomas F. Madden", status: "Reading", chapter: "Ch 5 - Founding a New Rome", chapterNo: 5,
    format: "Audiobook", themes: [], started: "2026-11-08", finished: null, notes: "", cover: "", isbn: "9780143129691", quizBest: null, quizTaken: null,
    quiz: [
      { ch: "1", q: "In the founding legend, why was Chalcedon called the city of the blind?", options: ["Its founders missed the better site across the water", "Its people worshipped a blind god", "It was built in a valley with no view of the sea", "Its king had lost his sight"], answer: 0, why: "Byzas judged that settlers who chose the Asian shore must have been blind to the better site." },
      { ch: "2", q: "Why did Athens care so much about Byzantium?", options: ["Its silver mines", "Its warships", "Grain ships from the Black Sea passed it", "It was Pericles' home"], answer: 2, why: "Athens imported its grain through the Bosporus." },
      { ch: "4", q: "Why did Septimius Severus besiege the city?", options: ["Unpaid taxes", "It backed his rival Pescennius Niger", "It turned Christian", "It allied with Persia"], answer: 1, why: "It sided with Niger in the civil war." },
      { ch: "6", q: "Locked until chapter 6 is done", options: ["a", "b"], answer: 0, why: "" },
    ] },
  { id: "bk2", title: "Atomic Habits", author: "James Clear", status: "Reading", chapter: "Chapter 2: how habits shape identity", chapterNo: 2, format: "", themes: ["Habits", "Discipline", "Mindset"],
    started: "2026-11-09", finished: null, notes: "", cover: "", isbn: "9780735211292", quizBest: 75, quizTaken: "2026-11-13",
    quiz: [{ ch: "1", q: "Roughly how much better are you after a year of 1% a day?", options: ["About 3.6 times", "About 37 times", "365%", "Twice"], answer: 1, why: "1.01^365 ≈ 37.8." }] },
  { id: "bk3", title: "Venice: A New History", author: "Thomas F. Madden", status: "Want to read", chapter: "", chapterNo: 0, format: "", themes: [], started: null, finished: null, notes: "", cover: "", isbn: "", quizBest: null, quizTaken: null, quiz: [] },
];
const quotes = [
  { id: "q1", book: "bk1", kind: "Takeaway", chapter: "1", text: "Byzantium won because of where it stood: the European tip of the Bosporus, where trade and fish had to pass its door.", applied: [] },
  { id: "q2", book: "bk1", kind: "Takeaway", chapter: "2", text: "Whoever held the Bosporus held the grain road to Athens.", applied: [{ day: "2026-11-13", text: "Watched where the ships go from the hotel roof plan — picked the Galata side for sunset." }] },
  { id: "q3", book: "bk1", kind: "Eric captured", chapter: "3", text: "Protection without rulership.", why: "That's how a good mentor works.", applied: [] },
  { id: "q4", book: "bk2", kind: "Takeaway", chapter: "2", text: "Every small action is a vote for the kind of person you are becoming.", applied: [{ day: "2026-11-12", text: "Focused on being the agent who calls back the same day, not on the number of enrollments." }] },
].map((q) => ({ page: "", speaker: "", why: "", favorite: false, captured: "2026-11-12T08:00:00Z", ...q }));
const log = [
  { book: "bk1", day: "2026-11-13", chapter: "3", notes: "Paying attention to the waterways, and how they were pivotal. Whoever controlled it could tax people.", apply: "", point: "" },
  { book: "bk2", day: "2026-11-11", chapter: "1", notes: "", apply: "A client. Just chip away", point: "" },
];
const chap = (t) => { const m = String(t || "").match(/(\d+)/); return m ? Number(m[1]) : 0; };
async function list() {
  return { books: books.map((b) => { const mine = quotes.filter((q) => q.book === b.id); const { quiz, ...r } = b;
    return { ...r, quizCount: quiz.filter((q) => chap(q.ch) < b.chapterNo).length, takeaways: mine.filter((q) => q.kind === "Takeaway").length,
      captured: mine.filter((q) => q.kind !== "Takeaway").length, applied: mine.reduce((n, q) => n + q.applied.length, 0) }; }) };
}
async function get(id) {
  const b = books.find((x) => x.id === id); if (!b) { const e = new Error("not found"); e.status = 404; throw e; }
  const quiz = b.quiz.filter((q) => chap(q.ch) < b.chapterNo);
  return copy({ book: { ...b, quiz: undefined }, quotes: quotes.filter((q) => q.book === id).map(({ book, ...q }) => q), log: log.filter((l) => l.book === id).map(({ book, ...l }) => l), quiz, quizLocked: b.quiz.length - quiz.length });
}
let n = 10;
async function addQuote(bookId, f) { const q = { id: "q" + ++n, book: bookId, kind: "Eric captured", chapter: String(chap(f.chapter) || ""), text: f.text, page: f.page || "", speaker: "", why: f.why || "", favorite: false, captured: new Date().toISOString(), applied: [] }; quotes.push(q); const { book, ...r } = q; return copy(r); }
async function updateQuote(id, f) { const q = quotes.find((x) => x.id === id); Object.assign(q, f); const { book, ...r } = q; return copy(r); }
async function applyTo() { return { ok: true }; }
async function saveQuiz(bookId, day, pct) { const b = books.find((x) => x.id === bookId); b.quizBest = Math.max(b.quizBest || 0, pct); b.quizTaken = day; return { best: b.quizBest }; }
module.exports = { list, get, addQuote, updateQuote, applyTo, saveQuiz };
