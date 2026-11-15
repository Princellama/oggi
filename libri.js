// /libri — Eric's books. A cover shelf, and a page per book: Claude's takeaways by chapter with what Eric
// told Roger when he applied each one, the lines Eric captured, his reading notes from the Daily Log,
// and a quiz on the chapters he has finished. Claude's libri skill writes takeaways, quizzes and covers.
const N = require("./notion");
const { _call: call, _read: baseRead, _rich: rich, _queryDS: queryDS, _queryAll: queryAll } = N;

const DS = {
  books: process.env.NOTION_BOOKS_DS || "18172872-c5a3-4efc-9592-0de4ea449261",
  quotes: process.env.NOTION_QUOTES_DS || "fe6d0f14-dbba-4863-9a2c-4f19be9cffe5",
  log: process.env.NOTION_DAILYLOG_DS || "08faadad-0899-4b6e-ac63-46094d86303d",
};
const STATUS_ORDER = { "Reading": 0, "Want to read": 1, "Finished": 2, "Set aside": 3 };

function read(p) {
  if (!p) return null;
  if (p.type === "status") return p.status ? p.status.name : null;
  if (p.type === "checkbox") return !!p.checkbox;
  if (p.type === "relation") return (p.relation || []).map((r) => r.id);
  if (p.type === "created_time") return p.created_time;
  return baseRead(p);
}
const chapterNo = (t) => { const m = String(t || "").match(/(\d+)/); return m ? Number(m[1]) : 0; };
const dash = (id) => String(id || "").replace(/-/g, "");

function parseQuiz(s) {
  if (!s) return [];
  try {
    const q = JSON.parse(s);
    return Array.isArray(q) ? q.filter((x) => x && x.q && Array.isArray(x.options) && Number.isInteger(x.answer)) : [];
  } catch { return []; }
}
function toBook(pg) {
  const p = pg.properties;
  const b = {
    id: pg.id, title: read(p["Title"]) || "", author: read(p["Author"]) || "", status: read(p["Status"]) || "Want to read",
    chapter: read(p["Current chapter"]) || "", format: read(p["Format"]) || "", themes: read(p["Themes"]) || [],
    started: read(p["Started"]), finished: read(p["Finished"]), notes: read(p["Notes"]) || "",
    cover: read(p["Cover"]) || "", isbn: read(p["ISBN"]) || "", quizBest: read(p["Quiz best"]), quizTaken: read(p["Quiz taken"]),
  };
  if (!b.cover && b.isbn) b.cover = `https://covers.openlibrary.org/b/isbn/${b.isbn.replace(/[^0-9Xx]/g, "")}-M.jpg`;
  b.chapterNo = chapterNo(b.chapter);
  b.quiz = parseQuiz(read(p["Quiz"]));
  return b;
}
function toQuote(pg) {
  const p = pg.properties;
  const applied = String(read(p["Applied"]) || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(\d{4}-\d{2}-\d{2})\s*[·\-:]\s*(.*)$/);
    return m ? { day: m[1], text: m[2] } : { day: "", text: l };
  });
  return { id: pg.id, text: read(p["Quote"]) || "", kind: read(p["Kind"]) || "", chapter: read(p["Chapter"]) || "", page: read(p["Page"]) || "",
    speaker: read(p["Speaker"]) || "", why: read(p["Why it hit"]) || "", favorite: read(p["Favorite"]) || false,
    captured: read(p["Captured"]) || pg.created_time, applied, book: read(p["Book"]) || [] };
}

// The shelf: every book, Reading first, with counts so a cover can say what's inside.
async function list() {
  const [books, quotes] = await Promise.all([
    queryAll(DS.books, {}),
    queryAll(DS.quotes, { filter: { property: "Book", relation: { is_not_empty: true } } }),
  ]);
  const qs = quotes.map(toQuote);
  const out = books.map(toBook).map((b) => {
    const mine = qs.filter((q) => q.book.some((id) => dash(id) === dash(b.id)));
    const { quiz, ...rest } = b;
    return { ...rest, quizCount: quiz.filter((q) => chapterNo(q.ch) < (b.status === "Finished" ? 1e9 : b.chapterNo)).length,
      takeaways: mine.filter((q) => q.kind === "Takeaway").length, captured: mine.filter((q) => q.kind !== "Takeaway").length,
      applied: mine.reduce((n, q) => n + q.applied.length, 0) };
  });
  out.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || String(b.started || "").localeCompare(String(a.started || "")) || a.title.localeCompare(b.title));
  return { books: out };
}

