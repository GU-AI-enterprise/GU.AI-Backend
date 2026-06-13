# Socket.IO Setup Guide

## Overview
Socket.IO has been configured to support real-time features including:
- **Notifications**: Send notifications to specific users
- **Messaging**: Real-time messaging between users
- **Monitoring**: System monitoring for admin users

## Files Created/Modified

### Configuration
- `src/config/socket.ts` - Socket.IO initialization and configuration
- `src/server.ts` - Modified to integrate Socket.IO with HTTP server

### Services
- `src/services/socket.service.ts` - Service class for socket operations

### Middleware
- `src/middlewares/socket.middleware.ts` - Authentication middleware for socket connections

## Usage Examples

### 1. Send Notification to User
```typescript
import { SocketService } from '../services/socket.service';

SocketService.sendNotification({
  userId: 'user-id-here',
  type: 'success',
  title: 'Image Generated',
  message: 'Your image has been generated successfully',
  data: { imageId: '123' }
});
```

### 2. Send Message to User
```typescript
import { SocketService } from '../services/socket.service';

SocketService.sendMessage({
  fromUserId: 'sender-id',
  toUserId: 'receiver-id',
  conversationId: 'conv-123',
  content: 'Hello!',
  timestamp: new Date()
});
```

### 3. Broadcast to Conversation
```typescript
import { SocketService } from '../services/socket.service';

SocketService.broadcastToConversation('conv-123', {
  fromUserId: 'sender-id',
  toUserId: 'receiver-id',
  conversationId: 'conv-123',
  content: 'New message',
  timestamp: new Date()
});
```

### 4. Send Monitoring Data to Admins
```typescript
import { SocketService } from '../services/socket.service';

SocketService.sendMonitoringData({
  type: 'performance',
  metric: 'cpu_usage',
  value: 75.5,
  timestamp: new Date()
});
```

### 5. Check User Online Status
```typescript
import { SocketService } from '../services/socket.service';

const isOnline = SocketService.isUserOnline('user-id-here');
console.log(`User is online: ${isOnline}`);
```

### 6. Get Connected Clients Count
```typescript
import { SocketService } from '../services/socket.service';

const count = SocketService.getConnectedClientsCount();
console.log(`Connected clients: ${count}`);
```

## Client-Side Connection

### Basic Connection
```typescript
import { io } from 'socket.io-client';

const token = 'your-supabase-jwt-token';
const socket = io('http://localhost:5000', {
  auth: { token },
  withCredentials: true
});

// Listen for notifications
socket.on('notification', (data) => {
  console.log('Notification:', data);
});

// Listen for messages
socket.on('message', (data) => {
  console.log('Message:', data);
});

// Join a conversation
socket.emit('join-conversation', 'conversation-id');

// Leave a conversation
socket.emit('leave-conversation', 'conversation-id');

// Join admin room (for admin users)
socket.emit('join-admin');
```

## Room Structure

- `user:{userId}` - Personal room for each user (auto-joined on connection)
- `conversation:{conversationId}` - Room for conversation participants
- `admins` - Room for admin users (monitoring data)

## Events

### Server → Client
- `notification` - User notifications
- `message` - Chat messages
- `monitoring` - System monitoring data (admin only)

### Client → Server
- `join-conversation` - Join a conversation room
- `leave-conversation` - Leave a conversation room
- `join-admin` - Join admin room (requires admin role)

## Authentication

Socket connections require a valid Supabase JWT token. The token should be passed in the `auth` object:

```typescript
const socket = io('http://localhost:5000', {
  auth: { token: 'your-jwt-token' }
});
```

Or as a Bearer token in headers:

```typescript
const socket = io('http://localhost:5000', {
  extraHeaders: {
    Authorization: 'Bearer your-jwt-token'
  }
});
```

## Admin Access

To access admin monitoring features, users must have `role = 'admin'` in the `users` table. The admin authentication middleware checks this before allowing access to the admin room.

## Environment Variables

Make sure `CLIENT_URL` is set in your `.env` file for CORS configuration:

```env
CLIENT_URL=http://localhost:3000,https://your-frontend-domain.com
```
