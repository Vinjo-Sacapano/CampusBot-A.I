/**
 * ============================================================================
 * CampusBot AI — Admin Panel Management (Aklan Catholic College)
 * Features:
 * - Accordion Sections with + to - Toggle & Smooth Slide Animation
 * - Clickable Cards with Hover Actions & Inline Editing
 * - Delete with Confirmation Dialog & Firestore/LocalStorage Persistence
 * - User Management (Role changes, active/disabled, add staff)
 * - Comprehensive Inquiries Inbox (Offline + Cloud)
 * - Full Knowledge Base Coverage (FAQs, Announcements, Schedule, Offices,
 *   Map Facilities, Enrollment Steps, Programs, Rules & Regulations, Campuses,
 *   and Registrar Settings)
 * ============================================================================
 */

let currentAdminTab = "faqs";
let activeInlineEditId = null;
let isAddFormOpen = false;

// Complete Admin Tabs list covering active school collections
const ADMIN_TABS = [
  { key: "faqs", label: "FAQs", icon: "fa-circle-question" },
  { key: "announcements", label: "Announcements", icon: "fa-bullhorn" },
  { key: "offices", label: "Office Directory", icon: "fa-building-columns" },
  { key: "mapPlaces", label: "Campus Map", icon: "fa-map-location-dot" },
  { key: "inquiries", label: "Student Inquiries", icon: "fa-envelope-open-text" },
  { key: "users", label: "User Management", icon: "fa-users-gear" },
  { key: "settings", label: "School Settings", icon: "fa-sliders" }
];

// Configuration for fields in each section
const FIELD_CONFIG = {
  faqs: {
    title: "Frequently Asked Questions",
    sub: "These answer student questions directly in the chatbot.",
    badge: "FAQ",
    fields: [
      { k: "question", label: "Question", type: "text", placeholder: "e.g., What are the library hours?" },
      { k: "keywords", label: "Keywords (space-separated)", type: "text", placeholder: "library books hours schedule borrow" },
      { k: "answer", label: "Answer", type: "textarea", placeholder: "The library is open..." }
    ],
    render: f => `<span class="meta">FAQ</span><b>${escapeHtml(f.question)}</b><br><span style="color:var(--text);">${escapeHtml(f.answer)}</span>`
  },
  announcements: {
    title: "Official Announcements",
    sub: "Shown to students as a news feed, newest first.",
    badge: "Announcement",
    fields: [
      { k: "title", label: "Title", type: "text", placeholder: "Enrollment for AY 2026-2027 is now open", req: true },
      { k: "category", label: "Category", type: "select", options: ["General", "Academic", "Event", "Enrollment", "Suspension"] },
      { k: "date", label: "Date posted", type: "date" },
      { k: "body", label: "Details", type: "textarea", placeholder: "Write the full announcement here..." }
    ],
    render: a => `<span class="meta">${escapeHtml(a.category || 'General')} · ${escapeHtml(window.formatAnnDate(a.date))}</span><b>${escapeHtml(a.title)}</b>${a.body ? `<br>${escapeHtml(a.body)}` : ''}`
  },
  offices: {
    title: "Office Directory",
    sub: "Campus office locations, working hours, and official contact channels.",
    badge: "Office",
    fields: [
      { k: "name", label: "Office Name", type: "text", placeholder: "Office of the Registrar" },
      { k: "location", label: "Building & Floor", type: "text", placeholder: "Admin Bldg, Ground Floor" },
      { k: "hours", label: "Operating Hours", type: "text", placeholder: "Mon-Fri, 8:00 AM - 5:00 PM" },
      { k: "contact", label: "Email / Phone", type: "text", placeholder: "registrar@acc.edu.ph / (036) 268-4152" }
    ],
    render: o => `<span class="meta">Office</span><b>${escapeHtml(o.name)}</b><br>${escapeHtml(o.location)} · ${escapeHtml(o.hours)}<br><span style="color:var(--slate);">Contact: ${escapeHtml(o.contact)}</span>`
  },
  mapPlaces: {
    title: "Campus Map & Facilities",
    sub: "Building descriptions and campus location guide.",
    badge: "Map",
    fields: [
      { k: "building", label: "Building / Facility Name", type: "text", placeholder: "Main Administration Building" },
      { k: "description", label: "Description / Offices Inside", type: "textarea", placeholder: "Registrar, Admissions, Cashier..." }
    ],
    render: m => `<span class="meta">Building</span><b>${escapeHtml(m.building)}</b><br>${escapeHtml(m.description)}`
  }
};

// ============================================================================
// 1. ADMIN NAVIGATION & TAB SWITCHING
// ============================================================================
function isUserSuperAdmin() {
  if (!window.adminSession) return false;
  const r = (window.adminSession.role || '').toLowerCase();
  return r === 'superadmin' || r === 'super_admin';
}

