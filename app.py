from flask import (
    Flask, request, redirect, render_template,
    jsonify, session, url_for, send_from_directory, render_template_string
)
from werkzeug.security import generate_password_hash, check_password_hash
from flask_session import Session
from functools import wraps
import logging
from logging.handlers import RotatingFileHandler
import mysql.connector
from mysql.connector import Error
from pathlib import Path
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import uuid
import requests
from urllib.parse import quote_plus
import re
from dotenv import load_dotenv
import os

app = Flask(__name__, template_folder='Templates')

# ----------------------
# Configuration
# ----------------------

# Configure Secret Key for Session
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your_secure_random_secret_key')
app.config['SESSION_TYPE'] = 'filesystem'

# Use /tmp on serverless platforms like Vercel; fallback to local folder for dev
session_dir = Path(os.getenv('SESSION_DIR', '/tmp/flask_session'))
app.config['SESSION_FILE_DIR'] = session_dir
app.config['SESSION_PERMANENT'] = False

# Initialize Extensions
Session(app)
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# ----------------------
# Logging Configuration
# ----------------------

# Ensure log directory exists using pathlib
log_dir = Path(os.getenv('LOG_DIR', '/tmp/logs'))
log_dir.mkdir(exist_ok=True)

logger = logging.getLogger('main_app')
logger.setLevel(logging.DEBUG)

formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s')

# File handler for all logs
file_handler = RotatingFileHandler(
    str(log_dir / 'app.log'),
    maxBytes=1024 * 1024,  # 1MB
    backupCount=5
)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(formatter)

# File handler for errors
error_handler = RotatingFileHandler(
    str(log_dir / 'backend.log'),
    maxBytes=1024 * 1024,
    backupCount=5
)
error_handler.setLevel(logging.ERROR)
error_handler.setFormatter(formatter)

# Console handler
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.DEBUG)
console_handler.setFormatter(formatter)

logger.addHandler(file_handler)
logger.addHandler(error_handler)
logger.addHandler(console_handler)

# ----------------------
# Database Configuration for XAMPP
# ----------------------

# Load environment variables from the .env file
load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_DATABASE"),
    "port": int(os.getenv("DB_PORT", 3306))
}

def init_database():
    conn = None
    cursor = None
    try:
        # Connect to MySQL server (without specifying the database initially)
        conn = mysql.connector.connect(
            host=DB_CONFIG["host"],
            user=DB_CONFIG["user"],
            password=DB_CONFIG["password"],
            port=DB_CONFIG["port"]
        )
        cursor = conn.cursor()

        # Create the database if it doesn't exist, then select it
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_CONFIG['database']}")
        cursor.execute(f"USE {DB_CONFIG['database']}")

        # Create signup table
        cursor.execute(""" 
            CREATE TABLE IF NOT EXISTS signup ( 
                id INT AUTO_INCREMENT PRIMARY KEY, 
                email VARCHAR(255) UNIQUE NOT NULL, 
                password VARCHAR(255) NOT NULL, 
                first_name VARCHAR(255), 
                last_name VARCHAR(255), 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
            ) 
        """)

        # Create signin table
        cursor.execute(""" 
            CREATE TABLE IF NOT EXISTS signin ( 
                id INT AUTO_INCREMENT PRIMARY KEY, 
                email VARCHAR(255) UNIQUE NOT NULL, 
                password VARCHAR(255) NOT NULL, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
            ) 
        """)

        # Create applications table
        cursor.execute(""" 
            CREATE TABLE IF NOT EXISTS applications ( 
                id INT AUTO_INCREMENT PRIMARY KEY, 
                name VARCHAR(255) NOT NULL 
            ) 
        """)

        # Create scopes table
        cursor.execute(""" 
            CREATE TABLE IF NOT EXISTS scopes ( 
                id INT AUTO_INCREMENT PRIMARY KEY, 
                application_id INT NOT NULL, 
                scope_name VARCHAR(255) NOT NULL
                -- FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE 
            ) 
        """)

        conn.commit()
        print("Database and tables initialized successfully.")

    except mysql.connector.Error as err:
        print("Error:", err)
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.is_connected():
            conn.close()

# Initialize database on startup only when explicitly enabled
if os.getenv('ENABLE_DB_INIT') == '1':
    init_database()

# Function to get database connection
def get_db_connection():
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        return connection
    except Error as e:
        logger.error(f"Error connecting to database: {e}")
        raise

