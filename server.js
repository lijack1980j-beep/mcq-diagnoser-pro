import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { openDb } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = openDb();

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
  "school": [
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
app.post("/api/auth/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username + password required" });
  if (String(username).length < 3) return res.status(400).json({ error: "username too short" });
  if (String(password).length < 6) return res.status(400).json({ error: "password too short" });

  const pass_hash = bcrypt.hashSync(String(password), 10);

  try {
    const info = db
      .prepare("INSERT INTO users (username, pass_hash, role) VALUES (?, ?, 'user')")
      .run(String(username), pass_hash);
    req.session.user = { id: info.lastInsertRowid, username: String(username), role: "user" };
    res.json({ ok: true, user: req.session.user });
  } catch (e) {
    res.status(409).json({ error: "Username already exists" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare("SELECT * FROM users WHERE username=?").get(String(username || ""));
  if (!row) return res.status(401).json({ error: "Invalid login" });

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

/** Create first admin automatically if not exists (optional convenience)
 *  If you want: create admin by registering then update role in DB manually.
 */

/** ---------- Admin (upgrade #2) ---------- **/
app.get("/api/admin/questions", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT id, topic, difficulty, question FROM questions ORDER BY id DESC").all();
  res.json({ questions: rows });
});

app.post("/api/admin/questions", requireAdmin, (req, res) => {
  const { topic, difficulty, question, choices, answerIndex, explain } = req.body || {};
  if (!topic || !question || !Array.isArray(choices) || choices.length < 2)
    return res.status(400).json({ error: "Invalid question data" });

  const diff = clamp(Number(difficulty || 1), 1, 5);
  const ans = Number(answerIndex);
  if (!Number.isInteger(ans) || ans < 0 || ans >= choices.length)
    return res.status(400).json({ error: "answerIndex out of range" });

  const info = db
    .prepare(
      `INSERT INTO questions (topic, difficulty, question, choices_json, answer_index, explain)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(String(topic), diff, String(question), JSON.stringify(choices), ans, String(explain || ""));

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.delete("/api/admin/questions/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM questions WHERE id=?").run(id);
  res.json({ ok: true });
});

/** ---------- Quiz API (practice + exam timer) (upgrade #3 + saving #1) ---------- **/
app.post("/api/quiz/start", requireAuth, (req, res) => {
  const { mode, educationSystem, numQuestions, secondsPerQuestion, topics } = req.body || {};

  const m = mode === "exam" ? "exam" : "practice";
  const edu = EDUCATION_SYSTEMS[educationSystem] ? educationSystem : "general-6";
  const n = clamp(Number(numQuestions || 12), 3, 100);
  const spq = clamp(Number(secondsPerQuestion || 30), 10, 300);

  // Load questions (optionally filter by topics)
  let rows;
  if (Array.isArray(topics) && topics.length) {
    const placeholders = topics.map(() => "?").join(",");
    rows = db
      .prepare(
        `SELECT id, topic, difficulty, question, choices_json, answer_index, explain
         FROM questions WHERE topic IN (${placeholders})`
      )
      .all(...topics.map(String));
  } else {
    rows = db
      .prepare(
        `SELECT id, topic, difficulty, question, choices_json, answer_index, explain
         FROM questions`
      )
      .all();
  }

  const bank = rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    difficulty: r.difficulty,
    question: r.question,
    choices: JSON.parse(r.choices_json),
    answerIndex: r.answer_index,
    explain: r.explain || ""
  }));

  if (!bank.length) return res.status(400).json({ error: "No questions available" });

  // Create attempt record
  const attemptInfo = db
    .prepare(
      `INSERT INTO attempts (user_id, started_at, mode, education_system, num_questions, seconds_per_question)
       VALUES (?, datetime('now'), ?, ?, ?, ?)`
    )
    .run(req.session.user.id, m, edu, n, spq);

  const attemptId = attemptInfo.lastInsertRowid;

  // Server keeps attempt state in session (lightweight)
  req.session.quiz = {
    attemptId,
    mode: m,
    educationSystem: edu,
    numQuestions: n,
    secondsPerQuestion: spq,
    overallSkill: 50,
    targetDifficulty: 2,
    asked: [],
    topicStats: {}, // topic -> {correct,total,score}
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

  // Store current question id (so we can validate answer)
  qz.currentQuestionId = nextQ.id;

  // IMPORTANT: do NOT send correct answer to client
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
  if (!Number.isInteger(qid) || qid !== qz.currentQuestionId)
    return res.status(400).json({ error: "Invalid question id" });

  const q = qz.bank.find((x) => x.id === qid);
  if (!q) return res.status(400).json({ error: "Question not found" });

  const selected = Number(choiceIndex);
  const isTimeout = Boolean(timedOut);

  const correct = !isTimeout && selected === q.answerIndex;

  // update overall
  qz.overallSkill = updateSkill(qz.overallSkill, q.difficulty, correct);

  // topic stats
  qz.topicStats[q.topic] ??= { correct: 0, total: 0, score: 50 };
  const t = qz.topicStats[q.topic];
  t.total += 1;
  if (correct) t.correct += 1;
  t.score = updateSkill(t.score, q.difficulty, correct);

  // adapt difficulty
  qz.targetDifficulty = clamp(qz.targetDifficulty + (correct ? 1 : -1), 1, 5);

  // mark asked
  if (!qz.asked.includes(qid)) qz.asked.push(qid);

  // progress
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

app.post("/api/quiz/finish", requireAuth, (req, res) => {
  const qz = req.session.quiz;
  if (!qz) return res.status(400).json({ error: "No active quiz" });

  const finalScore = Math.round(qz.overallSkill);
  const finalLevelStr = levelFromScore(qz.overallSkill, qz.educationSystem);

  const details = {
    topicStats: qz.topicStats,
    asked: qz.asked,
    mode: qz.mode
  };

  db.prepare(
    `UPDATE attempts
     SET finished_at=datetime('now'), final_score=?, final_level=?, details_json=?
     WHERE id=? AND user_id=?`
  ).run(finalScore, finalLevelStr, JSON.stringify(details), qz.attemptId, req.session.user.id);

  req.session.quiz = null;

  res.json({ ok: true, finalScore, finalLevel: finalLevelStr, details });
});

app.get("/api/history", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, started_at, finished_at, mode, education_system, num_questions, seconds_per_question, final_score, final_level
       FROM attempts
       WHERE user_id=?
       ORDER BY id DESC
       LIMIT 30`
    )
    .all(req.session.user.id);

  res.json({ attempts: rows });
});

/** ---------- Start ---------- **/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Running: http://localhost:${PORT}`);
  console.log(`Login page: http://localhost:${PORT}/`);
});