function renderAdminNav() {
  const nav = document.getElementById('adminNav');
  if (!nav) return;
  nav.innerHTML = '';

  const isSuperAdmin = isUserSuperAdmin();
  const isSuperAdminPage = document.body && document.body.dataset && document.body.dataset.page === 'super-admin-dashboard';
  const canSeeSuperAdminTabs = isSuperAdmin || isSuperAdminPage;

  // FAQs and User Management are exclusive to Super Admin
  const visibleTabs = ADMIN_TABS.filter(t => {
    if (t.key === 'users') return canSeeSuperAdminTabs;
    if (t.key === 'faqs') return canSeeSuperAdminTabs;
    return true;
  });

  visibleTabs.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span><i class="fa-solid ${t.icon}" style="margin-right:8px;width:16px;"></i>${t.label}</span>`;
    b.className = t.key === currentAdminTab ? 'active' : '';
    b.id = 'admintab-' + t.key;
    b.onclick = () => switchAdminTab(t.key);
    nav.appendChild(b);
  });
}

function switchAdminTab(key) {
  currentAdminTab = key;
  activeInlineEditId = null;
  isAddFormOpen = false;

  document.querySelectorAll('#adminNav button').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById('admintab-' + key);
  if (activeBtn) activeBtn.classList.add('active');

  renderAdminContent();
}

// ============================================================================
// 2. ACCORDION TOGGLE LOGIC (+ to -)
// ============================================================================

/**
 * Toggles the Add Entry form accordion open or closed.
 * Smooth slide-down animation and switches icon between + and -
 */
function toggleAddForm() {
  const formBox = document.getElementById('collapsibleAddForm');
  const toggleBtn = document.getElementById('accordionToggleBtn');
  const icon = document.getElementById('accordionIcon');
  const btnText = document.getElementById('accordionText');

  if (!formBox) return;

  isAddFormOpen = !isAddFormOpen;

  if (isAddFormOpen) {
    formBox.classList.add('open');
    if (toggleBtn) toggleBtn.classList.add('open');
    if (icon) icon.className = 'fa-solid fa-minus';
    if (btnText) btnText.textContent = 'Cancel';
    if (toggleBtn) toggleBtn.setAttribute('title', 'Close form');
    
    // Focus first input field
    const firstInput = formBox.querySelector('input, textarea');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 150);
    }
  } else {
    closeAddForm();
  }
}

function closeAddForm() {
  const formBox = document.getElementById('collapsibleAddForm');
  const toggleBtn = document.getElementById('accordionToggleBtn');
  const icon = document.getElementById('accordionIcon');
  const btnText = document.getElementById('accordionText');

  isAddFormOpen = false;

  if (formBox) {
    formBox.classList.remove('open');
    formBox.querySelectorAll('input, textarea').forEach(el => el.value = '');
    formBox.querySelectorAll('select').forEach(el => el.selectedIndex = 0);
  }
  if (toggleBtn) {
    toggleBtn.classList.remove('open');
    toggleBtn.setAttribute('title', 'Add new entry');
  }
  if (icon) icon.className = 'fa-solid fa-plus';
  if (btnText) btnText.textContent = 'Add Entry';
}

// ESC Key closes active accordion form or inline edit
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (isAddFormOpen) {
      closeAddForm();
    }
    if (activeInlineEditId) {
      cancelInlineEdit();
    }
  }
});

// ============================================================================
// 3. RENDER ADMIN CONTENT
// ============================================================================
function renderAdminContent() {
  const el = document.getElementById('adminContent');
  if (!el) return;

  // Tab: Settings
  if (currentAdminTab === 'settings') {
    renderSettingsView(el);
    return;
  }

  // Tab: User Management (Super Admin Guard)
  if (currentAdminTab === 'users') {
    const isSuperAdmin = isUserSuperAdmin();
    const isSuperAdminPage = document.body && document.body.dataset && document.body.dataset.page === 'super-admin-dashboard';
    if (!isSuperAdmin && !isSuperAdminPage) {
      el.innerHTML = `
        <h2>User Management</h2>
        <div class="auth-error" style="margin-top:16px;">
          <i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i>
          Access Denied: Only Super Administrators can view and manage user accounts.
        </div>
      `;
      return;
    }
    renderUsersView(el);
    return;
  }

  // Tab: Student Inquiries (contactMessages & local fallback)
  if (currentAdminTab === 'inquiries') {
    renderInquiriesView(el);
    return;
  }

  // Tab: FAQs (Super Admin Guard: Add/edit FAQs only available to Super Admin)
  if (currentAdminTab === 'faqs') {
    const isSuperAdmin = isUserSuperAdmin();
    const isSuperAdminPage = document.body && document.body.dataset && document.body.dataset.page === 'super-admin-dashboard';
    if (!isSuperAdmin && !isSuperAdminPage) {
      el.innerHTML = `
        <h2>Frequently Asked Questions</h2>
        <div class="auth-error" style="margin-top:16px;">
          <i class="fa-solid fa-triangle-exclamation" style="margin-right:6px;"></i>
          Access Restricted: Only Super Administrators can add and manage FAQs.
        </div>
      `;
      return;
    }
  }

  // Standard Accordion Tab (FAQs, Announcements, Schedule, Offices, etc.)
  const cfg = FIELD_CONFIG[currentAdminTab];
  if (!cfg) return;

  const list = (window.DATA && window.DATA[currentAdminTab]) || [];

  let html = `
    <div class="admin-section-header">
      <div>
        <h2>${cfg.title}</h2>
        <p class="admin-sub">${cfg.sub}</p>
      </div>
      <button type="button" class="accordion-toggle-btn ${isAddFormOpen ? 'open' : ''}" id="accordionToggleBtn" onclick="toggleAddForm()" title="${isAddFormOpen ? 'Close form' : 'Add new entry'}">
        <i class="fa-solid ${isAddFormOpen ? 'fa-minus' : 'fa-plus'}" id="accordionIcon"></i>
        <span id="accordionText">${isAddFormOpen ? 'Cancel' : 'Add Entry'}</span>
      </button>
    </div>

    <div class="shared-note">
      <i class="fa-solid fa-bolt" style="margin-right:6px;"></i>
      Changes made here synchronize instantly with CampusBot AI and the student interface. Click any card to edit in-place.
    </div>
  `;

  // Record List of Cards
  if (!list.length) {
    const emptyMessages = {
      faqs: "No FAQs added yet. Click <b>+ Add Entry</b> above to create one.",
      announcements: "No announcements posted yet. Click <b>+ Add Entry</b> above to create one.",
      offices: "No office directory entries added yet. Click <b>+ Add Entry</b> above to create one.",
      mapPlaces: "No campus map locations added yet. Click <b>+ Add Entry</b> above to create one."
    };
    const emptyMsg = emptyMessages[currentAdminTab] || `No ${cfg.title.toLowerCase()} added yet. Click <b>+ Add Entry</b> above to create one.`;
    html += `<div class="empty-state">${emptyMsg}</div>`;
  } else {
    html += `<div class="record-list" id="recordList">`;
    list.forEach(item => {
      if (item.id === activeInlineEditId) {
        // INLINE EDIT MODE CARD
        html += renderInlineEditCard(item, cfg);
      } else {
        // NORMAL CLICKABLE CARD
        html += `
          <div class="record" id="card-${item.id}" onclick="handleCardClick('${item.id}', event)">
            <div class="record-main">
              ${cfg.render(item)}
            </div>
            <div class="record-actions">
              <button type="button" class="icon-btn edit" onclick="startInlineEdit('${item.id}', event)" title="Edit this entry">
                <i class="fa-solid fa-pencil"></i>
              </button>
              <button type="button" class="icon-btn" onclick="confirmDeleteRecord('${item.id}', event)" title="Delete entry">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        `;
      }
    });
    html += `</div>`;
  }

  // SLIDE-DOWN ACCORDION ADD FORM
  html += `
    <div class="form-box collapsible ${isAddFormOpen ? 'open' : ''}" id="collapsibleAddForm">
      <h3>Add New ${cfg.badge}</h3>
      <div class="form-grid">
  `;

  cfg.fields.forEach(f => {
    const wide = f.type === 'textarea' ? ' style="grid-column: 1 / -1;"' : '';
    html += `
        <div class="field"${wide}>
          <label for="add_${f.k}">${f.label}${f.req ? ' *' : ''}</label>
          ${fieldInputHtml(f, 'add_' + f.k, '')}
        </div>
      `;
  });

  html += `
      </div>
      <div class="form-actions">
        <button type="button" class="btn-primary" onclick="saveNewRecord()">Add Entry</button>
        <button type="button" class="btn-secondary" onclick="closeAddForm()">Cancel</button>
      </div>
    </div>
  `;

  el.innerHTML = html;
}

// ============================================================================
// 4. CLICKABLE CARDS & INLINE EDITING LOGIC
// ============================================================================

/**
 * Clicking the card itself starts inline editing
 */
function handleCardClick(id, event) {
  if (event.target.closest('.record-actions') || event.target.closest('button')) {
    return;
  }
  startInlineEdit(id, event);
}

function startInlineEdit(id, event) {
  if (event) event.stopPropagation();
  activeInlineEditId = id;
  renderAdminContent();
  
  setTimeout(() => {
    const cardEl = document.getElementById(`card-${id}`);
    if (cardEl) {
      const firstInput = cardEl.querySelector('input, textarea');
      if (firstInput) firstInput.focus();
    }
  }, 100);
}

function cancelInlineEdit(event) {
  if (event) event.stopPropagation();
  activeInlineEditId = null;
  renderAdminContent();
}

function renderInlineEditCard(item, cfg) {
  let fieldsHtml = '';
  cfg.fields.forEach(f => {
    fieldsHtml += `
        <div class="field">
          <label for="inline_${f.k}">${f.label}</label>
          ${fieldInputHtml(f, 'inline_' + f.k, item[f.k])}
        </div>
      `;
  });

  return `
    <div class="record inline-editing" id="card-${item.id}">
      <div class="inline-edit-box">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:8px;">
          <span class="meta" style="margin:0;"><i class="fa-solid fa-pencil" style="margin-right:5px;"></i>Editing ${cfg.badge}</span>
          <span style="font-size:11px;color:var(--text-dim);">Press ESC to cancel</span>
        </div>
        ${fieldsHtml}
        <div class="inline-edit-actions">
          <button type="button" class="btn-primary" onclick="saveInlineEdit('${item.id}', event)">Save Changes</button>
          <button type="button" class="btn-secondary" onclick="cancelInlineEdit(event)">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function saveInlineEdit(id, event) {
  if (event) event.stopPropagation();
  if (currentAdminTab === 'faqs' && !isUserSuperAdmin()) {
    alert("Only Super Administrators can edit FAQs.");
    return;
  }

  const cfg = FIELD_CONFIG[currentAdminTab];
  const list = window.DATA[currentAdminTab];
  const idx = list.findIndex(x => x.id === id);
  if (idx === -1) return;

  const updatedFields = {};
  let hasValue = false;

  cfg.fields.forEach(f => {
    const input = document.getElementById(`inline_${f.k}`);
    if (input) {
      updatedFields[f.k] = input.value.trim();
      if (updatedFields[f.k]) hasValue = true;
    }
  });

  if (!hasValue) {
    alert("Please fill in at least one field.");
    return;
  }
  const missingInline = cfg.fields.find(f => f.req && !updatedFields[f.k]);
  if (missingInline) {
    alert(`Please fill in: ${missingInline.label}`);
    return;
  }

  list[idx] = { ...list[idx], ...updatedFields };
  await window.persist();

  activeInlineEditId = null;
  renderAdminContent();
  window.showToast("Changes saved successfully!");

  if (currentAdminTab === 'announcements' && typeof window.renderBoard === 'function') {
    window.renderBoard();
  }
  if (typeof window.showContentSection === 'function' && typeof window.activeContentTab !== 'undefined') {
    window.showContentSection(window.activeContentTab);
  }
}

// ============================================================================
// 5. CREATE NEW ENTRY & DELETE WITH CONFIRM
// ============================================================================
async function saveNewRecord() {
  if (currentAdminTab === 'faqs' && !isUserSuperAdmin()) {
    alert("Only Super Administrators can add FAQs.");
    return;
  }

  const cfg = FIELD_CONFIG[currentAdminTab];
  if (!window.DATA[currentAdminTab]) {
    window.DATA[currentAdminTab] = [];
  }
  const list = window.DATA[currentAdminTab];
  const record = {};
  let hasValue = false;

  cfg.fields.forEach(f => {
    const el = document.getElementById(`add_${f.k}`);
    if (el) {
      record[f.k] = el.value.trim();
      if (record[f.k]) hasValue = true;
    }
  });

  if (!hasValue) {
    alert("Please fill in the required fields to add an entry.");
    return;
  }
  const missing = cfg.fields.find(f => f.req && !record[f.k]);
  if (missing) {
    alert(`Please fill in: ${missing.label}`);
    return;
  }
  if (currentAdminTab === 'announcements' && !record.date) {
    record.date = new Date().toISOString().slice(0, 10);   // date posted defaults to today
  }

  record.id = window.uid(currentAdminTab.slice(0, 3) + '_');
  list.push(record);
  await window.persist();

  closeAddForm();
  renderAdminContent();
  window.showToast("New entry added successfully!");

  if (currentAdminTab === 'announcements' && typeof window.renderBoard === 'function') {
    window.renderBoard();
  }
  if (typeof window.showContentSection === 'function' && typeof window.activeContentTab !== 'undefined') {
    window.showContentSection(window.activeContentTab);
  }
}

async function confirmDeleteRecord(id, event) {
  if (event) event.stopPropagation();
  const ok = confirm("Are you sure you want to delete this entry? This action cannot be undone.");
  if (!ok) return;

  const list = window.DATA[currentAdminTab];
  if (!list) return;

  const idx = list.findIndex(x => x.id === id);
  if (idx > -1) {
    list.splice(idx, 1);
    await window.persist();
    renderAdminContent();
    window.showToast("Entry deleted successfully.");

    if (currentAdminTab === 'announcements' && typeof window.renderBoard === 'function') {
      window.renderBoard();
    }
    if (typeof window.showContentSection === 'function' && typeof window.activeContentTab !== 'undefined') {
      window.showContentSection(window.activeContentTab);
    }
  }
}

// ============================================================================
// 6. STUDENT INQUIRIES VIEW (Robust Firestore + Local Fallback)
// ============================================================================
async function renderInquiriesView(container) {
  container.innerHTML = `
    <h2>Student Inquiries & Contact Messages</h2>
    <p class="admin-sub">Questions submitted by students via the Contact Staff modal.</p>
    <div id="inquiriesLoading" style="color: white; font-size:13px; padding:12px 0; ">Loading incoming inquiries...</div>
    <div id="inquiriesList" class="record-list"></div>
  `;

  const listEl = document.getElementById('inquiriesList');
  const loadingEl = document.getElementById('inquiriesLoading');

  // Student messages live only in Firestore `contactMessages` (readable by staff only, see firestore.rules).
  let messages = [];
  if (window.db) {
    try {
      const snap = await window.db.collection('contactMessages').orderBy('createdAt', 'desc').limit(200).get();
      messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn("Could not read contactMessages:", err.code || err.message);
      if (currentAdminTab !== 'inquiries') return;
      if (loadingEl) loadingEl.remove();
      listEl.innerHTML = `<div class="auth-error">Could not load inquiries (${escapeHtml(err.code || 'error')}). Log in as staff and make sure firestore.rules is deployed.</div>`;
      return;
    }
  }

  if (currentAdminTab !== 'inquiries') return;   // staff switched tabs while this was loading
  if (loadingEl) loadingEl.remove();

  if (!messages.length) {
    listEl.innerHTML = `<div class="empty-state">No student inquiries have been submitted yet. When a student uses the "Contact Staff" feature, their questions will appear here.</div>`;
    return;
  }

  let html = '';
  messages.forEach(msg => {
        html += `
      <div class="record" style="cursor:default; background-color:#4b5563; padding:12px; border-radius:10px; margin-bottom:10px;">
        <div class="record-main">
          <span class="meta" style="color:white;">${escapeHtml(msg.createdAt && msg.createdAt.toDate ? msg.createdAt.toDate().toLocaleString() : 'Just now')}</span>
          <b style="color:white;">${escapeHtml(msg.name)}</b> &lt;<a href="mailto:${escapeAttr(msg.email)}" style="color:white;">${escapeHtml(msg.email)}</a>&gt
          <div style="background:#6b7280;border:1px solid #9ca3af;padding:8px 12px;border-radius:6px;margin-top:6px;font-size:13px; color:white;">
            ${escapeHtml(msg.message)}
          </div>
          ${msg.unansweredQuestion ? `<div style="font-size:11px;color:var(--text-dim);margin-top:4px;"><i>Triggered by query: "${escapeHtml(msg.unansweredQuestion)}"</i></div>` : ''}
        </div>
        <div class="record-actions">
          <button type="button" class="icon-btn" onclick="deleteInquiry('${msg.id}')" title="Delete inquiry"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

async function deleteInquiry(id) {
  if (!confirm("Delete this message?")) return;


  // 2. Delete from Firestore collection
  if (window.db) {
    try {
      await window.db.collection('contactMessages').doc(id).delete();
    } catch (e) {
      console.warn("Could not delete message from Firestore:", e.message);
    }
  }

  window.showToast("Message deleted");
  renderInquiriesView(document.getElementById('adminContent'));
}

// ============================================================================
// 7. USER MANAGEMENT VIEW (Super Admin Only)
// ============================================================================
async function renderUsersView(container) {
  await loadUsers();
  if (currentAdminTab !== 'users') return;   // staff switched tabs while this was loading
  const users = (window.DATA && window.DATA.users) || [];

  container.innerHTML = `
    <h2>User Management</h2>
    <p class="admin-sub">Manage student accounts, staff, and system administrators.</p>
    <div class="shared-note">
      <i class="fa-solid fa-shield-halved" style="margin-right:6px;"></i>
      Super Admin Controls: modify roles, activate/disable accounts, or delete users.
    </div>
    <div class="record-list">
      ${users.map(u => userRowHtml(u)).join('')}
    </div>

    <div class="form-box">
      <h3>Add Staff / Admin Account</h3>
      <div class="form-grid">
        <div class="field">
          <label for="newUserName">Full Name</label>
          <input type="text" id="newUserName" placeholder="Prof. Jane Doe">
        </div>
        <div class="field">
          <label for="newUserEmail">Email Address</label>
          <input type="email" id="newUserEmail" placeholder="jane.doe@acc.edu.ph">
        </div>
        <div class="field">
          <label for="newUserPassword">Password</label>
          <div class="password-input-wrap">
            <input type="password" id="newUserPassword" placeholder="At least 6 characters">
            <button type="button" class="eye-toggle-btn" onclick="togglePassword('newUserPassword', this)" title="Show password">
              <i class="fa-regular fa-eye-slash"></i>
            </button>
          </div>
        </div>
        <div class="field">
          <label for="newUserRole">Role</label>
          <select id="newUserRole">
            <option value="staff">Staff</option>
            <option value="super_admin">Super Admin</option>
            <option value="student">Student</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-primary" onclick="addUserAccount()">Add Account</button>
      </div>
    </div>
  `;
}

function userRowHtml(u) {
  const isSelf = window.adminSession && u.id === window.adminSession.id;
  const roleLower = (u.role || '').toLowerCase();
  const isSuper = roleLower === 'superadmin' || roleLower === 'super_admin';
  const roleLabel = isSuper ? 'Super Admin' : (roleLower === 'staff' || roleLower === 'admin' ? 'Staff' : 'Student');

  return `
    <div class="record" style="cursor:default;">
      <div class="record-main">
        <span class="meta">${roleLabel}</span>
        <b>${escapeHtml(u.name)}</b>
        <span class="status-badge ${u.status}">${u.status}</span>
        ${isSelf ? '<span style="color:var(--text-dim);font-size:11px;font-weight:600;">(You)</span>' : ''}
        <br>${escapeHtml(u.email)}
      </div>
      <div class="record-actions" style="flex-direction:column;align-items:stretch;gap:6px;min-width:150px;">
        <select class="role-select" onchange="changeUserRole('${u.id}', this.value)" ${isSelf ? 'disabled' : ''}>
          <option value="student" ${roleLower === 'student' ? 'selected' : ''}>Student</option>
          <option value="staff" ${roleLower === 'staff' || roleLower === 'admin' ? 'selected' : ''}>Staff</option>
          <option value="super_admin" ${isSuper ? 'selected' : ''}>Super Admin</option>
        </select>
        <div style="display:flex;gap:6px;">
          <button type="button" class="icon-btn" onclick="toggleUserStatus('${u.id}')" ${isSelf ? 'disabled' : ''} title="${u.status === 'active' ? 'Disable account' : 'Activate account'}">
            <i class="fa-solid fa-power-off"></i>
          </button>
          <button type="button" class="icon-btn" onclick="deleteUserAccount('${u.id}')" ${isSelf ? 'disabled' : ''} title="Delete account">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

async function renderSuperAdminStats() {
  await loadUsers();
  const users = (window.DATA && window.DATA.users) || [];
  const faqs = (window.DATA && window.DATA.faqs) || [];
  const announcements = (window.DATA && window.DATA.announcements) || [];

  const totalUsersEl = document.getElementById('statTotalUsers');
  const totalStudentsEl = document.getElementById('statTotalStudents');
  const totalStaffEl = document.getElementById('statTotalStaff');
  const totalContentEl = document.getElementById('statTotalContent');

  const studentsCount = users.filter(u => (u.role || '').toLowerCase() === 'student').length;
  const staffCount = users.filter(u => ['staff', 'admin', 'superadmin', 'super_admin'].includes((u.role || '').toLowerCase())).length;

  if (totalUsersEl) totalUsersEl.textContent = users.length;
  if (totalStudentsEl) totalStudentsEl.textContent = studentsCount;
  if (totalStaffEl) totalStaffEl.textContent = staffCount;
  if (totalContentEl) totalContentEl.textContent = faqs.length + announcements.length;
}

async function loadUsers() {
  if (!window.db) return;
  try {
    const snap = await window.db.collection('users').get();
    window.DATA.users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('Could not load users:', e.code || e.message);
    window.DATA.users = [];
  }
}

// Role and status live in Firestore users/{uid}; passwords live only in Firebase Auth.
async function updateUserDoc(id, patch, okMsg) {
  try {
    await window.db.collection('users').doc(id).update(patch);
    window.showToast(okMsg);
  } catch (e) {
    alert('Could not update the user: ' + (e.code || e.message));
  }
  renderAdminContent();
}

function changeUserRole(id, newRole) {
  return updateUserDoc(id, { role: newRole }, 'User role updated');
}

async function toggleUserStatus(id) {
  const u = (window.DATA.users || []).find(x => x.id === id);
  if (!u) return;
  const status = u.status === 'active' ? 'disabled' : 'active';
  await updateUserDoc(id, { status }, 'User ' + status);
}

async function deleteUserAccount(id) {
  if (window.adminSession && window.adminSession.id === id) {
    alert("You cannot delete your own account.");
    return;
  }
  if (!confirm("Delete this user's profile? To remove their sign-in completely, also delete them in Firebase Console > Authentication.")) return;
  try {
    await window.db.collection('users').doc(id).delete();
    window.showToast("Profile deleted");
  } catch (e) {
    alert('Could not delete the profile: ' + (e.code || e.message));
  }
  renderAdminContent();
}

async function addUserAccount() {
  const nameEl = document.getElementById('newUserName');
  const emailEl = document.getElementById('newUserEmail');
  const passEl = document.getElementById('newUserPassword');
  const roleEl = document.getElementById('newUserRole');

  const name = nameEl ? nameEl.value.trim() : '';
  const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
  const password = passEl ? passEl.value : '';
  const role = roleEl ? roleEl.value : 'staff';

  if (!name || !email || !password) {
    alert("Please fill in every field.");
    return;
  }
  if (password.length < 6) {
    alert("Password must be at least 6 characters.");
    return;
  }
  if (!window.auth || !window.db) {
    alert("Firebase is not available. Refresh the page and try again.");
    return;
  }

  try {
    // A second Firebase app creates the account so the Super Admin stays signed in.
    const secondary = firebase.apps.find(a => a.name === 'staff-creator') || firebase.initializeApp(window.firebaseConfig, 'staff-creator');
    const cred = await secondary.auth().createUserWithEmailAndPassword(email, password);
    await secondary.auth().signOut();
    // No password field: Firebase Auth keeps the credential.
    await window.db.collection('users').doc(cred.user.uid).set({
      name,
      email,
      role,
      status: 'active',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    alert(e.code === 'auth/email-already-in-use'
      ? 'An account with that email already exists. Change its role in the list instead.'
      : 'Could not create the account: ' + (e.code || e.message));
    return;
  }

  if (nameEl) nameEl.value = '';
  if (emailEl) emailEl.value = '';
  if (passEl) passEl.value = '';

  renderAdminContent();
  window.showToast("Account created successfully");
}

// ============================================================================
// 8. SETTINGS VIEW (School Branding & Official Registrar Config)
// ============================================================================
function renderSettingsView(container) {
  const schoolName = (window.DATA && window.DATA.school && window.DATA.school.name) || "Aklan Catholic College";
  const reg = (window.DATA && window.DATA.contactRegistrar) || {};
  const me = window.adminSession;

  container.innerHTML = `
    <h2>School Settings & Institutional Branding</h2>
    <p class="admin-sub">Configure institution branding and registrar details shown to students.</p>
    
    <div class="form-box" style="border-top:none;padding-top:0;">
      <h3>School Information</h3>
      <div class="form-grid full">
        <div class="field">
          <label for="settingsSchoolName">Institution Name</label>
          <input id="settingsSchoolName" type="text" value="${escapeAttr(schoolName)}">
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-primary" onclick="saveSchoolSettings()">Save Institutional Name</button>
      </div>
    </div>

    <div class="form-box">
      <h3>Official Registrar Contact Information</h3>
      <div class="form-grid">
        <div class="field">
          <label for="regOffice">Office Title</label>
          <input id="regOffice" type="text" value="${escapeAttr(reg.office || 'Office of the College Registrar')}">
        </div>
        <div class="field">
          <label for="regLocation">Location / Building</label>
          <input id="regLocation" type="text" value="${escapeAttr(reg.location || 'Admin Building, Ground Floor, Main Campus')}">
        </div>
        <div class="field">
          <label for="regHours">Operating Hours</label>
          <input id="regHours" type="text" value="${escapeAttr(reg.hours || 'Monday to Friday, 8:00 AM – 5:00 PM')}">
        </div>
        <div class="field">
          <label for="regEmail">Registrar Email</label>
          <input id="regEmail" type="email" value="${escapeAttr(reg.email || 'registrar@acc.edu.ph')}">
        </div>
        <div class="field">
          <label for="regPhone">Contact Numbers</label>
          <input id="regPhone" type="text" value="${escapeAttr(reg.phone || '(036) 268-4152 / (036) 268-8576')}">
        </div>
        <div class="field">
          <label for="regProc">Document Processing Times</label>
          <input id="regProc" type="text" value="${escapeAttr(reg.documentProcessingTime || 'Transcript of Records (3-5 days), COE (1-2 days)')}">
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-primary" onclick="saveRegistrarSettings()">Save Registrar Information</button>
      </div>
    </div>

    ${me ? `
      <div class="form-box">
        <h3>My Account Profile</h3>
        <div class="form-grid">
          <div class="field">
            <label for="settingsMyName">Name</label>
            <input id="settingsMyName" type="text" value="${escapeAttr(me.name)}">
          </div>
          <div class="field">
            <label for="settingsMyEmail">Email (used to sign in)</label>
            <input id="settingsMyEmail" type="text" value="${escapeAttr(me.email)}" disabled>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-primary" onclick="saveMyCredentials()">Update My Profile</button>
          <button type="button" class="btn-secondary" onclick="sendMyPasswordReset()">Email me a password reset link</button>
        </div>
      </div>
    ` : ''}
  `;
}

async function saveSchoolSettings() {
  const input = document.getElementById('settingsSchoolName');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;

  window.DATA.school.name = name;
  await window.persist();

  const brandLabel = document.getElementById('schoolNameLabel');
  if (brandLabel) brandLabel.textContent = name;
  window.showToast("School settings saved");
}

async function saveRegistrarSettings() {
  const office = document.getElementById('regOffice').value.trim();
  const location = document.getElementById('regLocation').value.trim();
  const hours = document.getElementById('regHours').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const proc = document.getElementById('regProc').value.trim();

  window.DATA.contactRegistrar = {
    office: office || "Office of the College Registrar",
    location: location || "Admin Building, Ground Floor",
    hours: hours || "Monday to Friday, 8:00 AM – 5:00 PM",
    email: email || "registrar@acc.edu.ph",
    phone: phone || "(036) 268-4152",
    documentProcessingTime: proc || "Transcript of Records (3-5 days), COE (1-2 days)"
  };

  await window.persist();
  window.showToast("Registrar contact information saved");
}

async function saveMyCredentials() {
  const me = window.adminSession;
  if (!me || !window.db) return;

  const name = document.getElementById('settingsMyName').value.trim();
  if (!name) {
    alert("Please enter your name.");
    return;
  }

  try {
    await window.db.collection('users').doc(me.id).update({ name });
  } catch (e) {
    alert('Could not update your profile: ' + (e.code || e.message));
    return;
  }
  me.name = name;

  const whoEl = document.getElementById('adminWhoName');
  if (whoEl) {
    const roleLower = (me.role || '').toLowerCase();
    const roleLabel = roleLower === 'superadmin' || roleLower === 'super_admin' ? 'Super Admin' : 'Staff';
    whoEl.textContent = '· ' + name + ' (' + roleLabel + ')';
  }
  window.showToast("Profile updated");
}

// Passwords are managed by Firebase Auth: staff get a reset link by e-mail instead of editing a stored password.
async function sendMyPasswordReset() {
  const me = window.adminSession;
  if (!me || !window.auth) return;
  try {
    await window.auth.sendPasswordResetEmail(me.email);
    window.showToast("Password reset email sent");
  } catch (e) {
    alert('Could not send the reset email: ' + (e.code || e.message));
  }
}

// Helpers
function escapeAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Builds the input for one FIELD_CONFIG field (text, textarea, select or date)
function fieldInputHtml(f, id, val) {
  const v = val == null ? '' : String(val);
  if (f.type === 'textarea') return `<textarea id="${id}" placeholder="${escapeAttr(f.placeholder || '')}">${escapeHtml(v)}</textarea>`;
  if (f.type === 'select') return `<select id="${id}">${f.options.map(o => `<option${o === v ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  if (f.type === 'date') return `<input type="date" id="${id}" value="${/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''}">`;
  return `<input type="text" id="${id}" placeholder="${escapeAttr(f.placeholder || '')}" value="${escapeAttr(v)}">`;
}

// Expose functions globally for HTML onclick handlers
window.renderAdminNav = renderAdminNav;
window.switchAdminTab = switchAdminTab;
window.renderAdminContent = renderAdminContent;
window.toggleAddForm = toggleAddForm;
window.closeAddForm = closeAddForm;
window.handleCardClick = handleCardClick;
window.startInlineEdit = startInlineEdit;
window.cancelInlineEdit = cancelInlineEdit;
window.saveInlineEdit = saveInlineEdit;
window.saveNewRecord = saveNewRecord;
window.confirmDeleteRecord = confirmDeleteRecord;
window.deleteInquiry = deleteInquiry;
window.changeUserRole = changeUserRole;
window.toggleUserStatus = toggleUserStatus;
window.deleteUserAccount = deleteUserAccount;
window.addUserAccount = addUserAccount;
window.saveSchoolSettings = saveSchoolSettings;
window.saveRegistrarSettings = saveRegistrarSettings;
window.saveMyCredentials = saveMyCredentials;
window.sendMyPasswordReset = sendMyPasswordReset;
window.loadUsers = loadUsers;
window.renderSuperAdminStats = renderSuperAdminStats;
