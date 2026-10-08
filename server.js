// Oggi — Eric's daily brief on the web.
// Notion is the store: Claude writes Brief Days / Brief Items, this app reads and edits them.

const express = require("express");
const crypto = require("crypto");
const path = require("path");

// Demo mode skips sign-in and serves sample data, so it only ever runs when asked for
// explicitly, and never on Railway.
const ON_RAILWAY = !!process.env.RAILWAY_ENVIRONMENT_NAME || !!process.env.RAILWAY_PROJECT_ID;
const DEMO = process.env.OGGI_DEMO === "1" && !ON_RAILWAY;
if (!DEMO && !process.env.NOTION_TOKEN) {
  console.error("NOTION_TOKEN is not set. Refusing to start without it (use npm run dev for demo data).");
  process.exit(1);
}
const store = DEMO ? require("./demo") : require("./notion");

const PORT = process.env.PORT || 8080;
const SECRET = process.env.SESSION_SECRET || (DEMO ? "demo-secret" : null);
const ALLOWED = (process.env.ALLOWED_EMAIL || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const MAIL_FROM = process.env.MAIL_FROM || "Oggi <oggi@princellama.com>";
// Username + PIN sign-in. Both live only in Railway → Variables, never in the code.
const PIN_USER = (process.env.OGGI_USER || "").trim().toLowerCase();
const PIN = (process.env.OGGI_PIN || "").trim();

if (!SECRET) {
  console.error("SESSION_SECRET is not set. Refusing to start without it.");
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1); // Railway sits in front; needed for per-device lockout
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  next();
});

// ---------- signed tokens (stateless) ----------
const b64 = (s) => Buffer.from(s).toString("base64url");
const unb64 = (s) => Buffer.from(s, "base64url").toString();
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}
function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const want = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(unb64(body));
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}
function cookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function authed(req) {
  if (DEMO) return { e: "demo" };
  return verify(cookie(req, "oggi"));
}
function requireAuth(req, res, next) {
  if (authed(req)) return next();
  res.status(401).json({ error: "signin" });
}

// ---------- magic link ----------
const recent = new Map(); // email -> last send time
app.post("/auth/request", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  // Always answer the same way, so the page never confirms which address is allowed.
  const reply = () => res.json({ ok: true });
  if (!ALLOWED.includes(email)) return reply();
  const last = recent.get(email) || 0;
  if (Date.now() - last < 60_000) return reply();
  recent.set(email, Date.now());
  const token = sign({ e: email, k: "link", exp: Date.now() + 15 * 60_000 });
  const link = `${BASE_URL}/auth/verify?t=${encodeURIComponent(token)}`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [email],
        subject: "Your Oggi sign-in link",
        text: `Open this link to sign in to Oggi. It works once, for 15 minutes.\n\n${link}\n\nIf you did not ask for it, ignore this email.`,
      }),
    });
    if (!r.ok) console.error("Resend error", r.status, await r.text());
  } catch (e) {
    console.error("Resend failed", e.message);
  }
  reply();
});

// ---------- username + PIN ----------
// A four-digit PIN is only 10,000 guesses, so wrong tries lock out hard:
// 5 wrong from one connection → that connection waits 15 minutes;
// 15 wrong from anywhere within an hour → PIN sign-in pauses for an hour (the email link still works).
const pinFails = new Map(); // ip -> { n, until }
let pinGlobal = { n: 0, since: Date.now(), until: 0 };
const hashed = (s) => crypto.createHash("sha256").update(String(s)).digest();
function setSession(res, who) {
  const session = sign({ e: who, k: "session", exp: Date.now() + 90 * 24 * 3600_000 });
  const secure = BASE_URL.startsWith("https") ? "; Secure" : "";
  res.set("Set-Cookie", `oggi=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${90 * 24 * 3600}${secure}`);
}
app.get("/auth/methods", (req, res) => res.json({ pin: !!(PIN_USER && PIN), email: ALLOWED.length > 0 }));
app.post("/auth/pin", (req, res) => {
  if (!PIN_USER || !PIN) return res.status(503).json({ error: "PIN sign-in is not set up." });
  const now = Date.now();
  if (now - pinGlobal.since > 3600_000) pinGlobal = { n: 0, since: now, until: 0 };
  if (pinGlobal.until > now) return res.status(429).json({ error: "Too many wrong PINs. PIN sign-in is paused for an hour — use the email link instead." });
  const ip = req.ip || "?";
  const f = pinFails.get(ip) || { n: 0, until: 0 };
  if (f.until > now) return res.status(429).json({ error: `Too many wrong tries. Try again in ${Math.ceil((f.until - now) / 60000)} minutes.` });
  const user = String(req.body.user || "").trim().toLowerCase();
  const pin = String(req.body.pin || "").trim();
  const ok = crypto.timingSafeEqual(hashed(user), hashed(PIN_USER)) & crypto.timingSafeEqual(hashed(pin), hashed(PIN));
  if (!ok) {
    f.n += 1;
    if (f.n >= 5) { f.until = now + 15 * 60_000; f.n = 0; }
    pinFails.set(ip, f);
    pinGlobal.n += 1;
    if (pinGlobal.n >= 15) { pinGlobal.until = now + 3600_000; console.error("PIN sign-in paused after repeated wrong PINs"); }
    return res.status(401).json({ error: "That username and PIN don't match." });
  }
  pinFails.delete(ip);
  setSession(res, ALLOWED[0] || PIN_USER);
  res.json({ ok: true });
});

