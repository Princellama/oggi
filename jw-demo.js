// Sample data for /jw in demo mode (npm run dev). Made up; nothing real. Demo PIN: 0000.
const crypto = require("crypto");
const salt = Buffer.from("demo-salt-demo-salt");
const HASH = salt.toString("base64url") + ":" + crypto.scryptSync("0000", salt, 32).toString("base64url");
const parts = [
  { id: "p1", name: "Sample talk (JIRO)", status: "Given", event: "Midweek meeting", when: null, where: "", theme: "", link: "https://example.com", order: 1, deliverables: "", details: "" },
  { id: "p2", name: "Sample assembly part", status: "Draft", event: "Circuit assembly", when: null, where: "Assembly hall", theme: "Sample theme, 10 minutes", link: null, order: 2,
    deliverables: "[x] Reply to accept\nPick interviewees\nDraft the part\nRehearsal", details: "Sample outline notes.\nQuestions:\n- One\n- Two" },
];
const items = [
  { id: "i1", key: "demo-jw", title: "Sample Kalihi task", place: "Kalihi", area: "Personal", status: "Open", sentence: "A made-up item for demo mode.", note: "", lastSeen: "2026-11-13" },
];
const project = { id: "pr1", slug: "demo", name: "Sample hall dedication", status: "Active", when: "2027-05-01T14:00:00-10:00", where: "Sample hall", summary: "Made-up project for demo mode.", facts: "Date: Sat May 1\nProgram: 2:00 PM\nSpeaker: Sample speaker", order: 1 };
const pitems = [
  { id: "a1", kind: "Alert", level: "Action", status: "To do", title: "Sample action alert", lead: "Each CoBE", details: "Reply with approval.", steps: "", notes: "", order: 1 },
  { id: "a2", kind: "Alert", level: "Info", title: "Sample info", details: "Something confirmed.", steps: "", notes: "", order: 2 },
  { id: "m1", kind: "Assignment", mine: true, status: "Doing", title: "Sample overseer role", lead: "Eric", assistants: "A, B, C", due: "2027-05-01T09:00:00-10:00", details: "What the role covers.", steps: "[x] First step\nSecond step\nThird step", notes: "", order: 1 },
  { id: "t1", kind: "Team", title: "Organization", lead: "Person A", assistants: "Person B", order: 1 },
  { id: "t2", kind: "Team", mine: true, title: "Sample team", lead: "Eric", assistants: "A, B", details: "9 AM.", order: 2 },
  { id: "t3", kind: "Team", title: "First aid", lead: "Person C", assistants: "Person D", order: 3 },
  { id: "g1", kind: "Program", minutes: "10", title: "Opening song and prayer", lead: "Chairman", order: 1 },
  { id: "g2", kind: "Program", minutes: "45-60", title: "Main talk", lead: "Speaker", details: "Notes.", order: 2 },
  { id: "d1", kind: "Decision", title: "Sample decision", order: 1 },
];
module.exports = {
  getProject: async (slug) => (slug === "demo" ? { project, items: pitems } : null),
  getPItem: async (id) => pitems.find((x) => x.id === id),
  updatePItem: async (id, f) => Object.assign(pitems.find((x) => x.id === id), f),
  getAccess: async () => HASH,
  getAll: async () => ({ parts, items, literature: [{ id: "l1", item: "Sample tract", symbol: "T-0", language: "English", forWhom: "Kalihi English", quantity: 50, status: "Submitted", requested: "2026-11-13" }], events: [], projects: [project], errors: [] }),
  getPart: async (id) => parts.find((p) => p.id === id),
  updatePart: async (id, f) => Object.assign(parts.find((p) => p.id === id), f),
};
