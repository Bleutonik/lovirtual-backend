const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Aplicar autenticacion a todas las rutas
router.use(authenticateToken);

// GET / - Listar anuncios
router.get('/', (req, res) => {
  try {
    const { category, active_only } = req.query;

    let announcements = db.getAll('announcements');

    // Por defecto, solo mostrar activos y no expirados
    if (active_only !== 'false') {
      const now = new Date().toISOString();
      announcements = announcements.filter(a =>
        a.is_active && (!a.expires_at || a.expires_at > now)
      );
    }

    // Filtrar por categoria
    if (category) {
      announcements = announcements.filter(a => a.category === category);
    }

    // Ordenar por fecha de creacion descendente
    announcements.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Agregar info de autores
    const users = db.getAll('users');
    announcements = announcements.map(a => {
      const author = users.find(u => u.id === a.author_id);
      return {
        ...a,
        author: author ? author.username : 'Unknown',
        author_first_name: author ? author.first_name : null,
        author_last_name: author ? author.last_name : null
      };
    });

    res.json({
      success: true,
      data: announcements
    });
  } catch (error) {
    console.error('Error al listar anuncios:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los anuncios'
    });
  }
});

// POST / - Crear anuncio (solo admin)
router.post('/', requireRole('admin'), (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { title, content, category, expires_at } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'El titulo y contenido son requeridos'
      });
    }

    const validCategories = ['general', 'important', 'urgent', 'event', 'policy'];
    const announcementCategory = validCategories.includes(category) ? category : 'general';

    const newAnnouncement = db.insert('announcements', {
      title,
      content,
      category: announcementCategory,
      author_id: userId,
      expires_at: expires_at || null,
      is_active: true
    });

    // Agregar info del autor
    const users = db.getAll('users');
    const author = users.find(u => u.id === userId);

    res.status(201).json({
      success: true,
      message: 'Anuncio creado exitosamente',
      data: {
        ...newAnnouncement,
        author: author ? author.username : 'Unknown',
        author_first_name: author ? author.first_name : null,
        author_last_name: author ? author.last_name : null
      }
    });
  } catch (error) {
    console.error('Error al crear anuncio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el anuncio'
    });
  }
});

// PUT /:id - Actualizar anuncio (solo admin)
router.put('/:id', requireRole('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category, is_active, expires_at } = req.body;

    const existingAnnouncement = db.getById('announcements', id);

    if (!existingAnnouncement) {
      return res.status(404).json({
        success: false,
        message: 'Anuncio no encontrado'
      });
    }

    const validCategories = ['general', 'important', 'urgent', 'event', 'policy'];

    const updates = {
      title: title || existingAnnouncement.title,
      content: content || existingAnnouncement.content,
      category: validCategories.includes(category) ? category : existingAnnouncement.category,
      is_active: is_active !== undefined ? is_active : existingAnnouncement.is_active,
      expires_at: expires_at !== undefined ? expires_at : existingAnnouncement.expires_at
    };

    const updatedAnnouncement = db.update('announcements', id, updates);

    // Agregar info del autor
    const users = db.getAll('users');
    const author = users.find(u => u.id === updatedAnnouncement.author_id);

    res.json({
      success: true,
      message: 'Anuncio actualizado exitosamente',
      data: {
        ...updatedAnnouncement,
        author: author ? author.username : 'Unknown',
        author_first_name: author ? author.first_name : null,
        author_last_name: author ? author.last_name : null
      }
    });
  } catch (error) {
    console.error('Error al actualizar anuncio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el anuncio'
    });
  }
});

// DELETE /:id - Eliminar anuncio (solo admin)
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const { id } = req.params;

    const existingAnnouncement = db.getById('announcements', id);

    if (!existingAnnouncement) {
      return res.status(404).json({
        success: false,
        message: 'Anuncio no encontrado'
      });
    }

    db.delete('announcements', id);

    res.json({
      success: true,
      message: 'Anuncio eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar anuncio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el anuncio'
    });
  }
});

module.exports = router;
