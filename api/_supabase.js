import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://ylyvwytirhamoxmmikod.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlseXZ3eXRpcmhhbW94bW1pa29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4OTMwMDAsImV4cCI6MjA4NTQ2OTAwMH0.yjpmgEAPB9kGDAwUWyr47-97iOykeq9AUq3rwvF6aYo"
);
