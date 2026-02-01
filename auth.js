const el = (id) => document.getElementById(id);

const authCard = el("authCard");
const startCard = el("startCard");
const historyCard = el("historyCard");

const username = el("username");
const password = el("password");
const authMsg = el("authMsg").querySelector("small");

const loginBtn = el("loginBtn");
const registerBtn = el("registerBtn");
const logoutBtn = el("logoutBtn");
const startBtn = el("startBtn");

const meText = el("meText");
const mode = el("mode");
const educationSystem = el("educationSystem");
const numQuestions = el("numQuestions");
const secondsPerQuestion = el("secondsPerQuestion");

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

async function refreshMe() {
  const { user } = await api("/api/auth/me");
  if (!user) {
    authCard.classList.remove("hidden");
    startCard.classList.add("hidden");
    historyCard.classList.add("hidden");
    return;
  }
  authCard.classList.add("hidden");
  startCard.classList.remove("hidden");
  historyCard.classList.remove("hidden");
  meText.textContent = `Logged in as ${user.username} (${user.role})`;

  await loadHistory();
}

async function loadHistory() {
  const box = el("history");
  box.innerHTML = "Loading...";
  const { attempts } = await api("/api/history");
  if (!attempts.length) {
    box.innerHTML = "<small>No attempts yet.</small>";
    return;
  }
  let html = `<table><thead><tr>
    <th>Started</th><th>Mode</th><th>System</th><th>Q</th><th>Time/Q</th><th>Score</th><th>Level</th>
  </tr></thead><tbody>`;
  for (const a of attempts) {
    html += `<tr>
      <td>${a.started_at}</td>
      <td>${a.mode}</td>
      <td>${a.education_system}</td>
      <td>${a.num_questions}</td>
      <td>${a.seconds_per_question}s</td>
      <td>${a.final_score ?? "-"}</td>
      <td>${a.final_level ?? "-"}</td>
    </tr>`;
  }
  html += `</tbody></table>`;
  box.innerHTML = html;
}

loginBtn.addEventListener("click", async () => {
  authMsg.textContent = "";
  try {
    await api("/api/auth/login", "POST", { username: username.value, password: password.value });
    await refreshMe();
  } catch (e) {
    authMsg.textContent = e.message;
  }
});

registerBtn.addEventListener("click", async () => {
  authMsg.textContent = "";
  try {
    await api("/api/auth/register", "POST", { username: username.value, password: password.value });
    await refreshMe();
  } catch (e) {
    authMsg.textContent = e.message;
  }
});

logoutBtn?.addEventListener("click", async () => {
  await api("/api/auth/logout", "POST");
  await refreshMe();
});

startBtn?.addEventListener("click", async () => {
  const payload = {
    mode: mode.value,
    educationSystem: educationSystem.value,
    numQuestions: Number(numQuestions.value || 12),
    secondsPerQuestion: Number(secondsPerQuestion.value || 30)
  };
  try {
    await api("/api/quiz/start", "POST", payload);
    window.location.href = "/quiz.html";
  } catch (e) {
    alert(e.message);
  }
});

refreshMe();