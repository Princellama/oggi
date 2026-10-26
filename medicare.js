// /medicare — the Medicare marketing tables in Notion.
// Claude writes Pulse rows, campaign counts, field days and post drafts; the app reads them and
// writes back what Eric does (read / acted, costs, post status, a partner's next step, new photos).

const N = require("./notion");
const { _call: call, _read: baseRead, _rich: rich, _plain: plain, _queryAll: queryAll, API, VERSION } = N;

const DS = {
  pulse: process.env.NOTION_PULSE_DS || "290fedaf-813c-421d-a310-f91bb7106d1f",
  campaigns: process.env.NOTION_CAMPAIGNS_DS || "0415f919-2f07-4930-b8e6-477d807ae3c6",
  content: process.env.NOTION_CONTENT_DS || "16fd1657-cc30-405b-a388-20b6d62f67be",
  field: process.env.NOTION_FIELD_DS || "e11838f2-f914-45b1-b478-8dea9e96f56e",
  partners: process.env.NOTION_PARTNERS_DS || "fe50f233-8c9a-4d3c-bce1-ceab5dd05653",
  portals: process.env.NOTION_PORTALS_DS || "e94d3fc0-0caa-461a-b01a-8974241c9c40",
};

function read(p) {
  if (!p) return null;
  if (p.type === "checkbox") return !!p.checkbox;
  if (p.type === "files") return (p.files || []).map((f) => ({ name: f.name }));
  if (p.type === "relation") return (p.relation || []).map((r) => r.id);
  if (p.type === "email") return p.email;
  if (p.type === "phone_number") return p.phone_number;
  return baseRead(p);
}
const dateEnd = (p) => (p && p.type === "date" && p.date ? p.date.end : null);

function toPulse(pg) {
  const p = pg.properties;
  return {
    id: pg.id, url: pg.url, headline: read(p["Headline"]), date: read(p["Date"]), scope: read(p["Scope"]),
    carriers: read(p["Carrier"]) || [], kind: read(p["Kind"]), summary: read(p["Summary"]) || "",
    why: read(p["Why it matters"]) || "", action: read(p["Action"]) || "", link: read(p["Link"]),
    source: read(p["Source"]) || "", key: read(p["Key"]), status: read(p["Status"]) || "New",
    contentIdea: read(p["Content idea"]), created: pg.created_time,
  };
}
function toCampaign(pg) {
  const p = pg.properties;
  return {
    id: pg.id, url: pg.url, name: read(p["Name"]), channel: read(p["Channel"]), carriers: read(p["Carrier"]) || [],
    start: read(p["Start"]), end: read(p["End"]), cost: read(p["Cost"]), pieces: read(p["Pieces"]),
    match: read(p["GHL source match"]) || "", leads: read(p["Leads"]), appointments: read(p["Appointments"]),
    enrollments: read(p["Enrollments"]), countedOn: read(p["Counted on"]), status: read(p["Status"]) || "Running",
    notes: read(p["Notes"]) || "", tracking: read(p["Tracking"]) || "",
  };
}
function toContent(pg) {
  const p = pg.properties;
  return {
    id: pg.id, url: pg.url, title: read(p["Title"]), kind: read(p["Kind"]),
    photos: (read(p["Photo"]) || []).length, thumbs: (read(p["Thumbnail"]) || []).length,
    brief: read(p["Brief"]) || "", ig: read(p["IG caption"]) || "", fb: read(p["FB caption"]) || "",
    summary: read(p["Summary"]) || "", cta: read(p["Call to action"]) || "", disclaimer: read(p["Disclaimer"]) || "",
    compliance: read(p["Compliance"]), materialId: read(p["Material ID"]) || "", status: read(p["Status"]) || "Requested",
    postDate: read(p["Post date"]), campaign: (read(p["Campaign"]) || [])[0] || null, created: pg.created_time,
  };
}
function toPartner(pg) {
  const p = pg.properties;
  return {
    id: pg.id, url: pg.url, name: read(p["Name"]), channel: read(p["Channel"]), type: read(p["Type"]), phase: read(p["Phase"]),
    contact: read(p["Contact person"]) || "", phone: read(p["Phone"]), email: read(p["Email"]),
    networks: read(p["Networks"]) || [], disruption: read(p["Disruption"]), nextStep: read(p["Next step"]) || "",
    lastContact: read(p["Last contact"]), leads: read(p["Leads in GHL"]), notes: read(p["Notes"]) || "",
  };
}
function toField(pg) {
  const p = pg.properties;
  return {
    id: pg.id, name: read(p["Name"]), start: read(p["When"]), end: dateEnd(p["When"]), kind: read(p["Kind"]),
    site: read(p["Site"]), address: read(p["Address"]) || "", carrier: read(p["Carrier"]),
    peopleMet: read(p["People met"]), notes: read(p["Notes"]) || "", campaign: (read(p["Campaign"]) || [])[0] || null,
  };
}

