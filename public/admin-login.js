const statusEl = document.getElementById("status");
const whoEl = document.getElementById("who");

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function saveSession(data) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("role", data.role || "user");
  localStorage.setItem("username", data.username || "");
}

async function loginAdmin() {
  const username = document.getElementById("user").value.trim();
  const password = document.getElementById("pass").value;

  if (!username || !password) {
    setStatus("Enter username + password.");
    return;
  }

  setStatus("Logging in…");

  try {
    const res = await fetch("/api/auth-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(data.error || "Login failed.");
      return;
    }

    saveSession(data);

    const role = (data.role || localStorage.getItem("role") || "").toLowerCase();

    if (role !== "admin") {
      setStatus("Not admin. Redirecting…");
      setTimeout(() => (window.location.href = "/questions.html"), 600);
      return;
    }

    setStatus("Admin verified ✅ Redirecting…");
    setTimeout(() => (window.location.href = "/admin.html"), 500);

  } catch (e) {
    setStatus("Network error: " + e.message);
  }
}

document.getElementById("loginBtn").onclick = loginAdmin;
document.getElementById("homeBtn").onclick = () => (window.location.href = "/");

// show quick status
(function init() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role") || "";
  const username = localStorage.getItem("username") || "";

  if (token && username) whoEl.textContent = `${username} (${role || "user"})`;
})();
