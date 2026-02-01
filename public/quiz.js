const el = (id) => document.getElementById(id);

const timerEl = el("timer");
const progressEl = el("progress");
const levelEl = el("level");
const scoreEl = el("score");

const topicTag = el("topicTag");
const diffTag = el("diffTag");
const qText = el("qText");
const choices = el("choices");

const submitBtn = el("submit");
const nextBtn = el("next");
const finishBtn = el("finish");
const feedback = el("feedback");

const quizCard = el("quizCard");
const resultCard = el("resultCard");

const finalScore = el("finalScore");
const finalLevel = el("finalLevel");
const breakdown = el("breakdown");

let current = null;
let selectedIndex = null;

let secondsLeft = 0;
let timer = null;

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function setTimer(sec) {
  secondsLeft = sec;
  timerEl.textContent = `${secondsLeft}s`;
  clearInterval(timer);
  timer = setInterval(() => {
    secondsLeft -= 1;
    timerEl.textContent = `${secondsLeft}s`;
    if (secondsLeft <= 0) {
      clearInterval(timer);
      // timeout auto-submit
      submitAnswer(true).catch(() => {});
    }
  }, 1000);
}

function renderQuestion(payload) {
  current = payload.question;
  selectedIndex = null;

  progressEl.textContent = `${payload.index} / ${payload.numQuestions}`;
  levelEl.textContent = payload.level;
  scoreEl.textContent = `${payload.score} / 100`;

  topicTag.textContent = `Topic: ${current.topic}`;
  diffTag.textContent = `Difficulty: ${current.difficulty}`;

  qText.textContent = current.question;

  choices.innerHTML = "";
  feedback.classList.add("hidden");
  feedback.classList.remove("good", "bad");
  nextBtn.classList.add("hidden");
  submitBtn.disabled = true;

  for (let i = 0; i < current.choices.length; i++) {
    const label = document.createElement("label");
    label.className = "choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "mcq";
    input.value = i;
    input.addEventListener("change", () => {
      selectedIndex = Number(input.value);
      submitBtn.disabled = false;
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(current.choices[i]));
    choices.appendChild(label);
  }

  setTimer(payload.secondsPerQuestion);
}

async function loadNext() {
  const payload = await api("/api/quiz/next");
  if (payload.done) {
    await finishQuiz();
    return;
  }
  renderQuestion(payload);
}

function showFeedback(info) {
  feedback.classList.remove("hidden");
  feedback.classList.add(info.correct ? "good" : "bad");
  const explain = info.explain ? `\n\nExplanation: ${info.explain}` : "";
  feedback.textContent = info.correct
    ? `✅ Correct!${explain}`
    : `❌ Wrong. Correct answer: ${info.correctAnswer}${explain}`;
}

async function submitAnswer(timedOut = false) {
  if (!current) return;

  clearInterval(timer);
  timerEl.textContent = timedOut ? "TIME" : timerEl.textContent;

  submitBtn.disabled = true;

  const res = await api("/api/quiz/answer", "POST", {
    questionId: current.id,
    choiceIndex: timedOut ? -1 : selectedIndex,
    timedOut
  });

  // update headline stats
  scoreEl.textContent = `${res.score} / 100`;
  levelEl.textContent = res.level;

  showFeedback(res.feedback);
  nextBtn.classList.remove("hidden");
}

async function finishQuiz() {
  clearInterval(timer);
  const res = await api("/api/quiz/finish", "POST");

  quizCard.classList.add("hidden");
  resultCard.classList.remove("hidden");

  finalScore.textContent = res.finalScore;
  finalLevel.textContent = res.finalLevel;

  const stats = res.details.topicStats || {};
  const rows = Object.entries(stats).map(([topic, s]) => {
    const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;
    return { topic, answered: s.total, accuracy: acc, topicScore: Math.round(s.score) };
  }).sort((a,b)=>b.topicScore-a.topicScore);

  let html = `<table><thead><tr><th>Topic</th><th>Answered</th><th>Accuracy</th><th>Topic score</th></tr></thead><tbody>`;
  for (const r of rows) {
    html += `<tr><td>${r.topic}</td><td>${r.answered}</td><td>${r.accuracy}%</td><td>${r.topicScore}/100</td></tr>`;
  }
  html += `</tbody></table>`;
  breakdown.innerHTML = html;
}

submitBtn.addEventListener("click", () => submitAnswer(false));
nextBtn.addEventListener("click", () => loadNext());
finishBtn.addEventListener("click", () => finishQuiz());

loadNext().catch(() => {
  alert("No active quiz. Start from Home page.");
  window.location.href = "/";
});
