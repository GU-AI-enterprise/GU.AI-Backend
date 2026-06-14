import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { socketAuthMiddleware, AuthenticatedSocket } from '../middlewares/socket.middleware';
import { SocketService } from '../services/socket.service';
import { UserRole, hasRoleOrHigher } from '../types/role';

let io: SocketIOServer | null = null;

interface StaffPresenceEntry {
  userId: string;
  email: string;
  role: string;
  connectedAt: string;
}
// socketId → presence info (one entry per connection, not per user)
const staffPresence = new Map<string, StaffPresenceEntry>();

function broadcastStaffPresence(): void {
  if (!io) return;
  // Deduplicate by userId — keep the earliest connection per user
  const byUser = new Map<string, StaffPresenceEntry>();
  for (const entry of staffPresence.values()) {
    if (!byUser.has(entry.userId)) byUser.set(entry.userId, entry);
  }
  io.to('admin').emit('staff_presence', Array.from(byUser.values()));
}

export const initializeSocket = (httpServer: HTTPServer): SocketIOServer => {
  if (io) {
    return io;
  }

  const allowedOrigins: string[] = (
    process.env.CLIENT_URL || 'http://localhost:3000'
  )
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

  // In development allow any origin (mirrors Express CORS behaviour).
  // In production restrict to the explicit CLIENT_URL whitelist.
  const corsOrigin =
    process.env.NODE_ENV !== 'production'
      ? true
      : (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
          const clean = origin ? origin.trim().replace(/\/$/, '') : '';
          const allowed =
            !origin ||
            allowedOrigins.includes(clean) ||
            allowedOrigins.some((a) => clean.startsWith(a));
          allowed ? cb(null, true) : cb(new Error(`Socket CORS blocked: ${origin}`));
        };

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(socketAuthMiddleware);

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`🔗 Client connected: ${socket.id}, User: ${socket.userEmail}`);

    // Join user to their personal room (already done in middleware, but ensuring)
    if (socket.userId) {
      SocketService.joinUserRoom(socket.id, socket.userId);
    }

    // Track staff/admin presence — middleware already joined them to admin room
    if (socket.userId && socket.userRole && hasRoleOrHigher(socket.userRole, UserRole.STAFF)) {
      staffPresence.set(socket.id, {
        userId: socket.userId,
        email: socket.userEmail ?? '',
        role: socket.userRole,
        connectedAt: new Date().toISOString(),
      });
      broadcastStaffPresence();
    }

    // Allow client to request current presence list
    socket.on('get_staff_presence', () => {
      if (!socket.userRole || !hasRoleOrHigher(socket.userRole, UserRole.STAFF)) return;
      const byUser = new Map<string, StaffPresenceEntry>();
      for (const entry of staffPresence.values()) {
        if (!byUser.has(entry.userId)) byUser.set(entry.userId, entry);
      }
      socket.emit('staff_presence', Array.from(byUser.values()));
    });

    // Handle custom events
    socket.on('join-conversation', (conversationId: string) => {
      SocketService.joinConversationRoom(socket.id, conversationId);
    });

    socket.on('leave-conversation', (conversationId: string) => {
      SocketService.leaveConversationRoom(socket.id, conversationId);
    });

    socket.on('join-admin', () => {
      if (!socket.userRole || !hasRoleOrHigher(socket.userRole, UserRole.STAFF)) {
        console.warn(`[Socket] join-admin rejected for ${socket.userEmail} (role: ${socket.userRole})`);
        return;
      }
      SocketService.joinAdminRoom(socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id}, User: ${socket.userEmail}, reason: ${reason}`);
      if (socket.userId) {
        SocketService.leaveUserRoom(socket.id, socket.userId);
      }
      if (staffPresence.has(socket.id)) {
        staffPresence.delete(socket.id);
        broadcastStaffPresence();
      }
    });

    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.id}:`, error);
    });
  });

  console.log('✅ Socket.IO initialized');
  return io;
};

export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return io;
};
