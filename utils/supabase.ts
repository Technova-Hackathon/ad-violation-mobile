import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://uwftfrikbdgzzppgequh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3ZnRmcmlrYmRnenpwcGdlcXVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU3MTc5OTgsImV4cCI6MjA3MTI5Mzk5OH0.ySbsFddFWLUMfrVl2ymsPv20Cqau9C00rbJ48NhtOwE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
