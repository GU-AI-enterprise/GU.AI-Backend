import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { UserRole, isValidRole, hasRoleOrHigher } from '../types/role';

export interface AuthRequest extends Request<any, any, any, any> {
  user?: {
    id: string;
    email: string;
    role: UserRole;
  };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header.' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Xác thực token với Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
      return;
    }

    // Fetch user role from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData || !isValidRole(userData.role)) {
      res.status(401).json({ error: 'User role not found or invalid.' });
      return;
    }

    // Gán user vào request để các controller phía sau sử dụng
    req.user = {
      id: user.id,
      email: user.email || '',
      role: userData.role as UserRole,
    };
    next();
  } catch (err: any) {
    res.status(500).json({ error: 'Server Auth Error', details: err.message });
  }
};

/**
 * Require specific role or higher
 * Usage: router.get('/admin', requireAuth, requireRole(UserRole.STAFF), ...)
 */
export const requireRole = (requiredRole: UserRole) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!hasRoleOrHigher(req.user.role, requiredRole)) {
      res.status(403).json({ error: `Access denied. Required role: ${requiredRole}` });
      return;
    }

    next();
  };
};

/**
 * Require STAFF or ADMIN role
 * Usage: router.get('/staff-dashboard', requireAuth, requireStaff, ...)
 */
export const requireStaff = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (!hasRoleOrHigher(req.user.role, UserRole.STAFF)) {
    res.status(403).json({ error: 'Access denied. Staff or Admin role required.' });
    return;
  }

  next();
};

/**
 * Require ADMIN role only
 * Usage: router.get('/admin-only', requireAuth, requireAdmin, ...)
 */
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (req.user.role !== UserRole.ADMIN) {
    res.status(403).json({ error: 'Access denied. Admin role required.' });
    return;
  }

  next();
};

/**
 * Require CUSTOMER role only (for customer-only endpoints)
 * Usage: router.get('/customer-only', requireAuth, requireCustomer, ...)
 */
export const requireCustomer = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (req.user.role !== UserRole.CUSTOMER) {
    res.status(403).json({ error: 'Access denied. Customer role required.' });
    return;
  }

  next();
};
