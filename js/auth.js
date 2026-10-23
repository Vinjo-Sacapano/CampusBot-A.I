/**
 * ============================================================================
 * CampusBot AI — Authentication & Security (Aklan Catholic College)
 * Firebase Auth is the single source of truth for sign-in. Profiles (name, role,
 * status) live in Firestore `users/{uid}`. Passwords are NEVER stored by this app.
 * ============================================================================
 */

let studentSession = null;
let adminSession = null;
let studentAuthMode = 'login';
let lastUnansweredQuery = '';
let authBusy = false;           // true while login/signup is mid-flight so the auth listener cannot race it
let pendingSignupName = null;   // name typed on the sign-up form; used when the profile document is created

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
window.escapeHtml = window.escapeHtml || escapeHtml;

function getPageType() {
  if (document.body && document.body.dataset && document.body.dataset.page) {
    return document.body.dataset.page;
  }
  const path = window.location.pathname.toLowerCase();
  if (path.includes('super-admin-dashboard')) return 'super-admin-dashboard';
  if (path.includes('staff-dashboard')) return 'staff-dashboard';
  if (path.includes('student-dashboard')) return 'student-dashboard';
  if (path.includes('login')) return 'login';
  if (path.includes('index')) return 'register';
  return 'register';
}
window.getPageType = getPageType;

function isRegisterView() {
  return getPageType() === 'register';
}
window.isRegisterView = isRegisterView;

// Old builds cached sessions in localStorage (trivial to forge). Sessions now come only from Firebase Auth.
const LEGACY_SESSION_KEYS = ['CAMPUSBOT_STUDENT_SESSION', 'CAMPUSBOT_ADMIN_SESSION'];

// FIX: top-level `let` variables are not window properties, so admin.js saw window.adminSession as undefined
// (Super Admin got "Access Denied" and every profile/user action failed). Expose read-only getters.
Object.defineProperty(window, 'studentSession', { get: () => studentSession, configurable: true });
Object.defineProperty(window, 'adminSession', { get: () => adminSession, configurable: true });

// ============================================================================
// 1. PASSWORD EYE ICON TOGGLE (Vanilla JS)
// ============================================================================

/**
 * Toggles password visibility between 'password' and 'text'
 * @param {string} inputId - ID of the password input element
 * @param {HTMLElement} triggerBtn - The button or icon clicked
 */
function togglePassword(inputId, triggerBtn) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';

  // Find icon inside button or use triggerBtn itself
  const icon = triggerBtn.querySelector('i') || triggerBtn;
  
  if (isPassword) {
    // Switch to Open Eye
    if (icon.tagName === 'I') {
      icon.className = 'fa-regular fa-eye';
    } else {
      triggerBtn.innerHTML = '<i class="fa-regular fa-eye"></i>';
    }
    triggerBtn.setAttribute('title', 'Hide password');
    triggerBtn.setAttribute('aria-label', 'Hide password');
  } else {
    // Switch to Closed Eye (Slash)
    if (icon.tagName === 'I') {
      icon.className = 'fa-regular fa-eye-slash';
    } else {
      triggerBtn.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
    }
    triggerBtn.setAttribute('title', 'Show password');
    triggerBtn.setAttribute('aria-label', 'Show password');
  }
}

// ============================================================================
// 2. VIEW SWITCHER
// ============================================================================
function switchTab(tab) {
  const studentView = document.getElementById('studentView');
  const adminView = document.getElementById('adminView');
  const tabStudentBtn = document.getElementById('tabStudentBtn');
  const tabAdminBtn = document.getElementById('tabAdminBtn');

  if (tab === 'student') {
    if (studentView) studentView.style.display = 'block';
    if (adminView) adminView.style.display = 'none';
    if (tabStudentBtn) tabStudentBtn.classList.add('active');
    if (tabAdminBtn) tabAdminBtn.classList.remove('active');
  } else {
    if (studentView) studentView.style.display = 'none';
    if (adminView) adminView.style.display = 'block';
    if (tabStudentBtn) tabStudentBtn.classList.remove('active');
    if (tabAdminBtn) tabAdminBtn.classList.add('active');
  }
}

