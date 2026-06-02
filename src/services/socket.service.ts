import { getIO } from '../config/socket';

export interface NotificationPayload {
  userId: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  data?: any;
}

export interface MessagePayload {
  fromUserId: string;
  toUserId: string;
  conversationId?: string;
  content: string;
  timestamp: Date;
}

export interface AIJobUpdatePayload {
  jobId: string;
  status: 'completed' | 'failed';
  imageUrl?: string;
  assetId?: string;
  creditsUsed?: number;
  error?: string;
}

export interface MonitoringPayload {
  type: 'system' | 'performance' | 'error' | 'warning';
  metric: string;
  value: any;
  timestamp: Date;
}

export class SocketService {
  /**
   * Send notification to a specific user
   */
  static sendNotification(payload: NotificationPayload): void {
    const io = getIO();
    io.to(`user:${payload.userId}`).emit('notification', payload);
  }

  /**
   * Emit AI job completion/failure to the job owner
   */
  static emitAIJobUpdate(userId: string, payload: AIJobUpdatePayload): void {
    try {
      const io = getIO();
      io.to(`user:${userId}`).emit('ai_job_update', payload);
    } catch {
      console.warn('[SocketService] Socket.IO not available for AI job emit.');
    }
  }

  /**
   * Send message to a specific user
   */
  static sendMessage(payload: MessagePayload): void {
    const io = getIO();
    io.to(`user:${payload.toUserId}`).emit('message', payload);
  }

  /**
   * Notify a customer that a staff/admin replied (badge increment)
   */
  static emitSupportNewMessage(userId: string, conversationId: string): void {
    try {
      const io = getIO();
      io.to(`user:${userId}`).emit('support:new_message', { conversationId });
    } catch {
      console.warn('[SocketService] Socket.IO not available for support:new_message emit.');
    }
  }

  /**
   * Notify all staff/admin that a customer sent a message (badge increment)
   */
  static emitSupportNeedsHelp(conversationId: string): void {
    try {
      const io = getIO();
      io.to('admins').emit('support:needs_help', { conversationId });
    } catch {
      console.warn('[SocketService] Socket.IO not available for support:needs_help emit.');
    }
  }

  /**
   * Notify conversation participants that messages have been read
   * readBy: 'customer' | 'staff'
   */
  static emitReadReceipt(conversationId: string, readBy: 'customer' | 'staff'): void {
    try {
      const io = getIO();
      io.to(`conversation:${conversationId}`).emit('support:read_receipt', { conversationId, readBy });
    } catch {
      console.warn('[SocketService] Socket.IO not available for support:read_receipt emit.');
    }
  }

  /**
   * Broadcast message to a conversation
   */
  static broadcastToConversation(conversationId: string, payload: MessagePayload): void {
    try {
      const io = getIO();
      io.to(`conversation:${conversationId}`).emit('message', payload);
    } catch (error) {
      console.warn('Socket.IO not available for conversation emit.');
    }
  }

  /**
   * Send monitoring data to admin users
   */
  static sendMonitoringData(payload: MonitoringPayload): void {
    try {
      const io = getIO();
      io.to('admins').emit('monitoring', payload);
    } catch (error) {
      console.warn('Socket.IO not available for monitoring emit.');
    }
  }

  /**
   * Join user to their personal room
   */
  static joinUserRoom(socketId: string, userId: string): void {
    const io = getIO();
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(`user:${userId}`);
      console.log(`✅ User ${userId} joined their room`);
    }
  }

  /**
   * Join user to a conversation room
   */
  static joinConversationRoom(socketId: string, conversationId: string): void {
    const io = getIO();
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(`conversation:${conversationId}`);
      console.log(`✅ Socket ${socketId} joined conversation ${conversationId}`);
    }
  }

  /**
   * Join user to admin room
   */
  static joinAdminRoom(socketId: string): void {
    const io = getIO();
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join('admins');
      console.log(`✅ Socket ${socketId} joined admin room`);
    }
  }

  /**
   * Leave user from their personal room
   */
  static leaveUserRoom(socketId: string, userId: string): void {
    const io = getIO();
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(`user:${userId}`);
      console.log(`🚪 User ${userId} left their room`);
    }
  }

  /**
   * Leave conversation room
   */
  static leaveConversationRoom(socketId: string, conversationId: string): void {
    const io = getIO();
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(`conversation:${conversationId}`);
      console.log(`🚪 Socket ${socketId} left conversation ${conversationId}`);
    }
  }

  /**
   * Broadcast to all connected clients
   */
  static broadcastToAll(event: string, data: any): void {
    const io = getIO();
    io.emit(event, data);
  }

  /**
   * Get number of connected clients
   */
  static getConnectedClientsCount(): number {
    const io = getIO();
    return io.sockets.sockets.size;
  }

  /**
   * Check if user is online
   */
  static isUserOnline(userId: string): boolean {
    const io = getIO();
    const room = io.sockets.adapter.rooms.get(`user:${userId}`);
    return room ? room.size > 0 : false;
  }
}
