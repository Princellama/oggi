// /jw — the Kalihi JW galaxy. Everything here comes from Notion at request time, behind
// Oggi sign-in AND the /jw PIN. Nothing JW-specific (assignments, names, the PIN) lives in this repo.

const n = require("./notion");
const { _call: call, _read: read, _rich: rich, _queryAll: queryAll, toItem } = n;

const DS = {
  parts: process.env.NOTION_JW_PARTS_DS || "4188f469-b674-81b2-9f6c-000b6096ee41",
  lit: process.env.NOTION_JW_LIT_DS || "4188f469-b674-8144-9a0e-000becc71b29",
  items: process.env.NOTION_ITEMS_DS || "56605421-1249-4338-9a43-4ac9edc3bddc",
};

function toPart(page) {
  const p = page.properties;
  const when = p["When"] && p["When"].date;
  return {
    id: page.id,
    url: page.url,
    name: read(p["Name"]) || "",
    status: read(p["Status"]),
    event: read(p["Event"]) || "",
    when: when ? when.start : null,
    whenEnd: when ? when.end : null,
    where: read(p["Where"]) || "",
    theme: read(p["Theme"]) || "",
    link: read(p["Link"]),
    order: read(p["Order"]) ?? 99,
    deliverables: read(p["Deliverables"]) || "",
    details: read(p["Details"]) || "",
  };
}
function toLit(page) {
  const p = page.properties;
  return {
    id: page.id,
    item: read(p["Item"]) || "",
    symbol: read(p["Symbol"]) || "",
    language: read(p["Language"]),
    forWhom: read(p["For"]),
    quantity: read(p["Quantity"]),
    status: p["Status"] && p["Status"].status ? p["Status"].status.name : null,
    requested: read(p["Requested"]),
    received: read(p["Received"]),
    careOf: read(p["Care of"]) || "",
    notes: read(p["Notes"]) || "",
  };
}

async function getAccess() {
  const rows = await queryAll(DS.parts, { filter: { property: "Kind", select: { equals: "Access" } } });
  return rows.length ? read(rows[0].properties["Body"]) || null : null;
}

async function getParts() {
  const rows = await queryAll(DS.parts, {
    filter: { property: "Kind", select: { equals: "Part" } },
    sorts: [{ property: "Order", direction: "ascending" }],
  });
  return rows.map(toPart);
}
async function getPart(id) { return toPart(await call("GET", `/pages/${id}`)); }
async function updatePart(id, f) {
  const props = {};
  if ("deliverables" in f) props["Deliverables"] = { rich_text: rich(f.deliverables) };
  if ("status" in f) props["Status"] = { select: f.status ? { name: f.status } : null };
  const page = await call("PATCH", `/pages/${id}`, { properties: props });
  return toPart(page);
}

// Kalihi items: every open one, plus anything closed or seen in the last two weeks.
async function getItems(today) {
  const since = new Date(new Date(today + "T12:00:00Z").getTime() - 14 * 864e5).toISOString().slice(0, 10);
  const rows = await queryAll(DS.items, {
    filter: { and: [
      { property: "Place", select: { equals: "Kalihi" } },
      { or: [{ property: "Status", select: { equals: "Open" } }, { property: "Last seen", date: { on_or_after: since } }] },
    ] },
  });
  return rows.map(toItem).sort((a, b) => (a.status === b.status ? String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")) : a.status === "Open" ? -1 : 1));
}

async function getLiterature() {
  const rows = await queryAll(DS.lit, { sorts: [{ property: "Requested", direction: "descending" }] });
  return rows.map(toLit).slice(0, 80);
}

async function getEvents(today) {
  const evs = await n.getEvents(today);
  return evs.filter((e) => e.calendar === "Kalihi JW" || e.calendar === "Field service").slice(0, 40);
}

// Each section loads on its own, so one table the integration can't see doesn't blank the page.
async function getAll(today) {
  const errors = [];
  const safe = (name, p) => p.catch((e) => { console.error("jw", name, e.message); errors.push(name); return []; });
  const [parts, items, literature, events] = await Promise.all([
    safe("parts", getParts()), safe("items", getItems(today)), safe("literature", getLiterature()), safe("events", getEvents(today)),
  ]);
  return { parts, items, literature, events, errors };
}

module.exports = { getAll, getAccess, getPart, updatePart, DS };
