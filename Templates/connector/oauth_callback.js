(async function initCallback() {
  const statusTitle = document.getElementById('statusTitle');
  const statusMessage = document.getElementById('statusMessage');
  const tokenContainer = document.getElementById('tokenContainer');
  const accessTokenEl = document.getElementById('accessToken');
  const refreshTokenEl = document.getElementById('refreshToken');
  const copyAccess = document.getElementById('copyAccess');
  const copyRefresh = document.getElementById('copyRefresh');

  function setError(message) {
    statusTitle.textContent = 'OAuth Failed';
    statusMessage.textContent = message;
    statusMessage.classList.add('error-text');
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {
      console.error('Clipboard copy failed');
    });
  }

  if (!window.supabaseClient) {
    setError('Supabase client is not configured.');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  const errorDescription = params.get('error_description');

  if (error) {
    setError(`Authorization failed: ${error}${errorDescription ? ' - ' + errorDescription : ''}`);
    return;
  }

  if (!code) {
    setError('Authorization code not found.');
    return;
  }

  const stored = sessionStorage.getItem('zoho_oauth');
  if (!stored) {
    setError('Session data missing. Please restart the OAuth flow.');
    return;
  }

  const sessionData = JSON.parse(stored);
  if (!sessionData || sessionData.state !== state) {
    setError('Invalid OAuth state. Please restart the OAuth flow.');
    return;
  }

  const payload = {
    code,
    client_id: sessionData.client_id,
    client_secret: sessionData.client_secret,
    redirect_url: sessionData.redirect_url,
    region: sessionData.region
  };

  try {
    const anonKey = window.__ENV && window.__ENV.SUPABASE_ANON_KEY ? window.__ENV.SUPABASE_ANON_KEY : "";
    const { data, error: fnError } = await window.supabaseClient.functions.invoke('zoho-exchange', {
      body: payload,
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey
      }
    });

    if (fnError) {
      setError(fnError.message || 'Token exchange failed.');
      return;
    }

    if (data && data.error) {
      setError(typeof data.error === 'string' ? data.error : 'Token exchange failed.');
      return;
    }

    if (!data || !data.access_token || !data.refresh_token) {
      setError('Token exchange failed. Missing tokens in response.');
      return;
    }

    statusTitle.textContent = 'OAuth Successful';
    statusMessage.textContent = 'Tokens generated successfully.';
    tokenContainer.style.display = 'block';
    accessTokenEl.textContent = data.access_token;
    refreshTokenEl.textContent = data.refresh_token;

    copyAccess.addEventListener('click', () => copyText(data.access_token));
    copyRefresh.addEventListener('click', () => copyText(data.refresh_token));

    sessionStorage.removeItem('zoho_oauth');
  } catch (err) {
    console.error(err);
    setError('An unexpected error occurred.');
  }
})();
