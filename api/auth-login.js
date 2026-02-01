import bcrypt from "bcryptjs";
import { supabase } from "./_supabase.js";
import { signToken } from "./_jwt.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { username, password } = req.body || {};

  const { data: user, error } = await supabase
    .from("users")
    .select("id, username, role, pass_hash")
    .eq("username", String(username || ""))
    .single();

  if (error || !user) return res.status(401).json({ error: "Invalid login" });

  const ok = bcrypt.compareSync(String(password || ""), user.pass_hash);
  if (!ok) return res.status(401).json({ error: "Invalid login" });

  const token = signToken({ id: user.id, role: user.role, username: user.username });

  res.status(200).json({ ok: true, token, user: { id: user.id, username: user.username, role: user.role } });
}
