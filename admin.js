const el = (id) => document.getElementById(id);

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

async function loadList() {
  const box = el("list");
  box.innerHTML = "Loading...";
  const { questions } = await api("/api/admin/questions");
  if (!questions.length) {
    box.innerHTML = "<small>No questions.</small>";
    return;
  }
  let html = `<table><thead><tr><th>ID</th><th>Topic</th><th>Diff</th><th>Question</th><th></th></tr></thead><tbody>`;
  for (const q of questions) {
    html += `<tr>
      <td>${q.id}</td>
      <td>${q.topic}</td>
      <td>${q.difficulty}</td>
      <td>${q.question}</td>
      <td><button class="danger" data-del="${q.id}">Delete</button></td>
    </tr>`;
  }
  html += `</tbody></table>`;
  box.innerHTML = html;

  box.querySelectorAll("button[data-del]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-del");
      await api(`/api/admin/questions/${id}`, "DELETE");
      await loadList();
    });
  });
}

el("addBtn").addEventListener("click", async () => {
  const msg = el("msg");
  msg.textContent = "";
  try {
    const choices = JSON.parse(el("choices").value || "[]");
    const payload = {
      topic: el("topic").value,
      difficulty: Number(el("difficulty").value || 1),
      question: el("question").value,
      choices,
      answerIndex: Number(el("answerIndex").value || 0),
      explain: el("explain").value
    };
    await api("/api/admin/questions", "POST", payload);
    msg.textContent = "✅ Added!";
    await loadList();
  } catch (e) {
    msg.textContent = "❌ " + e.message + " (Are you logged in as admin?)";
  }
});

loadList().catch(() => {
  el("list").innerHTML =
    "<small>❌ Admin only. You must be logged in as an admin user.</small>";
});