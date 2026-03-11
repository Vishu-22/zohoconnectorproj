$(document).ready(function(){
  $('.testimonial-slider').slick({
    autoplay: true,
    autoplaySpeed: 2000,
    dots: true,
    arrows: false,
    adaptiveHeight: true,
    fade: true,
    cssEase: 'ease-in-out',
    speed: 200
  });
});

function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.classList.add('notification', type);
  notification.innerText = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.remove();
    if (type === 'success' && message.includes('Sign-Up successful')) {
      document.getElementById('authTitle').textContent = 'Welcome Back!';
      document.getElementById('authButton').textContent = 'Sign In';
      document.getElementById('toggleForm').textContent = "Don't have an account? Sign Up";
      document.getElementById('action').value = 'signin';
      document.getElementById('nameGroup').style.display = 'none';
      document.getElementById('lastNameGroup').style.display = 'none';
      document.getElementById('confirmPasswordGroup').style.display = 'none';
    }
  }, 3000);
}

function togglePassword(fieldId) {
  const passwordField = document.getElementById(fieldId);
  const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
  passwordField.setAttribute('type', type);
}

function getSupabaseClient() {
  if (!window.supabaseClient) {
    showNotification('Supabase client is not configured.', 'error');
    return null;
  }
  return window.supabaseClient;
}

async function handleSignUp(supabaseClient, formData) {
  const email = formData.get('email').trim();
  const password = formData.get('password').trim();
  const firstName = formData.get('first_name').trim();
  const lastName = formData.get('last_name').trim();

  if (!firstName || !lastName) {
    showNotification('First name and last name are required for sign-up.', 'error');
    return;
  }

  if (password.length < 6) {
    showNotification('Password must be at least 6 characters long.', 'error');
    return;
  }

  const { error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName
      }
    }
  });

  if (error) {
    showNotification(error.message || 'Sign-up failed.', 'error');
    return;
  }

  showNotification('Sign-Up successful! Please sign in with your credentials.', 'success');
}

async function handleSignIn(supabaseClient, formData) {
  const email = formData.get('email').trim();
  const password = formData.get('password').trim();

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showNotification(error.message || 'Incorrect email or password. Please try again.', 'error');
    return;
  }

  if (!data.session) {
    showNotification('Check your inbox to confirm your email before signing in.', 'info');
    return;
  }

  window.location.href = '/Templates/connector/connector.html';
}

document.getElementById('authForm').addEventListener('submit', async function(event) {
  event.preventDefault();

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  const formData = new FormData(event.target);
  const action = formData.get('action');
  const email = formData.get('email').trim();
  const password = formData.get('password').trim();

  if (!email || !password) {
    showNotification('Email and password are required.', 'error');
    return;
  }

  if (action === 'signup') {
    const confirmPassword = formData.get('confirm_password').trim();
    if (password !== confirmPassword) {
      showNotification('Passwords do not match.', 'error');
      return;
    }
    await handleSignUp(supabaseClient, formData);
    return;
  }

  await handleSignIn(supabaseClient, formData);
});

const toggleFormButton = document.getElementById('toggleForm');
const firstNameGroup = document.getElementById('nameGroup');
const lastNameGroup = document.getElementById('lastNameGroup');
const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
const authTitle = document.getElementById('authTitle');
const authButton = document.getElementById('authButton');
const actionInput = document.getElementById('action');
let isSignIn = true;

function syncAuthMode() {
  firstNameGroup.style.display = isSignIn ? 'none' : 'block';
  lastNameGroup.style.display = isSignIn ? 'none' : 'block';
  confirmPasswordGroup.style.display = isSignIn ? 'none' : 'block';
  authTitle.textContent = isSignIn ? 'Welcome Back!' : 'Create an Account';
  authButton.textContent = isSignIn ? 'Sign In' : 'Sign Up';
  toggleFormButton.textContent = isSignIn
    ? "Don't have an account? Sign Up"
    : 'Already have an account? Sign In';
  actionInput.value = isSignIn ? 'signin' : 'signup';
}

syncAuthMode();

toggleFormButton.addEventListener('click', () => {
  isSignIn = !isSignIn;
  syncAuthMode();
});