// Carrier Portals: the sites Eric signs in to. Login is the email or username only; Password hint
// says where the password lives. The password itself never goes in Notion or through this app.
function toPortal(pg) {
  const p = pg.properties;
  return {
    id: pg.id, url: pg.url, name: read(p["Name"]), carrier: read(p["Carrier"]), what: read(p["What it does"]) || "",
    kinds: read(p["Kind"]) || [], website: read(p["Website"]), login: read(p["Login"]) || "", hint: read(p["Password hint"]) || "",
    emailsTo: read(p["Emails go to"]), rts: read(p["RTS 2027"]), lastChecked: read(p["Last checked"]),
    support: read(p["Support"]) || "", notes: read(p["Notes"]) || "",
  };
}

const isoDay = (s, add) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + add); return d.toISOString().slice(0, 10); };

// Each table loads on its own, so one table not yet shared with the integration doesn't blank the page.
async function part(fn) {
  try { return { rows: await fn() }; } catch (e) {
    const share = e.status === 404 || /could not find|not shared|object_not_found/i.test(e.message || "");
    return { rows: [], error: share ? "share" : (e.message || "failed") };
  }
}

async function getAll(today) {
  const [pulse, campaigns, content, partners, field, portals] = await Promise.all([
    part(async () => (await queryAll(DS.pulse, {
      filter: { property: "Status", select: { does_not_equal: "Archived" } },
      sorts: [{ property: "Date", direction: "descending" }],
    })).map(toPulse)),
    part(async () => (await queryAll(DS.campaigns, { sorts: [{ property: "Start", direction: "descending" }] })).map(toCampaign)),
    part(async () => (await queryAll(DS.content, { sorts: [{ timestamp: "created_time", direction: "descending" }] })).slice(0, 120).map(toContent)),
    part(async () => (await queryAll(DS.partners, {})).map(toPartner)),
    part(async () => (await queryAll(DS.field, {
      filter: { property: "When", date: { on_or_after: isoDay(today, -14) } },
      sorts: [{ property: "When", direction: "ascending" }],
    })).map(toField)),
    part(async () => (await queryAll(DS.portals, {})).map(toPortal)),
  ]);
  return { pulse, campaigns, content, partners, field, portals };
}

// ---------- writes ----------
const sel = (v) => ({ select: v ? { name: v } : null });
const num = (v) => ({ number: v == null || v === "" ? null : Number(v) });
const day = (v) => ({ date: v ? { start: v } : null });

async function setPulse(id, { status }) {
  return toPulse(await call("PATCH", `/pages/${id}`, { properties: { Status: sel(status) } }));
}

function campaignProps(f) {
  const props = {};
  if ("name" in f) props["Name"] = { title: rich(f.name) };
  if ("channel" in f) props["Channel"] = sel(f.channel);
  if ("carriers" in f) props["Carrier"] = { multi_select: (f.carriers || []).map((name) => ({ name })) };
  if ("start" in f) props["Start"] = day(f.start);
  if ("end" in f) props["End"] = day(f.end);
  if ("cost" in f) props["Cost"] = num(f.cost);
  if ("pieces" in f) props["Pieces"] = num(f.pieces);
  if ("status" in f) props["Status"] = sel(f.status);
  if ("notes" in f) props["Notes"] = { rich_text: rich(f.notes) };
  if ("tracking" in f) props["Tracking"] = { rich_text: rich(f.tracking) };
  if ("match" in f) props["GHL source match"] = { rich_text: rich(f.match) };
  return props;
}
async function updateCampaign(id, f) {
  return toCampaign(await call("PATCH", `/pages/${id}`, { properties: campaignProps(f) }));
}
async function createCampaign(f) {
  return toCampaign(await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.campaigns }, properties: campaignProps(f) }));
}

