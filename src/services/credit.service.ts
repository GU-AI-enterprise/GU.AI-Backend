import { supabaseAdmin } from '../config/supabase';
import { AIJobType, AIJobStatus, AIProvider } from '../constants/ai';
import { AssetType, AssetCategory, AssetRole } from '../constants/asset';

export interface CreditCheckResult {
  ok: boolean;
  userCredit: number;
  missing?: number;
}

export interface AIJobCreateResult {
  jobId: string;
}

export class CreditService {
  private static getClient() {
    if (!supabaseAdmin) {
      throw new Error('Supabase Service Role key not configured');
    }
    return supabaseAdmin;
  }

  /**
   * Kiểm tra user có đủ credit không.
   */
  public static async checkCredit(userId: string, cost: number): Promise<CreditCheckResult> {
    const client = this.getClient();
    const { data, error } = await client
      .from('users')
      .select('current_credit')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new Error(`Không thể kiểm tra credit: ${error?.message || 'User not found'}`);
    }

    if (data.current_credit < cost) {
      return {
        ok: false,
        userCredit: data.current_credit,
        missing: cost - data.current_credit,
      };
    }

    return { ok: true, userCredit: data.current_credit };
  }

  /**
   * Trừ credit và ghi vào credit_ledger.
   * Được gọi SAU KHI generate thành công.
   */
  public static async deductCredit(
    userId: string,
    cost: number,
    description: string,
    jobId?: string
  ): Promise<void> {
    const client = this.getClient();

    // Lấy current_credit hiện tại
    const { data: user, error: userErr } = await client
      .from('users')
      .select('current_credit')
      .eq('id', userId)
      .single();

    if (userErr || !user) {
      throw new Error(`Không thể trừ credit: ${userErr?.message || 'User not found'}`);
    }

    const newBalance = user.current_credit - cost;

    // Chỉ INSERT vào credit_ledger — trigger trg_credit_ledger_apply (apply_credit_ledger)
    // tự động cập nhật users.current_credit. Không UPDATE trực tiếp để tránh double-deduct.
    const { error: ledgerErr } = await client.from('credit_ledger').insert({
      user_id: userId,
      ai_job_id: jobId || null,
      type: 'spend',
      amount: -cost,
      balance_after: newBalance,
      description,
    });

    if (ledgerErr) {
      throw new Error(`Lỗi ghi credit_ledger: ${ledgerErr.message}`);
    }
  }

  /**
   * Tạo AI job record.
   */
  public static async createAIJob(params: {
    userId: string;
    type: AIJobType;
    prompt?: string;
    creditCost: number;
    provider: AIProvider;
    inputParams?: any;
  }): Promise<AIJobCreateResult> {
    const client = this.getClient();

    const { data, error } = await client
      .from('ai_jobs')
      .insert({
        user_id: params.userId,
        type: params.type,
        status: 'processing',
        prompt: params.prompt || null,
        provider: params.provider,
        credit_cost: params.creditCost,
        input_params: params.inputParams || null,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Lỗi tạo AI job: ${error.message}`);
    }

    return { jobId: data.id };
  }

  /**
   * Cập nhật status AI job.
   */
  public static async updateAIJob(
    jobId: string,
    status: AIJobStatus,
    errorMessage?: string
  ): Promise<void> {
    const client = this.getClient();

    const updateData: any = { status, updated_at: new Date().toISOString() };
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }
    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { error } = await client.from('ai_jobs').update(updateData).eq('id', jobId);

    if (error) {
      throw new Error(`Lỗi cập nhật AI job: ${error.message}`);
    }
  }

  /**
   * Tạo asset record từ ảnh AI generate.
   */
  public static async saveOutputAsset(params: {
    userId: string;
    url: string;
    category: AssetCategory;
    mimeType?: string;
    fileName?: string;
    width?: number;
    height?: number;
  }) {
    const client = this.getClient();

    const { data, error } = await client
      .from('assets')
      .insert({
        user_id: params.userId,
        type: AssetType.IMAGE,
        category: params.category,
        url: params.url,
        mime_type: params.mimeType || 'image/png',
        file_name: params.fileName || null,
        width: params.width || null,
        height: params.height || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Lỗi lưu asset: ${error.message}`);
    }

    return data;
  }

  /**
   * Liên kết asset với AI job.
   */
  public static async linkAssetToJob(
    jobId: string,
    assetId: string,
    role: AssetRole
  ): Promise<void> {
    const client = this.getClient();

    const { error } = await client.from('ai_job_assets').insert({
      job_id: jobId,
      asset_id: assetId,
      role,
    });

    if (error) {
      console.error('[CreditService] Lỗi liên kết asset với job:', error.message);
    }
  }

  /**
   * Cộng credit cho user (dùng bởi admin/staff khi award thủ công).
   */
  public static async addCredit(
    userId: string,
    amount: number,
    description: string,
    type: 'bonus' | 'admin_adjust' | 'refund' = 'admin_adjust'
  ): Promise<{ newBalance: number }> {
    const client = this.getClient();

    // Đọc balance hiện tại để tính balance_after cho ledger record
    const { data: user, error: userErr } = await client
      .from('users').select('current_credit').eq('id', userId).single();
    if (userErr || !user) throw new Error(`Không thể lấy credit: ${userErr?.message ?? 'User not found'}`);

    const expectedBalance = user.current_credit + amount;

    // Chỉ INSERT vào credit_ledger.
    // Trigger apply_credit_ledger (BEFORE INSERT) tự cập nhật users.current_credit
    // và ghi đè balance_after với giá trị chính xác.
    const { error: ledgerErr } = await client.from('credit_ledger').insert({
      user_id: userId, type, amount, balance_after: expectedBalance, description,
    });
    if (ledgerErr) throw new Error(`Lỗi ghi credit_ledger: ${ledgerErr.message}`);

    // Đọc lại balance thực tế sau khi trigger chạy
    const { data: updated } = await client
      .from('users').select('current_credit').eq('id', userId).single();
    const newBalance = updated?.current_credit ?? expectedBalance;

    return { newBalance };
  }
}
