import serverless from "serverless-http";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ✅ Put your Supabase credentials here (no .env)
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_PUBLIC_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.use(express.json({ limit: "1mb" }));

// ✅ IMPORTANT on Vercel
app.set("trust proxy", 1);

// ✅ Sessions (still not perfect in serverless, but will run)
app.use(
  session({
    secret: "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: true
    }
  })
);

// ✅ Serve static files (public) from project root
app.use(express.static(path.join(__dirname, "..", "public")));

/** ---------- Debug route (so Vercel shows errors) ---------- **/
app.get("/api/health", async (req, res) => {
  const { data, error } = await supabase.from("questions").select("id").limit(1);
  res.json({
    ok: true,
    sessionUser: req.session.user ?? null,
    supabase: error ? { ok: false, error: error.message } : { ok: true, sample: data }
  });
});

/** ---------- Helpers ---------- **/
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  if (req.session.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function updateSkill(skill, difficulty, correct) {
  const step = 4 + difficulty * 2;
  return clamp(skill + (correct ? step : -step), 0, 100);
}
function pickNextQuestion(questions, askedIds, targetDifficulty) {
  const remaining = questions.filter((q) => !askedIds.has(q.id));
  if (!remaining.length) return null;

  const sorted = remaining
    .map((q) => ({ q, dist: Math.abs(q.difficulty - targetDifficulty) }))
    .sort((a, b) => a.dist - b.dist);

  const top = sorted.slice(0, Math.min(5, sorted.length)).map((x) => x.q);
  return top[Math.floor(Math.random() * top.length)];
}

/** ---------- Education systems mapping ---------- **/
const EDUCATION_SYSTEMS = {
  "general-6": [
    { name: "Beginner", min: 0, max: 24 },
    { name: "Elementary", min: 25, max: 44 },
    { name: "Intermediate", min: 45, max: 64 },
    { name: "Upper-Intermediate", min: 65, max: 79 },
    { name: "Advanced", min: 80, max: 90 },
    { name: "Expert", min: 91, max: 100 }
  ],
  school: [
    { name: "Primary school", min: 0, max: 29 },
    { name: "Middle school", min: 30, max: 54 },
    { name: "High school", min: 55, max: 74 },
    { name: "University (undergrad)", min: 75, max: 89 },
    { name: "University (advanced)", min: 90, max: 100 }
  ],
  "language-cefr": [
    { name: "A1", min: 0, max: 19 },
    { name: "A2", min: 20, max: 34 },
    { name: "B1", min: 35, max: 54 },
    { name: "B2", min: 55, max: 69 },
    { name: "C1", min: 70, max: 84 },
    { name: "C2", min: 85, max: 100 }
  ]
};

function levelFromScore(score, systemKey) {
  const levels = EDUCATION_SYSTEMS[systemKey] || EDUCATION_SYSTEMS["general-6"];
  const s = clamp(Math.round(score), 0, 100);
  return levels.find((L) => s >= L.min && s <= L.max)?.name ?? "Unrated";
}

/** ---------- Auth ---------- **/
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username + password required" });
  if (String(username).length < 3) return res.status(400).json({ error: "username too short" });
  if (String(password).length < 6) return res.status(400).json({ error: "password too short" });

  const pass_hash = bcrypt.hashSync(String(password), 10);

  const { data: existing, error: e1 } = await supabase
    .from("users")
    .select("id")
    .eq("username", String(username))
    .limit(1);

  if (e1) return res.status(500).json({ error: e1.message });
  if (existing?.length) return res.status(409).json({ error: "Username already exists" });

  const { data, error } = await supabase
    .from("users")
    .insert({ username: String(username), pass_hash, role: "user" })
    .select("id, username, role")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  req.session.user = { id: data.id, username: data.username, role: data.role };
  res.json({ ok: true, user: req.session.user });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};

  const { data: row, error } = await supabase
    .from("users")
    .select("id, username, role, pass_hash")
    .eq("username", String(username || ""))
    .single();

  if (error || !row) return res.status(401).json({ error: "Invalid login" });

  const ok = bcrypt.compareSync(String(password || ""), row.pass_hash);
  if (!ok) return res.status(401).json({ error: "Invalid login" });

  req.session.user = { id: row.id, username: row.username, role: row.role };
  res.json({ ok: true, user: req.session.user });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.session.user ?? null });
});

/** ---------- Admin (example) ---------- **/
app.get("/api/admin/questions", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("questions")
    .select("id, topic, difficulty, question")
    .order("id", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ questions: data || [] });
});

// ✅ Export serverless handler for Vercel
export default serverless(app);
