const statusEl = document.getElementById("status");
const bankOut = document.getElementById("bankOut");

function setStatus(msg) {
  statusEl.textContent = msg;
}

async function register() {
  const username = document.getElementById("rUser").value.trim();
  const password = document.getElementById("rPass").value;

  const res = await fetch("/api/auth-register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!res.ok) {
    setStatus("Register error: " + (data.error || "failed"));
    return;
  }

 localStorage.setItem("token", data.token);
setStatus("Registered & logged in ✅");
window.location.href = "/questions.html";
}

async function login() {
  const username = document.getElementById("lUser").value.trim();
  const password = document.getElementById("lPass").value;

  try {
    const res = await fetch("/api/auth-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus("Login error: " + (data.error || "failed"));
      return;
    }

 localStorage.setItem("token", data.token);
setStatus("Login success ✅");

// ✅ GO TO QUESTIONS PAGE
window.location.href = "/questions.html";
  } catch (e) {
    setStatus("Request failed: " + e.message);
  }
}

async function loadBank() {
  const token = localStorage.getItem("token");
  if (!token) {
    setStatus("You must login first.");
    return;
  }

  const res = await fetch("/api/bank", {
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();

  if (!res.ok) {
    setStatus("Bank error: " + (data.error || "failed"));
    return;
  }

  setStatus("Loaded bank ✅ (" + data.length + " questions)");
  bankOut.textContent = JSON.stringify(data, null, 2);
}

document.getElementById("registerBtn").onclick = register;
document.getElementById("loginBtn").onclick = login;
document.getElementById("bankBtn").onclick = loadBank;


