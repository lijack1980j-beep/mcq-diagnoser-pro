const whoEl = document.getElementById("who");
const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const countEl = document.getElementById("count");

const token = localStorage.getItem("token");
const role = localStorage.getItem("role") || "user";
const username = localStorage.getItem("username") || "";

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("username");
  window.location.href = "/";
}

function guard() {
  if (!token) {
    alert("Please login first.");
    window.location.href = "/";
    return false;
  }
  if (role !== "admin") {
    alert("Admin only.");
    window.location.href = "/admin-login.html";
    return false;
  }
  whoEl.textContent = username ? `Admin: ${username}` : "Admin";
  return true;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    }
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.error || data?.message || ("HTTP " + res.status);
    throw new Error(msg);
  }

  return data;
}

async function loadQuestions() {
  setStatus("Loading…");
  listEl.innerHTML = "";
  try {
    const data = await api("/api/admin/questions", { method: "GET" });
    const questions = data.questions || [];
    renderList(questions);
    setStatus("Loaded ✅");
  } catch (e) {
    setStatus("Error: " + e.message);
    listEl.innerHTML = `<div class="empty">Failed to load questions.</div>`;
  }
}

function renderList(items) {
  const search = (document.getElementById("search").value || "").toLowerCase().trim();
  const topicFilter = (document.getElementById("topicFilter").value || "").trim();

  let filtered = items;

  if (topicFilter) {
    filtered = filtered.filter(q => String(q.topic || "") === topicFilter);
  }

  if (search) {
    filtered = filtered.filter(q =>
      String(q.question || "").toLowerCase().includes(search) ||
      String(q.topic || "").toLowerCase().includes(search)
    );
  }

  countEl.textContent = `${filtered.length} shown`;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty">No results.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map((q) => {
    return `
      <div class="item">
        <div class="row">
          <div class="badge">${escapeHtml(q.topic || "-")}</div>
          <div class="small">Difficulty: ${escapeHtml(String(q.difficulty ?? "-"))}</div>
          <div class="spacer"></div>
          <button class="btnTiny danger" data-del="${q.id}">Delete</button>
        </div>
        <div class="qtext">${escapeHtml(q.question || "")}</div>
        <div class="small">ID: ${q.id}</div>
      </div>
    `;
  }).join("");

  // bind delete buttons
  listEl.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del");
      if (!confirm("Delete this question?")) return;

      try {
        btn.disabled = true;
        await api(`/api/admin/questions/${id}`, { method: "DELETE" });
        setStatus("Deleted ✅");
        await loadQuestions();
      } catch (e) {
        setStatus("Delete error: " + e.message);
        btn.disabled = false;
      }
    });
  });
}

function getForm() {
  const topic = document.getElementById("topic").value.trim();
  const difficulty = Number(document.getElementById("difficulty").value || 2);
  const question = document.getElementById("question").value.trim();

  const c0 = document.getElementById("c0").value.trim();
  const c1 = document.getElementById("c1").value.trim();
  const c2 = document.getElementById("c2").value.trim();
  const c3 = document.getElementById("c3").value.trim();

  // only keep non-empty choices
  const choices = [c0, c1, c2, c3].filter(Boolean);

  const answerIndex = Number(document.getElementById("answerIndex").value);
  const explain = document.getElementById("explain").value.trim();

  return { topic, difficulty, question, choices, answerIndex, explain };
}

function clearForm() {
  document.getElementById("topic").value = "";
  document.getElementById("difficulty").value = 2;
  document.getElementById("question").value = "";
  document.getElementById("c0").value = "";
  document.getElementById("c1").value = "";
  document.getElementById("c2").value = "";
  document.getElementById("c3").value = "";
  document.getElementById("answerIndex").value = 0;
  document.getElementById("explain").value = "";
}

async function saveQuestion() {
  const payload = getForm();

  if (!payload.topic || !payload.question) {
    setStatus("Topic + question required.");
    return;
  }
  if (!Array.isArray(payload.choices) || payload.choices.length < 2) {
    setStatus("Add at least 2 choices (A and B).");
    return;
  }
  if (payload.answerIndex < 0 || payload.answerIndex >= payload.choices.length) {
    setStatus("Correct answer must exist (A/B/C/D).");
    return;
  }

  setStatus("Saving…");

  try {
    await api("/api/admin/questions", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setStatus("Saved ✅");
    clearForm();
    await loadQuestions();
  } catch (e) {
    setStatus("Save error: " + e.message);
  }
}

// events
document.getElementById("saveBtn").onclick = saveQuestion;
document.getElementById("clearBtn").onclick = clearForm;
document.getElementById("refreshBtn").onclick = loadQuestions;
document.getElementById("logoutBtn").onclick = logout;

document.getElementById("search").addEventListener("input", () => loadQuestions());
document.getElementById("topicFilter").addEventListener("input", () => loadQuestions());

// init
if (guard()) loadQuestions();

