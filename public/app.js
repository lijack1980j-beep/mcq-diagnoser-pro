const setupCard = document.getElementById("setupCard");
const quizCard = document.getElementById("quizCard");
const resultCard = document.getElementById("resultCard");

const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const numQuestionsInput = document.getElementById("numQuestions");
const showExplainInput = document.getElementById("showExplain");

const progressText = document.getElementById("progressText");
const levelText = document.getElementById("levelText");
const scoreText = document.getElementById("scoreText");

const topicText = document.getElementById("topicText");
const diffText = document.getElementById("diffText");
const questionText = document.getElementById("questionText");
const choicesDiv = document.getElementById("choices");

const submitBtn = document.getElementById("submitBtn");
const nextBtn = document.getElementById("nextBtn");
const feedback = document.getElementById("feedback");

const finalLevel = document.getElementById("finalLevel");
const finalScore = document.getElementById("finalScore");
const topicBreakdown = document.getElementById("topicBreakdown");

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function levelFromScore(score, levels) {
  const s = clamp(Math.round(score), 0, 100);
  const found = levels.find((L) => s >= L.min && s <= L.max);
  return found?.name ?? "Unrated";
}

function updateSkill(skill, difficulty, correct) {
  const step = 4 + difficulty * 2; // harder = more impact
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

// ✅ LOGIN FUNCTION (PUT THIS IN public/app.js)

async function login(username, password) {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const text = await res.text(); // read raw
    console.log("LOGIN STATUS:", res.status);
    console.log("LOGIN RESPONSE:", text);

    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }

    if (!res.ok) {
      alert(data.error || "Login failed");
      return;
    }

    localStorage.setItem("token", data.token);
    alert("Login success");
  } catch (e) {
    alert("Request failed: " + e.message);
    console.error(e);
  }
}

// ✅ LOAD QUESTIONS (AUTH REQUIRED)
async function loadBank() {
  const token = localStorage.getItem("token");

  const res = await fetch("/api/bank", {
    headers: {
      "Authorization": "Bearer " + token
    }
  });

  if (!res.ok) throw new Error("Failed to load bank");

  return res.json();
}




let bank = null;
let state = null;

function initState(numQuestions) {
  const topics = {};
  for (const q of bank.questions) {
    topics[q.topic] ??= { correct: 0, total: 0, score: 50 };
  }

  return {
    numQuestions,
    showExplain: showExplainInput.checked,
    currentIndex: 1,
    overallSkill: 50,
    targetDifficulty: 2,
    asked: new Set(),
    topicStats: topics,
    currentQuestion: null,
    locked: false
  };
}

function renderQuestion() {
  const q = state.currentQuestion;
  progressText.textContent = `${state.currentIndex} / ${state.numQuestions}`;
  scoreText.textContent = `${Math.round(state.overallSkill)} / 100`;
  levelText.textContent = levelFromScore(state.overallSkill, bank.levels);

  topicText.textContent = `Topic: ${q.topic}`;
  diffText.textContent = `Difficulty: ${q.difficulty}`;
  questionText.textContent = q.question;

  choicesDiv.innerHTML = "";
  feedback.classList.add("hidden");
  feedback.classList.remove("good", "bad");
  submitBtn.disabled = true;
  nextBtn.classList.add("hidden");
  state.locked = false;

  q.choices.forEach((choice, idx) => {
    const label = document.createElement("label");
    label.className = "choice";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "mcq";
    input.value = idx;

    input.addEventListener("change", () => {
      if (!state.locked) submitBtn.disabled = false;
    });

    label.appendChild(input);
    label.appendChild(document.createTextNode(choice));
    choicesDiv.appendChild(label);
  });
}

function getSelectedIndex() {
  const checked = document.querySelector('input[name="mcq"]:checked');
  return checked ? Number(checked.value) : null;
}

function showFeedback(correct, q) {
  feedback.classList.remove("hidden");
  feedback.classList.add(correct ? "good" : "bad");

  const correctText = q.choices[q.answerIndex];
  const explain = state.showExplain && q.explain ? `\n\nExplanation: ${q.explain}` : "";

  feedback.textContent = correct
    ? `✅ Correct!${explain}`
    : `❌ Wrong. Correct answer: ${correctText}${explain}`;
}

function finish() {
  quizCard.classList.add("hidden");
  resultCard.classList.remove("hidden");

  finalScore.textContent = Math.round(state.overallSkill);
  finalLevel.textContent = levelFromScore(state.overallSkill, bank.levels);

  const rows = Object.entries(state.topicStats)
    .map(([topic, s]) => {
      const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      return { topic, answered: s.total, accuracy: acc, topicScore: Math.round(s.score) };
    })
    .sort((a, b) => b.topicScore - a.topicScore);

  let html = `<table>
    <thead><tr><th>Topic</th><th>Answered</th><th>Accuracy</th><th>Topic score</th></tr></thead>
    <tbody>
  `;

  for (const r of rows) {
    html += `<tr>
      <td>${r.topic}</td>
      <td>${r.answered}</td>
      <td>${r.accuracy}%</td>
      <td>${r.topicScore}/100</td>
    </tr>`;
  }
  html += `</tbody></table>`;
  topicBreakdown.innerHTML = html;
}

function nextStep() {
  if (state.currentIndex > state.numQuestions) {
    finish();
    return;
  }

  const q = pickNextQuestion(bank.questions, state.asked, state.targetDifficulty);
  if (!q) {
    finish();
    return;
  }

  state.currentQuestion = q;
  state.asked.add(q.id);
  renderQuestion();
}

startBtn.addEventListener("click", async () => {
  try {
    bank = await loadBank();
    const num = clamp(Number(numQuestionsInput.value || 12), 3, 100);
    state = initState(num);

    setupCard.classList.add("hidden");
    resultCard.classList.add("hidden");
    quizCard.classList.remove("hidden");

    nextStep();
  } catch (e) {
    alert("Error loading question bank. Check server + questions.json");
  }
});

submitBtn.addEventListener("click", () => {
  if (state.locked) return;

  const q = state.currentQuestion;
  const selected = getSelectedIndex();
  if (selected === null) return;

  state.locked = true;

  const correct = selected === q.answerIndex;

  // Update overall + topic stats
  state.overallSkill = updateSkill(state.overallSkill, q.difficulty, correct);

  const t = state.topicStats[q.topic];
  t.total += 1;
  if (correct) t.correct += 1;
  t.score = updateSkill(t.score, q.difficulty, correct);

  // Adapt difficulty
  state.targetDifficulty = clamp(state.targetDifficulty + (correct ? 1 : -1), 1, 5);

  showFeedback(correct, q);

  submitBtn.disabled = true;
  nextBtn.classList.remove("hidden");
});

nextBtn.addEventListener("click", () => {
  state.currentIndex += 1;
  nextStep();
});

restartBtn.addEventListener("click", () => {
  resultCard.classList.add("hidden");
  quizCard.classList.add("hidden");
  setupCard.classList.remove("hidden");
});




