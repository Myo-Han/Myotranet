import { Router } from 'express';
import pool from '../database/db.js';
import { isAuthenticated, isManagerOrAdmin } from '../middleware/auth.js';
import { createAuditLog, getClientIp } from '../middleware/audit.js';

const router = Router();

// Request leave
router.post('/request', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate, leaveType, daysRequested, reason } = req.body;

    if (!startDate || !endDate || !leaveType || !daysRequested || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user has enough annual leave balance
    if (req.user!.annual_leave_balance < daysRequested) {
      return res.status(400).json({
        error: 'Insufficient annual leave balance',
        balance: req.user!.annual_leave_balance,
        requested: daysRequested,
      });
    }

    // Create leave request
    const result = await pool.query(
      `INSERT INTO leaves (user_id, start_date, end_date, leave_type, days_requested, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [userId, startDate, endDate, leaveType, daysRequested, reason]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Leave request error:', error);
    res.status(500).json({ error: 'Failed to create leave request' });
  }
});

// Get my leave requests
router.get('/my-requests', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { status } = req.query;

    let query = 'SELECT * FROM leaves WHERE user_id = $1';
    const params: any[] = [userId];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch leave requests error:', error);
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

// Get all leave requests (Manager/Admin only)
router.get('/all-requests', isAuthenticated, isManagerOrAdmin, async (req, res) => {
  try {
    const { userId, status, startDate, endDate } = req.query;

    let query = `
      SELECT l.*, u.name, u.email, u.role, u.annual_leave_balance
      FROM leaves l
      JOIN users u ON l.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (userId) {
      params.push(userId);
      query += ` AND l.user_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND l.status = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      query += ` AND l.start_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND l.end_date <= $${params.length}`;
    }

    query += ' ORDER BY l.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch all leave requests error:', error);
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

// Approve/reject leave request (Manager/Admin only)
router.post('/request/:id/review', isAuthenticated, isManagerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Get leave request
    const leaveRequest = await pool.query(
      'SELECT l.*, u.annual_leave_balance FROM leaves l JOIN users u ON l.user_id = u.id WHERE l.id = $1',
      [id]
    );

    if (leaveRequest.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const leave = leaveRequest.rows[0];

    if (leave.status !== 'pending') {
      return res.status(400).json({ error: 'Leave request already reviewed' });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update leave request
      const updated = await client.query(
        `UPDATE leaves 
         SET status = $1, reviewed_by = $2, review_notes = $3, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = $4 RETURNING *`,
        [status, req.user!.id, reviewNotes || null, id]
      );

      // If approved, deduct from annual leave balance
      if (status === 'approved') {
        const newBalance = leave.annual_leave_balance - leave.days_requested;
        await client.query(
          'UPDATE users SET annual_leave_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newBalance, leave.user_id]
        );
      }

      await client.query('COMMIT');

      // Create audit log
      await createAuditLog({
        actorId: req.user!.id,
        actionType: 'LEAVE_REVIEW',
        targetUserId: leave.user_id,
        description: `${status === 'approved' ? 'Approved' : 'Rejected'} leave request for ${leave.days_requested} days`,
        changes: {
          leaveId: id,
          status,
          daysRequested: leave.days_requested,
          reviewNotes,
        },
        ipAddress: getClientIp(req),
      });

      res.json(updated.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Review leave error:', error);
    res.status(500).json({ error: 'Failed to review leave request' });
  }
});

// Get leave balance
router.get('/balance', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT annual_leave_balance FROM users WHERE id = $1',
      [req.user!.id]
    );
    res.json({ balance: result.rows[0].annual_leave_balance });
  } catch (error) {
    console.error('Fetch balance error:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

export default router;