# ----------------------
# OAuth Configuration
# ----------------------

# Define Zoho OAuth domains based on region
ZOHO_DOMAINS = {
    'US': 'https://accounts.zoho.com',
    'AU': 'https://accounts.zoho.com.au',
    'EU': 'https://accounts.zoho.eu',
    'IN': 'https://accounts.zoho.in',
    'CN': 'https://accounts.zoho.com.cn',
    'JP': 'https://accounts.zoho.jp',
    'SA': 'https://accounts.zoho.sa',
    'CA': 'https://accounts.zohocloud.ca'
}

RESPONSE_TYPE = 'code'
GRANT_TYPE = 'authorization_code'
REDIRECT_URI_DEFAULT = 'http://127.0.0.1:8000/oauth_redirect/'

# In-memory storage for OAuth sessions
oauth_sessions = {}

# ----------------------
# Enhanced Scope Processing Helper
# ----------------------
# Prompt for Enhanced Scope Processing:
#
#   Objective: Refactor the OAuth scope handling logic to efficiently process and validate
#   more than 50 scopes at a time while maintaining code readability, performance, and security.
#
#   This function:
#     1. Splits and trims the incoming comma-separated scopes.
#     2. Validates each scope against a regex pattern (allowing letters, numbers, dots, underscores, and hyphens).
#     3. Removes duplicate scopes.
#     4. Ensures essential scopes are present.
#     5. Joins and URL-encodes the final scopes string.
#
def process_scopes(scopes_raw: str, essential_scopes: list, valid_scope_pattern: str = r'^[A-Za-z0-9\.\_\-]+$') -> str:
    """
    Process the input scopes string and return a URL-encoded string of scopes.
    
    Args:
        scopes_raw (str): The raw comma-separated scopes string.
        essential_scopes (list): A list of essential scopes that must be included.
        valid_scope_pattern (str): Regex pattern that each scope must match.
        
    Returns:
        str: URL-encoded scope string.
    """
    scopes_set = set()
    if scopes_raw:
        scopes_list = [s.strip() for s in scopes_raw.split(',') if s.strip()]
        for scope in scopes_list:
            if re.match(valid_scope_pattern, scope):
                scopes_set.add(scope)
            else:
                logger.warning(f"Invalid scope format detected and skipped: {scope}")
    
    # Ensure essential scopes are present
    for es in essential_scopes:
        scopes_set.add(es)
    
    # Sort scopes for consistency and join them with a space before URL encoding
    scopes_combined = ' '.join(sorted(scopes_set))
    return quote_plus(scopes_combined)

# ----------------------
# Templates
# ----------------------

