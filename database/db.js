const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.json');

// Estructura inicial de la base de datos
const initialData = {
  users: [
    {
      id: 1,
      username: 'rock',
      email: 'rock@lovirtual.com',
      password: '$2a$10$9Dk9dcObPzZYCZo4cR6EFeGHZig5dHTpInP7q0ngvsLsJfZb3AYqK', // 123456
      role: 'employee',
      avatar: null,
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      username: 'admin',
      email: 'admin@lovirtual.com',
      password: '$2a$10$ZZsAjHNFfXEODMmXOCDnk.8yEqnmlNQYVwn7HqsSE/.AAIxG92ijG', // admin123
      role: 'admin',
      avatar: null,
      created_at: new Date().toISOString()
    }
  ],
  attendance: [],
  breaks: [],
  tasks: [],
  notes: [],
  incidents: [],
  permissions: [],
  announcements: [
    {
      id: 1,
      title: '¡Bienvenidos!',
      content: 'Hola. ¡Bienvenidos a LoVirtual! Gracias por ser parte de LoVirtual. Te apreciamos y estamos agradecidos de que seas parte de esta gran familia. Cualquier error que pueda presentar la plataforma, por favor reportarlo a su líder de equipo.',
      created_at: new Date(Date.now() - 38 * 24 * 60 * 60 * 1000).toISOString()
    }
  ],
  chat_messages: [],
  daily_reports: [],
  activity_logs: []
};

// Cargar o crear base de datos
function loadDb() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('Creando nueva base de datos...');
  }
  saveDb(initialData);
  return initialData;
}

// Guardar base de datos
function saveDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// Base de datos en memoria
let db = loadDb();

// Funciones de utilidad
const database = {
  // Obtener todos los registros de una tabla
  getAll(table) {
    return db[table] || [];
  },

  // Obtener por ID
  getById(table, id) {
    return db[table]?.find(item => item.id === id);
  },

  // Buscar con filtro
  find(table, predicate) {
    return db[table]?.filter(predicate) || [];
  },

  // Buscar uno
  findOne(table, predicate) {
    return db[table]?.find(predicate);
  },

  // Insertar
  insert(table, data) {
    const maxId = db[table]?.reduce((max, item) => Math.max(max, item.id || 0), 0) || 0;
    const newItem = { id: maxId + 1, ...data, created_at: data.created_at || new Date().toISOString() };
    db[table] = db[table] || [];
    db[table].push(newItem);
    saveDb(db);
    return newItem;
  },

  // Actualizar
  update(table, id, data) {
    const index = db[table]?.findIndex(item => item.id === id);
    if (index === -1) return null;
    db[table][index] = { ...db[table][index], ...data, updated_at: new Date().toISOString() };
    saveDb(db);
    return db[table][index];
  },

  // Eliminar
  delete(table, id) {
    const index = db[table]?.findIndex(item => item.id === id);
    if (index === -1) return false;
    db[table].splice(index, 1);
    saveDb(db);
    return true;
  },

  // Recargar desde archivo
  reload() {
    db = loadDb();
  }
};

module.exports = database;
