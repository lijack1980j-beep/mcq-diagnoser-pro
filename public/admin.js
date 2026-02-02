const whoEl = document.getElementById("who");
const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const countEl = document.getElementById("count");

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

/* ✅ SESSION-BASED API CALL */
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    credentials: "include", // ⭐ send session cookie
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}

  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

/* ✅ CHECK WHO IS LOGGED IN */
async function loadMe() {
  try {
    const data = await api("/api/auth/me");
    if (!data.user) {
      alert("Please login first.");
      window.location.href = "/";
      return;
    }

    if (data.user.role !== "admin") {
      alert("Admin only.");
      window.location.href = "/";
      return;
    }

    whoEl.textContent = `Admin: ${data.user.username}`;
  } catch {
    window.location.href = "/";
  }
}

/* ✅ LOGOUT */
async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
}

/* ---------------- QUESTIONS ---------------- */

async function loadQuestions() {
  setStatus("Loading…");
  listEl.innerHTML = "";

  try {
    const data = await api("/api/admin/questions", { method: "GET" });
    renderList(data.questions || []);
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

  listEl.innerHTML = filtered.map((q) => `
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
  `).join("");

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

/* ---------------- FORM ---------------- */

function getForm() {
  const topic = document.getElementById("topic").value.trim();
  const difficulty = Number(document.getElementById("difficulty").value || 2);
  const question = document.getElementById("question").value.trim();

  const c0 = document.getElementById("c0").value.trim();
  const c1 = document.getElementById("c1").value.trim();
  const c2 = document.getElementById("c2").value.trim();
  const c3 = document.getElementById("c3").value.trim();

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
  if (payload.choices.length < 2) {
    setStatus("Add at least 2 choices.");
    return;
  }
  if (payload.answerIndex < 0 || payload.answerIndex >= payload.choices.length) {
    setStatus("Correct answer must exist.");
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

/* ---------------- EVENTS ---------------- */

document.getElementById("saveBtn").onclick = saveQuestion;
document.getElementById("clearBtn").onclick = clearForm;
document.getElementById("refreshBtn").onclick = loadQuestions;
document.getElementById("logoutBtn").onclick = logout;

document.getElementById("search").addEventListener("input", loadQuestions);
document.getElementById("topicFilter").addEventListener("input", loadQuestions);

/* ---------------- INIT ---------------- */

(async function init() {
  await loadMe();       // verify admin session
  await loadQuestions();
})();
