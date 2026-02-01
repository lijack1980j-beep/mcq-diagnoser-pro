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

// ⚠️ On Vercel you MUST set cookie secure correctly behind proxy
app.set("trust proxy", 1);

app.use(
  session({
    secret: "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: true // Vercel uses https
    }
  })
);

// Serve static files (public)
app.use(express.static(path.join(__dirname, "..", "public")));

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

/** ---------- Education systems ---------- **/
const EDUCATION_SYSTEMS = {
  "general-6": [
    { name: "Beginner", min: 0, max: 24 },
    { name: "Elementary", min: 25, max: 44 },
    { name: "Intermediate", min: 45, max: 64 },
    { name: "Upper-Intermediate", min: 65, max: 79 },
    { name: "Advanced", min: 80, max: 90 },
    { name: "Expert", min: 91, max: 100 }
  ]
};
function levelFromScore(score, systemKey) {
  const levels = EDUCATION_SYSTEMS[systemKey] || EDUCATION_SYSTEMS["general-6"];
  const s = clamp(Math.round(score), 0, 100);
  return levels.find((L) => s >= L.min && s <= L.max)?.name ?? "Unrated";
}

/** ---------- Debug route (so you can see real errors) ---------- **/
app.get("/api/health", (req, res) => {
  res.json({ ok: true, on: "vercel", sessionUser: req.session.user ?? null });
});

/** ---------- Auth ---------- **/
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username + password required" });

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

/** ---------- Admin questions ---------- **/
app.get("/api/admin/questions", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("questions")
    .select("id, topic, difficulty, question")
    .order("id", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ questions: data || [] });
});

/** ---------- Quiz (minimal) ---------- **/
app.post("/api/quiz/start", requireAuth, async (req, res) => {
  const { mode, educationSystem, numQuestions, secondsPerQuestion } = req.body || {};
  const m = mode === "exam" ? "exam" : "practice";
  const edu = EDUCATION_SYSTEMS[educationSystem] ? educationSystem : "general-6";
  const n = clamp(Number(numQuestions || 12), 3, 100);
  const spq = clamp(Number(secondsPerQuestion || 30), 10, 300);

  const { data: rows, error } = await supabase
    .from("questions")
    .select("id, topic, difficulty, question, choices, answer_index, explain");

  if (error) return res.status(500).json({ error: error.message });

  const bank = (rows || []).map((r) => ({
    id: r.id,
    topic: r.topic,
    difficulty: r.difficulty,
    question: r.question,
    choices: Array.isArray(r.choices) ? r.choices : [],
    answerIndex: r.answer_index,
    explain: r.explain || ""
  }));

  req.session.quiz = {
    mode: m,
    educationSystem: edu,
    numQuestions: n,
    secondsPerQuestion: spq,
    overallSkill: 50,
    targetDifficulty: 2,
    asked: [],
    topicStats: {},
    index: 1,
    bank
  };

  res.json({ ok: true });
});

app.get("/api/quiz/next", requireAuth, (req, res) => {
  const qz = req.session.quiz;
  if (!qz) return res.status(400).json({ error: "No active quiz" });

  if (qz.index > qz.numQuestions) return res.json({ done: true });

  const askedSet = new Set(qz.asked);
  const nextQ = pickNextQuestion(qz.bank, askedSet, qz.targetDifficulty);
  if (!nextQ) return res.json({ done: true });

  qz.currentQuestionId = nextQ.id;

  res.json({
    done: false,
    index: qz.index,
    numQuestions: qz.numQuestions,
    secondsPerQuestion: qz.secondsPerQuestion,
    question: {
      id: nextQ.id,
      topic: nextQ.topic,
      difficulty: nextQ.difficulty,
      question: nextQ.question,
      choices: nextQ.choices
    },
    score: Math.round(qz.overallSkill),
    level: levelFromScore(qz.overallSkill, qz.educationSystem)
  });
});

/** IMPORTANT: Do NOT call app.listen() on Vercel **/
export default serverless(app);
