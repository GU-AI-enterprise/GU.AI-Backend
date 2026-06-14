import { getIO } from '../config/socket';
import { supabaseAdmin } from '../config/supabase';

export type AdminEventType =
  | 'job_created'
  | 'job_completed'
  | 'job_failed'
  | 'user_action'
  | 'system'
  | 'payment_created'
  | 'payment_updated';

export interface AdminEvent {
  id: string;
  type: AdminEventType;
  message: string;
  userId?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface AdminEventStats {
  total: number;
  job_created: number;
  job_completed: number;
  job_failed: number;
}

export interface AdminEventsResult {
  events: AdminEvent[];
  stats: AdminEventStats;
  hasMore: boolean;
}

// In-memory buffer for real-time push (latest 200)
const MAX_MEM = 200;
const recentEvents: AdminEvent[] = [];

// Actions we care about in the admin log
const TRACKED_ACTIONS: AdminEventType[] = [
  'job_created', 'job_completed', 'job_failed', 'user_action', 'system',
];

export class AdminEventService {
  static emit(event: Omit<AdminEvent, 'id' | 'timestamp'>): void {
    const fullEvent: AdminEvent = {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).substr(2, 12),
      timestamp: new Date().toISOString(),
      ...event,
    };

    // In-memory buffer for real-time
    recentEvents.unshift(fullEvent);
    if (recentEvents.length > MAX_MEM) recentEvents.pop();

    // Persist to activity_logs (fire-and-forget, errors are non-fatal)
    this.persistToDB(fullEvent).catch((err) => {
      console.warn('[AdminEventService] persistToDB error:', err?.message);
    });

    // Socket.IO push to admins room
    try {
      const io = getIO();
      io.to('admins').emit('admin_event', fullEvent);
    } catch {
      // Socket.IO not yet initialized during startup
    }
  }

  private static async persistToDB(event: AdminEvent): Promise<void> {
    if (!supabaseAdmin) return;
    try {
      // Determine target_type from event type
      const targetType = event.type.startsWith('job_') ? 'ai_job' : null;
      const targetId   = event.metadata?.jobId ?? null;
      const actorRole  = event.userId ? 'customer' : 'system';

      await supabaseAdmin.from('activity_logs').insert({
        id:          event.id,
        user_id:     event.userId ?? null,
        actor_role:  actorRole,
        action:      event.type,
        target_type: targetType,
        target_id:   targetId,
        metadata:    { ...event.metadata, message: event.message },
        created_at:  event.timestamp,
      });
    } catch (err: any) {
      console.warn('[AdminEventService] DB persist failed:', err.message);
    }
  }

  /**
   * Query admin events from activity_logs by date with pagination + daily stats.
   */
  static async query(params: {
    date: string;   // 'YYYY-MM-DD'
    limit?: number;
    offset?: number;
  }): Promise<AdminEventsResult> {
    if (!supabaseAdmin) {
      const mem = recentEvents.slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 20));
      return { events: mem, stats: this.computeStats(recentEvents), hasMore: false };
    }

    const limit  = params.limit  ?? 20;
    const offset = params.offset ?? 0;

    // Day range in Vietnam local time (UTC+7)
    const dayStart = new Date(params.date + 'T00:00:00.000+07:00');
    const dayEnd   = new Date(params.date + 'T23:59:59.999+07:00');

    // Paginated events
    const { data: rows, error } = await supabaseAdmin
      .from('activity_logs')
      .select('id, user_id, action, target_type, target_id, metadata, created_at')
      .in('action', TRACKED_ACTIONS)
      .gte('created_at', dayStart.toISOString())
      .lte('created_at', dayEnd.toISOString())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`AdminEvent query failed: ${error.message}`);

    // Total count for the day
    const { count } = await supabaseAdmin
      .from('activity_logs')
      .select('id', { count: 'exact', head: true })
      .in('action', TRACKED_ACTIONS)
      .gte('created_at', dayStart.toISOString())
      .lte('created_at', dayEnd.toISOString());

    // Per-type counts
    const { data: typeCounts } = await supabaseAdmin
      .from('activity_logs')
      .select('action')
      .in('action', TRACKED_ACTIONS)
      .gte('created_at', dayStart.toISOString())
      .lte('created_at', dayEnd.toISOString());

    const stats: AdminEventStats = {
      total:         count ?? 0,
      job_created:   typeCounts?.filter(r => r.action === 'job_created').length   ?? 0,
      job_completed: typeCounts?.filter(r => r.action === 'job_completed').length ?? 0,
      job_failed:    typeCounts?.filter(r => r.action === 'job_failed').length    ?? 0,
    };

    const events: AdminEvent[] = (rows ?? []).map(r => ({
      id:       r.id,
      type:     r.action as AdminEventType,
      message:  r.metadata?.message ?? r.action,
      userId:   r.user_id ?? undefined,
      metadata: r.metadata ?? undefined,
      timestamp: r.created_at,
    }));

    return { events, stats, hasMore: offset + limit < (count ?? 0) };
  }

  private static computeStats(events: Pick<AdminEvent, 'type'>[]): AdminEventStats {
    return {
      total:         events.length,
      job_created:   events.filter(e => e.type === 'job_created').length,
      job_completed: events.filter(e => e.type === 'job_completed').length,
      job_failed:    events.filter(e => e.type === 'job_failed').length,
    };
  }

  static getRecent(limit = 20): AdminEvent[] {
    return recentEvents.slice(0, Math.min(limit, MAX_MEM));
  }
}
