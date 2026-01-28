const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new Database(dbPath);

// Habilitar foreign keys
db.pragma('foreign_keys = ON');

console.log('Inicializando base de datos...');

// Crear tabla de usuarios
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'employee' CHECK(role IN ('admin', 'supervisor', 'employee')),
    avatar TEXT,
    first_name TEXT,
    last_name TEXT,
    department TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Crear tabla de asistencia
db.exec(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    clock_in DATETIME,
    clock_out DATETIME,
    date DATE NOT NULL,
    total_hours REAL,
    status TEXT DEFAULT 'present' CHECK(status IN ('present', 'late', 'absent', 'half_day')),
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
  )
`);

// Crear tabla de breaks/descansos
db.exec(`
  CREATE TABLE IF NOT EXISTS breaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('break_am', 'lunch', 'break_pm', 'other')),
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    date DATE NOT NULL,
    duration_minutes INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Crear tabla de tareas
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
    due_date DATE,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Crear tabla de notas
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    color TEXT DEFAULT '#ffffff',
    is_pinned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Crear tabla de incidentes
db.exec(`
  CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general' CHECK(category IN ('technical', 'hr', 'safety', 'general', 'other')),
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_review', 'resolved', 'closed')),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
    resolved_at DATETIME,
    resolved_by INTEGER,
    resolution_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_by) REFERENCES users(id)
  )
`);

// Crear tabla de permisos/solicitudes
db.exec(`
  CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('vacation', 'sick_leave', 'personal', 'maternity', 'paternity', 'bereavement', 'other')),
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
    date_requested DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    days_requested INTEGER,
    approved_by INTEGER,
    approved_at DATETIME,
    rejection_reason TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id)
  )
`);

// Crear tabla de anuncios
db.exec(`
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general' CHECK(category IN ('general', 'important', 'urgent', 'event', 'policy')),
    author_id INTEGER,
    is_active INTEGER DEFAULT 1,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id)
  )
`);

// Crear tabla de mensajes de chat
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    message_type TEXT DEFAULT 'text' CHECK(message_type IN ('text', 'image', 'file', 'system')),
    is_edited INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Crear indices para mejorar rendimiento
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_breaks_user_date ON breaks(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
  CREATE INDEX IF NOT EXISTS idx_incidents_user_status ON incidents(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_permissions_user_status ON permissions(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
`);

// Crear usuario demo "rock" con password "123456"
const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get('rock');

if (!existingUser) {
  const hashedPassword = bcrypt.hashSync('123456', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password, role, first_name, last_name, department)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    'rock',
    'rock@mitrabajovirtual.com',
    hashedPassword,
    'employee',
    'Rock',
    'Usuario',
    'Desarrollo'
  );

  console.log('Usuario demo creado: username="rock", password="123456"');
}

// Crear usuario admin de ejemplo
const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');

if (!existingAdmin) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password, role, first_name, last_name, department)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    'admin',
    'admin@mitrabajovirtual.com',
    hashedPassword,
    'admin',
    'Administrador',
    'Sistema',
    'Administracion'
  );

  console.log('Usuario admin creado: username="admin", password="admin123"');
}

// Crear algunos anuncios de ejemplo
const existingAnnouncements = db.prepare('SELECT COUNT(*) as count FROM announcements').get();

if (existingAnnouncements.count === 0) {
  const insertAnnouncement = db.prepare(`
    INSERT INTO announcements (title, content, category, author_id)
    VALUES (?, ?, ?, ?)
  `);

  insertAnnouncement.run(
    'Bienvenidos a Mi Trabajo Virtual',
    'Este es el nuevo sistema de gestion de trabajo virtual. Por favor, registra tu asistencia diariamente.',
    'general',
    2
  );

  insertAnnouncement.run(
    'Recordatorio de Horarios',
    'Recuerda registrar tu entrada antes de las 9:00 AM y tu salida al finalizar tu jornada.',
    'important',
    2
  );

  console.log('Anuncios de ejemplo creados');
}

console.log('Base de datos inicializada correctamente!');
console.log(`Ubicacion: ${dbPath}`);

db.close();

module.exports = { dbPath };
