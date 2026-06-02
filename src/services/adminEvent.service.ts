import { getIO } from '../config/socket';

export type AdminEventType =
  | 'job_created'
  | 'job_completed'
  | 'job_failed'
  | 'user_action'
  | 'system';

export interface AdminEvent {
  id: string;
  type: AdminEventType;
  message: string;
  userId?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

const MAX_EVENTS = 200;
const recentEvents: AdminEvent[] = [];

export class AdminEventService {
  static emit(event: Omit<AdminEvent, 'id' | 'timestamp'>): void {
    const fullEvent: AdminEvent = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      ...event,
    };

    recentEvents.unshift(fullEvent);
    if (recentEvents.length > MAX_EVENTS) recentEvents.pop();

    try {
      const io = getIO();
      io.to('admins').emit('admin_event', fullEvent);
    } catch {
      // Socket.IO not yet initialized during startup
    }
  }

  static getRecent(limit = 100): AdminEvent[] {
    return recentEvents.slice(0, Math.min(limit, MAX_EVENTS));
  }
}