// ============================================================================
// 3. STUDENT AUTHENTICATION (Login / Signup)
// ============================================================================

function renderStudentAuth(errorMsg, successMsg) {
  const el = document.getElementById('studentAuthBody');
  if (!el) return;
  const schoolName = (window.DATA && window.DATA.school && window.DATA.school.name) || "Aklan Catholic College";

  if (isRegisterView()) {
    el.innerHTML = `
      <h1>Create your account</h1>
      <p class="auth-sub">Sign up to start asking CampusBot about ${escapeHtml(schoolName)}.</p>
      ${errorMsg ? `<div class="auth-error">${errorMsg}</div>` : ''}
      ${successMsg ? `<div class="auth-success">${successMsg}</div>` : ''}
      <div class="auth-field">
        <label for="signup-name">Full name</label>
        <input type="text" id="signup-name" placeholder="Enter your full name" autocomplete="name">
      </div>
      <div class="auth-field">
        <label for="signup-email">Email address</label>
        <input type="email" id="signup-email" placeholder="Enter your email" autocomplete="email">
      </div>
      <div class="auth-field">
        <label for="signup-password">Password</label>
        <div class="password-input-wrap">
          <input type="password" id="signup-password" placeholder="At least 6 characters" autocomplete="new-password" onkeydown="if(event.key==='Enter')studentSignup()">
          <button type="button" class="eye-toggle-btn" onclick="togglePassword('signup-password', this)" title="Show password" aria-label="Show password">
            <i class="fa-regular fa-eye-slash"></i>
          </button>
        </div>
      </div>
      <div class="terms-row">
        <input type="checkbox" id="signupAgree">
        <label for="signupAgree">I agree to the <a onclick="openTerms();return false;" href="#">Terms of Service</a> and <a onclick="openPrivacy();return false;" href="#">Privacy Policy</a></label>
      </div>
      <button type="button" class="auth-submit" onclick="studentSignup()">Sign Up</button>
      <p class="auth-switch">Already have an account? <a href="login.html" class="auth-link" style="font-weight:600;text-decoration:underline;">Login</a></p>
    `;
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    const justRegistered = urlParams.get('registered') === 'true' || urlParams.get('registered') === '1';
    const prefilledEmail = urlParams.get('email') || '';

    let banner = '';
    if (errorMsg) {
      banner = `<div class="auth-error">${errorMsg}</div>`;
    } else if (successMsg) {
      banner = `<div class="auth-success">${successMsg}</div>`;
    } else if (justRegistered) {
      banner = `<div class="auth-success"><i class="fa-solid fa-circle-check" style="margin-right:6px;"></i>Registration successful! Please log in with your password.</div>`;
    }

    el.innerHTML = `
      <h1>Welcome back!</h1>
      <p class="auth-sub">Log in to your CampusBot account and continue getting quick answers about ${escapeHtml(schoolName)}.</p>
      ${banner}
      <div class="auth-field">
        <label for="student-email">Email address</label>
        <input type="email" id="student-email" value="${escapeHtml(prefilledEmail)}" placeholder="Enter your email" autocomplete="email">
      </div>
      <div class="auth-field">
        <label for="student-password">Password</label>
        <div class="password-input-wrap">
          <input type="password" id="student-password" placeholder="••••••••" autocomplete="current-password" onkeydown="if(event.key==='Enter')studentLogin()">
          <button type="button" class="eye-toggle-btn" onclick="togglePassword('student-password', this)" title="Show password" aria-label="Show password">
            <i class="fa-regular fa-eye-slash"></i>
          </button>
        </div>
      </div>
      <div class="auth-row-between">
        <button type="button" class="auth-link" onclick="openForgotPasswordModal()">Forgot Password?</button>
      </div>
      <button type="button" class="auth-submit" onclick="studentLogin()">Login</button>
      <p class="auth-switch">Don't have an account? <a href="index.html" class="auth-link" style="font-weight:600;text-decoration:underline;">Sign Up</a></p>
    `;
  }
}

