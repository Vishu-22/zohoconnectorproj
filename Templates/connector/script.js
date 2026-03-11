document.addEventListener('DOMContentLoaded', async function() {
  const supabaseClient = window.supabaseClient;
  if (!supabaseClient) {
    console.error('Supabase client not configured.');
    return;
  }

  const menuToggle = document.getElementById('menuToggle');
  const mainNav = document.getElementById('mainNav');
  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', function() {
      mainNav.classList.toggle('active');
    });
  }

  const redirectUrlInput = document.getElementById('redirect_url');
  if (redirectUrlInput && !redirectUrlInput.value) {
    redirectUrlInput.value = `${window.location.origin}/Templates/connector/oauth_callback.html`;
  }

  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData || !sessionData.session) {
    window.location.href = '/Templates/Signin_up/signin.html';
    return;
  }

  const selectedScopes = new Set();

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'} toast-icon"></i>
        <div>
          <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
          <div class="toast-message">${message}</div>
        </div>
        <button type="button" class="toast-close" aria-label="Close">
          <span aria-hidden="true">x</span>
        </button>
      </div>
    `;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastSlideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.style.animation = 'toastSlideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    });
  }

  function updateSelectedScopesDisplay() {
    const displayDiv = document.getElementById('selectedScopesDisplay');
    displayDiv.innerHTML = '';
    if (selectedScopes.size === 0) {
      return;
    }
    selectedScopes.forEach(scope => {
      const scopeTag = document.createElement('span');
      scopeTag.className = 'scope-tag';
      scopeTag.innerHTML = `
        ${scope}
        <span class="remove-scope" data-scope="${scope}">x</span>
      `;
      displayDiv.appendChild(scopeTag);
    });
    displayDiv.querySelectorAll('.remove-scope').forEach(button => {
      button.addEventListener('click', (e) => {
        const scope = e.target.dataset.scope;
        selectedScopes.delete(scope);
        const checkbox = document.querySelector(`input[type="checkbox"][value="${scope}"]`);
        if (checkbox) checkbox.checked = false;
        updateSelectedScopesDisplay();
        updateAuthenticateButton();
      });
    });
  }

  function updateAuthenticateButton() {
    const clientId = document.getElementById('client_id').value;
    const clientSecret = document.getElementById('client_secret').value;
    const region = document.getElementById('region').value;
    const isValid = clientId && clientSecret && region !== 'select' && selectedScopes.size > 0;
    const authenticateBtn = document.getElementById('authenticateBtn');
    authenticateBtn.disabled = !isValid;
  }

  function normalizeScopes(scopesRaw) {
    const essentialScopes = ['ZohoCRM.users.ALL', 'ZohoCRM.org.ALL', 'offline_access'];
    const pattern = /^[A-Za-z0-9._-]+$/;
    const scopeSet = new Set();

    if (scopesRaw) {
      scopesRaw.forEach(scope => {
        const trimmed = scope.trim();
        if (!trimmed) return;
        if (pattern.test(trimmed)) {
          scopeSet.add(trimmed);
        } else {
          console.warn(`Invalid scope skipped: ${trimmed}`);
        }
      });
    }

    essentialScopes.forEach(scope => scopeSet.add(scope));
    return Array.from(scopeSet).sort().join(' ');
  }

  async function fetchApplications() {
    const { data, error } = await supabaseClient
      .from('applications')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function fetchScopes(applicationId) {
    const { data, error } = await supabaseClient
      .from('scopes')
      .select('scope_name')
      .eq('application_id', applicationId)
      .order('scope_name', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  }

  try {
    const apps = await fetchApplications();
    const dropdownInput = document.getElementById('applicationsDropdown');
    const dropdownList = document.getElementById('applicationsList');

    dropdownInput.addEventListener('click', () => {
      dropdownList.classList.toggle('show');
      const chevron = dropdownInput.querySelector('.fa-chevron-down');
      if (chevron) {
        chevron.style.transform = dropdownList.classList.contains('show')
          ? 'rotate(180deg)'
          : 'rotate(0deg)';
      }
    });

    document.addEventListener('click', (e) => {
      if (!dropdownInput.contains(e.target) && !dropdownList.contains(e.target)) {
        dropdownList.classList.remove('show');
        const chevron = dropdownInput.querySelector('.fa-chevron-down');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
      }
    });

    async function fetchAndDisplayScopes(appId, scopesDiv) {
      scopesDiv.innerHTML = '<div class="text-center py-2"><i class="fas fa-spinner fa-spin"></i> Loading scopes...</div>';
      try {
        const scopes = await fetchScopes(appId);
        scopesDiv.innerHTML = '';
        if (!scopes || scopes.length === 0) {
          scopesDiv.innerHTML = '<p class="text-muted text-center">No scopes available.</p>';
          return;
        }
        scopes.forEach((scopeRow) => {
          const scope = scopeRow.scope_name;
          const scopeDiv = document.createElement('div');
          scopeDiv.className = 'form-check sub-item';
          const scopeCheckbox = document.createElement('input');
          scopeCheckbox.type = 'checkbox';
          scopeCheckbox.className = 'form-check-input scope-checkbox';
          scopeCheckbox.value = scope;
          scopeCheckbox.id = `app${appId}-scope-${scope}`;
          if (selectedScopes.has(scope)) scopeCheckbox.checked = true;
          scopeCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
              selectedScopes.add(scope);
              showToast(`Added scope: ${scope}`, 'success');
            } else {
              selectedScopes.delete(scope);
            }
            updateSelectedScopesDisplay();
            updateAuthenticateButton();
          });
          const scopeLabel = document.createElement('label');
          scopeLabel.className = 'form-check-label';
          scopeLabel.htmlFor = `app${appId}-scope-${scope}`;
          scopeLabel.textContent = scope;
          scopeDiv.appendChild(scopeCheckbox);
          scopeDiv.appendChild(scopeLabel);
          scopesDiv.appendChild(scopeDiv);
        });
        scopesDiv.style.display = 'block';
        scopesDiv.style.maxHeight = '0px';
        setTimeout(() => {
          scopesDiv.style.maxHeight = scopesDiv.scrollHeight + 'px';
        }, 0);
      } catch (error) {
        console.error('Error fetching scopes:', error);
        scopesDiv.innerHTML = '<p class="text-danger text-center">Error loading scopes.</p>';
        showToast('Failed to load scopes.', 'error');
      }
    }

    if (!apps || apps.length === 0) {
      dropdownList.innerHTML = '<p class="text-muted text-center">No applications available.</p>';
      return;
    }

    apps.forEach((app) => {
      const appElement = document.createElement('div');
      appElement.className = 'scope-item';
      const appHTML = `
        <div class="scope-header">
          <div class="checkbox-wrapper">
            <input type="checkbox" data-app-id="${app.id}" id="app-${app.id}">
            <label for="app-${app.id}">${app.name}</label>
          </div>
          <i class="fas fa-chevron-right chevron"></i>
        </div>
        <div class="scope-items" id="scopes-for-app${app.id}" style="display: none;"></div>
      `;
      appElement.innerHTML = appHTML;
      const header = appElement.querySelector('.scope-header');
      const scopesDiv = appElement.querySelector('.scope-items');
      const chevron = appElement.querySelector('.chevron');
      const checkbox = appElement.querySelector(`[data-app-id="${app.id}"]`);

      header.addEventListener('click', (e) => {
        if (!e.target.matches('input')) {
          const isExpanding = scopesDiv.style.display !== 'block';
          chevron.style.transform = isExpanding ? 'rotate(90deg)' : 'rotate(0deg)';
          if (isExpanding) {
            scopesDiv.style.display = 'block';
            scopesDiv.style.maxHeight = '0px';
            setTimeout(() => {
              scopesDiv.style.maxHeight = scopesDiv.scrollHeight + 'px';
            }, 0);
          } else {
            scopesDiv.style.maxHeight = '0px';
            setTimeout(() => {
              scopesDiv.style.display = 'none';
            }, 300);
          }
        }
      });

      checkbox.addEventListener('change', async (e) => {
        if (e.target.checked) {
          await fetchAndDisplayScopes(app.id, scopesDiv);
        } else {
          scopesDiv.style.maxHeight = '0px';
          setTimeout(() => {
            scopesDiv.innerHTML = '';
            scopesDiv.style.display = 'none';
            const appScopes = document.querySelectorAll(`[id^=app${app.id}-scope-]`);
            appScopes.forEach(scope => selectedScopes.delete(scope.value));
            updateSelectedScopesDisplay();
            updateAuthenticateButton();
          }, 300);
        }
      });
      dropdownList.appendChild(appElement);
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    document.getElementById('applicationsList').innerHTML = '<p class="text-danger text-center">Error loading applications.</p>';
    showToast('Failed to load applications.', 'error');
  }

  document.getElementById('oauthForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const submitButton = document.getElementById('authenticateBtn');
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redirecting...';

    const clientId = document.getElementById('client_id').value.trim();
    const clientSecret = document.getElementById('client_secret').value.trim();
    const redirectUrl = document.getElementById('redirect_url').value.trim();
    const region = document.getElementById('region').value;

    if (!clientId || !clientSecret || !redirectUrl || region === 'select') {
      showToast('Please complete all required fields.', 'error');
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fas fa-lock me-2"></i> Authenticate';
      return;
    }

    const scopesStr = normalizeScopes(Array.from(selectedScopes));
    if (!scopesStr) {
      showToast('Please select at least one scope.', 'error');
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fas fa-lock me-2"></i> Authenticate';
      return;
    }

    const state = crypto.randomUUID();
    sessionStorage.setItem('zoho_oauth', JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_url: redirectUrl,
      region,
      scopes: scopesStr,
      state
    }));

    const zohoDomains = {
      US: 'https://accounts.zoho.com',
      AU: 'https://accounts.zoho.com.au',
      EU: 'https://accounts.zoho.eu',
      IN: 'https://accounts.zoho.in',
      CN: 'https://accounts.zoho.com.cn',
      JP: 'https://accounts.zoho.jp',
      SA: 'https://accounts.zoho.sa',
      CA: 'https://accounts.zohocloud.ca'
    };

    const authUrl = `${zohoDomains[region]}/oauth/v2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scopesStr)}&redirect_uri=${encodeURIComponent(redirectUrl)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

    window.location.href = authUrl;
  });

  ['client_id', 'client_secret', 'region'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateAuthenticateButton);
  });

  updateAuthenticateButton();
  updateSelectedScopesDisplay();
});
