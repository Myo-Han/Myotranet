import { Request } from 'express';
import pool from '../database/db.js';
import { User } from '../types.js';

interface AuditLogData {
  actorId: number;
  actionType: string;
  targetUserId?: number;
  description: string;
  changes?: any;
  ipAddress?: string;
}

// Create audit log entry
export const createAuditLog = async (data: AuditLogData): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action_type, target_user_id, description, changes, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        data.actorId,
        data.actionType,
        data.targetUserId || null,
        data.description,
        data.changes ? JSON.stringify(data.changes) : null,
        data.ipAddress || null,
      ]
    );
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit logging failure shouldn't break the main operation
  }
};

// Helper function to get client IP
export const getClientIp = (req: Request): string => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown'
  );
};