const usedLinks = new Set();
app.get("/auth/verify", (req, res) => {
  const t = String(req.query.t || "");
  const p = verify(t);
  if (!p || p.k !== "link" || usedLinks.has(t)) return res.redirect("/?signin=expired");
  usedLinks.add(t);
  setSession(res, p.e);
  res.redirect("/");
});
app.post("/auth/signout", (req, res) => {
  res.set("Set-Cookie", "oggi=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  res.json({ ok: true });
});
app.get("/auth/me", (req, res) => res.json({ signedIn: !!authed(req), demo: DEMO }));

// ---------- API ----------
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(e.status && e.status < 500 ? e.status : 502).json({ error: e.message || "failed" });
});
const localDate = (req) => (/^\d{4}-\d{2}-\d{2}$/.test(req.query.d || req.body?.d || "") ? (req.query.d || req.body.d) : new Date().toISOString().slice(0, 10));
const stamp = () => new Date().toISOString().slice(11, 16) + "Z";

app.get("/api/brief", requireAuth, wrap(async (req, res) => {
  const b = await store.getBrief(localDate(req));
  if (!b) return res.json({ day: null, items: [] });
  res.json(b);
}));

app.patch("/api/item/:id", requireAuth, wrap(async (req, res) => {
  const allowed = ["title", "note", "place", "area", "order", "decision", "status"];
  const fields = {};
  for (const k of allowed) if (k in req.body) fields[k] = req.body[k];
  if (fields.place && !["Skyline", "Airport", "Kalihi", "Kakaako", "Kahala", "Hawaii Kai", "Home"].includes(fields.place)) return res.status(400).json({ error: "place" });
  if (fields.area && !["CPA", "Medicare", "Personal", "Money"].includes(fields.area)) return res.status(400).json({ error: "area" });
  if ("decision" in fields && fields.decision !== null && !["Tomorrow", "This week", "Let go"].includes(fields.decision)) return res.status(400).json({ error: "decision" });
  if ("status" in fields && !["Open", "Closed"].includes(fields.status)) return res.status(400).json({ error: "status" });
  const item = await store.updateItem(req.params.id, fields);

  // Change log line, written in Eric's own terms so it can ride into a Claude prompt.
  const dayId = req.body.dayId;
  const t = item.title;
  let line = null;
  if ("decision" in fields) {
    line = fields.decision ? `${t} → ${fields.decision}` : `${t} → choice cleared`;
    if (fields.decision && item.task) await store.applyDecisionToTask(item.task, fields.decision, localDate(req)).catch((e) => console.error("task move", e.message));
  } else if ("status" in fields) line = `${t} → marked ${fields.status === "Closed" ? "done" : "open again"}`;
  else if ("title" in fields) line = `Renamed an item to “${t}”`;
  else if ("place" in fields) line = `${t} → moved to ${fields.place}`;
  else if ("area" in fields) line = `${t} → area ${fields.area}`;
  else if ("note" in fields && fields.note) line = `Note on ${t}: ${fields.note}`;
  const mergeKey = "note" in fields ? `Note on ${t}:` : ("decision" in fields ? `${t} → ` : null);
  if (line && dayId) await store.logEdit(dayId, `${stamp()} ${line}`, mergeKey);
  res.json(item);
}));

app.patch("/api/day/:id", requireAuth, wrap(async (req, res) => {
  const fields = {};
  if ("intentions" in req.body) fields.intentions = String(req.body.intentions).slice(0, 4000);
  if ("log" in req.body) fields.log = String(req.body.log).slice(0, 2000);
  const day = await store.updateDay(req.params.id, fields);
  if (fields.intentions) await store.logEdit(req.params.id, `${stamp()} Intentions: ${fields.intentions}`, "Intentions:");
  if (fields.log) await store.logEdit(req.params.id, `${stamp()} Log: ${fields.log}`, "Log:");
  res.json(day);
}));

app.post("/api/capture", requireAuth, wrap(async (req, res) => {
  const text = String(req.body.text || "").trim().slice(0, 300);
  if (!text) return res.status(400).json({ error: "empty" });
  const task = await store.createTask(text, localDate(req));
  if (req.body.dayId) await store.logEdit(req.body.dayId, `${stamp()} Captured: ${text}`);
  res.json(task);
}));

app.post("/api/edits/clear", requireAuth, wrap(async (req, res) => {
  if (!req.body.dayId) return res.status(400).json({ error: "dayId" });
  await store.updateDay(req.body.dayId, { edits: "" });
  res.json({ ok: true });
}));

// ---------- static ----------
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, p) {
    if (p.endsWith("sw.js") || p.endsWith(".html")) res.set("Cache-Control", "no-cache");
  },
}));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`oggi on ${PORT}${DEMO ? " (demo data)" : ""}`));
