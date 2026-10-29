const EMAILJS_PUBLIC_KEY  = "Zi0GqfqEAqtzQUsJA";   
const EMAILJS_SERVICE_ID  = "service_5jrhbza";    
const EMAILJS_TEMPLATE_ID = "template_68sa31j";   

window.EMAILJS_PUBLIC_KEY = EMAILJS_PUBLIC_KEY;
window.EMAILJS_SERVICE_ID = EMAILJS_SERVICE_ID;
window.EMAILJS_TEMPLATE_ID = EMAILJS_TEMPLATE_ID;
window.EMAILJS_PUBLIC_KEY && window.emailjs && emailjs.init(window.EMAILJS_PUBLIC_KEY);

const firebaseConfig = {
  apiKey: "AIzaSyCQ2Q4sLRQVRfscebJ6vzFA5GZohMeXwfw",
  authDomain: "campusbot-8b059.firebaseapp.com",
  projectId: "campusbot-8b059",
  storageBucket: "campusbot-8b059.firebasestorage.app",
  messagingSenderId: "613125477923",
  appId: "1:613125477923:web:ada68e6b517da4d8d14396"
};

let db = null;
let auth = null;

const firebaseIsConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_");
if (window.firebase && firebaseIsConfigured) {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    if (firebase.auth) {
      auth = firebase.auth();
    }
    console.log("✓ Firebase initialized successfully for", firebaseConfig.projectId);
  } catch (err) {
    console.warn("Firebase initialization notice:", err);
  }
}

if (!db) console.error("Firestore is not initialised: the Firebase compat <script> tags must load BEFORE js/firebase-config.js.");
if (!auth) console.error("Firebase Auth is not initialised: add firebase-auth-compat.js before js/firebase-config.js.");

const FIRESTORE_COLLECTION = "campusbot";
const FIRESTORE_DOC = "shared-data";

// ==========================================
// 4. OFFICIAL DEFAULT KNOWLEDGE BASE (ACC)
// ==========================================
const DEFAULTS = {
  school: { name: "Aklan Catholic College" },
  users: [],
  faqs: [],
  announcements: [],
  offices: [],
  mapPlaces: [],
  inquiries: []
};

let DATA = null;
// FIX: a top-level `let` is NOT a property of window, so window.DATA was always undefined.
// That caused the auth.js crash and the empty announcements. Expose it explicitly.
Object.defineProperty(window, 'DATA', { get: () => DATA, set: v => { DATA = v; }, configurable: true });

// ==========================================
// 5. DATA LOADER & PERSISTENCE
// ==========================================

// Only the PUBLIC knowledge base is stored in campusbot/shared-data.
// Accounts live in Firebase Auth + Firestore `users`; student messages in `contactMessages`.
function publicData() {
  const copy = JSON.parse(JSON.stringify(DATA || {}));
  delete copy.users;
  delete copy.inquiries;
  return copy;
}

async function loadData() {
  let loaded = false;
  if (db) {
    try {
      const snap = await db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).get();
      if (snap.exists && snap.data().payload) { DATA = JSON.parse(snap.data().payload); loaded = true; }
    } catch (e) {
      console.warn("Firestore load failed (using defaults):", e.code || e.message);
      showToast("Could not load data from server. Please check your connection.");
    }
  }
  if (!DATA) DATA = JSON.parse(JSON.stringify(DEFAULTS));

  // Fill missing keys (migration safety)
  Object.keys(DEFAULTS).forEach(k => {
    if (DATA[k] === undefined) DATA[k] = JSON.parse(JSON.stringify(DEFAULTS[k]));
  });
  // Old versions kept users (with plain-text passwords) in this document. Drop them from memory
  // and let the first staff login re-save the document without them.
  window._legacyAccountsInPayload = !!((DATA.users && DATA.users.length) || (DATA.inquiries && DATA.inquiries.length));
  DATA.users = [];       // loaded on demand from Firestore by the Super Admin screen
  DATA.inquiries = [];
  return DATA;
}

