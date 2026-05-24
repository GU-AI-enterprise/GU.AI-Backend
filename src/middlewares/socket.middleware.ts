import { Socket } from 'socket.io';
import { supabase } from '../config/supabase';
import { SocketService } from '../services/socket.service';
import { UserRole, isValidRole, hasRoleOrHigher } from '../types/role';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: UserRole;
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

    // Fetch user role from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData || !isValidRole(userData.role)) {
      return next(new Error('Authentication error: User role not found or invalid'));
    }

    socket.userId = user.id;
    socket.userEmail = user.email;
    socket.userRole = userData.role as UserRole;

    // Join user to their personal room
    SocketService.joinUserRoom(socket.id, user.id);

    // If admin or staff, join staff room for monitoring
    if (hasRoleOrHigher(userData.role as UserRole, UserRole.STAFF)) {
      SocketService.joinAdminRoom(socket.id);
    }

    console.log(`✅ User authenticated: ${user.email} (${user.id}) as ${userData.role}`);
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

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return next(new Error('Authentication error: Invalid token'));
    }

    // Fetch user role from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData || !isValidRole(userData.role)) {
      return next(new Error('Authentication error: User role not found or invalid'));
    }

    // Check if user is admin
    if (userData.role !== UserRole.ADMIN) {
      return next(new Error('Authorization error: Admin access required'));
    }

    socket.userId = user.id;
    socket.userEmail = user.email;
    socket.userRole = UserRole.ADMIN;

    // Join admin room
    SocketService.joinAdminRoom(socket.id);

    console.log(`✅ Admin authenticated: ${user.email} (${user.id})`);
    next();
  } catch (error: any) {
    console.error('Admin socket authentication error:', error);
    next(new Error('Authentication error: Internal server error'));
  }
};

export const staffAuthMiddleware = async (
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

    // Fetch user role from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData || !isValidRole(userData.role)) {
      return next(new Error('Authentication error: User role not found or invalid'));
    }

    // Check if user is staff or admin
    if (!hasRoleOrHigher(userData.role as UserRole, UserRole.STAFF)) {
      return next(new Error('Authorization error: Staff or Admin access required'));
    }

    socket.userId = user.id;
    socket.userEmail = user.email;
    socket.userRole = userData.role as UserRole;

    // Join staff room
    SocketService.joinAdminRoom(socket.id);

    console.log(`✅ Staff authenticated: ${user.email} (${user.id}) as ${userData.role}`);
    next();
  } catch (error: any) {
    console.error('Staff socket authentication error:', error);
    next(new Error('Authentication error: Internal server error'));
  }
};
