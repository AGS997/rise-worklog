/* ============================================================
   RISE Lab Officers Work Log — Frontend Application
   ============================================================ */

let currentUser = null;
let editingTaskId = null;
let viewingTaskId = null;
let changePwUserId = null;
let allUsers = [];

// ── Utility ──────────────────────────────────────────────────────────────────

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function fmt(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Auth ──────────────────────────────────────────────────────────────────────

document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('login-btn').click();
});

document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  if (!username || !password) { errEl.textContent = 'Please enter username and password.'; errEl.style.display = 'block'; return; }
  try {
    const data = await api('POST', '/api/login', { username, password });
    currentUser = data.user;
    initApp();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('POST', '/api/logout');
  currentUser = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
});

// ── App init ──────────────────────────────────────────────────────────────────

async function initApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  document.getElementById('nav-name').textContent = currentUser.full_name;
  const roleLabel = { boss: 'Director', supervisor: 'Supervisor', member: 'Lab Officer' };
  document.getElementById('nav-role').textContent = roleLabel[currentUser.role] || currentUser.role;
  document.getElementById('nav-avatar').textContent = initials(currentUser.full_name);

  buildNav();

  if (currentUser.role === 'member') {
    showPage('page-my-tasks');
    loadMyTasks();
    setDefaultDate();
  } else {
    // Load users list for filters
    allUsers = await api('GET', '/api/users');
    populateUserFilter();
    showPage('page-dashboard');
    loadDashboard();
  }
}

function buildNav() {
  const nav = document.getElementById('sidebar-nav');
  const role = currentUser.role;

  let html = '';

  if (role === 'member') {
    html += navItem('page-my-tasks', iconClipboard(), 'My Work Log');
  }

  if (role === 'boss' || role === 'supervisor') {
    html += `<div class="nav-section-label">Overview</div>`;
    html += navItem('page-dashboard', iconChart(), 'Dashboard');
    html += `<div class="nav-section-label">Tasks</div>`;
    html += navItem('page-all-tasks', iconList(), 'All Tasks');
  }

  if (role === 'boss') {
    html += `<div class="nav-section-label">Admin</div>`;
    html += navItem('page-users', iconUsers(), 'Users');
  }

  nav.innerHTML = html;

  nav.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      showPage(page);
      if (page === 'page-my-tasks') loadMyTasks();
      else if (page === 'page-all-tasks') loadAllTasks();
      else if (page === 'page-dashboard') loadDashboard();
      else if (page === 'page-users') loadUsers();
      // Close mobile sidebar
      document.getElementById('sidebar').classList.remove('open');
    });
  });
}

function navItem(page, icon, label) {
  return `<button class="nav-item" data-page="${page}">${icon}${label}</button>`;
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageId);
  });
}

function setDefaultDate() {
  const d = document.getElementById('task-date-input');
  if (d && !d.value) d.value = today();
}

