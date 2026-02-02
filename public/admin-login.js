// public/admin-login.js  ✅ JWT VERSION (works with your /api/auth/login returning { token, user })

const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

async function enter() {
  const password = document.getElementById("pass").value.trim();

  if (!password) {
    setStatus("Enter the password.");
    return;
  }

  setStatus("Checking…");

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password
      })
    });

    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

    if (!res.ok) {
      setStatus(data.error || "Access denied.");
      return;
    }

    // ✅ store JWT token
    if (data.token) {
      localStorage.setItem("token", data.token);
    } else {
      setStatus("Login succeeded but token missing.");
      return;
    }

    setStatus("✅ Access granted. Redirecting…");
    setTimeout(() => {
      window.location.href = "/admin.html";
    }, 300);

  } catch (e) {
    setStatus("Network error.");
  }
}

document.getElementById("goBtn").onclick = enter;
document.getElementById("homeBtn").onclick = () => (window.location.href = "/");

document.getElementById("pass").addEventListener("keydown", (e) => {
  if (e.key === "Enter") enter();
});
