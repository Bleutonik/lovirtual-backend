const express = require('express');
const db = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Tipos de permisos
const PERMISSION_TYPES = {
  vacation: 'Vacaciones',
  sick_leave: 'Licencia por Enfermedad',
  personal: 'Permiso Personal',
  maternity: 'Licencia de Maternidad',
  paternity: 'Licencia de Paternidad',
  bereavement: 'Licencia por Duelo',
  other: 'Otro'
};

// Calcular dias entre dos fechas
const calculateDays = (from, to) => {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diffTime = Math.abs(toDate - fromDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// GET /api/permissions - Obtener permisos del usuario
router.get('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { status, limit = 50, offset = 0 } = req.query;

    let permissions = db.find('permissions', p => p.user_id === userId);

    // Filtrar por status
    if (status) {
      permissions = permissions.filter(p => p.status === status);
    }

    // Ordenar por fecha de solicitud descendente
    permissions.sort((a, b) => new Date(b.date_requested || b.created_at) - new Date(a.date_requested || a.created_at));

    // Aplicar paginacion
    permissions = permissions.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: {
        permissions,
        types: PERMISSION_TYPES
      }
    });
  } catch (error) {
    console.error('Error obteniendo permisos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/permissions/all - Obtener todos los permisos (admin/supervisor)
router.get('/all', authenticateToken, requireRole('admin', 'supervisor'), (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;

    let permissions = db.getAll('permissions');

    // Filtrar por status
    if (status) {
      permissions = permissions.filter(p => p.status === status);
    }

    // Ordenar por fecha de solicitud descendente
    permissions.sort((a, b) => new Date(b.date_requested || b.created_at) - new Date(a.date_requested || a.created_at));

    // Agregar info de usuarios
    const users = db.getAll('users');
    permissions = permissions.map(p => {
      const user = users.find(u => u.id === p.user_id);
      const approver = p.approved_by ? users.find(u => u.id === p.approved_by) : null;
      return {
        ...p,
        username: user ? user.username : 'Unknown',
        first_name: user ? user.first_name : null,
        last_name: user ? user.last_name : null,
        department: user ? user.department : null,
        approved_by_username: approver ? approver.username : null
      };
    });

    // Aplicar paginacion
    permissions = permissions.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: {
        permissions,
        types: PERMISSION_TYPES
      }
    });
  } catch (error) {
    console.error('Error obteniendo permisos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/permissions/pending - Permisos pendientes de aprobar
router.get('/pending', authenticateToken, requireRole('admin', 'supervisor'), (req, res) => {
  try {
    let permissions = db.find('permissions', p => p.status === 'pending');

    // Ordenar por fecha de solicitud ascendente (los mas viejos primero)
    permissions.sort((a, b) => new Date(a.date_requested || a.created_at) - new Date(b.date_requested || b.created_at));

    // Agregar info de usuarios
    const users = db.getAll('users');
    permissions = permissions.map(p => {
      const user = users.find(u => u.id === p.user_id);
      return {
        ...p,
        username: user ? user.username : 'Unknown',
        first_name: user ? user.first_name : null,
        last_name: user ? user.last_name : null,
        department: user ? user.department : null
      };
    });

    res.json({
      success: true,
      data: { permissions }
    });
  } catch (error) {
    console.error('Error obteniendo permisos pendientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/permissions/:id - Obtener un permiso
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'supervisor';

    const permission = db.getById('permissions', req.params.id);

    if (!permission) {
      return res.status(404).json({
        success: false,
        message: 'Permiso no encontrado'
      });
    }

    // Verificar permisos de acceso
    if (!isAdmin && permission.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver esta solicitud'
      });
    }

    // Agregar info del aprobador
    if (permission.approved_by) {
      const users = db.getAll('users');
      const approver = users.find(u => u.id === permission.approved_by);
      permission.approved_by_username = approver ? approver.username : null;
    }

    res.json({
      success: true,
      data: { permission }
    });
  } catch (error) {
    console.error('Error obteniendo permiso:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// POST /api/permissions - Solicitar permiso
router.post('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { type, reason, date_from, date_to } = req.body;

    if (!type || !date_from || !date_to) {
      return res.status(400).json({
        success: false,
        message: 'Tipo, fecha de inicio y fecha de fin son requeridos'
      });
    }

    if (!PERMISSION_TYPES[type]) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de permiso invalido'
      });
    }

    if (new Date(date_from) > new Date(date_to)) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de inicio no puede ser mayor a la fecha de fin'
      });
    }

    const daysRequested = calculateDays(date_from, date_to);

    const permission = db.insert('permissions', {
      user_id: userId,
      type,
      reason: reason || null,
      date_from,
      date_to,
      days_requested: daysRequested,
      status: 'pending',
      date_requested: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'Solicitud de permiso enviada',
      data: { permission }
    });
  } catch (error) {
    console.error('Error creando permiso:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// PUT /api/permissions/:id/approve - Aprobar permiso
router.put('/:id/approve', authenticateToken, requireRole('admin', 'supervisor'), (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const permission = db.getById('permissions', req.params.id);

    if (!permission) {
      return res.status(404).json({
        success: false,
        message: 'Permiso no encontrado'
      });
    }

    if (permission.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Este permiso ya fue procesado'
      });
    }

    const updated = db.update('permissions', req.params.id, {
      status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Permiso aprobado',
      data: { permission: updated }
    });
  } catch (error) {
    console.error('Error aprobando permiso:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// PUT /api/permissions/:id/reject - Rechazar permiso
router.put('/:id/reject', authenticateToken, requireRole('admin', 'supervisor'), (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { rejection_reason } = req.body;

    const permission = db.getById('permissions', req.params.id);

    if (!permission) {
      return res.status(404).json({
        success: false,
        message: 'Permiso no encontrado'
      });
    }

    if (permission.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Este permiso ya fue procesado'
      });
    }

    const updated = db.update('permissions', req.params.id, {
      status: 'rejected',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      rejection_reason: rejection_reason || null
    });

    res.json({
      success: true,
      message: 'Permiso rechazado',
      data: { permission: updated }
    });
  } catch (error) {
    console.error('Error rechazando permiso:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// PUT /api/permissions/:id/cancel - Cancelar solicitud propia
router.put('/:id/cancel', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    const permission = db.findOne('permissions', p => p.id === req.params.id && p.user_id === userId);

    if (!permission) {
      return res.status(404).json({
        success: false,
        message: 'Permiso no encontrado'
      });
    }

    if (permission.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Solo puedes cancelar solicitudes pendientes'
      });
    }

    const updated = db.update('permissions', req.params.id, {
      status: 'cancelled'
    });

    res.json({
      success: true,
      message: 'Solicitud cancelada',
      data: { permission: updated }
    });
  } catch (error) {
    console.error('Error cancelando permiso:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

module.exports = router;