// Mobile menu
document.getElementById('mobile-menu-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ── My Tasks (Member) ─────────────────────────────────────────────────────────

async function loadMyTasks(from, to) {
  let url = '/api/tasks/mine';
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to', to);
  // Filtering is done client-side for simplicity on /mine
  const tasks = await api('GET', url);
  const tbody = document.getElementById('my-tasks-body');

  let filtered = tasks;
  if (from) filtered = filtered.filter(t => t.date >= from);
  if (to)   filtered = filtered.filter(t => t.date <= to);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><p>No tasks logged yet. Click "Log Task" to add one.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => `
    <tr>
      <td style="white-space:nowrap;">${fmt(t.date)}</td>
      <td><strong>${escapeHtml(t.task_title)}</strong></td>
      <td>${escapeHtml(t.requestor)}</td>
      <td style="max-width:260px;">${escapeHtml(t.description)}</td>
      <td>${t.magnitude ? escapeHtml(t.magnitude) : '<span style="color:var(--text-light)">—</span>'}</td>
      <td><span class="badge badge-hours">${t.duration} hrs</span></td>
      <td>
        <div style="display:flex;gap:0.3rem;">
          <button class="btn btn-ghost btn-icon tooltip" data-tip="View" onclick="openViewModal(${t.id})">
            ${iconEye()}
          </button>
          <button class="btn btn-secondary btn-icon tooltip" data-tip="Edit" onclick="openEditTaskModal(${t.id})">
            ${iconEdit()}
          </button>
          <button class="btn btn-danger btn-icon tooltip" data-tip="Delete" onclick="deleteMyTask(${t.id})">
            ${iconTrash()}
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

document.getElementById('mine-filter-btn').addEventListener('click', () => {
  const from = document.getElementById('mine-filter-from').value;
  const to   = document.getElementById('mine-filter-to').value;
  loadMyTasks(from, to);
});
document.getElementById('mine-filter-clear').addEventListener('click', () => {
  document.getElementById('mine-filter-from').value = '';
  document.getElementById('mine-filter-to').value = '';
  loadMyTasks();
});

// ── All Tasks (Director/Supervisor) ───────────────────────────────────────────────

async function loadAllTasks() {
  const userId = document.getElementById('all-filter-user').value;
  const from   = document.getElementById('all-filter-from').value;
  const to     = document.getElementById('all-filter-to').value;
  const search = document.getElementById('all-filter-search').value.trim();

  const params = new URLSearchParams();
  if (userId) params.set('user_id', userId);
  if (from)   params.set('from', from);
  if (to)     params.set('to', to);
  if (search) params.set('search', search);

  const tasks = await api('GET', `/api/tasks?${params}`);
  const tbody = document.getElementById('all-tasks-body');
  const isBoss = currentUser.role === 'boss';

  if (!tasks.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>No tasks found matching your filters.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = tasks.map(t => `
    <tr>
      <td style="white-space:nowrap;">${fmt(t.date)}</td>
      <td><span class="badge badge-member">${escapeHtml(t.full_name)}</span></td>
      <td><strong>${escapeHtml(t.task_title)}</strong></td>
      <td>${escapeHtml(t.requestor)}</td>
      <td style="max-width:220px;">${escapeHtml(t.description)}</td>
      <td>${t.magnitude ? escapeHtml(t.magnitude) : '<span style="color:var(--text-light)">—</span>'}</td>
      <td><span class="badge badge-hours">${t.duration} hrs</span></td>
      <td>
        <div style="display:flex;gap:0.3rem;">
          <button class="btn btn-ghost btn-icon tooltip" data-tip="View & Comment" onclick="openViewModal(${t.id})">
            ${iconEye()}
          </button>
          ${isBoss ? `
          <button class="btn btn-secondary btn-icon tooltip" data-tip="Edit" onclick="openBossEditModal(${t.id})">
            ${iconEdit()}
          </button>
          <button class="btn btn-danger btn-icon tooltip" data-tip="Delete" onclick="deleteBossTask(${t.id})">
            ${iconTrash()}
          </button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

document.getElementById('all-filter-btn').addEventListener('click', loadAllTasks);
document.getElementById('all-filter-clear').addEventListener('click', () => {
  document.getElementById('all-filter-user').value = '';
  document.getElementById('all-filter-from').value = '';
  document.getElementById('all-filter-to').value = '';
  document.getElementById('all-filter-search').value = '';
  loadAllTasks();
});

// ── Export to Excel ──────────────────────────────────────────────────────────

document.getElementById('export-excel-btn').addEventListener('click', exportToExcel);

async function exportToExcel() {
  const userId = document.getElementById('all-filter-user').value;
  const from   = document.getElementById('all-filter-from').value;
  const to     = document.getElementById('all-filter-to').value;
  const search = document.getElementById('all-filter-search').value.trim();

  const params = new URLSearchParams();
  if (userId) params.set('user_id', userId);
  if (from)   params.set('from', from);
  if (to)     params.set('to', to);
  if (search) params.set('search', search);

  const tasks = await api('GET', `/api/tasks?${params}`);

  if (!tasks.length) { toast('No tasks to export.', 'error'); return; }

  // Build CSV content
  const headers = ['Date', 'Employee', 'Task', 'Requestor', 'Description', 'Magnitude', 'Duration (hrs)'];
  const rows = tasks.map(t => [
    t.date,
    t.full_name,
    t.task_title,
    t.requestor,
    t.description,
    t.magnitude || '',
    t.duration
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => {
      const val = String(cell ?? '').replace(/"/g, '""');
      return `"${val}"`;
    }).join(','))
    .join('\n');

  // Build filename based on active filters
  const employeeName = userId
    ? (allUsers.find(u => u.id == userId)?.full_name || 'Employee').replace(/\s+/g, '_')
    : 'All_Employees';
  const dateRange = (from || to)
    ? `_${from || 'start'}_to_${to || 'today'}`
    : '_All_Time';
  const filename = `RISE_Tasks_${employeeName}${dateRange}.csv`;

  // Trigger download
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  toast(`Exported ${tasks.length} task${tasks.length !== 1 ? 's' : ''} to Excel.`);
}

function populateUserFilter() {
  const sel = document.getElementById('all-filter-user');
  sel.innerHTML = '<option value="">All Employees</option>' +
    allUsers.map(u => `<option value="${u.id}">${escapeHtml(u.full_name)}</option>`).join('');
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function loadDashboard() {
  const from = document.getElementById('dash-from').value;
  const to   = document.getElementById('dash-to').value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  const data = await api('GET', `/api/analytics/summary?${params}`);

  document.getElementById('stat-today-tasks').textContent = data.todayTasks;
  document.getElementById('stat-today-hours').textContent = data.todayHours.toFixed(1);
  document.getElementById('stat-total-tasks').textContent = data.totalTasks;
  document.getElementById('stat-total-hours').textContent = data.totalHours.toFixed(1);

  // Hours bar chart
  const maxHours = Math.max(...data.perEmployee.map(e => e.total_hours), 1);
  document.getElementById('emp-hours-chart').innerHTML = data.perEmployee.length
    ? data.perEmployee.map(e => `
        <div class="emp-bar-row">
          <span class="emp-bar-name" title="${escapeHtml(e.full_name)}">${escapeHtml(e.full_name)}</span>
          <div class="emp-bar-track"><div class="emp-bar-fill" style="width:${(e.total_hours/maxHours*100).toFixed(1)}%"></div></div>
          <span class="emp-bar-value">${e.total_hours.toFixed(1)} hrs</span>
        </div>`).join('')
    : '<p style="color:var(--text-muted);font-size:0.85rem;">No data</p>';

  // Tasks bar chart
  const maxTasks = Math.max(...data.perEmployee.map(e => e.task_count), 1);
  document.getElementById('emp-tasks-chart').innerHTML = data.perEmployee.length
    ? data.perEmployee.map(e => `
        <div class="emp-bar-row">
          <span class="emp-bar-name" title="${escapeHtml(e.full_name)}">${escapeHtml(e.full_name)}</span>
          <div class="emp-bar-track"><div class="emp-bar-fill" style="width:${(e.task_count/maxTasks*100).toFixed(1)}%;background:#6366f1;"></div></div>
          <span class="emp-bar-value">${e.task_count} tasks</span>
        </div>`).join('')
    : '<p style="color:var(--text-muted);font-size:0.85rem;">No data</p>';

  // Daily chart
  const daily = [...data.daily].reverse();
  const maxD = Math.max(...daily.map(d => d.total_hours), 1);
  document.getElementById('daily-chart').innerHTML = daily.length
    ? daily.map(d => `
        <div class="daily-bar-col">
          <div class="daily-bar" style="height:${Math.max(4,(d.total_hours/maxD*88)).toFixed(0)}px" title="${d.total_hours} hrs on ${d.date}"></div>
          <span class="daily-bar-label">${d.date.slice(5)}</span>
        </div>`).join('')
    : '<p style="color:var(--text-muted);font-size:0.85rem;">No activity yet</p>';

  // Summary table
  document.getElementById('emp-summary-body').innerHTML = data.perEmployee.length
    ? data.perEmployee.map(e => `
        <tr>
          <td><strong>${escapeHtml(e.full_name)}</strong></td>
          <td>${e.task_count}</td>
          <td><span class="badge badge-hours">${e.total_hours.toFixed(1)} hrs</span></td>
          <td>${e.task_count ? (e.total_hours/e.task_count).toFixed(1) : '—'}</td>
        </tr>`).join('')
    : '<tr><td colspan="4"><div class="empty-state"><p>No data yet</p></div></td></tr>';
}

document.getElementById('dash-filter-btn').addEventListener('click', loadDashboard);
document.getElementById('dash-clear-btn').addEventListener('click', () => {
  document.getElementById('dash-from').value = '';
  document.getElementById('dash-to').value = '';
  loadDashboard();
});

// ── User Management (Director) ────────────────────────────────────────────────────

async function loadUsers() {
  const users = await api('GET', '/api/users');
  const tbody = document.getElementById('users-body');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.full_name)}</strong></td>
      <td><code style="font-size:0.85rem;">${escapeHtml(u.username)}</code></td>
      <td><span class="badge badge-${u.role}">${{boss:'Director',supervisor:'Supervisor',member:'Lab Officer'}[u.role] || u.role}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openChangePw(${u.id}, '${escapeHtml(u.username)}')">
          Change Password
        </button>
      </td>
    </tr>
  `).join('');
}

// ── Add/Edit Task Modal ───────────────────────────────────────────────────────

document.getElementById('open-add-task-btn').addEventListener('click', () => {
  openAddTaskModal();
});

function openAddTaskModal() {
  editingTaskId = null;
  document.getElementById('task-modal-title').textContent = 'Log a Task';
  document.getElementById('task-modal-id').value = '';
  document.getElementById('task-title-input').value = '';
  document.getElementById('task-date-input').value = today();
  document.getElementById('task-requestor-input').value = '';
  document.getElementById('task-duration-input').value = '';
  document.getElementById('task-description-input').value = '';
  document.getElementById('task-magnitude-input').value = '';
  openModal('task-modal-overlay');
}

async function openEditTaskModal(id) {
  const tasks = await api('GET', '/api/tasks/mine');
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  editingTaskId = id;
  document.getElementById('task-modal-title').textContent = 'Edit Task';
  document.getElementById('task-modal-id').value = id;
  document.getElementById('task-title-input').value = t.task_title;
  document.getElementById('task-date-input').value = t.date;
  document.getElementById('task-requestor-input').value = t.requestor;
  document.getElementById('task-duration-input').value = t.duration;
  document.getElementById('task-description-input').value = t.description;
  document.getElementById('task-magnitude-input').value = t.magnitude || '';
  openModal('task-modal-overlay');
}

async function openBossEditModal(id) {
  const tasks = await api('GET', '/api/tasks');
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  editingTaskId = id;
  document.getElementById('task-modal-title').textContent = 'Edit Task';
  document.getElementById('task-modal-id').value = id;
  document.getElementById('task-title-input').value = t.task_title;
  document.getElementById('task-date-input').value = t.date;
  document.getElementById('task-requestor-input').value = t.requestor;
  document.getElementById('task-duration-input').value = t.duration;
  document.getElementById('task-description-input').value = t.description;
  document.getElementById('task-magnitude-input').value = t.magnitude || '';
  openModal('task-modal-overlay');
}

document.getElementById('save-task-btn').addEventListener('click', async () => {
  const title       = document.getElementById('task-title-input').value.trim();
  const date        = document.getElementById('task-date-input').value;
  const requestor   = document.getElementById('task-requestor-input').value.trim();
  const duration    = document.getElementById('task-duration-input').value;
  const description = document.getElementById('task-description-input').value.trim();
  const magnitude   = document.getElementById('task-magnitude-input').value.trim();

  if (!title || !date || !requestor || !duration || !description) {
    toast('Please fill in all required fields.', 'error'); return;
  }

  try {
    if (editingTaskId) {
      const endpoint = currentUser.role === 'boss'
        ? `/api/tasks/${editingTaskId}`
        : `/api/tasks/${editingTaskId}/mine`;
      await api('PUT', endpoint, { task_title: title, date, requestor, description, magnitude, duration: parseFloat(duration) });
      toast('Task updated successfully.');
    } else {
      await api('POST', '/api/tasks', { task_title: title, date, requestor, description, magnitude, duration: parseFloat(duration) });
      toast('Task logged successfully.');
    }
    closeModal('task-modal-overlay');
    if (currentUser.role === 'member') loadMyTasks();
    else loadAllTasks();
  } catch(e) {
    toast(e.message, 'error');
  }
});

async function deleteMyTask(id) {
  if (!confirm('Delete this task? This cannot be undone.')) return;
  await api('DELETE', `/api/tasks/${id}/mine`);
  toast('Task deleted.');
  loadMyTasks();
}

async function deleteBossTask(id) {
  if (!confirm('Delete this task? This cannot be undone.')) return;
  await api('DELETE', `/api/tasks/${id}`);
  toast('Task deleted.');
  loadAllTasks();
}

['close-task-modal','cancel-task-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => closeModal('task-modal-overlay'));
});

