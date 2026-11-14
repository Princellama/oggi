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
module.exports = {
  getAccess: async () => HASH,
  getAll: async () => ({ parts, items, literature: [{ id: "l1", item: "Sample tract", symbol: "T-0", language: "English", forWhom: "Kalihi English", quantity: 50, status: "Submitted", requested: "2026-11-13" }], events: [], errors: [] }),
  getPart: async (id) => parts.find((p) => p.id === id),
  updatePart: async (id, f) => Object.assign(parts.find((p) => p.id === id), f),
};
