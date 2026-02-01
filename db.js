import Database from "better-sqlite3";
import fs from "fs";

export function openDb() {
  const db = new Database("./data.sqlite");
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      difficulty INTEGER NOT NULL,
      question TEXT NOT NULL,
      choices_json TEXT NOT NULL,
      answer_index INTEGER NOT NULL,
      explain TEXT
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      mode TEXT NOT NULL,          -- practice | exam
      education_system TEXT NOT NULL,
      num_questions INTEGER NOT NULL,
      seconds_per_question INTEGER NOT NULL,
      final_score INTEGER,
      final_level TEXT,
      details_json TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  seedIfEmpty(db);
  return db;
}

function seedIfEmpty(db) {
  const qCount = db.prepare("SELECT COUNT(*) as c FROM questions").get().c;
  if (qCount > 0) return;

  let seed;
  try {
    seed = JSON.parse(fs.readFileSync("./questions.seed.json", "utf8"));
  } catch {
    seed = { questions: [] };
  }

  const insert = db.prepare(`
    INSERT INTO questions (topic, difficulty, question, choices_json, answer_index, explain)
    VALUES (@topic, @difficulty, @question, @choices_json, @answer_index, @explain)
  `);

  const trx = db.transaction((items) => {
    for (const q of items) {
      insert.run({
        topic: q.topic,
        difficulty: q.difficulty,
        question: q.question,
        choices_json: JSON.stringify(q.choices),
        answer_index: q.answerIndex,
        explain: q.explain ?? ""
      });
    }
  });

  trx(seed.questions || []);
}