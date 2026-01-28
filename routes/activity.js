const express = require('express');
const db = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Almacen en memoria para actividad en tiempo real
const activityStatus = new Map();

// Tiempo en ms para considerar AFK (3 minutos sin actividad)
const AFK_THRESHOLD = 3 * 60 * 1000;
// Tiempo en ms para considerar desconectado (5 minutos sin heartbeat)
const OFFLINE_THRESHOLD = 5 * 60 * 1000;

// POST /api/activity/heartbeat - Reportar actividad
router.post('/heartbeat', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { isActive, lastActivity, idleTime } = req.body;

    const now = Date.now();

    activityStatus.set(userId, {
      userId,
      username: req.user.username,
      isActive: isActive !== false,
      lastHeartbeat: now,
      lastActivity: lastActivity || now,
      idleTime: idleTime || 0,
      status: isActive ? 'active' : (idleTime > AFK_THRESHOLD ? 'afk' : 'idle')
    });

    res.json({
      success: true,
      message: 'Heartbeat recibido'
    });
  } catch (error) {
    console.error('Error en heartbeat:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// POST /api/activity/afk - Reportar que el usuario esta AFK
router.post('/afk', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { idleTime } = req.body;

    const existing = activityStatus.get(userId) || {};

    activityStatus.set(userId, {
      ...existing,
      userId,
      username: req.user.username,
      isActive: false,
      lastHeartbeat: Date.now(),
      idleTime: idleTime || 0,
      status: 'afk',
      afkSince: existing.afkSince || Date.now()
    });

    // Guardar evento AFK en la base de datos
    db.insert('activity_logs', {
      user_id: userId,
      event: 'afk_start',
      idle_time: idleTime,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Estado AFK registrado'
    });
  } catch (error) {
    console.error('Error registrando AFK:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// POST /api/activity/back - Reportar que el usuario volvio
router.post('/back', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    const existing = activityStatus.get(userId) || {};
    const afkDuration = existing.afkSince ? Date.now() - existing.afkSince : 0;

    activityStatus.set(userId, {
      ...existing,
      userId,
      username: req.user.username,
      isActive: true,
      lastHeartbeat: Date.now(),
      lastActivity: Date.now(),
      idleTime: 0,
      status: 'active',
      afkSince: null
    });

    // Guardar evento de vuelta en la base de datos
    if (afkDuration > 0) {
      db.insert('activity_logs', {
        user_id: userId,
        event: 'afk_end',
        afk_duration: Math.round(afkDuration / 1000), // en segundos
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Estado activo registrado'
    });
  } catch (error) {
    console.error('Error registrando actividad:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/activity/status - Obtener estado de todos los usuarios (admin)
router.get('/status', authenticateToken, requireRole('admin', 'supervisor'), (req, res) => {
  try {
    const now = Date.now();
    const users = db.getAll('users').filter(u => u.role !== 'admin');

    const statuses = users.map(user => {
      const activity = activityStatus.get(user.id);

      if (!activity || (now - activity.lastHeartbeat > OFFLINE_THRESHOLD)) {
        return {
          userId: user.id,
          username: user.username,
          status: 'offline',
          statusLabel: 'Desconectado',
          idleTime: null,
          lastSeen: activity?.lastHeartbeat ? new Date(activity.lastHeartbeat).toISOString() : null
        };
      }

      const idleMinutes = Math.round(activity.idleTime / 60000);
      let statusLabel = 'Activo';

      if (activity.status === 'afk') {
        const afkMinutes = activity.afkSince ? Math.round((now - activity.afkSince) / 60000) : idleMinutes;
        statusLabel = `AFK (${afkMinutes} min)`;
      } else if (activity.idleTime > 60000) {
        statusLabel = `Inactivo (${idleMinutes} min)`;
      }

      return {
        userId: user.id,
        username: user.username,
        status: activity.status,
        statusLabel,
        idleTime: activity.idleTime,
        idleMinutes,
        lastActivity: new Date(activity.lastActivity).toISOString(),
        lastHeartbeat: new Date(activity.lastHeartbeat).toISOString(),
        afkSince: activity.afkSince ? new Date(activity.afkSince).toISOString() : null
      };
    });

    // Ordenar: AFK primero, luego inactivos, luego activos, desconectados al final
    const statusOrder = { afk: 0, idle: 1, active: 2, offline: 3 };
    statuses.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    res.json({
      success: true,
      data: {
        statuses,
        summary: {
          total: statuses.length,
          active: statuses.filter(s => s.status === 'active').length,
          idle: statuses.filter(s => s.status === 'idle').length,
          afk: statuses.filter(s => s.status === 'afk').length,
          offline: statuses.filter(s => s.status === 'offline').length
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo estados:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/activity/logs - Historial de actividad (admin)
router.get('/logs', authenticateToken, requireRole('admin', 'supervisor'), (req, res) => {
  try {
    const { userId, limit = 50 } = req.query;

    let logs = db.getAll('activity_logs') || [];

    if (userId) {
      logs = logs.filter(l => l.user_id === parseInt(userId));
    }

    // Ordenar por fecha descendente
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    logs = logs.slice(0, parseInt(limit));

    // Agregar nombres de usuario
    const users = db.getAll('users');
    logs = logs.map(log => {
      const user = users.find(u => u.id === log.user_id);
      return {
        ...log,
        username: user ? user.username : 'Desconocido'
      };
    });

    res.json({
      success: true,
      data: { logs }
    });
  } catch (error) {
    console.error('Error obteniendo logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

module.exports = router;
