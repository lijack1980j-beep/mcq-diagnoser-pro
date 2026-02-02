import serverless from "serverless-http";
import express from "express";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";

import { supabase } from "./_supabase.js";
import { signToken, verifyTokenFromReq } from "./_jwt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));

// ✅ Serve static files from /public
app.use(express.static(path.join(__dirname, "..", "public")));

/** ---------- Debug route ---------- **/
app.get("/api/health", async (req, res) => {
  const decoded = verifyTokenFromReq(req);
  const { data, error } = await supabase.from("questions").select("id").limit(1);

  res.json({
    ok: true,
    jwtUser: decoded ?? null,
    supabase: error ? { ok: false, error: error.message } : { ok: true, sample: data }
  });
});

/** ---------- Helpers (JWT) ---------- **/
function requireAuth(req, res, next) {
  const decoded = verifyTokenFromReq(req);
  if (!decoded) return res.status(401).json({ error: "Not logged in" });
  req.user = decoded;
  next();
}

function requireAdmin(req, res, next) {
  const decoded = verifyTokenFromReq(req);
  if (!decoded) return res.status(401).json({ error: "Not logged in" });
  if (decoded.role !== "admin") return res.status(403).json({ error: "Admin only" });
  req.user = decoded;
  next();
}

/** ---------- Auth (JWT) ---------- **/
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username + password required" });
  if (String(username).length < 3) return res.status(400).json({ error: "username too short" });
  if (String(password).length < 6) return res.status(400).json({ error: "password too short" });

  const pass_hash = bcrypt.hashSync(String(password), 10);

  const { data: existing, error: e1 } = await supabase
    .from("users")
    .select("id")
    .eq("username", String(username))
    .limit(1);

  if (e1) return res.status(500).json({ error: e1.message });
  if (existing?.length) return res.status(409).json({ error: "Username already exists" });

  const { data: user, error } = await supabase
    .from("users")
    .insert({ username: String(username), pass_hash, role: "user" })
    .select("id, username, role")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const token = signToken({ id: user.id, username: user.username, role: user.role });
  res.json({ ok: true, token, user });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};

  const { data: row, error } = await supabase
    .from("users")
    .select("id, username, role, pass_hash")
    .eq("username", String(username || ""))
    .single();

  if (error || !row) return res.status(401).json({ error: "Invalid login" });

  const ok = bcrypt.compareSync(String(password || ""), row.pass_hash);
  if (!ok) return res.status(401).json({ error: "Invalid login" });

  const token = signToken({ id: row.id, username: row.username, role: row.role });
  res.json({ ok: true, token, user: { id: row.id, username: row.username, role: row.role } });
});

// JWT doesn't need logout endpoint, but you can keep it:
app.post("/api/auth/logout", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  const decoded = verifyTokenFromReq(req);
  if (!decoded) return res.json({ user: null });

  // optional: fetch fresh role from DB
  const { data: user, error } = await supabase
    .from("users")
    .select("id, username, role")
    .eq("id", decoded.id)
    .single();

  if (error || !user) return res.json({ user: null });
  res.json({ user });
});

/** ---------- Admin (example) ---------- **/
app.get("/api/admin/questions", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("questions")
    .select("id, topic, difficulty, question")
    .order("id", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ questions: data || [] });
});

// ✅ Export serverless handler for Vercel
export default serverless(app);
