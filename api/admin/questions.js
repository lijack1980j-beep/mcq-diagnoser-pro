// api/admin/questions.js
import { supabase } from "../_supabase.js";
import { verifyTokenFromReq } from "../_jwt.js";

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

  // ✅ GET /api/admin/questions
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("questions")
      .select("id, topic, difficulty, question")
      .order("id", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ questions: data || [] });
  }

  // ✅ POST /api/admin/questions
  if (req.method === "POST") {
    const { topic, difficulty, question, choices, answerIndex, explain } = req.body || {};

    if (!topic || !question) return res.status(400).json({ error: "topic + question required" });
    if (!Array.isArray(choices) || choices.length < 2)
      return res.status(400).json({ error: "Add at least 2 choices" });
    if (answerIndex == null || answerIndex < 0 || answerIndex >= choices.length)
      return res.status(400).json({ error: "Invalid answerIndex" });

    // ⚠️ Change column names here if your table differs
    const { data, error } = await supabase
      .from("questions")
      .insert({
        topic: String(topic),
        difficulty: Number(difficulty ?? 2),
        question: String(question),
        choices,                 // if your column is json/array
        answer_index: Number(answerIndex),
        explain: String(explain ?? "")
      })
      .select("id, topic, difficulty, question")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, question: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
