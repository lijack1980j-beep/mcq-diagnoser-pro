// api/_supabase.js
import { createClient } from "@supabase/supabase-js";

// 🔐 On Vercel: put these in Environment Variables
// Settings → Environment Variables
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://ylyvwytirhamoxmmikod.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlseXZ3eXRpcmhhbW94bW1pa29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4OTMwMDAsImV4cCI6MjA4NTQ2OTAwMH0.yjpmgEAPB9kGDAwUWyr47-97iOykeq9AUq3rwvF6aYo";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
