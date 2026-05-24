import { supabaseAdmin, supabase } from '../config/supabase';

export class HistoryService {
  private static getClient() {
    return supabaseAdmin || supabase;
  }

  // Lấy lịch sử tác vụ tổng hợp của người dùng
  public static async getUserHistory(userId: string) {
    const client = this.getClient();

    // 1. Lấy lịch sử công việc AI (AI Jobs)
    const { data: aiJobs, error: aiJobsError } = await client
      .from('ai_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (aiJobsError) {
      throw new Error(`Lỗi khi lấy lịch sử AI jobs: ${aiJobsError.message}`);
    }

    // 2. Lấy lịch sử hoạt động chung (Activity Logs)
    const { data: activityLogs, error: logsError } = await client
      .from('activity_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (logsError) {
      throw new Error(`Lỗi khi lấy lịch sử hoạt động: ${logsError.message}`);
    }

    // 3. Lấy lịch sử giao dịch nạp credit (Transactions)
    const { data: transactions, error: txError } = await client
      .from('transactions')
      .select(`
        *,
        package:credit_packages(name, credit_amount)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (txError) {
      throw new Error(`Lỗi khi lấy lịch sử giao dịch: ${txError.message}`);
    }

    return {
      aiJobs: aiJobs || [],
      activityLogs: activityLogs || [],
      transactions: transactions || [],
    };
  }
}
