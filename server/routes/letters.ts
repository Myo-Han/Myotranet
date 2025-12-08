import { Router } from 'express';
import pool from '../database/db.js';
import { isAuthenticated, isManagerOrAdmin } from '../middleware/auth.js';
import { createAuditLog, getClientIp } from '../middleware/audit.js';

const router = Router();

// Create a letter
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { title, content, isAnonymous } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const result = await pool.query(
      'INSERT INTO letters (user_id, title, content, is_anonymous) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, title, content, isAnonymous || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create letter error:', error);
    res.status(500).json({ error: 'Failed to create letter' });
  }
});

// Get all letters
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT 
        l.id,
        l.title,
        l.content,
        l.is_anonymous,
        l.created_at,
        l.updated_at,
        CASE 
          WHEN l.is_anonymous THEN NULL
          ELSE u.name
        END as author_name,
        CASE 
          WHEN l.is_anonymous THEN NULL
          ELSE u.profile_picture
        END as author_picture
       FROM letters l
       JOIN users u ON l.user_id = u.id
       ORDER BY l.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch letters error:', error);
    res.status(500).json({ error: 'Failed to fetch letters' });
  }
});

// Delete a letter (Admin/Manager only)
router.delete('/:id', isAuthenticated, isManagerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get letter info before deletion for audit log
    const letter = await pool.query('SELECT * FROM letters WHERE id = $1', [id]);

    if (letter.rows.length === 0) {
      return res.status(404).json({ error: 'Letter not found' });
    }

    await pool.query('DELETE FROM letters WHERE id = $1', [id]);

    // Create audit log
    await createAuditLog({
      actorId: req.user!.id,
      actionType: 'LETTER_DELETE',
      targetUserId: letter.rows[0].user_id,
      description: `Deleted letter: "${letter.rows[0].title}"`,
      changes: { letterId: id, title: letter.rows[0].title },
      ipAddress: getClientIp(req),
    });

    res.json({ message: 'Letter deleted successfully' });
  } catch (error) {
    console.error('Delete letter error:', error);
    res.status(500).json({ error: 'Failed to delete letter' });
  }
});

export default router;