# Inline HTML templates for OAuth success and error messages
ERROR_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Error</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f8d7da; color: #721c24; text-align: center; padding-top: 50px; }
        .container { display: inline-block; padding: 20px; border: 1px solid #f5c6cb; border-radius: 5px; background-color: #f8d7da; }
        h1 { margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Error</h1>
        <p>{{ message }}</p>
    </div>
</body>
</html>
"""

SUCCESS_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OAuth Success</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --neon-blue: #00f3ff;
      --neon-purple: #9d00ff;
      --dark-bg: #0a0a0f;
      --card-bg: rgba(16, 16, 24, 0.9);
      --text-primary: #ffffff;
      --text-secondary: #a0a0a0;
    }

    body {
      font-family: 'Inter', sans-serif;
      background-color: #2c2cd4;
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      color: var(--text-primary);
      overflow: hidden;
      position: relative;
    }

    /* Animated Background */
    body::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: 
        radial-gradient(circle at 50% 50%, var(--neon-purple) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, var(--neon-blue) 0%, transparent 35%);
      opacity: 0.15;
      z-index: -1;
      animation: gradientMove 15s ease infinite;
      filter: blur(60px);
    }

    @keyframes gradientMove {
      0%, 100% { transform: translate(0, 0) scale(1); }
      25% { transform: translate(10%, 5%) scale(1.1); }
      50% { transform: translate(-5%, -10%) scale(0.9); }
      75% { transform: translate(-10%, 5%) scale(1.05); }
    }

    .card {
      background: var(--card-bg);
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      padding: 40px;
      width: 90%;
      max-width: 600px;
      position: relative;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      transform-style: preserve-3d;
      perspective: 1000px;
      animation: cardFloat 6s ease-in-out infinite;
    }

    @keyframes cardFloat {
      0%, 100% { transform: translateY(0) rotateX(0deg); }
      50% { transform: translateY(-10px) rotateX(2deg); }
    }

    .card h1 {
      font-size: 2.5rem;
      margin-bottom: 30px;
      background: linear-gradient(135deg, var(--neon-blue), var(--neon-purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-align: center;
      font-weight: 600;
    }

    .token-section {
      margin: 25px 0;
    }

    .token-section p {
      font-size: 1rem;
      color: var(--text-secondary);
      margin-bottom: 10px;
      font-weight: 500;
    }

    .token-box {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 15px;
      font-family: 'Monaco', monospace;
      font-size: 0.9rem;
      color: var(--text-primary);
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
    }

    .token-box:hover {
      border-color: var(--neon-blue);
      box-shadow: 0 0 15px rgba(0, 243, 255, 0.2);
    }

    .copy-btn {
      position: absolute;
      top: 50%;
      right: 15px;
      transform: translateY(-50%);
      background: linear-gradient(135deg, var(--neon-blue), var(--neon-purple));
      border: none;
      color: var(--text-primary);
      padding: 8px 15px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 500;
      transition: all 0.3s ease;
      opacity: 0;
    }

    .token-box:hover .copy-btn {
      opacity: 1;
    }

    .copy-btn:hover {
      transform: translateY(-50%) scale(1.05);
      box-shadow: 0 0 20px rgba(0, 243, 255, 0.4);
    }

    /* Success Animation */
    @keyframes successPulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.02); }
      100% { transform: scale(1); }
    }

    .success-icon {
      width: 60px;
      height: 60px;
      margin: 0 auto 20px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--neon-blue), var(--neon-purple));
      display: flex;
      align-items: center;
      justify-content: center;
      animation: successPulse 2s infinite;
    }

    .success-icon::before {
      content: '✓';
      font-size: 2rem;
      color: var(--text-primary);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="success-icon"></div>
    <h1>OAuth Successful</h1>
    <div class="token-section">
      <p>Access Token</p>
      <div class="token-box" id="accessTokenBox">
        {{ access_token }}
        <button class="copy-btn" onclick="copyToClipboard('accessTokenBox')">Copy Token</button>
      </div>
    </div>
    <div class="token-section">
      <p>Refresh Token</p>
      <div class="token-box" id="refreshTokenBox">
        {{ refresh_token }}
        <button class="copy-btn" onclick="copyToClipboard('refreshTokenBox')">Copy Token</button>
      </div>
    </div>
  </div>

  <script>
    function copyToClipboard(elementId) {
      const element = document.getElementById(elementId);
      const text = element.childNodes[0].textContent.trim();
      
      navigator.clipboard.writeText(text).then(() => {
        const btn = element.querySelector('.copy-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    }

    // Add subtle parallax effect to card
    document.addEventListener('mousemove', (e) => {
      const card = document.querySelector('.card');
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const moveX = (x - centerX) / 50;
      const moveY = (y - centerY) / 50;
      
      card.style.transform = `rotateY(${moveX}deg) rotateX(${-moveY}deg)`;
    });

    // Reset card position when mouse leaves
    document.querySelector('.card').addEventListener('mouseleave', () => {
      document.querySelector('.card').style.transform = 'rotateY(0deg) rotateX(0deg)';
    });
  </script>
</body>
</html>
"""

# ----------------------
# Route Handlers
# ----------------------

@app.route('/')
def index():
    return render_template('landing/landing.html')

@app.route('/signin')
def signin():
    return render_template('Signin_up/signin.html', action='signin')

@app.route('/signup')
def signup():
    return render_template('Signin_up/signin.html', action='signup')

@app.route('/connector')
def connector():
    return render_template('connector/connector.html')

@app.route('/auth', methods=['POST'])
@limiter.limit("10 per minute")
def auth():
    try:
        # Extract form data
        action = request.form.get('action')
        email = request.form.get('email').strip()
        password = request.form.get('password').strip()

        # Initialize error message
        error = None

        # Basic validation
        if not email or not password:
            error = "Email and password are required."

        if not is_valid_email(email):
            error = "Invalid email format."

        if action == 'signup':
            first_name = request.form.get('first_name').strip()
            last_name = request.form.get('last_name').strip()
            confirm_password = request.form.get('confirm_password').strip()

            # Additional validations for sign-up
            if not first_name or not last_name:
                error = "First name and last name are required for sign-up."

            if password != confirm_password:
                error = "Passwords do not match."

            if len(password) < 6:
                error = "Password must be at least 6 characters long."

        # If there's any error, return JSON response with error message
        if error:
            logger.warning(f"Authentication error: {error}")
            return jsonify({"success": False, "message": error}), 400

        # Database operations
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if action == 'signup':
            # Check if user already exists in signup table
            cursor.execute("SELECT id FROM signup WHERE email = %s", (email,))
            if cursor.fetchone():
                error = "Email is already registered."
                logger.warning(f"Sign-Up attempt with existing email: {email}")
                return jsonify({"success": False, "message": error}), 400

            # Hash the password
            hashed_password = generate_password_hash(password)

            # Insert into signup table
            cursor.execute("""
                INSERT INTO signup (email, password, first_name, last_name)
                VALUES (%s, %s, %s, %s)
            """, (email, hashed_password, first_name, last_name))

            # Insert into signin table
            cursor.execute("""
                INSERT INTO signin (email, password)
                VALUES (%s, %s)
            """, (email, hashed_password))

            conn.commit()
            logger.info(f"New user signed up: {email}")

            return jsonify({"success": True, "message": "Sign-Up successful! Please sign in with your credentials."}), 200

        elif action == 'signin':
            # Check if user exists in signin table
            cursor.execute("SELECT * FROM signin WHERE email = %s", (email,))
            user = cursor.fetchone()

            if user and check_password_hash(user['password'], password):
                # Authentication successful
                session['user_id'] = user['id']
                session['email'] = user['email']
                logger.info(f"User signed in: {email}")
                # Return JSON with redirect URL instead of redirect
                return jsonify({"success": True, "message": "Sign-In successful!", "redirect": "/connector"}), 200
            else:
                error = "Invalid email or password."
                logger.warning(f"Failed sign-in attempt for email: {email}")
                return jsonify({"success": False, "message": error}), 400

        else:
            error = "Invalid action."
            logger.error(f"Invalid action received: {action}")
            return jsonify({"success": False, "message": error}), 400

    except Error as e:
        logger.error(f"Database error during authentication: {e}")
        return jsonify({"success": False, "message": "Internal server error."}), 500

    except Exception as e:
        logger.error(f"Error during authentication: {e}")
        return jsonify({"success": False, "message": "An unexpected error occurred."}), 500

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals() and conn.is_connected():
            conn.close()

@app.route('/get_oauth_tokens', methods=['POST'])
def start_oauth():
    client_id = request.form.get('client_id')
    client_secret = request.form.get('client_secret')
    redirect_url = request.form.get('redirect_url', REDIRECT_URI_DEFAULT)
    scopes_raw = request.form.get('scopes', '')
    region = request.form.get('region')

    logger.debug(
        f"Received POST data - client_id: {client_id}, "
        f"client_secret: {'***' if client_secret else None}, "
        f"redirect_url: {redirect_url}, scopes: {scopes_raw}, region: {region}"
    )

    # Validate required fields
    if not all([client_id, client_secret, region]):
        return render_template_string(ERROR_TEMPLATE, 
            message="Client ID, Client Secret, and Region are required."
        ), 400

    # Use the enhanced scope processing helper
    essential_scopes = ['ZohoCRM.users.ALL', 'ZohoCRM.org.ALL', 'offline_access']
    scopes_str = process_scopes(scopes_raw, essential_scopes)

    # Generate state and store session
    state = str(uuid.uuid4())
    oauth_sessions[state] = {
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_url': redirect_url,
        'region': region,
        'scopes': scopes_str
    }

    # Build the authorization URL with all required parameters
    auth_url = (
        f"{ZOHO_DOMAINS[region]}/oauth/v2/auth?"
        f"response_type={RESPONSE_TYPE}&"
        f"client_id={client_id}&"
        f"scope={scopes_str}&"
        f"redirect_uri={quote_plus(redirect_url)}&"
        f"access_type=offline&"
        f"prompt=consent&"
        f"state={state}"
    )

    logger.info(f"Redirecting to Zoho OAuth URL: {auth_url}")
    return redirect(auth_url)

@app.route('/oauth_redirect/', methods=['GET'])
def oauth_redirect():
    code = request.args.get('code')
    state_received = request.args.get('state')
    error = request.args.get('error')
    error_description = request.args.get('error_description')

    logger.debug(f"Received OAuth Redirect - code: {code}, state: {state_received}, error: {error}")

    if error:
        error_msg = f"Authorization failed: {error}"
        if error_description:
            error_msg += f" - {error_description}"
        logger.error(error_msg)
        return render_template_string(ERROR_TEMPLATE, message=error_msg), 400

    if not code:
        return render_template_string(ERROR_TEMPLATE, 
            message="Authorization code not found."
        ), 400

    session_data = oauth_sessions.get(state_received)
    if not session_data:
        return render_template_string(ERROR_TEMPLATE,
            message="Invalid or expired state parameter."
        ), 400

    client_id = session_data.get('client_id')
    client_secret = session_data.get('client_secret')
    redirect_uri = session_data.get('redirect_url')
    region = session_data.get('region')

    if not all([client_id, client_secret, redirect_uri, region]):
        return render_template_string(ERROR_TEMPLATE,
            message="Missing OAuth credentials in session. Please try again."
        ), 400

    token_url = f"{ZOHO_DOMAINS[region]}/oauth/v2/token"
    
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": GRANT_TYPE,
        "code": code
    }

    try:
        response = requests.post(token_url, data=data)
        response.raise_for_status()
        token_data = response.json()
        
        access_token = token_data.get('access_token')
        refresh_token = token_data.get('refresh_token')
        
        if not access_token or not refresh_token:
            logger.error(f"Failed to retrieve tokens from Zoho. Response: {token_data}")
            return render_template_string(ERROR_TEMPLATE,
                message="Failed to generate tokens. Please check the logs."
            ), 400
            
        # Clean up the session
        if state_received in oauth_sessions:
            del oauth_sessions[state_received]
        
        return render_template_string(SUCCESS_TEMPLATE,
            access_token=access_token,
            refresh_token=refresh_token
        )
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Error during token request: {str(e)}")
        return render_template_string(ERROR_TEMPLATE,
            message=f"Failed to generate tokens: {str(e)}"
        ), 400

# ----------------------
# API Routes
# ----------------------

@app.route('/api/applications')
def get_applications():
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id, name FROM applications")
        applications = cursor.fetchall()
        return jsonify({"applications": applications})
    except Error as e:
        logger.error(f"Database error in get_applications: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'connection' in locals() and connection:
            connection.close()

@app.route('/api/scopes')
def get_scopes():
    application_id = request.args.get('application_id')

    if not application_id:
        return jsonify({"error": "Missing 'application_id' parameter"}), 400

    if not application_id.isdigit():
        return jsonify({"error": "'application_id' must be an integer"}), 400

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        query = "SELECT scope_name FROM scopes WHERE application_id = %s"
        logger.info(f"Executing query: {query} with application_id: {application_id}")
        cursor.execute(query, (int(application_id),))
        scopes = [row['scope_name'] for row in cursor.fetchall()]

        # Log the scopes retrieved
        logger.info(f"Scopes retrieved for application_id {application_id}: {scopes}")

        return jsonify({"scopes": scopes})
    except Error as e:
        logger.error(f"Database error in get_scopes: {e}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'connection' in locals() and connection:
            connection.close()



# ----------------------
# Error Handlers
# ----------------------

@app.errorhandler(404)
def not_found_error(error):
    return render_template('connector/connector.html', error="Page not found."), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {str(error)}")
    return render_template('connector/connector.html', error="Internal server error."), 500

# ----------------------
# Static Files Serving
# ----------------------

# Serve CSS and JS files from /Templates/Signin_up/
@app.route('/Templates/Signin_up/<path:filename>')
def serve_signin_css_js(filename):
    return send_from_directory('Templates/Signin_up', filename)

# Serve CSS and JS files from /Templates/connector/
@app.route('/Templates/landing/<path:filename>')
def serve_connector_css_js(filename):
    return send_from_directory('Templates/landing', filename)

# Serve CSS and JS files from /Templates/connector/
@app.route('/Templates/connector/<path:filename>')
def serve_conn_css_js(filename):
    return send_from_directory('Templates/connector', filename)

# ----------------------
# Utility Functions
# ----------------------

def is_valid_email(email):
    regex = r'^\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'
    return re.match(regex, email)

# -----------------------
# Ensure Directories Exist
# ----------------------

def ensure_directories():
    session_dir.mkdir(exist_ok=True)
    log_dir.mkdir(exist_ok=True)

# Initialize directories on startup
ensure_directories()

if __name__ == '__main__':
    app.run(debug=True, port=8000)
