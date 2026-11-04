// /cpa — CPA client meetings. Two Notion tables under Second Brain:
// CPA Clients (cadence, services, YTD figures, the estimate call, watch items) and
// CPA Meetings (when, type, status, agenda checklist JSON, notes, decisions, follow-ups).
// Claude fills the figures and preps agendas; the app edits what Eric does in the room.

const N = require("./notion");
const { _call: call, _read: baseRead, _rich: rich, _queryAll: queryAll } = N;

const DS = {
  clients: process.env.NOTION_CPA_CLIENTS_DS || "97239e72-6236-4d0c-a626-5b8f63a4e047",
  meetings: process.env.NOTION_CPA_MEETINGS_DS || "5a57185f-c613-49f0-a106-ec1e8506bd52",
};

function read(p) {
  if (!p) return null;
  if (p.type === "relation") return (p.relation || []).map((r) => r.id);
  return baseRead(p);
}
const num = (v) => (v == null || v === "" ? null : Number(v));

function toClient(pg) {
  const p = pg.properties;
  return {
    id: pg.id, url: pg.url, name: read(p["Name"]) || "", owner: read(p["Owner"]) || "", entity: read(p["Entity"]),
    cadence: read(p["Cadence"]), services: read(p["Services"]) || [], status: read(p["Status"]) || "Active",
    through: read(p["Through"]), ytdRevenue: read(p["YTD revenue"]), ytdNet: read(p["YTD net"]), projectedNet: read(p["Projected net"]),
    priorTax: read(p["Prior-year tax"]), fedPaid: read(p["Fed estimates paid"]), statePaid: read(p["State estimates paid"]),
    withholding: read(p["Withholding"]), estimateCall: read(p["Estimate call"]) || "", watch: read(p["Watch"]) || "",
    qbo: read(p["QBO"]), taxdome: read(p["TaxDome"]), notes: read(p["Notes"]) || "",
  };
}
function parseAgenda(s) {
  if (!s) return null;
  try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter((x) => x && typeof x.t === "string").map((x) => ({ t: x.t, done: !!x.done })) : null; } catch { return null; }
}
function toMeeting(pg) {
  const p = pg.properties;
  const when = p["When"] && p["When"].date ? p["When"].date.start : null;
  return {
    id: pg.id, url: pg.url, title: read(p["Title"]) || "", when, type: read(p["Type"]) || "Ad hoc", status: read(p["Status"]) || "Planned",
    link: read(p["Link"]), client: (read(p["Client"]) || [])[0] || null, agenda: parseAgenda(read(p["Agenda"])),
    notes: read(p["Notes"]) || "", decisions: read(p["Decisions"]) || "", followups: read(p["Follow-ups"]) || "", brief: read(p["Brief item"]),
  };
}

async function getAll() {
  const [clients, meetings] = await Promise.all([
    queryAll(DS.clients, { sorts: [{ property: "Name", direction: "ascending" }] }),
    queryAll(DS.meetings, { sorts: [{ property: "When", direction: "descending" }] }),
  ]);
  return { clients: clients.map(toClient), meetings: meetings.map(toMeeting) };
}

const text = (v) => ({ rich_text: rich(v || "") });
const sel = (v) => ({ select: v ? { name: v } : null });
const dateP = (v) => ({ date: v ? { start: v } : null });
function clientProps(f) {
  const o = {};
  if ("name" in f) o["Name"] = { title: rich(f.name) };
  if ("owner" in f) o["Owner"] = text(f.owner);
  if ("entity" in f) o["Entity"] = sel(f.entity);
  if ("cadence" in f) o["Cadence"] = sel(f.cadence);
  if ("status" in f) o["Status"] = sel(f.status);
  if ("services" in f) o["Services"] = { multi_select: f.services.map((name) => ({ name })) };
  if ("through" in f) o["Through"] = dateP(f.through);
  const nums = { ytdRevenue: "YTD revenue", ytdNet: "YTD net", projectedNet: "Projected net", priorTax: "Prior-year tax", fedPaid: "Fed estimates paid", statePaid: "State estimates paid", withholding: "Withholding" };
  for (const [k, name] of Object.entries(nums)) if (k in f) o[name] = { number: num(f[k]) };
  const texts = { estimateCall: "Estimate call", watch: "Watch", notes: "Notes" };
  for (const [k, name] of Object.entries(texts)) if (k in f) o[name] = text(f[k]);
  for (const [k, name] of [["qbo", "QBO"], ["taxdome", "TaxDome"]]) if (k in f) o[name] = { url: f[k] || null };
  return o;
}
function meetingProps(f) {
  const o = {};
  if ("title" in f) o["Title"] = { title: rich(f.title) };
  if ("when" in f) o["When"] = dateP(f.when);
  if ("type" in f) o["Type"] = sel(f.type);
  if ("status" in f) o["Status"] = sel(f.status);
  if ("link" in f) o["Link"] = { url: f.link || null };
  if ("client" in f) o["Client"] = { relation: f.client ? [{ id: f.client }] : [] };
  if ("agenda" in f) o["Agenda"] = text(f.agenda ? JSON.stringify(f.agenda) : "");
  for (const [k, name] of [["notes", "Notes"], ["decisions", "Decisions"], ["followups", "Follow-ups"]]) if (k in f) o[name] = text(f[k]);
  return o;
}

async function updateClient(id, f) { return toClient(await call("PATCH", `/pages/${id}`, { properties: clientProps(f) })); }
async function createClient(f) { return toClient(await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.clients }, properties: clientProps(f) })); }
async function updateMeeting(id, f) { return toMeeting(await call("PATCH", `/pages/${id}`, { properties: meetingProps(f) })); }
async function createMeeting(f) { return toMeeting(await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.meetings }, properties: meetingProps(f) })); }

module.exports = { getAll, updateClient, createClient, updateMeeting, createMeeting, DS };
