const statusEl = document.getElementById("status");
const sessionText = document.getElementById("sessionText");

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function setSessionPill() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role") || "user";
  const username = localStorage.getItem("username") || "";

  if (!token) {
    sessionText.textContent = "Not logged in";
    return;
  }

  sessionText.textContent = username ? `Logged as ${username} (${role})` : `Logged in (${role})`;
}

function redirectAfterAuth(role) {
  if (role === "admin") {
    window.location.href = "/admin.html";
  } else {
    window.location.href = "/questions.html";
  }
}

async function register() {
  const username = document.getElementById("rUser").value.trim();
  const password = document.getElementById("rPass").value;

  if (!username || !password) {
    setStatus("Please enter username and password.");
    return;
  }

  try {
    setStatus("Registering…");

    const res = await fetch("/api/auth-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus("Register error: " + (data.error || "failed"));
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.user?.role || "user");
    localStorage.setItem("username", data.user?.username || username);

    setStatus("Registered ✅ Redirecting…");
    setSessionPill();
    redirectAfterAuth(data.user?.role || "user");
  } catch (e) {
    setStatus("Register error: " + e.message);
  }
}

async function login() {
  const username = document.getElementById("lUser").value.trim();
  const password = document.getElementById("lPass").value;

  if (!username || !password) {
    setStatus("Please enter username and password.");
    return;
  }

  try {
    setStatus("Logging in…");

    const res = await fetch("/api/auth-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus("Login error: " + (data.error || "failed"));
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.user?.role || "user");
    localStorage.setItem("username", data.user?.username || username);

    setStatus("Login success ✅ Redirecting…");
    setSessionPill();
    redirectAfterAuth(data.user?.role || "user");
  } catch (e) {
    setStatus("Request failed: " + e.message);
  }
}

// UI helpers
document.getElementById("registerBtn").onclick = register;
document.getElementById("loginBtn").onclick = login;

document.getElementById("adminEnterBtn").onclick = () => {
  window.location.href = "/admin.html";
};

document.getElementById("goRegisterBtn").onclick = () => {
  document.getElementById("registerCard").scrollIntoView({ behavior: "smooth", block: "start" });
};

document.getElementById("goLoginBtn").onclick = () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// init
setSessionPill();
