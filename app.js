// ── API CONFIG ──
const API_BASE = 'https://uualamin.pythonanywhere.com/api/v1/jobs';

// ── STATE ──
let jobs          = [];
let editId        = null;
let deleteId      = null;
let currentFilter = 'all';

// ── API FIELD MAP ──
// API fields: job_title, company_name, application_deadline, application_link,
//             company_website_url, company_facebook_url, company_linkedin_url,
//             company_phone_no, company_email, description
// Local fields: title, company, deadline, link, website, facebook, linkedin, phone, email, desc

function apiToLocal(j) {
  return {
    id:       j.id,
    title:    j.job_title             || '',
    company:  j.company_name          || '',
    deadline: j.application_deadline  || '',
    link:     j.application_link      || '',
    website:  j.company_website_url   || '',
    facebook: j.company_facebook_url  || '',
    linkedin: j.company_linkedin_url  || '',
    phone:    j.company_phone_no      || '',
    email:    j.company_email         || '',
    desc:     j.description           || '',
    hidden:   false,  // local-only (not stored in API)
    status:   null,   // local-only (not stored in API)
  };
}

function localToApi(data) {
  return {
    job_title:            data.title,
    company_name:         data.company,
    application_deadline: data.deadline  || null,
    application_link:     data.link      || '',
    company_website_url:  data.website   || '',
    company_facebook_url: data.facebook  || '',
    company_linkedin_url: data.linkedin  || '',
    company_phone_no:     data.phone     || '',
    company_email:        data.email     || '',
    description:          data.desc      || '',
  };
}

// ── UTILITIES ──
function today() {
  return new Date().toISOString().split('T')[0];
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function deadlineTag(d) {
  if (!d) return '<span class="tag tag-open">Open</span>';
  if (d < today()) return '<span class="tag tag-closed">Closed</span>';
  const diff = Math.ceil((new Date(d) - new Date()) / 86_400_000);
  if (diff <= 7) return `<span class="tag tag-soon">Closes in ${diff}d</span>`;
  return '<span class="tag tag-open">Open</span>';
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => (t.className = 'toast'), 2800);
}

function setLoading(on) {
  document.getElementById('loading-overlay').style.display = on ? 'flex' : 'none';
}

function updateCompanySuggestions() {
  const list   = document.getElementById('company-suggestions');
  const unique = [...new Set(jobs.map(j => j.company.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)))];
  list.innerHTML = unique.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}

function updateStats() {
  document.getElementById('stat-total').textContent  = jobs.length;
  document.getElementById('stat-active').textContent = jobs.filter(j => !j.hidden && j.deadline >= today()).length;
  document.getElementById('stat-hidden').textContent = jobs.filter(j => j.hidden).length;
  document.getElementById('stat-closed').textContent = jobs.filter(j => j.deadline && j.deadline < today()).length;
  document.getElementById('job-count').textContent   = jobs.filter(j => !j.hidden).length;
}

// ── API HELPERS ──
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  if (res.status === 204) return null; // DELETE returns No Content
  return res.json();
}

