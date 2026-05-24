import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { socketAuthMiddleware, AuthenticatedSocket } from '../middlewares/socket.middleware';
import { SocketService } from '../services/socket.service';

let io: SocketIOServer | null = null;

export const initializeSocket = (httpServer: HTTPServer): SocketIOServer => {
  if (io) {
    return io;
  }

  const allowedOrigins: string[] = (
    process.env.CLIENT_URL || 'http://localhost:3000'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
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

    // Handle custom events
    socket.on('join-conversation', (conversationId: string) => {
      SocketService.joinConversationRoom(socket.id, conversationId);
    });

    socket.on('leave-conversation', (conversationId: string) => {
      SocketService.leaveConversationRoom(socket.id, conversationId);
    });

    socket.on('join-admin', () => {
      SocketService.joinAdminRoom(socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id}, User: ${socket.userEmail}, reason: ${reason}`);
      if (socket.userId) {
        SocketService.leaveUserRoom(socket.id, socket.userId);
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
