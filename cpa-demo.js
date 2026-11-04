// In-memory stand-in for cpa.js (OGGI_DEMO=1). Same interface, sample rows.
const iso = (add) => { const d = new Date(Date.now() - 10 * 3600e3); d.setUTCDate(d.getUTCDate() + add); return d.toISOString().slice(0, 10); };
let n = 0;
const id = () => "demo-cpa-" + (++n);
const copy = (x) => JSON.parse(JSON.stringify(x));

const state = { clients: [], meetings: [] };
const ekahi = {
  id: id(), url: null, name: "Ekahi Solutions LLC", owner: "Erik Louis", entity: "S corp", cadence: "Quarterly",
  services: ["Bookkeeping", "Payroll", "GE tax", "Estimates", "Business return", "Personal return"], status: "Active",
  through: iso(0), ytdRevenue: 213190.76, ytdNet: 48947.66, projectedNet: 65000, priorTax: null, fedPaid: null, statePaid: null, withholding: null,
  estimateCall: "Undecided. ~$8K tax on ~$65K, ~$4K with truck depreciation. Compare to 2025 tax and Q1–Q3 paid.",
  watch: "HSFCU bank feed down in QBO\nNo depreciation booked; truck financed\nGE refund $16,623 vs G-49 $16,869\nReasonable comp: confirm Erik's W-2", qbo: null, taxdome: null,
  notes: "Pool cleaning and repair. Target margin 40%.",
};
const mori = {
  id: id(), url: null, name: "Dr. Westley Mori", owner: "Westley Mori", entity: "Individual", cadence: "Annual",
  services: ["Personal return", "GE tax"], status: "Active", through: null, ytdRevenue: null, ytdNet: null, projectedNet: null,
  priorTax: 18400, fedPaid: 9000, statePaid: 3000, withholding: 0, estimateCall: "", watch: "", qbo: null, taxdome: null, notes: "",
};
state.clients.push(ekahi, mori);
state.meetings.push(
  { id: id(), url: null, title: "Ekahi Q3 review and year-end estimate", when: iso(0) + "T16:00:00.000-10:00", type: "Quarterly", status: "Prepped", link: "https://meet.google.com/", client: ekahi.id, agenda: null, notes: "", decisions: "", followups: "", brief: null },
  { id: id(), url: null, title: "Ekahi year-end: W-2s, Q4 estimate, 2027 plan", when: iso(66), type: "Year-end", status: "Planned", link: null, client: ekahi.id, agenda: null, notes: "", decisions: "", followups: "", brief: null },
  { id: id(), url: null, title: "Ekahi Q2 check-in", when: iso(-36), type: "Quarterly", status: "Followed up", link: null, client: ekahi.id, agenda: [{ t: "YTD P&L", done: true }], notes: "Broke even for three months; expects Q3 stronger.", decisions: "Meet early November to decide the Q4 estimate.", followups: "Find the July/Sept QBO mismatch", brief: null },
);

async function getAll() { return copy({ clients: state.clients, meetings: [...state.meetings].sort((a, b) => String(b.when).localeCompare(String(a.when))) }); }
function patch(list, rid, f) { const r = list.find((x) => x.id === rid); if (!r) throw Object.assign(new Error("not found"), { status: 404 }); Object.assign(r, f); return copy(r); }
async function updateClient(rid, f) { return patch(state.clients, rid, f); }
async function createClient(f) { const r = { id: id(), url: null, services: [], status: "Active", ...f }; state.clients.push(r); return copy(r); }
async function updateMeeting(rid, f) { return patch(state.meetings, rid, f); }
async function createMeeting(f) { const r = { id: id(), url: null, status: "Planned", type: "Ad hoc", agenda: null, notes: "", decisions: "", followups: "", ...f }; state.meetings.push(r); return copy(r); }

module.exports = { getAll, updateClient, createClient, updateMeeting, createMeeting };
