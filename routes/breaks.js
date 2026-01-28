const express = require('express');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Obtener fecha actual en formato YYYY-MM-DD
const getTodayDate = () => {
  return new Date().toISOString().split('T')[0];
};

// Tipos de break permitidos con duraciones maximas (en minutos)
const BREAK_TYPES = {
  break_am: { name: 'Break AM', maxDuration: 15 },
  lunch: { name: 'Almuerzo', maxDuration: 60 },
  break_pm: { name: 'Break PM', maxDuration: 15 },
  other: { name: 'Otro', maxDuration: 30 }
};

// POST /api/breaks/start - Iniciar un break
router.post('/start', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { type } = req.body;
    const today = getTodayDate();

    // Validar tipo de break
    if (!type || !BREAK_TYPES[type]) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de break invalido. Opciones: break_am, lunch, break_pm, other'
      });
    }

    // Verificar que hay una asistencia activa hoy
    const attendance = db.findOne('attendance', a =>
      a.user_id === userId && a.date === today && a.clock_in && !a.clock_out
    );

    if (!attendance) {
      return res.status(400).json({
        success: false,
        message: 'Debes tener un registro de entrada activo para iniciar un break'
      });
    }

    // Verificar que no hay un break activo
    const activeBreak = db.findOne('breaks', b =>
      b.user_id === userId && b.date === today && !b.end_time
    );

    if (activeBreak) {
      return res.status(400).json({
        success: false,
        message: `Ya tienes un break activo (${BREAK_TYPES[activeBreak.type].name}). Debes terminarlo primero.`
      });
    }

    // Verificar si ya tomo este tipo de break hoy (excepto 'other')
    if (type !== 'other') {
      const existingBreak = db.findOne('breaks', b =>
        b.user_id === userId && b.date === today && b.type === type
      );

      if (existingBreak) {
        return res.status(400).json({
          success: false,
          message: `Ya tomaste tu ${BREAK_TYPES[type].name} hoy`
        });
      }
    }

    // Crear nuevo break
    const newBreak = db.insert('breaks', {
      user_id: userId,
      type,
      start_time: new Date().toISOString(),
      date: today
    });

    res.status(201).json({
      success: true,
      message: `${BREAK_TYPES[type].name} iniciado`,
      data: {
        break: newBreak,
        maxDuration: BREAK_TYPES[type].maxDuration
      }
    });
  } catch (error) {
    console.error('Error iniciando break:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// POST /api/breaks/end - Terminar un break
router.post('/end', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const today = getTodayDate();

    // Buscar break activo
    const activeBreak = db.findOne('breaks', b =>
      b.user_id === userId && b.date === today && !b.end_time
    );

    if (!activeBreak) {
      return res.status(400).json({
        success: false,
        message: 'No tienes ningun break activo'
      });
    }

    // Calcular duracion
    const startTime = new Date(activeBreak.start_time);
    const endTime = new Date();
    const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

    // Actualizar break
    const updatedBreak = db.update('breaks', activeBreak.id, {
      end_time: new Date().toISOString(),
      duration_minutes: durationMinutes
    });

    const breakType = BREAK_TYPES[activeBreak.type];
    const isOvertime = durationMinutes > breakType.maxDuration;

    res.json({
      success: true,
      message: isOvertime
        ? `${breakType.name} terminado. Duracion: ${durationMinutes} min (excedido por ${durationMinutes - breakType.maxDuration} min)`
        : `${breakType.name} terminado. Duracion: ${durationMinutes} minutos`,
      data: {
        break: updatedBreak,
        duration: durationMinutes,
        isOvertime,
        overtime: isOvertime ? durationMinutes - breakType.maxDuration : 0
      }
    });
  } catch (error) {
    console.error('Error terminando break:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/breaks/today - Obtener breaks de hoy
router.get('/today', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const today = getTodayDate();

    const breaks = db.find('breaks', b => b.user_id === userId && b.date === today)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    // Verificar si hay un break activo
    const activeBreak = breaks.find(b => !b.end_time);

    // Calcular resumen
    const completedBreaks = breaks.filter(b => b.end_time);
    const totalBreakMinutes = completedBreaks.reduce((sum, b) => sum + (b.duration_minutes || 0), 0);

    // Verificar que breaks estan disponibles
    const takenBreakTypes = breaks.map(b => b.type);
    const availableBreaks = Object.keys(BREAK_TYPES)
      .filter(type => type === 'other' || !takenBreakTypes.includes(type))
      .map(type => ({ type, ...BREAK_TYPES[type] }));

    res.json({
      success: true,
      data: {
        breaks,
        activeBreak: activeBreak || null,
        summary: {
          totalBreaks: breaks.length,
          totalMinutes: totalBreakMinutes,
          formattedTime: `${Math.floor(totalBreakMinutes / 60)}h ${totalBreakMinutes % 60}m`
        },
        availableBreaks
      }
    });
  } catch (error) {
    console.error('Error obteniendo breaks de hoy:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/breaks/active - Verificar si hay un break activo
router.get('/active', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const today = getTodayDate();

    const activeBreak = db.findOne('breaks', b =>
      b.user_id === userId && b.date === today && !b.end_time
    );

    if (!activeBreak) {
      return res.json({
        success: true,
        data: { active: false, break: null }
      });
    }

    // Calcular tiempo transcurrido
    const startTime = new Date(activeBreak.start_time);
    const elapsedMinutes = Math.round((new Date() - startTime) / (1000 * 60));
    const breakType = BREAK_TYPES[activeBreak.type];

    res.json({
      success: true,
      data: {
        active: true,
        break: activeBreak,
        elapsedMinutes,
        maxDuration: breakType.maxDuration,
        isOvertime: elapsedMinutes > breakType.maxDuration
      }
    });
  } catch (error) {
    console.error('Error verificando break activo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/breaks/history - Historial de breaks
router.get('/history', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { limit = 50, offset = 0, from, to } = req.query;

    let history = db.find('breaks', b => b.user_id === userId);

    // Filtrar por fechas
    if (from) {
      history = history.filter(b => b.date >= from);
    }
    if (to) {
      history = history.filter(b => b.date <= to);
    }

    // Ordenar por fecha y hora descendente
    history.sort((a, b) => {
      const dateCompare = new Date(b.date) - new Date(a.date);
      if (dateCompare !== 0) return dateCompare;
      return new Date(b.start_time) - new Date(a.start_time);
    });

    // Aplicar paginacion
    history = history.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: { history }
    });
  } catch (error) {
    console.error('Error obteniendo historial de breaks:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/breaks/all - Obtener todos los breaks (admin)
router.get('/all', authenticateToken, (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'supervisor';

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver esta informacion'
      });
    }

    const { date } = req.query;
    const targetDate = date || getTodayDate();

    let breaks = db.find('breaks', b => b.date === targetDate);

    // Agregar info de usuarios
    const users = db.getAll('users');
    breaks = breaks.map(b => {
      const user = users.find(u => u.id === b.user_id);
      return {
        ...b,
        username: user ? user.username : 'Desconocido',
        break_type_name: BREAK_TYPES[b.type]?.name || b.type
      };
    });

    // Ordenar por hora de inicio
    breaks.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

    res.json({
      success: true,
      data: {
        breaks,
        date: targetDate
      }
    });
  } catch (error) {
    console.error('Error obteniendo breaks:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

module.exports = router;
