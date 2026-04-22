const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const db = new Database('worklog.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('boss', 'supervisor', 'member'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task_title TEXT NOT NULL,
    date TEXT NOT NULL,
    requestor TEXT NOT NULL,
    description TEXT NOT NULL,
    magnitude TEXT,
    duration REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    comment TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Seed users if none exist
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const insert = db.prepare('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)');
  insert.run('boss', hash('boss123'), 'Dr. Ahmed Al-Boss', 'boss');
  insert.run('supervisor1', hash('super123'), 'Sara Al-Supervisor', 'supervisor');
  for (let i = 1; i <= 20; i++) {
    insert.run(`employee${i}`, hash('pass123'), `Lab Officer ${i}`, 'member');
  }
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rise-worklog-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
};
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

// ── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid username or password' });
  req.session.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
  res.json({ user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// ── Task routes ───────────────────────────────────────────────────────────────
// Member: add own task
app.post('/api/tasks', requireAuth, (req, res) => {
  const { task_title, date, requestor, description, magnitude, duration } = req.body;
  if (!task_title || !date || !requestor || !description || duration === undefined)
    return res.status(400).json({ error: 'Missing required fields' });
  const result = db.prepare(
    'INSERT INTO tasks (user_id, task_title, date, requestor, description, magnitude, duration) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.session.user.id, task_title, date, requestor, description, magnitude || '', parseFloat(duration));
  const task = db.prepare('SELECT tasks.*, users.full_name FROM tasks JOIN users ON tasks.user_id = users.id WHERE tasks.id = ?').get(result.lastInsertRowid);
  res.json(task);
});

// Member: get own tasks
app.get('/api/tasks/mine', requireAuth, (req, res) => {
  const tasks = db.prepare(
    'SELECT tasks.*, users.full_name FROM tasks JOIN users ON tasks.user_id = users.id WHERE tasks.user_id = ? ORDER BY tasks.date DESC, tasks.created_at DESC'
  ).all(req.session.user.id);
  res.json(tasks);
});

// Boss/Supervisor: get all tasks (optionally filter by user_id or date range)
app.get('/api/tasks', requireAuth, requireRole('boss', 'supervisor'), (req, res) => {
  const { user_id, from, to, search } = req.query;
  let sql = 'SELECT tasks.*, users.full_name FROM tasks JOIN users ON tasks.user_id = users.id WHERE 1=1';
  const params = [];
  if (user_id) { sql += ' AND tasks.user_id = ?'; params.push(user_id); }
  if (from)    { sql += ' AND tasks.date >= ?'; params.push(from); }
  if (to)      { sql += ' AND tasks.date <= ?'; params.push(to); }
  if (search)  { sql += ' AND (tasks.task_title LIKE ? OR tasks.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY tasks.date DESC, tasks.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// Boss: edit any task
app.put('/api/tasks/:id', requireAuth, requireRole('boss'), (req, res) => {
  const { task_title, date, requestor, description, magnitude, duration } = req.body;
  db.prepare(
    'UPDATE tasks SET task_title=?, date=?, requestor=?, description=?, magnitude=?, duration=? WHERE id=?'
  ).run(task_title, date, requestor, description, magnitude || '', parseFloat(duration), req.params.id);
  const task = db.prepare('SELECT tasks.*, users.full_name FROM tasks JOIN users ON tasks.user_id = users.id WHERE tasks.id = ?').get(req.params.id);
  res.json(task);
});

// Boss: delete any task
app.delete('/api/tasks/:id', requireAuth, requireRole('boss'), (req, res) => {
  db.prepare('DELETE FROM comments WHERE task_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Member: edit own task (within same day)
app.put('/api/tasks/:id/mine', requireAuth, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  if (task.user_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });
  const { task_title, date, requestor, description, magnitude, duration } = req.body;
  db.prepare(
    'UPDATE tasks SET task_title=?, date=?, requestor=?, description=?, magnitude=?, duration=? WHERE id=?'
  ).run(task_title, date, requestor, description, magnitude || '', parseFloat(duration), req.params.id);
  const updated = db.prepare('SELECT tasks.*, users.full_name FROM tasks JOIN users ON tasks.user_id = users.id WHERE tasks.id = ?').get(req.params.id);
  res.json(updated);
});

// Member: delete own task
app.delete('/api/tasks/:id/mine', requireAuth, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  if (task.user_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM comments WHERE task_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Comments routes ───────────────────────────────────────────────────────────
app.get('/api/tasks/:id/comments', requireAuth, (req, res) => {
  const comments = db.prepare(
    'SELECT comments.*, users.full_name, users.role FROM comments JOIN users ON comments.user_id = users.id WHERE comments.task_id = ? ORDER BY comments.created_at ASC'
  ).all(req.params.id);
  res.json(comments);
});

app.post('/api/tasks/:id/comments', requireAuth, requireRole('boss', 'supervisor'), (req, res) => {
  const { comment } = req.body;
  if (!comment) return res.status(400).json({ error: 'Comment required' });
  const result = db.prepare(
    'INSERT INTO comments (task_id, user_id, comment) VALUES (?, ?, ?)'
  ).run(req.params.id, req.session.user.id, comment);
  const newComment = db.prepare(
    'SELECT comments.*, users.full_name, users.role FROM comments JOIN users ON comments.user_id = users.id WHERE comments.id = ?'
  ).get(result.lastInsertRowid);
  res.json(newComment);
});

app.delete('/api/comments/:id', requireAuth, requireRole('boss'), (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Analytics routes ───────────────────────────────────────────────────────────
app.get('/api/analytics/summary', requireAuth, requireRole('boss', 'supervisor'), (req, res) => {
  const { from, to } = req.query;
  let dateFilter = '';
  const params = [];
  if (from && to) { dateFilter = 'AND tasks.date BETWEEN ? AND ?'; params.push(from, to); }
  else if (from)  { dateFilter = 'AND tasks.date >= ?'; params.push(from); }
  else if (to)    { dateFilter = 'AND tasks.date <= ?'; params.push(to); }

  const totalTasks    = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE 1=1 ${dateFilter}`).get(...params);
  const totalHours    = db.prepare(`SELECT COALESCE(SUM(duration),0) as total FROM tasks WHERE 1=1 ${dateFilter}`).get(...params);
  const todayTasks    = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE date = date('now')`).get();
  const todayHours    = db.prepare(`SELECT COALESCE(SUM(duration),0) as total FROM tasks WHERE date = date('now')`).get();
  const perEmployee   = db.prepare(`
    SELECT users.id, users.full_name, COUNT(tasks.id) as task_count, COALESCE(SUM(tasks.duration),0) as total_hours
    FROM users LEFT JOIN tasks ON users.id = tasks.user_id AND 1=1 ${dateFilter}
    WHERE users.role = 'member'
    GROUP BY users.id ORDER BY total_hours DESC
  `).all(...params);
  const daily = db.prepare(`
    SELECT date, COUNT(*) as task_count, COALESCE(SUM(duration),0) as total_hours
    FROM tasks WHERE 1=1 ${dateFilter}
    GROUP BY date ORDER BY date DESC LIMIT 14
  `).all(...params);

  res.json({ totalTasks: totalTasks.count, totalHours: totalHours.total, todayTasks: todayTasks.count, todayHours: todayHours.total, perEmployee, daily });
});

// ── Users list (for filters) ───────────────────────────────────────────────────
app.get('/api/users', requireAuth, requireRole('boss', 'supervisor'), (req, res) => {
  const users = db.prepare("SELECT id, username, full_name, role FROM users WHERE role = 'member' ORDER BY full_name").all();
  res.json(users);
});

// Boss: change user password
app.put('/api/users/:id/password', requireAuth, requireRole('boss'), (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password too short' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`RISE Work Log running on port ${PORT}`));
