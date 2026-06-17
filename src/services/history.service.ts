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
      txPage?: number;
      txLimit?: number;
    } = {}
  ) {
    const client = this.getClient();
    const { jobPage = 1, jobLimit = 10, jobDateFrom, jobDateTo, txPage = 1, txLimit = 10 } = opts;
    const offset = (jobPage - 1) * jobLimit;
    const txOffset = (txPage - 1) * txLimit;

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

    const { data: transactions, error: txError, count: txCount } = await client
      .from('transactions')
      .select(`*, package:credit_packages(name, credit_amount)`, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(txOffset, txOffset + txLimit - 1);

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
      transactionsTotal: txCount ?? 0,
      transactionsPage: txPage,
      transactionsLimit: txLimit,
      transactionsTotalPages: Math.ceil((txCount ?? 0) / txLimit),
    };
  }
}