async function updateContent(id, f) {
  const props = {};
  if ("status" in f) props["Status"] = sel(f.status);
  if ("postDate" in f) props["Post date"] = day(f.postDate);
  if ("materialId" in f) props["Material ID"] = { rich_text: rich(f.materialId) };
  if ("compliance" in f) props["Compliance"] = sel(f.compliance);
  if ("brief" in f) props["Brief"] = { rich_text: rich(f.brief) };
  for (const [k, name] of [["ig", "IG caption"], ["fb", "FB caption"], ["cta", "Call to action"], ["summary", "Summary"]]) {
    if (k in f) props[name] = { rich_text: rich(f[k]) };
  }
  return toContent(await call("PATCH", `/pages/${id}`, { properties: props }));
}

// Upload one image to Notion (single part), returning the file upload id.
async function uploadFile(buf, type, filename) {
  const up = await call("POST", "/file_uploads", { filename, content_type: type });
  const form = new FormData();
  form.append("file", new Blob([buf], { type }), filename);
  const res = await fetch(`${API}/file_uploads/${up.id}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": VERSION },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(json.message || `Upload ${res.status}`); e.status = res.status; throw e; }
  return up.id;
}

async function createContent({ title, kind, brief, campaign, image }) {
  const props = {
    Title: { title: rich(title) },
    Kind: sel(kind),
    Brief: { rich_text: rich(brief || "") },
    Status: sel("Requested"),
  };
  if (campaign) props["Campaign"] = { relation: [{ id: campaign }] };
  if (image) {
    const fid = await uploadFile(image.buf, image.type, image.name);
    props["Photo"] = { files: [{ type: "file_upload", file_upload: { id: fid }, name: image.name }] };
  }
  return toContent(await call("POST", "/pages", { parent: { type: "data_source_id", data_source_id: DS.content }, properties: props }));
}

async function updatePartner(id, f) {
  const props = {};
  if ("nextStep" in f) props["Next step"] = { rich_text: rich(f.nextStep) };
  if ("disruption" in f) props["Disruption"] = sel(f.disruption);
  if ("networks" in f) props["Networks"] = { multi_select: (f.networks || []).map((name) => ({ name })) };
  if ("lastContact" in f) props["Last contact"] = day(f.lastContact);
  return toPartner(await call("PATCH", `/pages/${id}`, { properties: props }));
}

async function updatePortal(id, f) {
  const props = {};
  if ("rts" in f) props["RTS 2027"] = sel(f.rts);
  if ("lastChecked" in f) props["Last checked"] = day(f.lastChecked);
  for (const [k, name] of [["login", "Login"], ["hint", "Password hint"], ["notes", "Notes"], ["support", "Support"]]) {
    if (k in f) props[name] = { rich_text: rich(f[k]) };
  }
  if ("website" in f) props["Website"] = { url: f.website || null };
  return toPortal(await call("PATCH", `/pages/${id}`, { properties: props }));
}

// A photo or thumbnail's signed URL (they expire after an hour, so the server fetches it fresh).
const urlCache = new Map();
async function fileUrl(id, prop, i) {
  const k = `${id}:${prop}:${i}`, hit = urlCache.get(k);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const pg = await call("GET", `/pages/${id}`);
  const f = ((pg.properties[prop] || {}).files || [])[i];
  if (!f) return null;
  const url = f.type === "external" ? f.external.url : f.file.url;
  const exp = f.type === "file" && f.file.expiry_time ? Date.parse(f.file.expiry_time) : Date.now() + 30 * 60_000;
  urlCache.set(k, { url, exp });
  return url;
}

module.exports = { getAll, setPulse, updateCampaign, createCampaign, updateContent, createContent, updatePartner, updatePortal, fileUrl, DS };
