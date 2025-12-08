import { Router } from 'express';
import pool from '../database/db.js';
import { isAuthenticated, isManagerOrAdmin } from '../middleware/auth.js';
import { createAuditLog, getClientIp } from '../middleware/audit.js';

const router = Router();

// Check in (서버 시간으로 기록)
router.post('/check-in', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const today = new Date().toISOString().split('T')[0]; // Server date
    const now = new Date(); // Server timestamp

    // Check if already checked in today
    const existing = await pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (existing.rows.length > 0 && existing.rows[0].check_in) {
      return res.status(400).json({ error: 'Already checked in today' });
    }

    let result;
    if (existing.rows.length > 0) {
      // Update existing record
      result = await pool.query(
        `UPDATE attendance SET check_in = $1, status = 'present', updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 RETURNING *`,
        [now, existing.rows[0].id]
      );
    } else {
      // Create new record
      result = await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, status)
         VALUES ($1, $2, $3, 'present') RETURNING *`,
        [userId, today, now]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// Check out (서버 시간으로 기록)
router.post('/check-out', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const result = await pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (result.rows.length === 0 || !result.rows[0].check_in) {
      return res.status(400).json({ error: 'Please check in first' });
    }

    if (result.rows[0].check_out) {
      return res.status(400).json({ error: 'Already checked out today' });
    }

    const updated = await pool.query(
      'UPDATE attendance SET check_out = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [now, result.rows[0].id]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Check-out failed' });
  }
});

// Early leave (서버 시간으로 기록)
router.post('/early-leave', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const result = await pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (result.rows.length === 0 || !result.rows[0].check_in) {
      return res.status(400).json({ error: 'Please check in first' });
    }

    const updated = await pool.query(
      `UPDATE attendance SET early_leave = $1, status = 'early_leave', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 RETURNING *`,
      [now, result.rows[0].id]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Early leave error:', error);
    res.status(500).json({ error: 'Early leave failed' });
  }
});

// Get my attendance records
router.get('/my-records', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate, limit = 30 } = req.query;

    let query = 'SELECT * FROM attendance WHERE user_id = $1';
    const params: any[] = [userId];

    if (startDate) {
      params.push(startDate);
      query += ` AND date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND date <= $${params.length}`;
    }

    query += ' ORDER BY date DESC';

    if (limit) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch records error:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// Get all attendance records (Manager/Admin only)
router.get('/all-records', isAuthenticated, isManagerOrAdmin, async (req, res) => {
  try {
    const { userId, startDate, endDate, limit = 100 } = req.query;

    let query = `
      SELECT a.*, u.name, u.email, u.role 
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (userId) {
      params.push(userId);
      query += ` AND a.user_id = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      query += ` AND a.date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND a.date <= $${params.length}`;
    }

    query += ' ORDER BY a.date DESC, u.name ASC';

    if (limit) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch all records error:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// Request attendance revision
router.post('/revision-request', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      attendanceId,
      requestedDate,
      requestedCheckIn,
      requestedCheckOut,
      reason,
    } = req.body;

    if (!attendanceId || !requestedDate || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get original attendance record
    const attendance = await pool.query(
      'SELECT * FROM attendance WHERE id = $1 AND user_id = $2',
      [attendanceId, userId]
    );

    if (attendance.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    const original = attendance.rows[0];

    // Create revision request
    const result = await pool.query(
      `INSERT INTO attendance_revision_requests 
       (user_id, attendance_id, requested_date, original_check_in, original_check_out, 
        requested_check_in, requested_check_out, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING *`,
      [
        userId,
        attendanceId,
        requestedDate,
        original.check_in,
        original.check_out,
        requestedCheckIn || null,
        requestedCheckOut || null,
        reason,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Revision request error:', error);
    res.status(500).json({ error: 'Failed to create revision request' });
  }
});

// Get revision requests (Manager/Admin see all, User sees own)
router.get('/revision-requests', isAuthenticated, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT r.*, u.name as user_name, u.email as user_email
      FROM attendance_revision_requests r
      JOIN users u ON r.user_id = u.id
    `;
    const params: any[] = [];

    if (req.user!.role === 'User') {
      params.push(req.user!.id);
      query += ` WHERE r.user_id = $${params.length}`;
    } else {
      query += ' WHERE 1=1';
    }

    if (status) {
      params.push(status);
      query += ` AND r.status = $${params.length}`;
    }

    query += ' ORDER BY r.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch revision requests error:', error);
    res.status(500).json({ error: 'Failed to fetch revision requests' });
  }
});

// Approve/reject revision request (Manager/Admin only)
router.post('/revision-request/:id/review', isAuthenticated, isManagerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Get revision request
    const request = await pool.query(
      'SELECT * FROM attendance_revision_requests WHERE id = $1',
      [id]
    );

    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Revision request not found' });
    }

    const revision = request.rows[0];

    // Update revision request
    const updated = await pool.query(
      `UPDATE attendance_revision_requests 
       SET status = $1, reviewed_by = $2, review_notes = $3, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [status, req.user!.id, reviewNotes || null, id]
    );

    // If approved, update the actual attendance record
    if (status === 'approved') {
      await pool.query(
        'UPDATE attendance SET check_in = $1, check_out = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [
          revision.requested_check_in || revision.original_check_in,
          revision.requested_check_out || revision.original_check_out,
          revision.attendance_id,
        ]
      );
    }

    // Create audit log
    await createAuditLog({
      actorId: req.user!.id,
      actionType: 'ATTENDANCE_REVISION_REVIEW',
      targetUserId: revision.user_id,
      description: `${status === 'approved' ? 'Approved' : 'Rejected'} attendance revision request`,
      changes: { revisionId: id, status, reviewNotes },
      ipAddress: getClientIp(req),
    });

    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Review revision error:', error);
    res.status(500).json({ error: 'Failed to review revision request' });
  }
});

export default router;