// ── View / Comments Modal ─────────────────────────────────────────────────────

async function openViewModal(taskId) {
  viewingTaskId = taskId;

  // Fetch task details
  let tasks;
  if (currentUser.role === 'member') {
    tasks = await api('GET', '/api/tasks/mine');
  } else {
    tasks = await api('GET', '/api/tasks');
  }
  const t = tasks.find(t => t.id === taskId);
  if (!t) return;

  document.getElementById('view-modal-title').textContent = escapeHtml(t.task_title);
  document.getElementById('view-task-details').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
      <div><div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.2rem;">Date</div><div>${fmt(t.date)}</div></div>
      <div><div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.2rem;">Duration</div><div><span class="badge badge-hours">${t.duration} hrs</span></div></div>
      <div><div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.2rem;">Requestor</div><div>${escapeHtml(t.requestor)}</div></div>
      <div><div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.2rem;">Magnitude</div><div>${t.magnitude || '—'}</div></div>
      ${currentUser.role !== 'member' ? `<div><div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.2rem;">Employee</div><div><span class="badge badge-member">${escapeHtml(t.full_name)}</span></div></div>` : ''}
    </div>
    <div style="margin-top:0.8rem;">
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.3rem;">Description</div>
      <div style="background:var(--bg);border-radius:8px;padding:0.75rem;font-size:0.9rem;">${escapeHtml(t.description)}</div>
    </div>
  `;

  // Load comments
  await loadComments(taskId);

  // Show comment box only for boss/supervisor
  const commentArea = document.getElementById('add-comment-area');
  commentArea.style.display = (currentUser.role === 'boss' || currentUser.role === 'supervisor') ? 'block' : 'none';
  document.getElementById('comment-input').value = '';

  openModal('view-modal-overlay');
}

async function loadComments(taskId) {
  const comments = await api('GET', `/api/tasks/${taskId}/comments`);
  const list = document.getElementById('comments-list');
  if (!comments.length) {
    list.innerHTML = '<p style="font-size:0.85rem;color:var(--text-light);">No comments yet.</p>';
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-meta">${escapeHtml(c.full_name)} · <span>${{boss:'Director',supervisor:'Supervisor',member:'Lab Officer'}[c.role] || c.role}</span> · ${new Date(c.created_at).toLocaleDateString()}</div>
      <div class="comment-text">${escapeHtml(c.comment)}</div>
      ${currentUser.role === 'boss' ? `<button class="btn btn-ghost btn-icon" style="position:absolute;top:0.4rem;right:0.4rem;" onclick="deleteComment(${c.id})">${iconTrash()}</button>` : ''}
    </div>
  `).join('');
}

