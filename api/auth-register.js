import bcrypt from "bcryptjs";
import { supabase } from "./_supabase.js";
import { signToken } from "./_jwt.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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

  const token = signToken({ id: user.id, role: user.role, username: user.username });

  res.status(200).json({ ok: true, token, user });
}
