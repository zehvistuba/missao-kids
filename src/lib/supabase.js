import { createClient } from "@supabase/supabase-js";

const createSupabaseClient = () => createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON,
);

const DEV_CLIENT_KEY = "__rotinup_supabase_client__";

export const supabase = import.meta.env.DEV
  ? globalThis[DEV_CLIENT_KEY] ?? (globalThis[DEV_CLIENT_KEY] = createSupabaseClient())
  : createSupabaseClient();
