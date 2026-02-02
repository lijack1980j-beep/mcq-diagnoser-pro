const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

async function enter() {
  const password = document.getElementById("pass").value;

  if (!password) {
    setStatus("Enter the password.");
    return;
  }

  setStatus("Checking…");

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(data.error || "Access denied.");
      return;
    }

    setStatus("✅ Access granted. Redirecting…");
    setTimeout(() => (window.location.href = "/admin.html"), 300);

  } catch (e) {
    setStatus("Network error: " + e.message);
  }
}

document.getElementById("goBtn").onclick = enter;
document.getElementById("homeBtn").onclick = () => (window.location.href = "/");

// Enter key support
document.getElementById("pass").addEventListener("keydown", (e) => {
  if (e.key === "Enter") enter();
});
