const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Aplicar autenticacion a todas las rutas
router.use(authenticateToken);

// GET / - Listar tareas del usuario
router.get('/', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { status, priority } = req.query;

    let tasks = db.find('tasks', t => t.user_id === userId);

    // Filtrar por status
    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }

    // Filtrar por priority
    if (priority) {
      tasks = tasks.filter(t => t.priority === priority);
    }

    // Ordenar por fecha de creacion descendente
    tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    console.error('Error al listar tareas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las tareas'
    });
  }
});

// POST / - Crear tarea
router.post('/', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { title, description, priority, due_date } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'El titulo es requerido'
      });
    }

    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    const taskPriority = validPriorities.includes(priority) ? priority : 'medium';

    const newTask = db.insert('tasks', {
      user_id: userId,
      title,
      description: description || null,
      status: 'pending',
      priority: taskPriority,
      due_date: due_date || null
    });

    res.status(201).json({
      success: true,
      message: 'Tarea creada exitosamente',
      data: newTask
    });
  } catch (error) {
    console.error('Error al crear tarea:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear la tarea'
    });
  }
});

// PUT /:id - Actualizar tarea
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;
    const { title, description, status, priority, due_date } = req.body;

    // Verificar que la tarea existe y pertenece al usuario
    const existingTask = db.findOne('tasks', t => t.id === id && t.user_id === userId);

    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: 'Tarea no encontrada'
      });
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    const validPriorities = ['low', 'medium', 'high', 'urgent'];

    const updates = {
      title: title || existingTask.title,
      description: description !== undefined ? description : existingTask.description,
      status: validStatuses.includes(status) ? status : existingTask.status,
      priority: validPriorities.includes(priority) ? priority : existingTask.priority,
      due_date: due_date !== undefined ? due_date : existingTask.due_date
    };

    // Si se marca como completada, registrar fecha
    if (status === 'completed' && existingTask.status !== 'completed') {
      updates.completed_at = new Date().toISOString();
    } else if (status !== 'completed') {
      updates.completed_at = null;
    }

    const updatedTask = db.update('tasks', id, updates);

    res.json({
      success: true,
      message: 'Tarea actualizada exitosamente',
      data: updatedTask
    });
  } catch (error) {
    console.error('Error al actualizar tarea:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la tarea'
    });
  }
});

// DELETE /:id - Eliminar tarea
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;

    // Verificar que la tarea existe y pertenece al usuario
    const existingTask = db.findOne('tasks', t => t.id === id && t.user_id === userId);

    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: 'Tarea no encontrada'
      });
    }

    db.delete('tasks', id);

    res.json({
      success: true,
      message: 'Tarea eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar tarea:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la tarea'
    });
  }
});

module.exports = router;
