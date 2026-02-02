const statusEl = document.getElementById("status");
const whoEl = document.getElementById("who");

function setStatus(msg) {
  statusEl.textContent = msg || "";
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
    // ✅ correct backend endpoint (session login)
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(data.error || "Login failed.");
      return;
    }

    // ✅ now check who am I (session)
    const meRes = await fetch("/api/auth/me");
    const meData = await meRes.json().catch(() => ({}));

    const user = meData.user;
    if (!user) {
      setStatus("Session error. Try again.");
      return;
    }

    whoEl.textContent = `${user.username} (${user.role})`;

    if (user.role !== "admin") {
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

// small label
whoEl.textContent = "Not logged in";