// ============================================================================
// 3. STUDENT AUTHENTICATION (Login / Signup)
// ============================================================================
const NOT_FOUND_CODES = ['auth/user-not-found', 'auth/invalid-credential', 'auth/wrong-password'];

function authErrorMessage(err) {
  const code = err && err.code;
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/email-already-in-use': return 'Email already registered. <a href="login.html" style="text-decoration:underline;color:inherit;font-weight:700;">Please login here</a>.';
    case 'auth/invalid-email': return 'Please enter a valid email address.';
    case 'auth/weak-password': return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests': return 'Too many attempts. Wait a few minutes or reset your password.';
    case 'auth/network-request-failed': return 'Network error. Check your connection and try again.';
    case 'permission-denied': return 'Firestore denied access. Deploy firestore.rules (firebase deploy --only firestore:rules).';
    default: return 'Something went wrong (' + (code || (err && err.message) || 'unknown error') + ').';
  }
}

function firebaseReady() { return !!(window.auth && window.db); }

// Re-render the student form with an error but keep the typed email.
function showStudentError(msg, email) {
  renderStudentAuth(msg);
  const el = document.getElementById(isRegisterView() ? 'signup-email' : 'student-email');
  if (el && email) el.value = email;
}


async function studentSignup() {
  const nameInput = document.getElementById('signup-name');
  const emailInput = document.getElementById('signup-email');
  const passwordInput = document.getElementById('signup-password');
  const agreeInput = document.getElementById('signupAgree');

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const password = passwordInput ? passwordInput.value : '';
  const agree = agreeInput ? agreeInput.checked : false;

  if (!name || !email || !password) {
    renderStudentAuth('Please fill in every field.');
    return;
  }
  if (password.length < 6) {
    renderStudentAuth('Password must be at least 6 characters.');
    return;
  }
  if (!agree) {
    renderStudentAuth('Please agree to the Terms of Service and Privacy Policy to continue.');
    return;
  }

  if (!firebaseReady()) {
    showStudentError('Firebase is not available. Refresh the page and try again.', email);
    return;
  }

  authBusy = true;
  try {
    // Step 1: probe if credentials already exist
    let alreadyRegistered = false;
    try {
      await window.auth.signInWithEmailAndPassword(email, password);
      alreadyRegistered = true;
    } catch (probeErr) {
      if (!NOT_FOUND_CODES.includes(probeErr.code)) throw probeErr;
    }
    if (alreadyRegistered) {
      await window.auth.signOut();
      showStudentError('Email already registered. <a href="login.html" style="text-decoration:underline;color:inherit;font-weight:700;">Please login here</a>.', email);
      return;
    }

    // Step 2: create account in Firebase Auth
    pendingSignupName = name;
    const cred = await window.auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name }).catch(() => {});

    // Step 3: save user profile document in Firestore
    await window.db.collection('users').doc(cred.user.uid).set({
      name: name,
      email: email,
      role: 'student',
      status: 'active',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Step 4: sign out so user logs in cleanly through login.html
    await window.auth.signOut();

    const el = document.getElementById('studentAuthBody');
    if (el) {
      el.innerHTML = `
        <div class="auth-success" style="font-size:14px;padding:22px 16px;text-align:center;">
          <i class="fa-solid fa-circle-check" style="font-size:36px;color:var(--success);display:block;margin-bottom:12px;"></i>
          <h2 style="font-size:18px;margin:0 0 6px;color:var(--success);font-family:'Fraunces',Georgia,serif;">Registration Successful!</h2>
          <p style="margin:0 0 14px;color:var(--text-dim);font-size:13px;line-height:1.5;">Your account has been created. Redirecting to login...</p>
          <a href="login.html?registered=true&email=${encodeURIComponent(email)}" class="auth-link" style="font-weight:600;text-decoration:underline;">Click here to go to Login</a>
        </div>
      `;
    }

    setTimeout(() => {
      window.location.href = 'login.html?registered=true&email=' + encodeURIComponent(email);
    }, 1200);
  } catch (err) {
    pendingSignupName = null;
    if (err.code === 'auth/email-already-in-use') {
      showStudentError('Email already registered. <a href="login.html" style="text-decoration:underline;color:inherit;font-weight:700;">Please login here</a>.', email);
    } else {
      showStudentError(authErrorMessage(err), email);
    }
  } finally {
    authBusy = false;
  }
}


