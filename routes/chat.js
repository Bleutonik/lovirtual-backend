const express = require('express');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Aplicar autenticacion a todas las rutas
router.use(authenticateToken);

// GET /api/chat/conversations - Obtener conversaciones
router.get('/conversations', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'supervisor';

    const users = db.getAll('users');
    const messages = db.getAll('chat_messages') || [];

    if (isAdmin) {
      // Admin ve lista de empleados con sus ultimos mensajes
      const employees = users.filter(u => u.role === 'employee');

      const conversations = employees.map(emp => {
        // Mensajes entre este empleado y cualquier admin
        const empMessages = messages.filter(m =>
          (m.from_user_id === emp.id) || (m.to_user_id === emp.id)
        ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const lastMessage = empMessages[0];
        const unreadCount = empMessages.filter(m =>
          m.from_user_id === emp.id && m.to_user_id === userId && !m.read_at
        ).length;

        return {
          userId: emp.id,
          username: emp.username,
          email: emp.email,
          lastMessage: lastMessage ? {
            content: lastMessage.content,
            timestamp: lastMessage.created_at,
            fromMe: lastMessage.from_user_id === userId
          } : null,
          unreadCount
        };
      });

      // Ordenar: no leidos primero, luego por ultimo mensaje
      conversations.sort((a, b) => {
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
        if (!a.lastMessage) return 1;
        if (!b.lastMessage) return -1;
        return new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp);
      });

      res.json({
        success: true,
        data: { conversations, isAdmin: true }
      });
    } else {
      // Empleado ve su conversacion con admin
      const admins = users.filter(u => u.role === 'admin');
      const admin = admins[0];

      if (!admin) {
        return res.json({
          success: true,
          data: { conversation: null, isAdmin: false }
        });
      }

      const myMessages = messages.filter(m =>
        (m.from_user_id === userId && m.to_user_id === admin.id) ||
        (m.from_user_id === admin.id && m.to_user_id === userId)
      );

      const unreadCount = myMessages.filter(m =>
        m.from_user_id === admin.id && m.to_user_id === userId && !m.read_at
      ).length;

      res.json({
        success: true,
        data: {
          conversation: {
            userId: admin.id,
            username: admin.username,
            role: 'admin',
            unreadCount
          },
          isAdmin: false
        }
      });
    }
  } catch (error) {
    console.error('Error obteniendo conversaciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/chat/messages/:userId - Obtener mensajes con usuario especifico
router.get('/messages/:userId', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const otherUserId = parseInt(req.params.userId);
    const { limit = 50 } = req.query;

    const users = db.getAll('users');
    const otherUser = users.find(u => u.id === otherUserId);

    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    let messages = db.getAll('chat_messages') || [];

    // Filtrar mensajes entre estos dos usuarios
    messages = messages.filter(m =>
      (m.from_user_id === userId && m.to_user_id === otherUserId) ||
      (m.from_user_id === otherUserId && m.to_user_id === userId)
    );

    // Ordenar por fecha ascendente
    messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Tomar los ultimos N mensajes
    messages = messages.slice(-parseInt(limit));

    // Agregar info
    messages = messages.map(m => ({
      ...m,
      fromMe: m.from_user_id === userId,
      senderName: m.from_user_id === userId ? 'Yo' : otherUser.username
    }));

    // Marcar como leidos los mensajes recibidos
    messages.forEach(m => {
      if (m.from_user_id === otherUserId && !m.read_at) {
        db.update('chat_messages', m.id, { read_at: new Date().toISOString() });
      }
    });

    res.json({
      success: true,
      data: {
        messages,
        otherUser: {
          id: otherUser.id,
          username: otherUser.username,
          role: otherUser.role
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// POST /api/chat/messages - Enviar mensaje
router.post('/messages', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { to_user_id, content } = req.body;

    if (!to_user_id || !content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Destinatario y contenido son requeridos'
      });
    }

    if (content.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'El mensaje no puede exceder 2000 caracteres'
      });
    }

    const users = db.getAll('users');
    const toUser = users.find(u => u.id === parseInt(to_user_id));

    if (!toUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuario destinatario no encontrado'
      });
    }

    const message = db.insert('chat_messages', {
      from_user_id: userId,
      to_user_id: parseInt(to_user_id),
      content: content.trim(),
      read_at: null
    });

    res.status(201).json({
      success: true,
      message: 'Mensaje enviado',
      data: {
        message: {
          ...message,
          fromMe: true,
          senderName: 'Yo'
        }
      }
    });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/chat/unread - Conteo de no leidos
router.get('/unread', (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    const messages = db.getAll('chat_messages') || [];
    const unreadCount = messages.filter(m =>
      m.to_user_id === userId && !m.read_at
    ).length;

    res.json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

module.exports = router;
