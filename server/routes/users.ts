import { Router } from 'express';
import pool from '../database/db.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

// Search users
router.get('/search', isAuthenticated, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query required' });
    }

    const result = await pool.query(
      `SELECT id, name, email, profile_picture, role, annual_leave_balance, is_active
       FROM users 
       WHERE is_active = true AND (name ILIKE $1 OR email ILIKE $1)
       ORDER BY name
       LIMIT 20`,
      [`%${q}%`]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user profile with attendance and leave summary
router.get('/:id/profile', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    // Get user basic info
    const user = await pool.query(
      'SELECT id, name, email, profile_picture, role, annual_leave_balance, is_active FROM users WHERE id = $1',
      [id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get recent attendance (last 7 days)
    const attendance = await pool.query(
      `SELECT * FROM attendance 
       WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY date DESC`,
      [id]
    );

    // Get pending leave requests
    const leaves = await pool.query(
      'SELECT * FROM leaves WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 5',
      [id, 'pending']
    );

    res.json({
      user: user.rows[0],
      recentAttendance: attendance.rows,
      pendingLeaves: leaves.rows,
    });
  } catch (error) {
    console.error('Fetch user profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

export default router;
