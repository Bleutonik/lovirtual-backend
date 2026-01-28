require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Importar rutas
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const attendanceRoutes = require('./routes/attendance');
const breaksRoutes = require('./routes/breaks');
const tasksRoutes = require('./routes/tasks');
const notesRoutes = require('./routes/notes');
const incidentsRoutes = require('./routes/incidents');
const permissionsRoutes = require('./routes/permissions');
const announcementsRoutes = require('./routes/announcements');
const chatRoutes = require('./routes/chat');
const activityRoutes = require('./routes/activity');

const app = express();
const PORT = process.env.PORT || 3001;

// Lista de origenes permitidos
const allowedOrigins = [
  'https://lovirtual-test-one.vercel.app',
  'https://lovirtual.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:3000'
];

// Middleware de seguridad
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Configuracion de CORS
app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(null, true); // Permitir todos por ahora para debug
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id']
}));

// Manejar preflight requests
app.options('*', cors());

// Parser de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging de requests en desarrollo
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
  });
}

// Ruta de salud/status
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Mi Trabajo Virtual API funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Registrar rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/breaks', breaksRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/activity', activityRoutes);

// Ruta 404 para API
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Error de JSON mal formado
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'JSON invalido en el cuerpo de la peticion'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('   MI TRABAJO VIRTUAL - Backend API');
  console.log('='.repeat(50));
  console.log(`   Servidor corriendo en puerto: ${PORT}`);
  console.log(`   CORS habilitado para: todos los origenes`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(50));
  console.log('');
  console.log('Endpoints disponibles:');
  console.log('  - GET  /api/health          - Estado del servidor');
  console.log('  - POST /api/auth/login      - Iniciar sesion');
  console.log('  - POST /api/auth/register   - Registrar usuario');
  console.log('  - GET  /api/auth/me         - Usuario actual');
  console.log('  - *    /api/users           - Gestion de usuarios');
  console.log('  - *    /api/attendance      - Control de asistencia');
  console.log('  - *    /api/breaks          - Gestion de descansos');
  console.log('  - *    /api/tasks           - Gestion de tareas');
  console.log('  - *    /api/notes           - Notas personales');
  console.log('  - *    /api/incidents       - Reporte de incidentes');
  console.log('  - *    /api/permissions     - Solicitud de permisos');
  console.log('  - *    /api/announcements   - Anuncios');
  console.log('  - *    /api/chat            - Chat grupal');
  console.log('');
  console.log('Usuario demo: username="rock", password="123456"');
  console.log('Usuario admin: username="admin", password="admin123"');
  console.log('='.repeat(50));
});

module.exports = app;
