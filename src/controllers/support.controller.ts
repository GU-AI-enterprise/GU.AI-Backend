import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthRequest } from '../middlewares/auth.middleware';
import { UserRole } from '../types/role';
import { SocketService } from '../services/socket.service';
import { SupportStatus, SenderType, MessageType, ConversationSource } from '../constants/support';
import { sendSuccess, sendError } from '../utils/response';
import { StorageService } from '../services/storage.service';

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

  private getSenderType(role: UserRole | string): SenderType {
    const roleStr = String(role).toLowerCase().trim();
    console.log('[SupportController] getSenderType input:', role, 'normalized:', roleStr);
    if (roleStr === 'admin' || roleStr === UserRole.ADMIN) return SenderType.ADMIN;
    if (roleStr === 'staff' || roleStr === UserRole.STAFF) return SenderType.STAFF;
    return SenderType.CUSTOMER;
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
        .in('status', [SupportStatus.OPEN, SupportStatus.PENDING])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!conversation) {
        const { data: created, error: createError } = await supabaseAdmin!
          .from('support_conversations')
          .insert({
            user_id: req.user.id,
            status: SupportStatus.OPEN,
            source: ConversationSource.WEB,
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

      // Customer opened their chat → mark staff/admin messages as read + notify staff
      await supabaseAdmin!
        .from('support_messages')
        .update({ is_read: true })
        .eq('conversation_id', conversation.id)
        .neq('sender_type', SenderType.CUSTOMER)
        .eq('is_read', false);
      SocketService.emitReadReceipt(conversation.id, 'customer');

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

      const status   = typeof req.query.status === 'string' ? req.query.status : undefined;
      const userRole = (req.user as any).role as string;

      let query = supabaseAdmin!
        .from('support_conversations')
        .select(SUPPORT_CONVERSATION_SELECT)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      // Staff only see conversations assigned to them or unassigned
      // Admin sees everything
      if (userRole === 'staff') {
        query = query.or(`assigned_staff_id.eq.${req.user!.id},assigned_staff_id.is.null`);
      }

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

      // Auto mark-read when opening the conversation
      const isStaff = req.user.role === UserRole.STAFF || req.user.role === UserRole.ADMIN;
      if (isStaff) {
        // Staff opened → mark customer messages as read + notify customer
        await supabaseAdmin!
          .from('support_messages')
          .update({ is_read: true })
          .eq('conversation_id', conversationId)
          .eq('sender_type', SenderType.CUSTOMER)
          .eq('is_read', false);
        SocketService.emitReadReceipt(conversationId, 'staff');
      } else {
        // Customer opened → mark staff messages as read + notify staff
        await supabaseAdmin!
          .from('support_messages')
          .update({ is_read: true })
          .eq('conversation_id', conversationId)
          .neq('sender_type', SenderType.CUSTOMER)
          .eq('is_read', false);
        SocketService.emitReadReceipt(conversationId, 'customer');
      }

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

      // First-responder assignment lock:
      // If conversation is already assigned to another staff, only that staff (or admin) can reply
      if (
        conversation.assigned_staff_id &&
        conversation.assigned_staff_id !== req.user.id &&
        req.user.role === UserRole.STAFF
      ) {
        res.status(409).json({
          success: false,
          error: 'Cuộc hội thoại này đã được nhận bởi một staff khác.',
          data: { assigned_staff_id: conversation.assigned_staff_id },
        });
        return;
      }

      let senderType = this.getSenderType(req.user.role);
      // Đảm bảo sender_type luôn hợp lệ
      if (!Object.values(SenderType).includes(senderType)) {
        console.error('[SupportController] Invalid senderType calculated:', senderType, 'from role:', req.user.role);
        senderType = SenderType.CUSTOMER;
      }
      
      const now = new Date().toISOString();

      console.log('[SupportController] sendMessage:', {
        userId: req.user.id,
        userRole: req.user.role,
        userRoleType: typeof req.user.role,
        senderType,
        conversationId
      });

      const insertPayload = {
        conversation_id: conversationId,
        sender_id: req.user.id,
        sender_type: senderType,
        content: content.trim(),
        message_type: MessageType.TEXT,
        is_read: false,
      };

      console.log('[SupportController] Insert payload:', insertPayload);
      console.log('[SupportController] sender_type value:', JSON.stringify(insertPayload.sender_type));
      console.log('[SupportController] sender_type length:', insertPayload.sender_type.length);

      const { data: message, error: insertError } = await supabaseAdmin!
        .from('support_messages')
        .insert(insertPayload)
        .select(SUPPORT_MESSAGE_SELECT)
        .single();

      if (insertError) throw insertError;

      const updates: Record<string, any> = {
        last_message_at: now,
        updated_at: now,
      };

      if (senderType !== 'customer' && !conversation.assigned_staff_id) {
        updates.assigned_staff_id = req.user.id;
        updates.status = SupportStatus.PENDING;
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

      if (senderType !== SenderType.CUSTOMER) {
        // Staff/admin replied → notify the customer
        SocketService.emitSupportNewMessage(conversation.user_id, conversationId);
      } else {
        // Customer sent a message → notify all staff/admin
        SocketService.emitSupportNeedsHelp(conversationId);
      }

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

  /**
   * Role-aware badge count:
   * - Customer → count of unread messages from staff/admin in their conversation
   * - Staff/Admin → count of conversations with unread messages from customers
   */
  public async getBadgeCount(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) { sendError(res, 401, 'Authentication required.'); return; }
      if (!this.ensureAdminClient(res)) return;

      const role = req.user.role;
      const isStaff = role === UserRole.STAFF || role === UserRole.ADMIN;

      if (!isStaff) {
        // Customer: count unread staff/admin messages in their active conversation
        const { data: conv } = await supabaseAdmin!
          .from('support_conversations')
          .select('id')
          .eq('user_id', req.user.id)
          .in('status', [SupportStatus.OPEN, SupportStatus.PENDING])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!conv) {
          sendSuccess(res, { data: { count: 0, role, conversationId: null } });
          return;
        }

        const { count } = await supabaseAdmin!
          .from('support_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('is_read', false)
          .neq('sender_type', SenderType.CUSTOMER);

        sendSuccess(res, { data: { count: count ?? 0, role, conversationId: conv.id } });
      } else {
        // Staff/Admin: count conversations with at least one unread customer message
        const { data: convIds } = await supabaseAdmin!
          .from('support_messages')
          .select('conversation_id')
          .eq('sender_type', SenderType.CUSTOMER)
          .eq('is_read', false)
          .limit(1000);

        const unique = new Set((convIds ?? []).map((r: any) => r.conversation_id));
        sendSuccess(res, { data: { count: unique.size, role, conversationId: null } });
      }
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  /**
   * Role-aware mark-read:
   * - Customer → marks staff/admin messages in their conversation as read
   * - Staff/Admin → marks customer messages in specified conversation as read
   */
  public async markConversationRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) { sendError(res, 401, 'Authentication required.'); return; }
      if (!this.ensureAdminClient(res)) return;

      const { conversationId } = req.params;
      const role = req.user.role;
      const isStaff = role === UserRole.STAFF || role === UserRole.ADMIN;

      if (!isStaff) {
        // Customer: verify ownership
        const { data: conv } = await supabaseAdmin!
          .from('support_conversations')
          .select('id')
          .eq('id', conversationId)
          .eq('user_id', req.user.id)
          .maybeSingle();

        if (!conv) { sendError(res, 404, 'Conversation not found.'); return; }

        await supabaseAdmin!
          .from('support_messages')
          .update({ is_read: true })
          .eq('conversation_id', conversationId)
          .neq('sender_type', SenderType.CUSTOMER)
          .eq('is_read', false);

        // Notify staff that customer has read their messages
        SocketService.emitReadReceipt(conversationId, 'customer');
      } else {
        await supabaseAdmin!
          .from('support_messages')
          .update({ is_read: true })
          .eq('conversation_id', conversationId)
          .eq('sender_type', SenderType.CUSTOMER)
          .eq('is_read', false);

        // Notify customer that staff has read their messages
        SocketService.emitReadReceipt(conversationId, 'staff');
      }

      sendSuccess(res, { data: null });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  public async uploadSupportImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) { sendError(res, 401, 'Authentication required.'); return; }
      if (!this.ensureAdminClient(res)) return;

      const { conversationId } = req.params;
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) { sendError(res, 400, 'Cần gửi file ảnh.'); return; }

      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowed.includes(file.mimetype)) {
        sendError(res, 400, 'Chỉ chấp nhận ảnh JPEG, PNG, GIF, WEBP.'); return;
      }

      // Verify conversation access
      const { data: conv, error: convErr } = await supabaseAdmin!
        .from('support_conversations')
        .select('id, user_id')
        .eq('id', conversationId)
        .maybeSingle();

      if (convErr || !conv) { sendError(res, 404, 'Conversation not found.'); return; }

      const role = req.user.role;
      const isStaff = role === UserRole.STAFF || role === UserRole.ADMIN;
      if (!isStaff && conv.user_id !== req.user.id) {
        sendError(res, 403, 'Access denied.'); return;
      }

      const imageUrl = await StorageService.uploadSupportImage(
        file.buffer,
        file.originalname,
        file.mimetype,
        conversationId
      );

      const senderType = this.getSenderType(req.user.role);
      const now = new Date().toISOString();

      const { data: message, error: insertErr } = await supabaseAdmin!
        .from('support_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: req.user.id,
          sender_type: senderType,
          content: imageUrl,
          message_type: MessageType.IMAGE,
          is_read: false,
        })
        .select(SUPPORT_MESSAGE_SELECT)
        .single();

      if (insertErr) throw insertErr;

      await supabaseAdmin!
        .from('support_conversations')
        .update({ last_message_at: now, updated_at: now })
        .eq('id', conversationId);

      SocketService.broadcastToConversation(conversationId, {
        fromUserId: req.user.id,
        toUserId: conv.user_id,
        conversationId,
        content: imageUrl,
        timestamp: new Date(message.created_at),
      });

      if (senderType !== SenderType.CUSTOMER) {
        SocketService.emitSupportNewMessage(conv.user_id, conversationId);
      } else {
        SocketService.emitSupportNeedsHelp(conversationId);
      }

      res.status(201).json({ success: true, data: message });
    } catch (err: any) {
      sendError(res, 500, err.message);
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
      const allowedStatuses = Object.values(SupportStatus);

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
