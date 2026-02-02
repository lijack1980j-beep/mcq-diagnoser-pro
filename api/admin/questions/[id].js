// api/admin/questions/[id].js
import { supabase } from "../../_supabase.js";
import { verifyTokenFromReq } from "../../_jwt.js";

function requireAdmin(req, res) {
  const user = verifyTokenFromReq(req);
  if (!user) {
    res.status(401).json({ error: "Not logged in" });
    return null;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  const user = requireAdmin(req, res);
  if (!user) return;

  const id = req.query.id;

  // ✅ DELETE /api/admin/questions/:id
  if (req.method === "DELETE") {
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
