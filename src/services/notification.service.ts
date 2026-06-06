import { supabaseAdmin } from '../config/supabase';
import { SocketService } from './socket.service';
import { NotificationType, NotificationStatus, NotificationPriority } from '../constants/notification';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  data?: Record<string, any>;
}

export class NotificationService {
  private static get client() {
    if (!supabaseAdmin) throw new Error('Supabase admin client not configured');
    return supabaseAdmin;
  }

  static async create(params: CreateNotificationParams): Promise<void> {
    try {
      const { data, error } = await this.client
        .from('notifications')
        .insert({
          user_id: params.userId,
          type: params.type,
          title: params.title,
          content: params.content,
          priority: params.priority ?? NotificationPriority.NORMAL,
          action_url: params.actionUrl ?? null,
          data: params.data ?? {},
          status: NotificationStatus.UNREAD,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[NotificationService] Error creating notification:', error.message);
        return;
      }

      // Push real-time via socket
      type SocketAlertType = 'success' | 'info' | 'warning' | 'error';
      const socketTypeMap: Record<NotificationType, SocketAlertType> = {
        [NotificationType.PAYMENT]:   'success',
        [NotificationType.AI_JOB]:    'success',
        [NotificationType.PROMOTION]: 'success',
        [NotificationType.SECURITY]:  'warning',
        [NotificationType.SUPPORT]:   'info',
        [NotificationType.SYSTEM]:    'info',
      };
      SocketService.sendNotification({
        userId: params.userId,
        type: socketTypeMap[params.type] ?? 'info',
        title: params.title,
        message: params.content,
        data: { notificationId: data.id, category: params.type, ...(params.data ?? {}) },
      });
    } catch (err: any) {
      console.error('[NotificationService] Unexpected error:', err.message);
    }
  }

  static async getUserNotifications(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<{ notifications: any[]; total: number }> {
    const { data, count, error } = await this.client
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    return { notifications: data ?? [], total: count ?? 0 };
  }

  static async markRead(notificationId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from('notifications')
      .update({ status: NotificationStatus.READ, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
  }

  static async markAllRead(userId: string): Promise<void> {
    const { error } = await this.client
      .from('notifications')
      .update({ status: NotificationStatus.READ, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', NotificationStatus.UNREAD);

    if (error) throw new Error(error.message);
  }

  static async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await this.client
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', NotificationStatus.UNREAD);

    if (error) throw new Error(error.message);
    return count ?? 0;
  }
}
