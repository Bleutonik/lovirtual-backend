const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Aplicar autenticacion a todas las rutas
router.use(authenticateToken);

// Helper para obtener la fecha actual en formato YYYY-MM-DD
const getTodayDate = () => {
  return new Date().toISOString().split('T')[0];
};

// POST /daily - Crear o actualizar reporte diario
router.post('/daily', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { tasks_completed, tasks_in_progress, tasks_planned, blockers, notes, mood, date } = req.body;

    const reportDate = date || getTodayDate();

    // Verificar si ya existe un reporte para hoy
    const existingReport = db.findOne('daily_reports', r => r.user_id === userId && r.date === reportDate);

    if (existingReport) {
      // Actualizar reporte existente
      const updates = {
        tasks_completed: tasks_completed || existingReport.tasks_completed,
        tasks_in_progress: tasks_in_progress || existingReport.tasks_in_progress,
        tasks_planned: tasks_planned || existingReport.tasks_planned,
        blockers: blockers !== undefined ? blockers : existingReport.blockers,
        notes: notes !== undefined ? notes : existingReport.notes,
        mood: mood || existingReport.mood,
        updated_at: new Date().toISOString()
      };

      const updatedReport = db.update('daily_reports', existingReport.id, updates);

      return res.json({
        success: true,
        message: 'Reporte diario actualizado',
        data: updatedReport
      });
    }

    // Crear nuevo reporte
    const validMoods = ['great', 'good', 'okay', 'bad', 'terrible'];
    const reportMood = validMoods.includes(mood) ? mood : null;

    const newReport = db.insert('daily_reports', {
      user_id: userId,
      date: reportDate,
      tasks_completed: tasks_completed || null,
      tasks_in_progress: tasks_in_progress || null,
      tasks_planned: tasks_planned || null,
      blockers: blockers || null,
      notes: notes || null,
      mood: reportMood
    });

    res.status(201).json({
      success: true,
      message: 'Reporte diario creado',
      data: newReport
    });
  } catch (error) {
    console.error('Error al crear reporte diario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el reporte diario'
    });
  }
});

// GET /daily - Obtener reportes del usuario
router.get('/daily', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { from, to, limit, user_id } = req.query;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'supervisor';

    let reports;

    // Si es admin y se especifica user_id, mostrar reportes de ese usuario
    if (isAdmin && user_id) {
      reports = db.find('daily_reports', r => r.user_id === user_id);
    } else if (isAdmin && !user_id) {
      // Admin sin filtro de user_id ve todos los reportes
      reports = db.getAll('daily_reports');
    } else {
      // Usuario normal solo ve sus propios reportes
      reports = db.find('daily_reports', r => r.user_id === userId);
    }

    // Filtrar por fechas
    if (from) {
      reports = reports.filter(r => r.date >= from);
    }
    if (to) {
      reports = reports.filter(r => r.date <= to);
    }

    // Ordenar por fecha descendente
    reports.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Aplicar limite
    if (limit) {
      reports = reports.slice(0, parseInt(limit));
    }

    // Agregar info de usuarios
    const users = db.getAll('users');
    reports = reports.map(r => {
      const user = users.find(u => u.id === r.user_id);
      return {
        ...r,
        username: user ? user.username : 'Unknown',
        first_name: user ? user.first_name : null,
        last_name: user ? user.last_name : null
      };
    });

    res.json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error('Error al obtener reportes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los reportes'
    });
  }
});

// GET /daily/today - Reporte de hoy
router.get('/daily/today', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const today = getTodayDate();

    const report = db.findOne('daily_reports', r => r.user_id === userId && r.date === today);

    if (!report) {
      return res.json({
        success: true,
        data: null,
        message: 'No hay reporte para hoy'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error al obtener reporte de hoy:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el reporte de hoy'
    });
  }
});

// GET /daily/:date - Reporte de una fecha especifica
router.get('/daily/:date', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { date } = req.params;

    // Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de fecha invalido. Use YYYY-MM-DD'
      });
    }

    const report = db.findOne('daily_reports', r => r.user_id === userId && r.date === date);

    if (!report) {
      return res.json({
        success: true,
        data: null,
        message: `No hay reporte para ${date}`
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error al obtener reporte:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el reporte'
    });
  }
});

// GET /summary - Resumen de reportes (admin)
router.get('/summary', requireRole('admin', 'supervisor'), (req, res) => {
  try {
    const { from, to } = req.query;
    const today = getTodayDate();

    const dateFrom = from || today;
    const dateTo = to || today;

    const users = db.getAll('users').filter(u => u.role !== 'admin');
    const reports = db.getAll('daily_reports').filter(r => r.date >= dateFrom && r.date <= dateTo);

    // Obtener resumen de reportes por usuario
    const summary = users.map(u => {
      const userReports = reports.filter(r => r.user_id === u.id);
      const moods = [...new Set(userReports.map(r => r.mood).filter(m => m))];

      return {
        user_id: u.id,
        username: u.username,
        first_name: u.first_name,
        last_name: u.last_name,
        total_reports: userReports.length,
        moods: moods.join(',')
      };
    });

    // Obtener usuarios que no han enviado reporte hoy
    const todayReporters = reports.filter(r => r.date === today).map(r => r.user_id);
    const missingToday = users
      .filter(u => !todayReporters.includes(u.id))
      .map(u => ({
        id: u.id,
        username: u.username,
        first_name: u.first_name,
        last_name: u.last_name
      }));

    res.json({
      success: true,
      data: {
        summary,
        missing_today: missingToday,
        date_range: { from: dateFrom, to: dateTo }
      }
    });
  } catch (error) {
    console.error('Error al obtener resumen:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el resumen'
    });
  }
});

module.exports = router;
