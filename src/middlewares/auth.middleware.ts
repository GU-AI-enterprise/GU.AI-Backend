import { Request, Response, NextFunction } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { UserRole, isValidRole, hasRoleOrHigher } from '../types/role';

export interface AuthRequest extends Request<any, any, any, any> {
  user?: {
    id: string;
    email: string;
    role: UserRole;
  };
}

// Helper để lấy hoặc tạo user record
async function getOrCreateUserRecord(user: any) {
  if (!supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  }

  // Thử lấy user record
  const { data: existingUser, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('role, id')
    .eq('id', user.id)
    .single();

  if (existingUser) {
    return existingUser;
  }

  // Nếu không tìm thấy, tạo mới
  if (fetchError?.code === 'PGRST116' || !existingUser) {
    const { error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || null,
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        provider: user.app_metadata?.provider || 'email',
        role: 'customer',
        status: 'active',
        current_credit: 0,
        plan_type: 'free',
      });

    if (insertError) {
      throw new Error(`Failed to create user record: ${insertError.message}`);
    }

    return { id: user.id, role: 'customer' };
  }

  const errorMessage = (fetchError as any)?.message || 'Unknown database error';
  throw new Error(`Database error: ${errorMessage}`);
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

    // Lấy hoặc tạo user record
    const userRecord = await getOrCreateUserRecord(user);

    if (!isValidRole(userRecord.role)) {
      res.status(401).json({ error: 'User role not found or invalid.' });
      return;
    }

    // Gán user vào request
    req.user = {
      id: user.id,
      email: user.email || '',
      role: userRecord.role as UserRole,
    };
    next();
  } catch (err: any) {
    console.error('Auth middleware error:', err);
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