// ── LOAD ALL JOBS (GET) ──
async function loadJobs() {
  setLoading(true);
  try {
    const data = await apiFetch(`${API_BASE}/`);
    jobs = data.map(item => {
      // Preserve local-only fields across reloads
      const existing = jobs.find(j => j.id === item.id);
      const local    = apiToLocal(item);
      if (existing) {
        local.hidden = existing.hidden;
        local.status = existing.status;
      }
      return local;
    });
    renderAdmin();
    renderUser();
  } catch (e) {
    showToast('Failed to load jobs: ' + e.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ── CREATE JOB (POST) ──
async function createJob(data) {
  return apiFetch(`${API_BASE}/`, {
    method: 'POST',
    body: JSON.stringify(localToApi(data)),
  });
}

// ── UPDATE JOB (PUT) ──
async function updateJob(id, data) {
  return apiFetch(`${API_BASE}/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(localToApi(data)),
  });
}

// ── DELETE JOB (DELETE) ──
async function deleteJob(id) {
  return apiFetch(`${API_BASE}/${id}/`, { method: 'DELETE' });
}

// ── ADMIN TABLE ──
function renderAdmin() {
  const tbody = document.getElementById('admin-table-body');

  if (!jobs.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty">
            <div class="empty-icon">📋</div>
            <div class="empty-text">No jobs yet. Add one!</div>
          </div>
        </td>
      </tr>`;
    updateStats();
    updateCompanySuggestions();
    return;
  }

  tbody.innerHTML = jobs.map((j, i) => `
    <tr id="row-${j.id}" style="${j.hidden ? 'opacity:0.5' : ''}">
      <td style="color:var(--muted);font-size:12px">${i + 1}</td>
      <td><strong>${escapeHtml(j.title)}</strong></td>
      <td>${escapeHtml(j.company)}</td>
      <td style="font-size:13px">${j.deadline || '—'} ${deadlineTag(j.deadline)}</td>
      <td>${j.hidden ? '<span class="tag tag-hidden">Hidden</span>' : deadlineTag(j.deadline)}</td>
      <td>
        <div class="action-btns">
          <button class="icon-btn" title="Edit"   onclick="openEditModal(${j.id})">✏️</button>
          <button class="icon-btn" title="${j.hidden ? 'Show' : 'Hide'}" onclick="toggleHide(${j.id})">${j.hidden ? '👁️' : '🙈'}</button>
          <button class="icon-btn danger" title="Delete" onclick="openDelModal(${j.id})">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');

  updateStats();
  updateCompanySuggestions();
}

// ── USER CARDS ──
function renderUser() {
  const grid = document.getElementById('jobs-grid');
  let visible = jobs.filter(j => !j.hidden);
  if (currentFilter !== 'all') visible = visible.filter(j => j.status === currentFilter);

  if (!visible.length) {
    grid.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">No jobs found.</div>
      </div>`;
    return;
  }

  grid.innerHTML = visible.map(j => `
    <div class="job-card">
      <div class="job-card-header">
        <div class="job-title">${escapeHtml(j.title)}</div>
        ${deadlineTag(j.deadline)}
      </div>
      <div class="job-company">🏢 ${escapeHtml(j.company)}</div>
      <div class="job-deadline">Deadline: <strong>${j.deadline || 'Not specified'}</strong></div>
      <div class="job-desc">${escapeHtml(j.desc)}</div>
      <div class="job-card-footer">
        <select class="status-select ${j.status || ''}" onchange="setStatus(${j.id}, this)">
          <option value=""                    ${!j.status                         ? 'selected' : ''}>Track status…</option>
          <option value="interested"          ${j.status === 'interested'          ? 'selected' : ''}>⭐ Interested</option>
          <option value="applied"             ${j.status === 'applied'             ? 'selected' : ''}>📨 Applied</option>
          <option value="interview_scheduled" ${j.status === 'interview_scheduled' ? 'selected' : ''}>📅 Interview Scheduled</option>
          <option value="interview_done"      ${j.status === 'interview_done'      ? 'selected' : ''}>✅ Interview Done</option>
          <option value="offer_received"      ${j.status === 'offer_received'      ? 'selected' : ''}>🎉 Offer Received</option>
          <option value="rejected"            ${j.status === 'rejected'            ? 'selected' : ''}>❌ Rejected</option>
        </select>
        ${j.link ? `<a href="${escapeHtml(j.link)}" target="_blank" rel="noopener"><button class="btn btn-accent btn-sm">Apply →</button></a>` : ''}
        <button class="btn btn-primary btn-sm" onclick="scanCV(${j.id})">CV Scan</button>
      </div>
    </div>
  `).join('');
}

function setStatus(id, sel) {
  const j = jobs.find(x => x.id === id);
  if (j) {
    j.status = sel.value;
    sel.className = `status-select ${sel.value}`;
    renderUser();
    showToast('Status updated!');
  }
}

function scanCV(id) {
  const j = jobs.find(x => x.id === id);
  if (j) {
    showToast('CV scanning feature coming soon!', 'success');
    // TODO: Implement CV scanning logic here
  }
}

function filterJobs(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderUser();
}

// ── ADD / EDIT MODAL ──
function openAddModal() {
  editId = null;
  document.getElementById('modal-title').textContent = 'Add New Job';
  ['title', 'company', 'deadline', 'link', 'website', 'facebook', 'linkedin', 'phone', 'email', 'desc']
    .forEach(f => (document.getElementById('f-' + f).value = ''));
  document.getElementById('modal').classList.add('open');
}

function openEditModal(id) {
  editId = id;
  const j = jobs.find(x => x.id === id);
  document.getElementById('modal-title').textContent = 'Edit Job';
  document.getElementById('f-title').value    = j.title;
  document.getElementById('f-company').value  = j.company;
  document.getElementById('f-deadline').value = j.deadline;
  document.getElementById('f-link').value     = j.link;
  document.getElementById('f-website').value  = j.website;
  document.getElementById('f-facebook').value = j.facebook;
  document.getElementById('f-linkedin').value = j.linkedin;
  document.getElementById('f-phone').value    = j.phone;
  document.getElementById('f-email').value    = j.email;
  document.getElementById('f-desc').value     = j.desc;
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

async function saveJob() {
  const title   = document.getElementById('f-title').value.trim();
  const company = document.getElementById('f-company').value.trim();

  if (!title || !company) {
    showToast('Title and company are required', 'error');
    return;
  }

  const data = {
    title,
    company,
    deadline: document.getElementById('f-deadline').value,
    link:     document.getElementById('f-link').value.trim(),
    website:  document.getElementById('f-website').value.trim(),
    facebook: document.getElementById('f-facebook').value.trim(),
    linkedin: document.getElementById('f-linkedin').value.trim(),
    phone:    document.getElementById('f-phone').value.trim(),
    email:    document.getElementById('f-email').value.trim(),
    desc:     document.getElementById('f-desc').value.trim(),
  };

  setSaveBtnLoading(true);
  try {
    if (editId) {
      // PUT — update existing
      const updated = await updateJob(editId, data);
      const idx     = jobs.findIndex(j => j.id === editId);
      const local   = apiToLocal(updated);
      local.hidden  = jobs[idx].hidden;
      local.status  = jobs[idx].status;
      jobs[idx]     = local;
      showToast('Job updated! ✓');
    } else {
      // POST — create new
      const created = await createJob(data);
      jobs.push(apiToLocal(created));
      showToast('Job added! ✓');
    }
    closeModal();
    renderAdmin();
    renderUser();
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  } finally {
    setSaveBtnLoading(false);
  }
}

function setSaveBtnLoading(on) {
  const btn = document.getElementById('save-btn');
  btn.disabled    = on;
  btn.textContent = on ? 'Saving…' : 'Save Job';
}

// ── DELETE ──
function openDelModal(id) {
  deleteId = id;
  document.getElementById('del-modal').classList.add('open');
}

function closeDelModal() {
  document.getElementById('del-modal').classList.remove('open');
}

async function confirmDelete() {
  const btn = document.getElementById('confirm-del-btn');
  btn.disabled    = true;
  btn.textContent = 'Deleting…';
  try {
    await deleteJob(deleteId);
    jobs = jobs.filter(j => j.id !== deleteId);
    closeDelModal();
    renderAdmin();
    renderUser();
    showToast('Job deleted.');
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Delete';
  }
}

// ── TOGGLE VISIBILITY (local-only, no API) ──
function toggleHide(id) {
  const j = jobs.find(x => x.id === id);
  j.hidden = !j.hidden;
  renderAdmin();
  renderUser();
  showToast(j.hidden ? 'Job hidden from users.' : 'Job visible to users.');
}

// ── SWITCH VIEW ──
function switchView(v) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + v).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach((t, i) =>
    t.classList.toggle('active', (v === 'admin' && i === 0) || (v === 'user' && i === 1))
  );
  if (v === 'user') renderUser();
}

// ── CLOSE MODALS ON OVERLAY CLICK ──
['modal', 'del-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', function (e) {
    if (e.target === this) this.classList.remove('open');
  });
});

// ── INIT ──
loadJobs();