const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Aplicar autenticacion a todas las rutas
router.use(authenticateToken);

// GET / - Listar notas del usuario
router.get('/', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { pinned } = req.query;

    let notes = db.find('notes', n => n.user_id === userId);

    // Filtrar por pinned
    if (pinned !== undefined) {
      const isPinned = pinned === 'true' || pinned === true;
      notes = notes.filter(n => n.is_pinned === isPinned || n.is_pinned === (isPinned ? 1 : 0));
    }

    // Ordenar por pinned primero, luego por fecha de actualizacion
    notes.sort((a, b) => {
      const pinnedA = a.is_pinned ? 1 : 0;
      const pinnedB = b.is_pinned ? 1 : 0;
      if (pinnedB !== pinnedA) return pinnedB - pinnedA;
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });

    res.json({
      success: true,
      data: notes
    });
  } catch (error) {
    console.error('Error al listar notas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las notas'
    });
  }
});

// POST / - Crear nota
router.post('/', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { title, content, color, is_pinned } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'El titulo es requerido'
      });
    }

    const newNote = db.insert('notes', {
      user_id: userId,
      title,
      content: content || null,
      color: color || '#ffffff',
      is_pinned: is_pinned ? true : false
    });

    res.status(201).json({
      success: true,
      message: 'Nota creada exitosamente',
      data: newNote
    });
  } catch (error) {
    console.error('Error al crear nota:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear la nota'
    });
  }
});

// PUT /:id - Actualizar nota
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;
    const { title, content, color, is_pinned } = req.body;

    // Verificar que la nota existe y pertenece al usuario
    const existingNote = db.findOne('notes', n => n.id === id && n.user_id === userId);

    if (!existingNote) {
      return res.status(404).json({
        success: false,
        message: 'Nota no encontrada'
      });
    }

    const updates = {
      title: title || existingNote.title,
      content: content !== undefined ? content : existingNote.content,
      color: color || existingNote.color,
      is_pinned: is_pinned !== undefined ? (is_pinned ? true : false) : existingNote.is_pinned,
      updated_at: new Date().toISOString()
    };

    const updatedNote = db.update('notes', id, updates);

    res.json({
      success: true,
      message: 'Nota actualizada exitosamente',
      data: updatedNote
    });
  } catch (error) {
    console.error('Error al actualizar nota:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la nota'
    });
  }
});

// DELETE /:id - Eliminar nota
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;

    // Verificar que la nota existe y pertenece al usuario
    const existingNote = db.findOne('notes', n => n.id === id && n.user_id === userId);

    if (!existingNote) {
      return res.status(404).json({
        success: false,
        message: 'Nota no encontrada'
      });
    }

    db.delete('notes', id);

    res.json({
      success: true,
      message: 'Nota eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar nota:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la nota'
    });
  }
});

module.exports = router;
