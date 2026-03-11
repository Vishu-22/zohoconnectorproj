import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ZOHO_DOMAINS: Record<string, string> = {
  US: "https://accounts.zoho.com",
  AU: "https://accounts.zoho.com.au",
  EU: "https://accounts.zoho.eu",
  IN: "https://accounts.zoho.in",
  CN: "https://accounts.zoho.com.cn",
  JP: "https://accounts.zoho.jp",
  SA: "https://accounts.zoho.sa",
  CA: "https://accounts.zohocloud.ca"
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const body = await req.json();
    const { code, client_id, client_secret, redirect_url, region } = body || {};

    if (!code || !client_id || !client_secret || !redirect_url || !region) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const domain = ZOHO_DOMAINS[String(region).toUpperCase()];
    if (!domain) {
      return new Response(JSON.stringify({ error: "Invalid region" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const tokenUrl = `${domain}/oauth/v2/token`;

    const form = new URLSearchParams();
    form.set("client_id", client_id);
    form.set("client_secret", client_secret);
    form.set("redirect_uri", redirect_url);
    form.set("grant_type", "authorization_code");
    form.set("code", code);

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data || "Token exchange failed" }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!data.access_token || !data.refresh_token) {
      return new Response(JSON.stringify({ error: "Missing tokens in response", data }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type,
      expires_in: data.expires_in
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
