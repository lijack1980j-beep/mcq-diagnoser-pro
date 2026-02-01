import fs from "fs";
import prompts from "prompts";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function loadBank(path = "./questions.json") {
  const raw = fs.readFileSync(path, "utf8");
  const bank = JSON.parse(raw);

  if (!Array.isArray(bank.questions) || bank.questions.length === 0) {
    throw new Error("questions.json must contain a non-empty questions array.");
  }

  // Basic validation
  for (const q of bank.questions) {
    if (
      typeof q.id !== "string" ||
      typeof q.topic !== "string" ||
      typeof q.difficulty !== "number" ||
      typeof q.question !== "string" ||
      !Array.isArray(q.choices) ||
      typeof q.answerIndex !== "number"
    ) {
      throw new Error(`Invalid question format: ${JSON.stringify(q)}`);
    }
    if (q.answerIndex < 0 || q.answerIndex >= q.choices.length) {
      throw new Error(`answerIndex out of range for question ${q.id}`);
    }
  }

  // Default levels if missing
  const levels =
    Array.isArray(bank.levels) && bank.levels.length
      ? bank.levels
      : [
          { name: "Beginner", min: 0, max: 30 },
          { name: "Intermediate", min: 31, max: 70 },
          { name: "Advanced", min: 71, max: 100 }
        ];

  return { questions: bank.questions, levels };
}

function levelFromScore(score, levels) {
  const s = clamp(Math.round(score), 0, 100);
  const found = levels.find((L) => s >= L.min && s <= L.max);
  return found?.name ?? "Unrated";
}

// Pick next question near target difficulty, avoiding repeats
function pickNextQuestion(questions, askedIds, targetDifficulty) {
  const remaining = questions.filter((q) => !askedIds.has(q.id));
  if (!remaining.length) return null;

  // Prefer closest difficulty, then random among top few
  const sorted = remaining
    .map((q) => ({ q, dist: Math.abs(q.difficulty - targetDifficulty) }))
    .sort((a, b) => a.dist - b.dist);

  const top = sorted.slice(0, Math.min(5, sorted.length)).map((x) => x.q);
  return top[Math.floor(Math.random() * top.length)];
}

function initTopicStats(questions) {
  const topics = {};
  for (const q of questions) {
    topics[q.topic] ??= { correct: 0, total: 0, score: 50 }; // start neutral
  }
  return topics;
}

// Update a "skill score" (0..100) with difficulty weighting
function updateSkill(skill, difficulty, correct) {
  // Step size: harder questions move the score more
  const step = 4 + difficulty * 2; // difficulty 1->6, 2->8, 3->10...
  const delta = correct ? step : -step;
  return clamp(skill + delta, 0, 100);
}

async function main() {
  const { questions, levels } = loadBank("./questions.json");

  console.log("\nMCQ Diagnoser (Node.js)\n");

  const config = await prompts([
    {
      type: "number",
      name: "numQuestions",
      message: "How many questions do you want to answer?",
      initial: 12,
      min: 3,
      max: 100
    },
    {
      type: "toggle",
      name: "showExplain",
      message: "Show explanation after each answer?",
      initial: true,
      active: "yes",
      inactive: "no"
    }
  ]);

  if (!config.numQuestions) return;

  let overallSkill = 50; // start neutral
  let targetDifficulty = 2; // start medium-ish
  const asked = new Set();

  const topicStats = initTopicStats(questions);

  for (let i = 1; i <= config.numQuestions; i++) {
    const q = pickNextQuestion(questions, asked, targetDifficulty);
    if (!q) {
      console.log("\nNo more new questions available in questions.json.\n");
      break;
    }
    asked.add(q.id);

    const answer = await prompts({
      type: "select",
      name: "choiceIndex",
      message: `[${i}] (${q.topic}, difficulty ${q.difficulty}) ${q.question}`,
      choices: q.choices.map((c, idx) => ({ title: c, value: idx }))
    });

    // user canceled
    if (typeof answer.choiceIndex !== "number") break;

    const correct = answer.choiceIndex === q.answerIndex;

    // Update stats
    overallSkill = updateSkill(overallSkill, q.difficulty, correct);

    const t = topicStats[q.topic];
    t.total += 1;
    if (correct) t.correct += 1;
    t.score = updateSkill(t.score, q.difficulty, correct);

    // Adapt next difficulty
    if (correct) targetDifficulty = clamp(targetDifficulty + 1, 1, 5);
    else targetDifficulty = clamp(targetDifficulty - 1, 1, 5);

    const level = levelFromScore(overallSkill, levels);

    console.log(
      correct
        ? `✅ Correct! | Current level: ${level} | Score: ${Math.round(overallSkill)}/100\n`
        : `❌ Wrong. Correct: ${q.choices[q.answerIndex]} | Current level: ${level} | Score: ${Math.round(overallSkill)}/100\n`
    );

    if (config.showExplain && q.explain) {
      console.log(`Explanation: ${q.explain}\n`);
    }
  }

  // Final report
  const finalLevel = levelFromScore(overallSkill, levels);

  console.log("========== FINAL DIAGNOSIS ==========");
  console.log(`Estimated level: ${finalLevel}`);
  console.log(`Overall score: ${Math.round(overallSkill)}/100\n`);

  console.log("Topic breakdown:");
  const rows = Object.entries(topicStats)
    .map(([topic, s]) => {
      const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      return { topic, accuracy: acc, topicScore: Math.round(s.score), answered: s.total };
    })
    .sort((a, b) => b.topicScore - a.topicScore);

  for (const r of rows) {
    console.log(
      `- ${r.topic}: ${r.accuracy}% correct (${r.answered} answered) | topic score ${r.topicScore}/100`
    );
  }

  console.log("\nTip: Add more questions (different topics/difficulties) in questions.json to improve accuracy.\n");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});