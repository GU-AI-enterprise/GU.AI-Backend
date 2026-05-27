import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthRequest } from '../middlewares/auth.middleware';
import { UserRole } from '../types/role';
import { SocketService } from '../services/socket.service';

const SUPPORT_MESSAGE_SELECT = `
  id,
  conversation_id,
  sender_id,
  sender_type,
  content,
  message_type,
  is_read,
  created_at,
  sender:users!support_messages_sender_id_fkey(id, name, email, avatar_url, role)
`;

const SUPPORT_CONVERSATION_SELECT = `
  id,
  user_id,
  assigned_staff_id,
  status,
  source,
  last_message_at,
  created_at,
  updated_at,
  user:users!support_conversations_user_id_fkey(id, name, email, avatar_url, role),
  assigned_staff:users!support_conversations_assigned_staff_id_fkey(id, name, email, avatar_url, role)
`;

export class SupportController {
  private ensureAdminClient(res: Response): boolean {
    if (!supabaseAdmin) {
      res.status(500).json({ success: false, error: 'Supabase admin client is not configured.' });
      return false;
    }
    return true;
  }

  private getSenderType(role: UserRole): 'user' | 'staff' | 'admin' {
    if (role === UserRole.ADMIN) return 'admin';
    if (role === UserRole.STAFF) return 'staff';
    return 'user';
  }

  public async getMyConversation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
      }
      if (!this.ensureAdminClient(res)) return;

      let { data: conversation, error } = await supabaseAdmin!
        .from('support_conversations')
        .select(SUPPORT_CONVERSATION_SELECT)
        .eq('user_id', req.user.id)
        .in('status', ['open', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!conversation) {
        const { data: created, error: createError } = await supabaseAdmin!
          .from('support_conversations')
          .insert({
            user_id: req.user.id,
            status: 'open',
            source: 'web',
            last_message_at: new Date().toISOString(),
          })
          .select(SUPPORT_CONVERSATION_SELECT)
          .single();

        if (createError) throw createError;
        conversation = created;
      }

      const { data: messages, error: messageError } = await supabaseAdmin!
        .from('support_messages')
        .select(SUPPORT_MESSAGE_SELECT)
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (messageError) throw messageError;

      res.status(200).json({ success: true, data: { conversation, messages: messages || [] } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to get support conversation.', details: err.message });
    }
  }

  public async getConversations(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
      }
      if (!this.ensureAdminClient(res)) return;

      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      let query = supabaseAdmin!
        .from('support_conversations')
        .select(SUPPORT_CONVERSATION_SELECT)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;

      res.status(200).json({ success: true, data: data || [] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to get support conversations.', details: err.message });
    }
  }

  public async getConversationMessages(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
      }
      if (!this.ensureAdminClient(res)) return;

      const { conversationId } = req.params;
      const { data: conversation, error: conversationError } = await supabaseAdmin!
        .from('support_conversations')
        .select(SUPPORT_CONVERSATION_SELECT)
        .eq('id', conversationId)
        .single();

      if (conversationError || !conversation) {
        res.status(404).json({ success: false, error: 'Conversation not found.' });
        return;
      }

      if (req.user.role === UserRole.CUSTOMER && conversation.user_id !== req.user.id) {
        res.status(403).json({ success: false, error: 'Access denied.' });
        return;
      }

      const { data: messages, error } = await supabaseAdmin!
        .from('support_messages')
        .select(SUPPORT_MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      res.status(200).json({ success: true, data: { conversation, messages: messages || [] } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to get support messages.', details: err.message });
    }
  }

  public async sendMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
      }
      if (!this.ensureAdminClient(res)) return;

      const { conversationId } = req.params;
      const { content } = req.body;

      if (!content || typeof content !== 'string' || !content.trim()) {
        res.status(400).json({ success: false, error: 'Message content is required.' });
        return;
      }

      const { data: conversation, error: conversationError } = await supabaseAdmin!
        .from('support_conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (conversationError || !conversation) {
        res.status(404).json({ success: false, error: 'Conversation not found.' });
        return;
      }

      if (req.user.role === UserRole.CUSTOMER && conversation.user_id !== req.user.id) {
        res.status(403).json({ success: false, error: 'Access denied.' });
        return;
      }

      const senderType = this.getSenderType(req.user.role);
      const now = new Date().toISOString();

      const { data: message, error: insertError } = await supabaseAdmin!
        .from('support_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: req.user.id,
          sender_type: senderType,
          content: content.trim(),
          message_type: 'text',
          is_read: false,
        })
        .select(SUPPORT_MESSAGE_SELECT)
        .single();

      if (insertError) throw insertError;

      const updates: Record<string, any> = {
        last_message_at: now,
        updated_at: now,
      };

      if (senderType !== 'user' && !conversation.assigned_staff_id) {
        updates.assigned_staff_id = req.user.id;
        updates.status = 'pending';
      }

      await supabaseAdmin!
        .from('support_conversations')
        .update(updates)
        .eq('id', conversationId);

      SocketService.broadcastToConversation(conversationId, {
        fromUserId: req.user.id,
        toUserId: conversation.user_id,
        conversationId,
        content: message.content,
        timestamp: new Date(message.created_at),
      });
      SocketService.sendMonitoringData({
        type: 'system',
        metric: 'support_message_created',
        value: { conversationId, message },
        timestamp: new Date(),
      });

      res.status(201).json({ success: true, data: message });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to send support message.', details: err.message });
    }
  }

  public async updateConversationStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
      }
      if (!this.ensureAdminClient(res)) return;

      const { conversationId } = req.params;
      const { status } = req.body;
      const allowedStatuses = ['open', 'pending', 'resolved', 'closed'];

      if (!allowedStatuses.includes(status)) {
        res.status(400).json({ success: false, error: 'Invalid conversation status.' });
        return;
      }

      const { data, error } = await supabaseAdmin!
        .from('support_conversations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .select(SUPPORT_CONVERSATION_SELECT)
        .single();

      if (error) throw error;

      SocketService.broadcastToConversation(conversationId, {
        fromUserId: req.user.id,
        toUserId: data.user_id,
        conversationId,
        content: `Conversation status changed to ${status}`,
        timestamp: new Date(),
      });

      res.status(200).json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to update conversation status.', details: err.message });
    }
  }
}
