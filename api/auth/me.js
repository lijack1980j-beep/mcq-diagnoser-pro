// api/auth-me.js
import { verifyTokenFromReq } from "./_jwt.js";
import { supabase } from "./_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = verifyTokenFromReq(req);
  if (!decoded) {
    return res.status(200).json({ user: null });
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, username, role")
    .eq("id", decoded.id)
    .single();

  if (error || !user) {
    return res.status(200).json({ user: null });
  }

  return res.status(200).json({ user });
}
