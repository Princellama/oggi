// Thin Notion client for the two Brief tables and QuickActions.
// Uses the data-sources API (Notion-Version 2025-09-03) with plain fetch.

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";

const DS = {
  days: process.env.NOTION_DAYS_DS || "292f1929-9158-4c3f-8e80-80ad70cd4b13",
  items: process.env.NOTION_ITEMS_DS || "56605421-1249-4338-9a43-4ac9edc3bddc",
  tasks: process.env.NOTION_TASKS_DS || "15f8f469-b674-81ae-bbef-000bb207a508",
};

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || `Notion ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// ---- property helpers ----
const plain = (rt) => (rt || []).map((t) => t.plain_text).join("");
function read(p) {
  if (!p) return null;
  switch (p.type) {
    case "title": return plain(p.title);
    case "rich_text": return plain(p.rich_text);
    case "select": return p.select ? p.select.name : null;
    case "number": return p.number;
    case "url": return p.url;
    case "date": return p.date ? p.date.start : null;
    default: return null;
  }
}
// Notion caps one text object at 2000 chars; split long strings.
function rich(text) {
  const s = String(text || "");
  const out = [];
  for (let i = 0; i < s.length; i += 1900) out.push({ type: "text", text: { content: s.slice(i, i + 1900) } });
  return out;
}

function toItem(page) {
  const p = page.properties;
  return {
    id: page.id,
    key: read(p["Key"]),
    title: read(p["Title"]),
    mapLabel: read(p["Map label"]),
    place: read(p["Place"]) || "Skyline",
    area: read(p["Area"]),
    list: read(p["List"]),
    status: read(p["Status"]) || "Open",
    order: read(p["Order"]) ?? 99,
    sentence: read(p["Sentence"]),
    sourcePhrase: read(p["Source phrase"]),
    link: read(p["Link"]),
    task: read(p["Task"]),
    carries: read(p["Carries"]) || 0,
    firstSeen: read(p["First seen"]),
    lastSeen: read(p["Last seen"]),
    note: read(p["Note"]) || "",
    decision: read(p["Decision"]),
    decidedAt: read(p["Decided at"]),
  };
}

function toDay(page) {
  const p = page.properties;
  return {
    id: page.id,
    date: read(p["Name"]),
    pass: read(p["Pass"]) || "Morning",
    shape: read(p["Shape"]),
    headline: read(p["Headline"]),
    mapCaption: read(p["Map caption"]),
    intentions: read(p["Intentions"]) || "",
    log: read(p["Log"]) || "",
    edits: read(p["Edits since brief"]) || "",
    published: read(p["Published"]),
  };
}

// The day's structured data (acts, events, motifs, tomorrow) lives in the
// first JSON code block of the page body.
async function dayData(pageId) {
  const res = await call("GET", `/blocks/${pageId}/children?page_size=50`);
  for (const b of res.results) {
    if (b.type === "code") {
      const txt = plain(b.code.rich_text);
      try { return JSON.parse(txt); } catch { return {}; }
    }
  }
  return {};
}

async function queryDS(ds, body) {
  return call("POST", `/data_sources/${ds}/query`, body);
}

async function getBrief(date) {
  // Latest day on or before the requested date.
  const q = await queryDS(DS.days, {
    filter: date ? { property: "Date", date: { on_or_before: date } } : undefined,
    sorts: [{ property: "Date", direction: "descending" }],
    page_size: 2,
  });
  if (!q.results.length) return null;
  const day = toDay(q.results[0]);
  const previous = q.results[1] ? toDay(q.results[1]) : null;
  const [data, itemsRes] = await Promise.all([
    dayData(day.id),
    queryDS(DS.items, {
      filter: { property: "Last seen", date: { equals: day.date } },
      sorts: [{ property: "Order", direction: "ascending" }],
      page_size: 100,
    }),
  ]);
  return {
    day: { ...day, ...data, previousIntentions: previous ? previous.intentions : "" },
    items: itemsRes.results.map(toItem),
  };
}

async function updateItem(id, fields) {
  const props = {};
  if ("title" in fields) props["Title"] = { title: rich(fields.title) };
  if ("note" in fields) props["Note"] = { rich_text: rich(fields.note) };
  if ("place" in fields) props["Place"] = { select: { name: fields.place } };
  if ("area" in fields) props["Area"] = { select: { name: fields.area } };
  if ("order" in fields) props["Order"] = { number: fields.order };
  if ("status" in fields) props["Status"] = { select: { name: fields.status } };
  if ("decision" in fields) {
    props["Decision"] = fields.decision ? { select: { name: fields.decision } } : { select: null };
    props["Decided at"] = fields.decision ? { date: { start: new Date().toISOString() } } : { date: null };
  }
  const page = await call("PATCH", `/pages/${id}`, { properties: props });
  return toItem(page);
}

async function getPage(id) {
  return call("GET", `/pages/${id}`);
}

async function updateDay(id, fields) {
  const props = {};
  if ("intentions" in fields) props["Intentions"] = { rich_text: rich(fields.intentions) };
  if ("log" in fields) props["Log"] = { rich_text: rich(fields.log) };
  if ("edits" in fields) props["Edits since brief"] = { rich_text: rich(fields.edits) };
  const page = await call("PATCH", `/pages/${id}`, { properties: props });
  return toDay(page);
}

// Append one line to the day's change log (kept to the last ~60 lines).
async function logEdit(dayId, line, mergeKey) {
  const page = await getPage(dayId);
  const cur = read(page.properties["Edits since brief"]) || "";
  let lines = cur ? cur.split("\n") : [];
  // A note typed in bursts saves several times; keep only its latest wording.
  if (mergeKey && lines.length && lines[lines.length - 1].includes(mergeKey)) lines.pop();
  lines = lines.concat(line).slice(-60);
  await updateDay(dayId, { edits: lines.join("\n") });
  return lines.join("\n");
}

// The evening decision moves the matching QuickAction too.
// Tomorrow -> tomorrow's date; This week -> coming Friday; Let go -> a line in the body, nothing deleted.
function taskId(url) {
  const m = String(url || "").match(/([0-9a-f]{32})/i);
  return m ? m[1] : null;
}
async function applyDecisionToTask(taskUrl, decision, localDate) {
  const id = taskId(taskUrl);
  if (!id) return;
  const d = new Date(localDate + "T12:00:00Z");
  if (decision === "Tomorrow" || decision === "This week") {
    if (decision === "Tomorrow") d.setUTCDate(d.getUTCDate() + 1);
    else {
      const add = (5 - d.getUTCDay() + 7) % 7 || 7; // coming Friday
      d.setUTCDate(d.getUTCDate() + add);
    }
    const due = d.toISOString().slice(0, 10);
    await call("PATCH", `/pages/${id}`, { properties: { "Due Date": { date: { start: due } } } });
  } else if (decision === "Let go") {
    await call("PATCH", `/blocks/${id}/children`, {
      children: [{ object: "block", type: "paragraph", paragraph: { rich_text: rich(`Set down from the brief on ${localDate}. The task stays; the brief stops carrying it.`) } }],
    });
  }
}

async function createTask(text, localDate) {
  const page = await call("POST", "/pages", {
    parent: { type: "data_source_id", data_source_id: DS.tasks },
    properties: {
      Name: { title: rich(text) },
      Status: { status: { name: "To Do" } },
      "Due Date": { date: { start: localDate } },
    },
    children: [{ object: "block", type: "paragraph", paragraph: { rich_text: rich(`Captured in Oggi on ${localDate}.`) } }],
  }).catch(async (e) => {
    // Status may be a select rather than a status property; retry with select.
    if (e.status !== 400) throw e;
    return call("POST", "/pages", {
      parent: { type: "data_source_id", data_source_id: DS.tasks },
      properties: {
        Name: { title: rich(text) },
        Status: { select: { name: "To Do" } },
        "Due Date": { date: { start: localDate } },
      },
      children: [{ object: "block", type: "paragraph", paragraph: { rich_text: rich(`Captured in Oggi on ${localDate}.`) } }],
    });
  });
  return { id: page.id, url: page.url };
}

module.exports = { getBrief, updateItem, updateDay, logEdit, applyDecisionToTask, createTask, getPage, toItem };
