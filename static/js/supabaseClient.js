(function initSupabaseClient() {
  if (!window.__ENV) {
    console.error("Missing window.__ENV. Create static/js/env.js.");
    return;
  }

  const url = window.__ENV.SUPABASE_URL;
  const key = window.__ENV.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Supabase URL or anon key missing in static/js/env.js");
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase JS client not loaded.");
    return;
  }

  window.supabaseClient = window.supabase.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
})();