// Real-time synchronization listener for Firestore shared-data
function subscribeToDataUpdates(callback) {
  if (!db) return null;
  try {
    return db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).onSnapshot(doc => {
      if (doc.exists && doc.data().payload) {
        try {
          const fresh = JSON.parse(doc.data().payload);
          DATA = fresh;
          // Fill missing keys for safety
          Object.keys(DEFAULTS).forEach(k => {
            if (DATA[k] === undefined) DATA[k] = JSON.parse(JSON.stringify(DEFAULTS[k]));
          });
          if (typeof callback === 'function') {
            callback(DATA);
          }
        } catch (parseErr) {
          console.warn("Real-time payload parse error:", parseErr);
        }
      }
    }, err => {
      console.warn("Firestore real-time subscription note:", err.message);
    });
  } catch (e) {
    console.warn("Could not attach snapshot listener:", e);
    return null;
  }
}

async function persist() {
  if (!DATA) { console.warn("persist() skipped: DATA is not loaded yet."); return false; }
  const pub = publicData();

  // Save to Firebase Firestore:
  if (db) {
    if (auth && auth.currentUser) {
      try {
        // 1. Primary unified document for real-time synchronization with student dashboard
        await db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).set({
          payload: JSON.stringify(pub),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Also synchronize each Quick Information section into dedicated Firestore documents
        // so Announcements, Office Directory, Campus Map, and FAQs are clearly visible and saved
        try {
          const batch = db.batch();
          batch.set(db.collection('campusbot').doc('announcements'), {
            items: pub.announcements || [],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          batch.set(db.collection('campusbot').doc('offices'), {
            items: pub.offices || [],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          batch.set(db.collection('campusbot').doc('mapPlaces'), {
            items: pub.mapPlaces || [],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          batch.set(db.collection('campusbot').doc('faqs'), {
            items: pub.faqs || [],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          await batch.commit();
        } catch (sectionErr) {
          console.warn("Section sync note:", sectionErr.message);
        }

        showToast("Saved to Firestore");
        return true;
      } catch (e) {
        console.error("Firestore persist error:", e);
        showToast("Save failed: " + (e.message || "permission error"));
        return false;
      }
    } else {
      console.warn("User is not signed in to Firebase Auth. Cannot save — authentication required.");
      showToast("Authentication required to save changes. Please log in.");
      return false;
    }
  }

  showToast();
  return true;
}

function showToast(text) {
  const t = document.getElementById('saveToast');
  if (!t) return;
  if (text) t.textContent = text;
  else t.textContent = "Saved";
  t.classList.add('show');
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => t.classList.remove('show'), 1500);
}

function uid(prefix) {
  return (prefix || 'item_') + Math.random().toString(36).slice(2, 9);
}

// Announcement helpers (shared by the student feed and the staff panel)
function annTimestamp(a) {
  const raw = ((a && a.date) || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Date.parse(raw + 'T00:00:00') || 0;
  const m = raw.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);   // legacy "AUG 10"
  if (m) {
    const mi = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[1].toLowerCase());
    if (mi >= 0 && mi % 3 === 0) return new Date(+(m[3] || new Date().getFullYear()), mi / 3, +m[2]).getTime();
  }
  const t = Date.parse(raw);
  return isNaN(t) ? 0 : t;
}
function formatAnnDate(raw) {
  const t = annTimestamp({ date: raw });
  return t ? new Date(t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : (raw || 'Undated');
}

window.EMAILJS_PUBLIC_KEY = EMAILJS_PUBLIC_KEY;
window.EMAILJS_SERVICE_ID = EMAILJS_SERVICE_ID;
window.EMAILJS_TEMPLATE_ID = EMAILJS_TEMPLATE_ID;
window.firebaseConfig = firebaseConfig;
window.db = db;
window.auth = auth;
window.DEFAULTS = DEFAULTS;
window.loadData = loadData;
window.subscribeToDataUpdates = subscribeToDataUpdates;
window.persist = persist;
window.annTimestamp = annTimestamp;
window.formatAnnDate = formatAnnDate;
window.showToast = showToast;
window.uid = uid;
