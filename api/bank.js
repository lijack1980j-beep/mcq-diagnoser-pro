import { supabase } from "./_supabase.js";
import { verifyTokenFromReq } from "./_jwt.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = verifyTokenFromReq(req);
  if (!user) return res.status(401).json({ error: "No token" });

  const { data, error } = await supabase
    .from("questions")
    .select("id, topic, difficulty, question, choices")
    .order("id", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json(data || []);
}
