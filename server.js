import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// ✅ Admin password (DO NOT hardcode if pushing to GitHub)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123";

// ✅ Put your Supabase credentials here (no .env)
const SUPABASE_URL = "https://ylyvwytirhamoxmmikod.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlseXZ3eXRpcmhhbW94bW1pa29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4OTMwMDAsImV4cCI6MjA4NTQ2OTAwMH0.yjpmgEAPB9kGDAwUWyr47-97iOykeq9AUq3rwvF6aYo";

// Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    secret: "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true }
  })
);

app.use(express.static(path.join(__dirname, "public")));

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

/** ---------- Education systems mapping (upgrade #4) ---------- **/
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

/** ---------- Auth (upgrade #1) ---------- **/
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username + password required" });
  if (String(username).length < 3) return res.status(400).json({ error: "username too short" });
  if (String(password).length < 6) return res.status(400).json({ error: "password too short" });

  const pass_hash = bcrypt.hashSync(String(password), 10);

  // Check if username exists
  const { data: existing, error: e1 } = await supabase
    .from("users")
    .select("id")
    .eq("username", String(username))
    .limit(1);

  if (e1) return res.status(500).json({ error: e1.message });
  if (existing && existing.length) return res.status(409).json({ error: "Username already exists" });

  // Insert user
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

/** ---------- Admin (upgrade #2) ---------- **/
app.get("/api/admin/questions", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("questions")
    .select("id, topic, difficulty, question")
    .order("id", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ questions: data || [] });
});

app.post("/api/admin/questions", requireAdmin, async (req, res) => {
  const { topic, difficulty, question, choices, answerIndex, explain } = req.body || {};
  if (!topic || !question || !Array.isArray(choices) || choices.length < 2) {
    return res.status(400).json({ error: "Invalid question data" });
  }

  const diff = clamp(Number(difficulty || 1), 1, 5);
  const ans = Number(answerIndex);
  if (!Number.isInteger(ans) || ans < 0 || ans >= choices.length) {
    return res.status(400).json({ error: "answerIndex out of range" });
  }

  const { data, error } = await supabase
    .from("questions")
    .insert({
      topic: String(topic),
      difficulty: diff,
      question: String(question),
      choices: choices, // JSONB
      answer_index: ans,
      explain: String(explain || "")
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, id: data.id });
});

