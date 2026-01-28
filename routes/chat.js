const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Aplicar autenticacion a todas las rutas
router.use(authenticateToken);

// GET / - Obtener mensajes (ultimos 50)
router.get('/', (req, res) => {
  try {
    const { limit, before_id } = req.query;
    const messageLimit = Math.min(parseInt(limit) || 50, 100); // Max 100 mensajes

    let messages = db.getAll('chat_messages');

    // Paginacion: obtener mensajes anteriores a un ID
    if (before_id) {
      messages = messages.filter(m => m.id < before_id);
    }

    // Ordenar por fecha de creacion descendente y tomar los ultimos
    messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    messages = messages.slice(0, messageLimit);

    // Invertir para mostrar en orden cronologico
    messages.reverse();

    // Agregar info de usuarios
    const users = db.getAll('users');
    messages = messages.map(m => {
      const user = users.find(u => u.id === m.user_id);
      return {
        ...m,
        user_id: m.user_id,
        username: user ? user.username : 'Unknown',
        first_name: user ? user.first_name : null,
        last_name: user ? user.last_name : null,
        avatar: user ? user.avatar : null
      };
    });

    res.json({
      success: true,
      data: messages,
      meta: {
        count: messages.length,
        has_more: messages.length === messageLimit
      }
    });
  } catch (error) {
    console.error('Error al obtener mensajes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los mensajes'
    });
  }
});

// POST / - Enviar mensaje
router.post('/', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { message, message_type } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El mensaje no puede estar vacio'
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'El mensaje no puede exceder 2000 caracteres'
      });
    }

    const validTypes = ['text', 'image', 'file', 'system'];
    const msgType = validTypes.includes(message_type) ? message_type : 'text';

    const newMessage = db.insert('chat_messages', {
      user_id: userId,
      message: message.trim(),
      message_type: msgType,
      is_edited: false
    });

    // Agregar info del usuario
    const users = db.getAll('users');
    const user = users.find(u => u.id === userId);

    res.status(201).json({
      success: true,
      message: 'Mensaje enviado',
      data: {
        ...newMessage,
        username: user ? user.username : 'Unknown',
        first_name: user ? user.first_name : null,
        last_name: user ? user.last_name : null,
        avatar: user ? user.avatar : null
      }
    });
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    res.status(500).json({
      success: false,
      message: 'Error al enviar el mensaje'
    });
  }
});

// PUT /:id - Editar mensaje propio
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;
    const { message } = req.body;

    const existingMessage = db.getById('chat_messages', id);

    if (!existingMessage) {
      return res.status(404).json({
        success: false,
        message: 'Mensaje no encontrado'
      });
    }

    // Solo el autor puede editar su mensaje
    if (existingMessage.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'No puedes editar mensajes de otros usuarios'
      });
    }

    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El mensaje no puede estar vacio'
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'El mensaje no puede exceder 2000 caracteres'
      });
    }

    const updatedMessage = db.update('chat_messages', id, {
      message: message.trim(),
      is_edited: true
    });

    // Agregar info del usuario
    const users = db.getAll('users');
    const user = users.find(u => u.id === userId);

    res.json({
      success: true,
      message: 'Mensaje actualizado',
      data: {
        ...updatedMessage,
        username: user ? user.username : 'Unknown',
        first_name: user ? user.first_name : null,
        last_name: user ? user.last_name : null,
        avatar: user ? user.avatar : null
      }
    });
  } catch (error) {
    console.error('Error al editar mensaje:', error);
    res.status(500).json({
      success: false,
      message: 'Error al editar el mensaje'
    });
  }
});

// DELETE /:id - Eliminar mensaje propio
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.userId;
    const isAdmin = req.user.role === 'admin';

    const existingMessage = db.getById('chat_messages', id);

    if (!existingMessage) {
      return res.status(404).json({
        success: false,
        message: 'Mensaje no encontrado'
      });
    }

    // Solo el autor o admin puede eliminar
    if (existingMessage.user_id !== userId && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'No puedes eliminar mensajes de otros usuarios'
      });
    }

    db.delete('chat_messages', id);

    res.json({
      success: true,
      message: 'Mensaje eliminado'
    });
  } catch (error) {
    console.error('Error al eliminar mensaje:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el mensaje'
    });
  }
});

module.exports = router;
