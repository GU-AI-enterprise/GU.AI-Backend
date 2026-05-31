import { Socket } from 'socket.io';
import { supabase, supabaseAdmin } from '../config/supabase';
import { SocketService } from '../services/socket.service';
import { UserRole, isValidRole, hasRoleOrHigher } from '../types/role';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: UserRole;
}

// Mirror the same upsert logic as auth.middleware to avoid race conditions
// when a user connects via socket before their first HTTP request
async function resolveUserRole(user: any): Promise<string> {
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (existing) return existing.role;

  // New user — create record with default customer role
  await supabaseAdmin.from('users').insert({
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

  return 'customer';
}

export const socketAuthMiddleware = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void
): Promise<void> => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return next(new Error('Authentication error: Invalid token'));
    }

    const role = await resolveUserRole(user);

    if (!isValidRole(role)) {
      return next(new Error('Authentication error: User role not found or invalid'));
    }

    socket.userId = user.id;
    socket.userEmail = user.email;
    socket.userRole = role as UserRole;

    SocketService.joinUserRoom(socket.id, user.id);

    if (hasRoleOrHigher(role as UserRole, UserRole.STAFF)) {
      SocketService.joinAdminRoom(socket.id);
    }

    console.log(`✅ Socket authenticated: ${user.email} (${user.id}) as ${role}`);
    next();
  } catch (error: any) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication error: Internal server error'));
  }
};

export const adminAuthMiddleware = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void
): Promise<void> => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) return next(new Error('Authentication error: No token provided'));

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return next(new Error('Authentication error: Invalid token'));

    const role = await resolveUserRole(user);

    if (role !== UserRole.ADMIN) {
      return next(new Error('Authorization error: Admin access required'));
    }

    socket.userId = user.id;
    socket.userEmail = user.email;
    socket.userRole = UserRole.ADMIN;

    SocketService.joinAdminRoom(socket.id);
    console.log(`✅ Admin socket authenticated: ${user.email}`);
    next();
  } catch (error: any) {
    next(new Error('Authentication error: Internal server error'));
  }
};

export const staffAuthMiddleware = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void
): Promise<void> => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) return next(new Error('Authentication error: No token provided'));

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return next(new Error('Authentication error: Invalid token'));

    const role = await resolveUserRole(user);

    if (!hasRoleOrHigher(role as UserRole, UserRole.STAFF)) {
      return next(new Error('Authorization error: Staff or Admin access required'));
    }

    socket.userId = user.id;
    socket.userEmail = user.email;
    socket.userRole = role as UserRole;

    SocketService.joinAdminRoom(socket.id);
    console.log(`✅ Staff socket authenticated: ${user.email} as ${role}`);
    next();
  } catch (error: any) {
    next(new Error('Authentication error: Internal server error'));
  }
};
