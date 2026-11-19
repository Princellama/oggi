// /techstack — everything Eric runs on, in one place.
// Claude skills and the apps he built come from Apps & AI Projects (one row each; a skill's flow diagram is the
// first image on its page, put there by Claude whenever a skill is added or changed). Software and SaaS come from
// Tech Stack Inventory. Read live from Notion with a short cache, so a new or changed row shows up on its own.
// Login Notes in Tech Stack Inventory never leave Notion.
const N = require("./notion");
const { _call: call, _read: read, _queryAll: queryAll } = N;

const DS = {
  apps: process.env.NOTION_APPS_DS || "37ffdfc6-6d9f-400d-aa6c-0914fe968e9c",
  tools: process.env.NOTION_TOOLS_DS || "d3e23b18-70bf-45bf-b64c-f6dc1cde8070",
};
const LIST_TTL = 5 * 60_000;
let listCache = null; // { at, data }
const pageCache = new Map(); // page id -> { edited, img: { url, exp }, triggers }
const imgCache = new Map(); // `${id}:${edited}` -> { buf, type }

const plainBlock = (b) => ((b[b.type] && b[b.type].rich_text) || []).map((t) => t.plain_text).join("").trim();
const slugOf = (name) => { const m = String(name || "").match(/\(([^)]*?)\s+skills?\)\s*$/i); return m ? m[1].trim() : ""; };
const plainName = (name) => String(name || "").replace(/\s*\([^)]*\bskills?\)\s*$/i, "").trim();

// Which shelf a skill sits on. Keyword based so a brand-new skill lands somewhere sensible without code changes.
function areaOf(s) {
  const t = `${s.name} ${s.slug} ${s.what}`;
  if (/medicare|retireflo|ghl|part b|cms-40b|call script|scope of appointment/i.test(t)) return "Medicare";
  if (/italian|libri|book|jiro|cinemagraph|photo|milo|talk/i.test(t)) return "Personal & JIRO";
  return "Daily work";
}

function toApp(pg) {
  const p = pg.properties;
  const name = read(p["Name"]) || "";
  const slug = slugOf(name);
  const a = {
    id: pg.id, edited: pg.last_edited_time, name, title: plainName(name), slug,
    kind: slug ? "skill" : "app",
    stage: (p["Stage"] && p["Stage"].select && p["Stage"].select.name) || "",
    what: read(p["What it does"]) || "", who: read(p["Who uses it"]) || "",
    hosting: read(p["Hosting and accounts"]) || "", stack: read(p["Stack"]) || [],
    live: read(p["Live URL"]) || "", next: read(p["Next thing"]) || "",
    shipped: read(p["Last shipped"]), notion: pg.url,
  };
  if (a.kind === "skill") a.area = areaOf(a);
  return a;
}
function toTool(pg) {
  const p = pg.properties;
  // Login Notes is deliberately not read.
  return { id: pg.id, name: read(p["Tool"]) || "", category: read(p["Category"]) || "Other", purpose: read(p["Purpose"]) || "",
    cost: read(p["Monthly Cost"]), renews: read(p["Renewal Date"]), notion: pg.url };
}

async function safe(fn, label) {
  try { return { rows: await fn() }; }
  catch (e) {
    const hint = e.status === 404 || e.status === 403 ? `Share “${label}” with the oggi integration in Notion (••• → Connections).` : e.message;
    return { rows: [], error: hint };
  }
}

async function list(fresh) {
  if (!fresh && listCache && Date.now() - listCache.at < LIST_TTL) return listCache.data;
  const [apps, tools] = await Promise.all([
    safe(async () => (await queryAll(DS.apps, {})).map(toApp), "Apps & AI Projects"),
    safe(async () => (await queryAll(DS.tools, {})).map(toTool), "Tech Stack Inventory"),
  ]);
  const skills = apps.rows.filter((a) => a.kind === "skill").sort((a, b) => a.title.localeCompare(b.title));
  const built = apps.rows.filter((a) => a.kind === "app").sort((a, b) => (a.stage === "Live" ? 0 : 1) - (b.stage === "Live" ? 0 : 1) || a.title.localeCompare(b.title));
  const software = tools.rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  // Triggers come from each page body; fetch them alongside (cached per page edit).
  await Promise.all(skills.map(async (s) => { const d = await detail(s.id, s.edited).catch(() => null); s.triggers = d ? d.triggers : ""; s.hasImg = !!(d && d.img); }));
  await Promise.all(built.map(async (s) => { const d = await detail(s.id, s.edited).catch(() => null); s.hasImg = !!(d && d.img); }));
  const data = { skills, apps: built, software, errors: [apps.error, tools.error].filter(Boolean), at: new Date().toISOString() };
  listCache = { at: Date.now(), data };
  return data;
}

// A page's first image (the diagram) and its Triggers section, cached until the page is edited or the file link expires.
async function detail(id, edited) {
  const c = pageCache.get(id);
  if (c && c.edited === edited && (!c.img || c.img.exp > Date.now() + 60_000)) return c;
  const blocks = [];
  let cursor;
  do {
    const r = await call("GET", `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    blocks.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor && blocks.length < 300);
  let img = null;
  const im = blocks.find((b) => b.type === "image");
  if (im) {
    const f = im.image;
    img = f.type === "file" ? { url: f.file.url, exp: Date.parse(f.file.expiry_time) || Date.now() + 30 * 60_000 } : { url: f.external.url, exp: Date.now() + 864e5 };
  }
  let triggers = [];
  const t = blocks.findIndex((b) => /^heading_/.test(b.type) && /trigger/i.test(plainBlock(b)));
  if (t >= 0) for (const b of blocks.slice(t + 1)) { if (/^heading_/.test(b.type)) break; const s = plainBlock(b); if (s) triggers.push(s); }
  const d = { edited, img, triggers: triggers.join(" · ").slice(0, 400) };
  pageCache.set(id, d);
  return d;
}

// The diagram bytes for one row, for the thumbnail and the full view.
async function image(id) {
  const data = await list(false);
  const row = [...data.skills, ...data.apps].find((r) => r.id.replace(/-/g, "") === String(id).replace(/-/g, ""));
  if (!row) return null;
  const key = `${row.id}:${row.edited}`;
  if (imgCache.has(key)) return imgCache.get(key);
  const d = await detail(row.id, row.edited);
  if (!d.img) return null;
  const r = await fetch(d.img.url);
  if (!r.ok) { pageCache.delete(row.id); return null; }
  const out = { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "image/png" };
  for (const k of imgCache.keys()) if (k.startsWith(row.id + ":")) imgCache.delete(k);
  imgCache.set(key, out);
  return out;
}

module.exports = { list, image };