async function studentLogin() {
  const emailInput = document.getElementById('student-email');
  const passwordInput = document.getElementById('student-password');

  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email || !password) {
    renderStudentAuth('Please enter your email and password.');
    return;
  }

  if (!firebaseReady()) {
    showStudentError('Firebase is not available. Refresh the page and try again.', email);
    return;
  }
  try {
    await window.auth.signInWithEmailAndPassword(email, password);   // handleAuthState takes over from here
  } catch (err) {
    showStudentError(authErrorMessage(err), email);
  }
}

// ----------------------------------------------------------------------------
// Auth listener: the ONLY place sessions are created (login, signup and page refresh)
// ----------------------------------------------------------------------------
function showGates() {
  const set = (id, display) => { const el = document.getElementById(id); if (el) el.style.display = display; };
  set('studentGate', 'flex');
  set('adminGate', 'flex');
}

async function handleAuthState(user) {
  if (authBusy) return;   // login/signup in progress; it calls us again when it finishes
  const page = getPageType();

  if (!user) {
    studentSession = null;
    adminSession = null;
    if (page === 'student-dashboard' || page === 'staff-dashboard' || page === 'super-admin-dashboard') {
      window.location.href = 'login.html';
      return;
    }
    showGates();
    return;
  }

  try {
    const ref = window.db.collection('users').doc(user.uid);
    const snap = await ref.get();
    let profile = snap.exists ? snap.data() : null;
    if (!profile) {
      // First sign-in after sign-up (or an account created in the console): create the profile.
      profile = {
        name: pendingSignupName || user.displayName || (user.email || 'User').split('@')[0],
        email: user.email,
        role: 'student',
        status: 'active'
      };
      await ref.set({ ...profile, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    pendingSignupName = null;

    if (profile.status && profile.status !== 'active') {
      await window.auth.signOut();
      if (page === 'student-dashboard' || page === 'staff-dashboard' || page === 'super-admin-dashboard') {
        alert('This account has been disabled. Please contact the administrator.');
        window.location.href = 'login.html';
      } else {
        showStudentError('This account has been disabled. Please contact the administrator.', '');
      }
      return;
    }

    const role = (profile.role || 'student').toLowerCase();
    const isSuperAdmin = role === 'super_admin' || role === 'superadmin';
    const isStaff = isSuperAdmin || role === 'staff' || role === 'admin';

    studentSession = { id: user.uid, name: profile.name, email: user.email, role: role };
    adminSession = isStaff ? { id: user.uid, name: profile.name, email: user.email, role: role } : null;

    // Automatic routing from login or register
    if (page === 'register' || page === 'login') {
      if (isSuperAdmin) {
        window.location.href = 'super-admin-dashboard.html';
      } else if (isStaff) {
        window.location.href = 'staff-dashboard.html';
      } else {
        window.location.href = 'student-dashboard.html';
      }
      return;
    }

    // Role-based protection for dashboards
    if (page === 'super-admin-dashboard') {
      if (!isSuperAdmin) {
        alert('Access denied: Super Administrator privileges required.');
        window.location.href = isStaff ? 'staff-dashboard.html' : 'student-dashboard.html';
        return;
      }
      enterAdminApp();
      if (typeof window.renderSuperAdminStats === 'function') {
        window.renderSuperAdminStats();
      }
    } else if (page === 'staff-dashboard') {
      if (!isStaff) {
        alert('Access denied: Staff privileges required.');
        window.location.href = 'student-dashboard.html';
        return;
      }
      enterAdminApp();
      // One-time cleanup: re-save the shared document without legacy accounts/passwords.
      if (window._legacyAccountsInPayload) {
        window._legacyAccountsInPayload = false;
        await window.persist();
      }
    } else if (page === 'student-dashboard') {
      enterStudentApp();
    }
  } catch (err) {
    console.error('Could not load the account profile:', err);
    await window.auth.signOut().catch(() => {});
    if (page !== 'register' && page !== 'login') {
      window.location.href = 'login.html';
    } else {
      showStudentError(authErrorMessage(err), '');
    }
  }
}


function enterStudentApp() {
  const nameEl = document.getElementById('studentWhoName');
  if (nameEl && studentSession) {
    nameEl.textContent = studentSession.name;
  }
}

function enterAdminApp() {
  const whoEl = document.getElementById('adminWhoName');
  if (whoEl && adminSession) {
    const roleLower = (adminSession.role || '').toLowerCase();
    const roleLabel = roleLower === 'super_admin' || roleLower === 'superadmin' ? 'Super Admin' : 'Staff';
    whoEl.textContent = '· ' + adminSession.name + ' (' + roleLabel + ')';
  }
  if (typeof window.renderAdminNav === 'function') window.renderAdminNav();
  const defaultTab = (document.body && document.body.dataset && document.body.dataset.page === 'super-admin-dashboard') ? 'users' : 'announcements';
  if (typeof window.switchAdminTab === 'function') window.switchAdminTab(window.currentAdminTab || defaultTab);
}

// One Firebase identity per browser: logging out signs out of Firebase.
async function signOutEverywhere() {
  studentSession = null;
  adminSession = null;
  if (window.auth) {
    try { await window.auth.signOut(); } catch (_) {}
  }
}

async function logoutStudent() {
  await signOutEverywhere();
  window.location.href = 'login.html';
}

async function logoutAdmin() {
  await signOutEverywhere();
  window.location.href = 'login.html';
}


// ============================================================================
// 4. ADMIN & STAFF AUTHENTICATION
// ============================================================================

function renderAdminAuth(errorMsg) {
  const el = document.getElementById('adminAuthBody');
  if (!el) return;
  const schoolName = (window.DATA && window.DATA.school && window.DATA.school.name) || "Aklan Catholic College";

  if (isRegisterView()) {
    el.innerHTML = `
      <h1>Staff Access</h1>
      <p class="auth-sub">CampusBot Staff accounts for ${escapeHtml(schoolName)} are managed directly by the Super Admin.</p>
      <div class="auth-note" style="margin-bottom:20px;line-height:1.6;">
        <i class="fa-solid fa-shield-halved" style="margin-right:6px;"></i>
        Staff accounts are provisioned by the Super Admin. If you already have staff credentials, please proceed to Staff Login.
      </div>
      <a href="login.html?tab=admin" class="auth-submit" style="display:block;text-align:center;text-decoration:none;line-height:42px;">Go to Staff Login</a>
      <p class="auth-switch" style="margin-top:16px;">Student looking to register? <button type="button" class="auth-link" onclick="switchTab('student')" style="font-weight:600;text-decoration:underline;">Sign Up here</button></p>
    `;
    return;
  }

  el.innerHTML = `
    <h1>Welcome back!</h1>
    <p class="auth-sub">Log in to your CampusBot Staff account to manage content for ${escapeHtml(schoolName)}.</p>
    ${errorMsg ? `<div class="auth-error">${errorMsg}</div>` : ''}
    <div class="auth-field">
      <label for="staff-email">Email address</label>
      <input type="email" id="staff-email" placeholder="Enter your email" autocomplete="email">
    </div>
    <div class="auth-field">
      <label for="staff-password">Password</label>
      <div class="password-input-wrap">
        <input type="password" id="staff-password" placeholder="••••••••" autocomplete="current-password" onkeydown="if(event.key==='Enter')adminLogin()">
        <button type="button" class="eye-toggle-btn" onclick="togglePassword('staff-password', this)" title="Show password" aria-label="Show password">
          <i class="fa-regular fa-eye-slash"></i>
        </button>
      </div>
    </div>
    <div class="auth-row-between">
      <button type="button" class="auth-link" onclick="alert('Staff accounts are managed by a Super Admin from Staff Panel → User Management. Please contact your Super Admin if locked out.')">Forgot Password?</button>
    </div>
    <button type="button" class="auth-submit" onclick="adminLogin()">Login</button>
    <p class="auth-switch">Staff access only &mdash; accounts are created by a Super Admin.</p>
  `;
}

async function adminLogin() {
  const emailInput = document.getElementById('staff-email');
  const passwordInput = document.getElementById('staff-password');

  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email || !password) {
    renderAdminAuth('Please enter your staff email and password.');
    return;
  }

  if (!firebaseReady()) {
    renderAdminAuth('Firebase is not available. Refresh the page and try again.');
    return;
  }

  authBusy = true;
  try {
    const cred = await window.auth.signInWithEmailAndPassword(email, password);
    const snap = await window.db.collection('users').doc(cred.user.uid).get();
    const profile = snap.exists ? snap.data() : null;
    if (!profile || (profile.role !== 'admin' && profile.role !== 'staff' && profile.role !== 'super_admin' && profile.role !== 'superadmin')) {
      await window.auth.signOut();
      renderAdminAuth('This account does not have staff privileges.');
      return;
    }
    if (profile.status && profile.status !== 'active') {
      await window.auth.signOut();
      renderAdminAuth('This staff account has been disabled. Please contact a Super Admin.');
      return;
    }
  } catch (err) {
    renderAdminAuth(authErrorMessage(err));
    return;
  } finally {
    authBusy = false;
  }

  await handleAuthState(window.auth.currentUser);
}

// Session restore on page load: Firebase Auth remembers the signed-in user and the UI is rebuilt from it.
function initAuthSessions() {
  LEGACY_SESSION_KEYS.forEach(k => {
    try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch (_) {}
  });
  if (!window.auth) {
    renderStudentAuth('Firebase Authentication could not load. Check your connection and refresh the page.');
    return;
  }
  window.auth.onAuthStateChanged(user => { handleAuthState(user); });
}


// ============================================================================
// 5. FORGOT PASSWORD (Firebase e-mails the reset link; the old "type a new password" flow
//    let anyone who knew an e-mail address take over that account)
// ============================================================================
function openForgotPasswordModal() {
  renderForgotPasswordStep1();
  const modal = document.getElementById('forgotPasswordModalOverlay');
  if (modal) modal.classList.add('show');
}

function closeForgotPasswordModal() {
  const modal = document.getElementById('forgotPasswordModalOverlay');
  if (modal) modal.classList.remove('show');
}

function renderForgotPasswordStep1(errorMsg) {
  const el = document.getElementById('forgotPasswordBody');
  if (!el) return;
  el.innerHTML = `
    <p class="admin-sub" style="margin-top:6px;">Enter your student email and we will send you a link to reset your password.</p>
    ${errorMsg ? `<div class="auth-error">${errorMsg}</div>` : ''}
    <div class="auth-field">
      <label for="fpEmail">Email address</label>
      <input type="email" id="fpEmail" placeholder="Enter your email" onkeydown="if(event.key==='Enter')checkForgotPasswordEmail()">
    </div>
    <button type="button" class="auth-submit" style="margin-bottom:0;" onclick="checkForgotPasswordEmail()">Send reset link</button>
  `;
}

async function checkForgotPasswordEmail() {
  const input = document.getElementById('fpEmail');
  const email = input ? input.value.trim().toLowerCase() : '';
  if (!email) { renderForgotPasswordStep1('Please enter your email.'); return; }
  if (!window.auth) { renderForgotPasswordStep1('Firebase is not available. Refresh the page and try again.'); return; }
  try {
    await window.auth.sendPasswordResetEmail(email);
  } catch (err) {
    // user-not-found is ignored on purpose so the form cannot reveal which emails are registered
    if (err.code !== 'auth/user-not-found') { renderForgotPasswordStep1(authErrorMessage(err)); return; }
  }
  const el = document.getElementById('forgotPasswordBody');
  if (el) {
    el.innerHTML = `
      <p style="color:#2E7D32;font-size:13.5px;font-weight:600;">If an account exists for ${escapeHtml(email)}, a password reset link is on its way. Check your inbox and spam folder.</p>
      <button type="button" class="auth-submit" style="margin-bottom:0;" onclick="closeForgotPasswordModal(); renderStudentAuth();">Done</button>
    `;
  }
}


// ============================================================================
// 6. CONTACT STAFF (Direct Firestore Collection + Local Inquiries + EmailJS)
// ============================================================================
function openContactModal(query) {
  lastUnansweredQuery = query || '';
  const nameEl = document.getElementById('contactName');
  const emailEl = document.getElementById('contactEmail');
  const msgEl = document.getElementById('contactMessage');

  if (nameEl) nameEl.value = studentSession ? studentSession.name : '';
  if (emailEl) emailEl.value = studentSession ? studentSession.email : '';
  if (msgEl) msgEl.value = query ? `Regarding my question: "${query}"\n\n` : '';
  
  const statusEl = document.getElementById('contactStatusMsg');
  if (statusEl) statusEl.innerHTML = '';
  const overlay = document.getElementById('contactModalOverlay');
  if (overlay) overlay.classList.add('show');
}

function closeContactModal() {
  const overlay = document.getElementById('contactModalOverlay');
  if (overlay) overlay.classList.remove('show');
}

async function sendContactForm() {
  const nameInput = document.getElementById('contactName');
  const emailInput = document.getElementById('contactEmail');
  const msgInput = document.getElementById('contactMessage');
  const statusEl = document.getElementById('contactStatusMsg');

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const message = msgInput ? msgInput.value.trim() : '';

  if (!name || !email || !message) {
    if (statusEl) statusEl.innerHTML = '<div class="auth-error">Please fill in your name, email, and question.</div>';
    return;
  }


  const user = window.auth && window.auth.currentUser;
  if (!window.db || !user) {
    if (statusEl) statusEl.innerHTML = '<div class="auth-error">Your session expired. Please log in again to contact staff.</div>';
    return;
  }

  if (statusEl) statusEl.innerHTML = '<div class="auth-note">Submitting your question to staff...</div>';
  const schoolName = (window.DATA && window.DATA.school && window.DATA.school.name) || 'Aklan Catholic College';

  // 1. Save to Firestore `contactMessages` FIRST. Success is only reported if this write really succeeds.
  try {
    await window.db.collection('contactMessages').add({
      uid: user.uid,
      name,
      email,
      message,
      unansweredQuestion: lastUnansweredQuery || '',
      schoolName,
      status: 'unread',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (dbErr) {
    console.error('contactMessages save failed:', dbErr);
    if (statusEl) {
      statusEl.innerHTML = `<div class="auth-error">${dbErr.code === 'permission-denied'
        ? 'Message not sent: Firestore denied the write. Deploy the latest firestore.rules.'
        : 'Message not sent. Check your connection and try again.'}</div>`;
    }
    return;
  }

  // 2. Optional e-mail copy via EmailJS (never blocks or fails the submission)
  if (window.emailjs && window.EMAILJS_PUBLIC_KEY && !window.EMAILJS_PUBLIC_KEY.startsWith('YOUR_')) {
    try {
      await emailjs.send(window.EMAILJS_SERVICE_ID, window.EMAILJS_TEMPLATE_ID, {
        from_name: name,
        from_email: email,
        message: message,
        school_name: schoolName,
        unanswered_question: lastUnansweredQuery || '(General student inquiry)'
      });
    } catch (err) {
      console.warn('EmailJS delivery note:', err);
    }
  }

  if (statusEl) {
    statusEl.innerHTML = '<div style="color:#2E7D32;font-size:13px;font-weight:600;padding:8px 0;">✓ Message sent to ACC Staff! They will follow up with you via email.</div>';
  }
  if (msgInput) msgInput.value = '';
}


// ============================================================================
// 7. TERMS & PRIVACY MODALS
// ============================================================================
function openInfoModal(title, bodyHtml) {
  const titleEl = document.getElementById('infoModalTitle');
  const bodyEl = document.getElementById('infoModalBody');
  const overlay = document.getElementById('infoModalOverlay');
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = bodyHtml;
  if (overlay) overlay.classList.add('show');
}

function closeInfoModal() {
  const overlay = document.getElementById('infoModalOverlay');
  if (overlay) overlay.classList.remove('show');
}

function openTerms() {
  const school = (window.DATA && window.DATA.school && window.DATA.school.name) || 'Aklan Catholic College';
  openInfoModal('Terms of Service', `
    <p class="doc-updated">Official Policy &mdash; ${school}</p>
    <p>These Terms of Service govern your use of CampusBot AI, an official informational assistant developed for the students, faculty, and stakeholders of <b>${school}</b>.</p>
    <h4>1. Academic Purpose</h4>
    <p>CampusBot AI is designed to help students conveniently find verified information about degree programs, campus locations, registrar schedules, and academic rules. Information is synchronized directly with official school records.</p>
    <h4>2. Account Security</h4>
    <p>Students and staff must maintain the confidentiality of their credentials and avoid sharing accounts.</p>
    <h4>3. Code of Conduct</h4>
    <p>Users must adhere to ACC's Christian values. Any misuse, harassment, or unauthorized access attempts are strictly prohibited.</p>
  `);
}

function openPrivacy() {
  const school = (window.DATA && window.DATA.school && window.DATA.school.name) || 'Aklan Catholic College';
  openInfoModal('Privacy Policy', `
    <p class="doc-updated">Data Privacy Notice &mdash; ${school}</p>
    <p><b>${school}</b> is committed to protecting the privacy and personal data of our students and personnel in compliance with the Data Privacy Act of 2012 (R.A. 10173).</p>
    <h4>1. Data Collected</h4>
    <p>We collect your full name and student email address upon sign-up, and message logs submitted through the Contact Staff form to ensure prompt administrative assistance.</p>
    <h4>2. Storage & Security</h4>
    <p>Data is stored securely in Google Cloud Firestore and encrypted in transit.</p>
    <h4>3. Inquiries</h4>
    <p>For data privacy inquiries, contact the ACC Data Privacy Office or Registrar at registrar@acc.edu.ph.</p>
  `);
}

// Expose functions globally for HTML event attributes
window.togglePassword = togglePassword;
window.switchTab = switchTab;
window.renderStudentAuth = renderStudentAuth;
window.studentSignup = studentSignup;
window.studentLogin = studentLogin;
window.logoutStudent = logoutStudent;
window.enterStudentApp = enterStudentApp;
window.renderAdminAuth = renderAdminAuth;
window.adminLogin = adminLogin;
window.logoutAdmin = logoutAdmin;
window.enterAdminApp = enterAdminApp;
window.initAuthSessions = initAuthSessions;
window.openForgotPasswordModal = openForgotPasswordModal;
window.closeForgotPasswordModal = closeForgotPasswordModal;
window.checkForgotPasswordEmail = checkForgotPasswordEmail;
window.openContactModal = openContactModal;
window.closeContactModal = closeContactModal;
window.sendContactForm = sendContactForm;
window.openTerms = openTerms;
window.openPrivacy = openPrivacy;
window.openInfoModal = openInfoModal;
window.closeInfoModal = closeInfoModal;
