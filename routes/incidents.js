const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Aplicar autenticacion a todas las rutas
router.use(authenticateToken);

// GET / - Listar incidentes
router.get('/', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { status, category } = req.query;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'supervisor';

    let incidents = db.getAll('incidents');

    // Si no es admin, solo ver sus propios incidentes
    if (!isAdmin) {
      incidents = incidents.filter(i => i.user_id === userId);
    }

    // Filtrar por status
    if (status) {
      incidents = incidents.filter(i => i.status === status);
    }

    // Filtrar por category
    if (category) {
      incidents = incidents.filter(i => i.category === category);
    }

    // Ordenar por fecha de creacion descendente
    incidents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Agregar info de usuarios (si tenemos acceso)
    const users = db.getAll('users');
    incidents = incidents.map(i => {
      const reporter = users.find(u => u.id === i.user_id);
      const resolver = i.resolved_by ? users.find(u => u.id === i.resolved_by) : null;
      return {
        ...i,
        reported_by: reporter ? reporter.username : 'Unknown',
        resolved_by_username: resolver ? resolver.username : null
      };
    });

    res.json({
      success: true,
      data: incidents
    });
  } catch (error) {
    console.error('Error al listar incidentes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los incidentes'
    });
  }
});

// POST / - Reportar incidente
router.post('/', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { title, description, category, priority } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: 'El titulo y la descripcion son requeridos'
      });
    }

    const validCategories = ['technical', 'hr', 'safety', 'general', 'other'];
    const validPriorities = ['low', 'medium', 'high', 'critical'];

    const incidentCategory = validCategories.includes(category) ? category : 'general';
    const incidentPriority = validPriorities.includes(priority) ? priority : 'medium';

    const newIncident = db.insert('incidents', {
      user_id: userId,
      title,
      description,
      category: incidentCategory,
      priority: incidentPriority,
      status: 'open'
    });

    // Agregar info del usuario que reporta
    const users = db.getAll('users');
    const reporter = users.find(u => u.id === userId);

    res.status(201).json({
      success: true,
      message: 'Incidente reportado exitosamente',
      data: {
        ...newIncident,
        reported_by: reporter ? reporter.username : 'Unknown'
      }
    });
  } catch (error) {
    console.error('Error al reportar incidente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reportar el incidente'
    });
  }
});

// PUT /:id/status - Actualizar estado del incidente
router.put('/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;
    const { status, resolution_notes } = req.body;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'supervisor';

    // Verificar que el incidente existe
    const existingIncident = db.getById('incidents', id);

    if (!existingIncident) {
      return res.status(404).json({
        success: false,
        message: 'Incidente no encontrado'
      });
    }

    // Solo admin/supervisor puede cambiar estado, o el usuario puede cancelar su propio incidente
    if (!isAdmin && existingIncident.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para modificar este incidente'
      });
    }

    const validStatuses = ['open', 'in_review', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Estado invalido'
      });
    }

    // Si no es admin, solo puede poner en 'open' o 'closed'
    if (!isAdmin && !['open', 'closed'].includes(status)) {
      return res.status(403).json({
        success: false,
        message: 'Solo puedes abrir o cerrar tu propio incidente'
      });
    }

    const updates = {
      status,
      resolution_notes: resolution_notes || existingIncident.resolution_notes
    };

    // Si se resuelve, registrar quien y cuando
    if (status === 'resolved' && existingIncident.status !== 'resolved') {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = userId;
    }

    const updatedIncident = db.update('incidents', id, updates);

    // Agregar info de usuarios
    const users = db.getAll('users');
    const reporter = users.find(u => u.id === updatedIncident.user_id);
    const resolver = updatedIncident.resolved_by ? users.find(u => u.id === updatedIncident.resolved_by) : null;

    res.json({
      success: true,
      message: 'Estado del incidente actualizado',
      data: {
        ...updatedIncident,
        reported_by: reporter ? reporter.username : 'Unknown',
        resolved_by_username: resolver ? resolver.username : null
      }
    });
  } catch (error) {
    console.error('Error al actualizar estado del incidente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el estado del incidente'
    });
  }
});

module.exports = router;
