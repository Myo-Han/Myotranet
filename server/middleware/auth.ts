import { Request, Response, NextFunction } from 'express';
import pool from '../database/db.js';
import { User } from '../types.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Check if user is authenticated
export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Fetch user from database
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Check if user has specific role
export const hasRole = (...roles: Array<'Admin' | 'Manager' | 'User'>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Admin only middleware
export const isAdmin = hasRole('Admin');

// Admin or Manager middleware
export const isManagerOrAdmin = hasRole('Admin', 'Manager');
