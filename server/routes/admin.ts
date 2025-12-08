import { Router } from 'express';
import pool from '../database/db.js';
import { isAuthenticated, isAdmin } from '../middleware/auth.js';
import { createAuditLog, getClientIp } from '../middleware/audit.js';

const router = Router();

// Get all users (Admin only)
router.get('/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { includeInactive } = req.query;

    let query = 'SELECT * FROM users';
    if (!includeInactive) {
      query += ' WHERE is_active = true';
    }
    query += ' ORDER BY name';

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Add new user (Admin only)
router.post('/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { email, name, role, annualLeaveBalance } = req.body;

    if (!email || !name || !role) {
      return res.status(400).json({ error: 'Email, name, and role are required' });
    }

    if (!['Admin', 'Manager', 'User'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if user already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const result = await pool.query(
      'INSERT INTO users (email, name, role, annual_leave_balance) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, name, role, annualLeaveBalance || 15.0]
    );

    // Create audit log
    await createAuditLog({
      actorId: req.user!.id,
      actionType: 'USER_CREATE',
      targetUserId: result.rows[0].id,
      description: `Created new user: ${name} (${email}) with role ${role}`,
      changes: { email, name, role, annualLeaveBalance },
      ipAddress: getClientIp(req),
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user role (Admin only)
router.patch('/users/:id/role', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['Admin', 'Manager', 'User'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Get current user info
    const current = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [role, id]
    );

    // Create audit log
    await createAuditLog({
      actorId: req.user!.id,
      actionType: 'USER_ROLE_CHANGE',
      targetUserId: parseInt(id),
      description: `Changed user role from ${current.rows[0].role} to ${role}`,
      changes: { oldRole: current.rows[0].role, newRole: role },
      ipAddress: getClientIp(req),
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Deactivate user (Admin only)
router.patch('/users/:id/deactivate', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Cannot deactivate self
    if (parseInt(id) === req.user!.id) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }

    // Get user info
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );

    // Create audit log
    await createAuditLog({
      actorId: req.user!.id,
      actionType: 'USER_DEACTIVATE',
      targetUserId: parseInt(id),
      description: `Deactivated user: ${user.rows[0].name} (${user.rows[0].email})`,
      changes: { reason },
      ipAddress: getClientIp(req),
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// Reactivate user (Admin only)
router.patch('/users/:id/reactivate', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create audit log
    await createAuditLog({
      actorId: req.user!.id,
      actionType: 'USER_REACTIVATE',
      targetUserId: parseInt(id),
      description: `Reactivated user: ${result.rows[0].name}`,
      changes: {},
      ipAddress: getClientIp(req),
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Reactivate user error:', error);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
});

// Get audit logs (Admin only)
router.get('/audit-logs', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { limit = 100, offset = 0, actorId, targetUserId, actionType } = req.query;

    let query = `
      SELECT 
        al.*,
        u1.name as actor_name,
        u1.email as actor_email,
        u2.name as target_name,
        u2.email as target_email
      FROM audit_logs al
      LEFT JOIN users u1 ON al.actor_id = u1.id
      LEFT JOIN users u2 ON al.target_user_id = u2.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (actorId) {
      params.push(actorId);
      query += ` AND al.actor_id = $${params.length}`;
    }

    if (targetUserId) {
      params.push(targetUserId);
      query += ` AND al.target_user_id = $${params.length}`;
    }

    if (actionType) {
      params.push(actionType);
      query += ` AND al.action_type = $${params.length}`;
    }

    query += ' ORDER BY al.created_at DESC';

    params.push(limit, offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch audit logs error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Update user annual leave balance (Admin only)
router.patch('/users/:id/leave-balance', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { balance } = req.body;

    if (typeof balance !== 'number' || balance < 0) {
      return res.status(400).json({ error: 'Invalid balance value' });
    }

    // Get current balance
    const current = await pool.query('SELECT annual_leave_balance FROM users WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      'UPDATE users SET annual_leave_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [balance, id]
    );

    // Create audit log
    await createAuditLog({
      actorId: req.user!.id,
      actionType: 'LEAVE_BALANCE_UPDATE',
      targetUserId: parseInt(id),
      description: `Updated annual leave balance from ${current.rows[0].annual_leave_balance} to ${balance}`,
      changes: { oldBalance: current.rows[0].annual_leave_balance, newBalance: balance },
      ipAddress: getClientIp(req),
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update leave balance error:', error);
    res.status(500).json({ error: 'Failed to update leave balance' });
  }
});

export default router;
