// Demo data for /techstack (OGGI_DEMO=1). Same shapes as techstack.js.
// Diagrams come from .claude/skill-diagrams/<slug>.png when that folder exists on this machine, else a placeholder.
const fs = require("fs");
const path = require("path");

const skill = (slug, title, area, what, triggers, stack, live = "") => ({
  id: "sk-" + slug, edited: "2026-11-18T07:00:00.000Z", name: `${title} (${slug} skill)`, title, slug, kind: "skill", area,
  stage: "Live", what, who: "Eric", hosting: "", stack, live, next: "", shipped: "2026-11-18", notion: "https://www.notion.so/", triggers, hasImg: true,
});
const skills = [
  skill("retireflo-scope", "RetireFlo Scope", "Medicare", "Fills a client's RetireFlo Scope of Appointment to the signature page; after they sign, countersigns, files the PDF in OneDrive and logs it.", "\"Claude Scope\" · \"Scope signed\"", ["GoHighLevel", "Notion API"], "https://app.retireflo.com/hawaii"),
  skill("fill-cms-40b", "Part B request form", "Medicare", "Fills the CMS-40B Part B request from Notion and GHL and hands Eric a draft PDF, Medicare number and signature left blank.", "\"fill out the 40B for X\"", ["Google APIs", "Notion API", "Python"]),
  skill("medicare-calls", "Medicare call list", "Medicare", "Builds the next calling day's list with a compliant script per person, then files what Eric logged.", "\"who do I call?\" · \"file my calls\"", ["Notion API", "GoHighLevel"], "https://oggi.princellama.com/medicare/calls"),
  skill("daily-brief", "Daily brief", "Daily work", "Morning, afternoon and evening brief: what needs Eric, what closed, written to Notion for Oggi.", "\"/brief\" · \"morning brief\"", ["Notion API", "Google APIs", "Plaud"], "https://oggi.princellama.com"),
  skill("mail-check", "Mail check", "Daily work", "A mail-only pass between briefs: logged sent mail, the CPA and Medicare labels, hand-offs.", "\"check email\"", ["Google APIs", "Notion API"]),
  skill("libri", "Libri", "Personal & JIRO", "Summarizes chapters, adds books, writes takeaways and quizzes for the Libri page.", "\"summarize chapters\" · \"quiz me\"", ["Notion API"], "https://oggi.princellama.com/libri"),
];
skills[3].name = "Daily brief (brief, brief-web, morning skills)";
const apps = [
  { id: "ap-oggi", edited: "2026-11-18T07:00:00.000Z", name: "Oggi — the daily brief on the web", title: "Oggi — the daily brief on the web", slug: "", kind: "app", stage: "Live",
    what: "The morning, afternoon and evening brief as a web app.", who: "Eric", hosting: "Railway", stack: ["Node/Express", "Railway", "Notion API"], live: "https://oggi.princellama.com", next: "", shipped: "2026-11-18", notion: "https://www.notion.so/", hasImg: false },
  { id: "ap-milo", edited: "2026-11-18T07:00:00.000Z", name: "MILO — Maintenance Hub", title: "MILO — Maintenance Hub", slug: "", kind: "app", stage: "Live",
    what: "Runs the Kingdom Hall maintenance programme end to end.", who: "Admins and MSCs", hosting: "Railway", stack: ["Node/Express", "PostgreSQL", "Railway"], live: "", next: "", shipped: "2026-11-10", notion: "https://www.notion.so/", hasImg: false },
];
const software = [
  { id: "t1", name: "GoHighLevel", category: "CRM", purpose: "Client records, pipelines, tasks and texts.", cost: 97, renews: "2026-12-01", notion: "https://www.notion.so/" },
  { id: "t2", name: "RetireFlo", category: "Quoting", purpose: "Client surveys and Scope of Appointment.", cost: null, renews: null, notion: "https://www.notion.so/" },
  { id: "t3", name: "Claude", category: "AI", purpose: "Runs the skills on this page.", cost: 200, renews: null, notion: "https://www.notion.so/" },
  { id: "t4", name: "Notion", category: "Productivity", purpose: "System of record for people and everything Oggi shows.", cost: null, renews: null, notion: "https://www.notion.so/" },
];
async function list() { return JSON.parse(JSON.stringify({ skills, apps, software, errors: [], at: new Date().toISOString() })); }
async function image(id) {
  const slug = String(id).replace(/^sk-/, "");
  const f = path.join(__dirname, ".claude", "skill-diagrams", slug + ".png");
  const g = path.join(__dirname, ".claude", "scope-flow", "retireflo-scope-flow.png");
  const file = fs.existsSync(f) ? f : slug === "retireflo-scope" && fs.existsSync(g) ? g : null;
  return file ? { buf: fs.readFileSync(file), type: "image/png" } : null;
}
module.exports = { list, image };