document.getElementById('submit-comment-btn').addEventListener('click', async () => {
  const comment = document.getElementById('comment-input').value.trim();
  if (!comment) return;
  await api('POST', `/api/tasks/${viewingTaskId}/comments`, { comment });
  document.getElementById('comment-input').value = '';
  await loadComments(viewingTaskId);
  toast('Comment added.');
});

async function deleteComment(id) {
  await api('DELETE', `/api/comments/${id}`);
  await loadComments(viewingTaskId);
  toast('Comment deleted.');
}

['close-view-modal','close-view-modal-2'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => closeModal('view-modal-overlay'));
});

// ── Change Password ────────────────────────────────────────────────────────────

function openChangePw(userId, username) {
  changePwUserId = userId;
  document.getElementById('pw-modal-username').textContent = `Changing password for: ${username}`;
  document.getElementById('new-pw-input').value = '';
  openModal('pw-modal-overlay');
}

document.getElementById('save-pw-btn').addEventListener('click', async () => {
  const pw = document.getElementById('new-pw-input').value;
  if (!pw || pw.length < 4) { toast('Password must be at least 4 characters.', 'error'); return; }
  await api('PUT', `/api/users/${changePwUserId}/password`, { password: pw });
  toast('Password updated successfully.');
  closeModal('pw-modal-overlay');
});

['close-pw-modal','cancel-pw-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => closeModal('pw-modal-overlay'));
});

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function iconClipboard() { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>`; }
function iconChart()     { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`; }
function iconList()      { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`; }
function iconUsers()     { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`; }
function iconEdit()      { return `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`; }
function iconTrash()     { return `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`; }
function iconEye()       { return `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`; }

// ── Boot ──────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const data = await api('GET', '/api/me');
    currentUser = data.user;
    initApp();
  } catch {
    // Not logged in — show login screen
    document.getElementById('login-screen').style.display = 'flex';
  }
})();
