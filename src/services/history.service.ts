import { supabaseAdmin, supabase } from '../config/supabase';

export class HistoryService {
  private static getClient() {
    return supabaseAdmin || supabase;
  }

  public static async getUserHistory(
    userId: string,
    opts: {
      jobPage?: number;
      jobLimit?: number;
      jobDateFrom?: string;
      jobDateTo?: string;
    } = {}
  ) {
    const client = this.getClient();
    const { jobPage = 1, jobLimit = 10, jobDateFrom, jobDateTo } = opts;
    const offset = (jobPage - 1) * jobLimit;

    let jobQuery = client
      .from('ai_jobs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (jobDateFrom) {
      jobQuery = jobQuery.gte('created_at', jobDateFrom);
    }
    if (jobDateTo) {
      const end = new Date(jobDateTo);
      end.setDate(end.getDate() + 1);
      jobQuery = jobQuery.lt('created_at', end.toISOString());
    }

    const { data: aiJobs, error: aiJobsError, count } = await jobQuery.range(
      offset,
      offset + jobLimit - 1
    );

    if (aiJobsError) {
      throw new Error(`Lỗi khi lấy lịch sử AI jobs: ${aiJobsError.message}`);
    }

    const { data: transactions, error: txError } = await client
      .from('transactions')
      .select(`*, package:credit_packages(name, credit_amount)`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (txError) {
      throw new Error(`Lỗi khi lấy lịch sử giao dịch: ${txError.message}`);
    }

    return {
      aiJobs: aiJobs || [],
      aiJobsTotal: count ?? 0,
      aiJobsPage: jobPage,
      aiJobsLimit: jobLimit,
      aiJobsTotalPages: Math.ceil((count ?? 0) / jobLimit),
      transactions: transactions || [],
    };
  }
}