// One book: its takeaways and captured lines (with Roger's answers), Daily Log notes and answers that name it, and the quiz.
async function get(id) {
  const pg = await call("GET", `/pages/${id}`);
  const b = toBook(pg);
  const [quotes, days] = await Promise.all([
    queryAll(DS.quotes, { filter: { property: "Book", relation: { contains: pg.id } } }),
    b.title ? queryAll(DS.log, { filter: { property: "Book", rich_text: { equals: b.title } }, sorts: [{ property: "Day", direction: "descending" }] }).catch(() => []) : [],
  ]);
  const qs = quotes.map(toQuote).sort((x, y) => chapterNo(x.chapter) - chapterNo(y.chapter) || String(x.captured).localeCompare(String(y.captured)));
  const log = days.map((d) => {
    const p = d.properties;
    return { day: read(p["Day"]) || "", chapter: read(p["Chapter"]) || "", notes: read(p["Book notes"]) || "", apply: read(p["Apply"]) || "", point: read(p["Apply point"]) || "" };
  }).filter((d) => d.notes || d.apply);
  // Quiz only on chapters Eric has finished (all of them once the book is done).
  const upTo = b.status === "Finished" ? 1e9 : b.chapterNo;
  const quiz = b.quiz.filter((q) => chapterNo(q.ch) < upTo);
  return { book: { ...b, quiz: undefined }, quotes: qs.map(({ book, ...q }) => q), log, quiz, quizLocked: b.quiz.length - quiz.length };
}

// Eric adds a line he wants to keep.
async function addQuote(bookId, f) {
  const props = { Quote: { title: rich(f.text) }, Kind: { select: { name: "Eric captured" } }, Book: { relation: [{ id: bookId }] } };
  if (f.chapter) props.Chapter = { rich_text: rich(String(chapterNo(f.chapter) || f.chapter)) };
  if (f.page) props.Page = { rich_text: rich(f.page) };
  if (f.why) props["Why it hit"] = { rich_text: rich(f.why) };
  if (f.speaker) props.Speaker = { rich_text: rich(f.speaker) };
  const pg = await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.quotes }, properties: props });
  const { book, ...q } = toQuote(pg);
  return q;
}
async function updateQuote(id, f) {
  const props = {};
  if ("favorite" in f) props.Favorite = { checkbox: !!f.favorite };
  if ("why" in f) props["Why it hit"] = { rich_text: rich(f.why || "") };
  const pg = await call("PATCH", `/pages/${id}`, { properties: props });
  const { book, ...q } = toQuote(pg);
  return q;
}
// Roger asked how Eric used a point; the answer is kept on that point, newest last.
async function applyTo(quoteId, day, text) {
  const pg = await call("GET", `/pages/${quoteId}`);
  const prev = String(read(pg.properties["Applied"]) || "").trim();
  const line = `${day} · ${String(text).replace(/\s+/g, " ").trim()}`;
  const lines = prev ? prev.split("\n").filter((l) => !l.startsWith(day + " ")) : [];
  lines.push(line);
  await call("PATCH", `/pages/${quoteId}`, { properties: { Applied: { rich_text: rich(lines.join("\n").slice(-3800)) }, "Applied on": { date: { start: day } } } });
  return { ok: true };
}
async function saveQuiz(bookId, day, pct) {
  const pg = await call("GET", `/pages/${bookId}`);
  const best = read(pg.properties["Quiz best"]);
  const props = { "Quiz taken": { date: { start: day } } };
  if (best == null || pct > best) props["Quiz best"] = { number: pct };
  await call("PATCH", `/pages/${bookId}`, { properties: props });
  return { best: best == null ? pct : Math.max(best, pct) };
}
module.exports = { list, get, addQuote, updateQuote, applyTo, saveQuiz };
