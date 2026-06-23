import { supabaseAdmin } from '../config/supabase';
import type { ConversationTurn } from './workflow.service';

const MAX_PERSISTED_TURNS = 100; // chặn JSONB phình to vô hạn / context Gemini quá dài

export class WorkflowChatService {
  static async getTurns(userId: string): Promise<ConversationTurn[]> {
    const { data, error } = await supabaseAdmin!
      .from('workflow_chat_state')
      .select('turns')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return (data?.turns as ConversationTurn[]) ?? [];
  }

  /** Nối thêm 1 lượt trao đổi (user + assistant) vào lịch sử đã lưu, cắt theo MAX_PERSISTED_TURNS. */
  static async appendTurn(
    userId: string,
    userTurn: ConversationTurn,
    assistantTurn: ConversationTurn,
  ): Promise<void> {
    const existing = await this.getTurns(userId);
    const updated = [...existing, userTurn, assistantTurn].slice(-MAX_PERSISTED_TURNS);

    const { error } = await supabaseAdmin!
      .from('workflow_chat_state')
      .upsert(
        { user_id: userId, turns: updated, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );

    if (error) throw error;
  }

  static async clear(userId: string): Promise<void> {
    const { error } = await supabaseAdmin!
      .from('workflow_chat_state')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  }
}
