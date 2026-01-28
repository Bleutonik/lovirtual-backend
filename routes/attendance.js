const express = require('express');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Obtener fecha actual en formato YYYY-MM-DD
const getTodayDate = () => {
  return new Date().toISOString().split('T')[0];
};

// POST /api/attendance/clock-in - Registrar entrada
router.post('/clock-in', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const today = getTodayDate();

    // Verificar si ya hay un registro de hoy
    const existingAttendance = db.findOne('attendance', a => a.user_id === userId && a.date === today);

    if (existingAttendance) {
      if (existingAttendance.clock_in && !existingAttendance.clock_out) {
        return res.status(400).json({
          success: false,
          message: 'Ya registraste tu entrada hoy. Debes registrar tu salida primero.'
        });
      }

      if (existingAttendance.clock_out) {
        return res.status(400).json({
          success: false,
          message: 'Ya completaste tu jornada de hoy'
        });
      }
    }

    // Determinar estado (llegada tarde si es despues de las 9:00)
    const currentHour = new Date().getHours();
    const status = currentHour >= 9 ? 'late' : 'present';

    // Crear nuevo registro de asistencia
    const attendance = db.insert('attendance', {
      user_id: userId,
      clock_in: new Date().toISOString(),
      date: today,
      status
    });

    res.status(201).json({
      success: true,
      message: status === 'late' ? 'Entrada registrada (llegada tarde)' : 'Entrada registrada exitosamente',
      data: { attendance }
    });
  } catch (error) {
    console.error('Error en clock-in:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// POST /api/attendance/clock-out - Registrar salida
router.post('/clock-out', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const today = getTodayDate();

    // Buscar registro de hoy
    const attendance = db.findOne('attendance', a =>
      a.user_id === userId && a.date === today && a.clock_in && !a.clock_out
    );

    if (!attendance) {
      return res.status(400).json({
        success: false,
        message: 'No hay registro de entrada para hoy'
      });
    }

    // Calcular horas trabajadas
    const clockIn = new Date(attendance.clock_in);
    const clockOut = new Date();
    const diffMs = clockOut - clockIn;
    const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;

    // Actualizar registro
    const updatedAttendance = db.update('attendance', attendance.id, {
      clock_out: new Date().toISOString(),
      total_hours: totalHours
    });

    res.json({
      success: true,
      message: 'Salida registrada exitosamente',
      data: {
        attendance: updatedAttendance,
        totalHours: `${Math.floor(totalHours)}h ${Math.round((totalHours % 1) * 60)}m`
      }
    });
  } catch (error) {
    console.error('Error en clock-out:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/attendance/today - Obtener registro de hoy
router.get('/today', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const today = getTodayDate();

    const attendance = db.findOne('attendance', a => a.user_id === userId && a.date === today);

    // Obtener breaks de hoy
    const breaks = db.find('breaks', b => b.user_id === userId && b.date === today)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    res.json({
      success: true,
      data: {
        attendance: attendance || null,
        breaks,
        date: today
      }
    });
  } catch (error) {
    console.error('Error obteniendo asistencia de hoy:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/attendance/history - Historial de asistencia
router.get('/history', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { limit = 30, offset = 0, from, to } = req.query;

    let history = db.find('attendance', a => a.user_id === userId);

    // Filtrar por fechas
    if (from) {
      history = history.filter(a => a.date >= from);
    }
    if (to) {
      history = history.filter(a => a.date <= to);
    }

    // Ordenar por fecha descendente
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = history.length;

    // Aplicar paginacion
    history = history.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: {
        history,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + history.length < total
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/attendance/stats - Estadisticas del mes
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { month, year } = req.query;

    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();

    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-31`;

    const monthRecords = db.find('attendance', a =>
      a.user_id === userId && a.date >= startDate && a.date <= endDate
    );

    const stats = {
      totalDays: monthRecords.length,
      presentDays: monthRecords.filter(a => a.status === 'present').length,
      lateDays: monthRecords.filter(a => a.status === 'late').length,
      absentDays: monthRecords.filter(a => a.status === 'absent').length,
      avgHours: monthRecords.length > 0
        ? Math.round(monthRecords.reduce((sum, a) => sum + (a.total_hours || 0), 0) / monthRecords.length * 100) / 100
        : 0,
      totalHours: monthRecords.reduce((sum, a) => sum + (a.total_hours || 0), 0)
    };

    res.json({
      success: true,
      data: {
        stats,
        period: {
          month: targetMonth,
          year: targetYear
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadisticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/attendance/all - Obtener toda la asistencia (admin)
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

    let attendance = db.find('attendance', a => a.date === targetDate);

    // Agregar info de usuarios
    const users = db.getAll('users');
    attendance = attendance.map(a => {
      const user = users.find(u => u.id === a.user_id);
      return {
        ...a,
        username: user ? user.username : 'Desconocido',
        user_email: user ? user.email : null
      };
    });

    // Obtener breaks de hoy para cada usuario
    const breaks = db.find('breaks', b => b.date === targetDate);

    attendance = attendance.map(a => {
      const userBreaks = breaks.filter(b => b.user_id === a.user_id);
      return {
        ...a,
        breaks: userBreaks
      };
    });

    res.json({
      success: true,
      data: {
        attendance,
        date: targetDate
      }
    });
  } catch (error) {
    console.error('Error obteniendo asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

module.exports = router;