app.delete("/api/admin/questions/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

/** ---------- Quiz API (practice + exam timer) (upgrade #3 + saving #1) ---------- **/
app.post("/api/quiz/start", requireAuth, async (req, res) => {
  const { mode, educationSystem, numQuestions, secondsPerQuestion, topics } = req.body || {};

  const m = mode === "exam" ? "exam" : "practice";
  const edu = EDUCATION_SYSTEMS[educationSystem] ? educationSystem : "general-6";
  const n = clamp(Number(numQuestions || 12), 3, 100);
  const spq = clamp(Number(secondsPerQuestion || 30), 10, 300);

  // Load questions (optionally filter by topics)
  let query = supabase
    .from("questions")
    .select("id, topic, difficulty, question, choices, answer_index, explain");

  if (Array.isArray(topics) && topics.length) {
    query = query.in("topic", topics.map(String));
  }

  const { data: rows, error } = await query;
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

  if (!bank.length) return res.status(400).json({ error: "No questions available" });

  // Create attempt record
  const { data: attemptRow, error: e2 } = await supabase
    .from("attempts")
    .insert({
      user_id: req.session.user.id,
      mode: m,
      education_system: edu,
      num_questions: n,
      seconds_per_question: spq
    })
    .select("id")
    .single();

  if (e2) return res.status(500).json({ error: e2.message });

  const attemptId = attemptRow.id;

  // Keep attempt state in session
  req.session.quiz = {
    attemptId,
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

  res.json({ ok: true, attemptId, mode: m, educationSystem: edu, numQuestions: n, secondsPerQuestion: spq });
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

app.post("/api/quiz/answer", requireAuth, (req, res) => {
  const qz = req.session.quiz;
  if (!qz) return res.status(400).json({ error: "No active quiz" });

  const { questionId, choiceIndex, timedOut } = req.body || {};
  const qid = Number(questionId);
  if (!Number.isInteger(qid) || qid !== qz.currentQuestionId) {
    return res.status(400).json({ error: "Invalid question id" });
  }

  const q = qz.bank.find((x) => x.id === qid);
  if (!q) return res.status(400).json({ error: "Question not found" });

  const selected = Number(choiceIndex);
  const isTimeout = Boolean(timedOut);

  const correct = !isTimeout && selected === q.answerIndex;

  qz.overallSkill = updateSkill(qz.overallSkill, q.difficulty, correct);

  qz.topicStats[q.topic] ??= { correct: 0, total: 0, score: 50 };
  const t = qz.topicStats[q.topic];
  t.total += 1;
  if (correct) t.correct += 1;
  t.score = updateSkill(t.score, q.difficulty, correct);

  qz.targetDifficulty = clamp(qz.targetDifficulty + (correct ? 1 : -1), 1, 5);

  if (!qz.asked.includes(qid)) qz.asked.push(qid);

  const currentLevel = levelFromScore(qz.overallSkill, qz.educationSystem);

  const feedback = {
    correct,
    correctAnswer: q.choices[q.answerIndex],
    explain: q.explain || ""
  };

  qz.index += 1;

  res.json({
    ok: true,
    feedback,
    score: Math.round(qz.overallSkill),
    level: currentLevel
  });
});

app.post("/api/quiz/finish", requireAuth, async (req, res) => {
  const qz = req.session.quiz;
  if (!qz) return res.status(400).json({ error: "No active quiz" });

  const finalScore = Math.round(qz.overallSkill);
  const finalLevelStr = levelFromScore(qz.overallSkill, qz.educationSystem);

  const details = {
    topicStats: qz.topicStats,
    asked: qz.asked,
    mode: qz.mode
  };

  const { error } = await supabase
    .from("attempts")
    .update({
      finished_at: new Date().toISOString(),
      final_score: finalScore,
      final_level: finalLevelStr,
      details: details
    })
    .eq("id", qz.attemptId)
    .eq("user_id", req.session.user.id);

  if (error) return res.status(500).json({ error: error.message });

  req.session.quiz = null;

  res.json({ ok: true, finalScore, finalLevel: finalLevelStr, details });
});

app.get("/api/history", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("attempts")
    .select(
      "id, started_at, finished_at, mode, education_system, num_questions, seconds_per_question, final_score, final_level"
    )
    .eq("user_id", req.session.user.id)
    .order("id", { ascending: false })
    .limit(30);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ attempts: data || [] });
});

// ===== ADMIN AUTO-CREATION =====
// ===== ADMIN AUTO-CREATION =====
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "azerty&é""; // the password you will type

async function ensureAdminUser() {
  const { data: existing, error: selErr } = await supabase
    .from("users")
    .select("id, username, role")
    .eq("role", "admin")
    .limit(1);

  if (selErr) {
    console.log("❌ Admin SELECT blocked:", selErr.message);
    return;
  }

  if (existing && existing.length > 0) {
    console.log("✅ Admin already exists:", existing[0].username);
    return;
  }

  const pass_hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

  const { error: insErr } = await supabase.from("users").insert({
    username: ADMIN_USERNAME,
    pass_hash,
    role: "admin"
  });

  if (insErr) {
    console.log("❌ Admin INSERT blocked:", insErr.message);
    return;
  }

  console.log("✅ Admin user created:", ADMIN_USERNAME);
}
/** ---------- Start ---------- **/
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log("Server running");
  await ensureAdminUser();
  console.log(`✅ Running: http://localhost:${PORT}`);
  console.log(`Login page: http://localhost:${PORT}/`);
});






