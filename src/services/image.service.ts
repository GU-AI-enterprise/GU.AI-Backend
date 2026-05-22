import { supabaseAdmin, supabase } from '../config/supabase';

export class ImageService {
  /**
   * Return Supabase client for server‑side operations.
   * When RLS is enabled we must use the Service Role key to bypass policies.
   * If the service key is missing we throw an explicit error so the issue is visible.
   */
  private static getClient() {
    if (!supabaseAdmin) {
      throw new Error('Supabase Service Role key not configured – cannot bypass RLS.');
    }
    return supabaseAdmin;
  }

  // 1. Lưu bản ghi ảnh mới vào database
  public static async createImage(params: {
    userId: string;
    fileUrl: string;
    thumbnailUrl?: string;
    type?: 'input' | 'output' | 'edit' | 'temp';
    fileSize?: number;
    jobId?: string;
  }) {
    const client = this.getClient();
    const { data, error } = await client
      .from('images')
      .insert([
        {
          user_id: params.userId,
          file_url: params.fileUrl,
          thumbnail_url: params.thumbnailUrl || null,
          type: params.type || 'input',
          file_size: params.fileSize || 0,
          job_id: params.jobId || null,
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Lỗi khi tạo bản ghi ảnh: ${error.message}`);
    }

    return data;
  }

  // 2. Lấy danh sách ảnh của người dùng (không lấy ảnh đã bị xóa mềm)
  public static async getUserImages(userId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('images')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Lỗi khi lấy danh sách ảnh: ${error.message}`);
    }

    return data;
  }

  // 3. Xóa mềm ảnh (đặt is_deleted = true)
  public static async deleteImage(userId: string, imageId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('images')
      .update({ is_deleted: true })
      .eq('id', imageId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Lỗi khi xóa ảnh: ${error.message}`);
    }

    return data;
  }

  // 4. Tạo bản ghi lô tải lên hàng loạt (batch uploads)
  public static async createBatchUpload(userId: string, totalFiles: number) {
    const client = this.getClient();
    const { data, error } = await client
      .from('batch_uploads')
      .insert([
        {
          user_id: userId,
          total_files: totalFiles,
          uploaded_count: 0,
          failed_count: 0,
          status: 'processing',
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Lỗi khi tạo batch upload: ${error.message}`);
    }

    return data;
  }

  // 5. Cập nhật tiến độ tải lên hàng loạt
  public static async updateBatchUpload(
    batchId: string,
    params: {
      uploadedCount: number;
      failedCount: number;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      errorLog?: any;
    }
  ) {
    const client = this.getClient();
    const { data, error } = await client
      .from('batch_uploads')
      .update({
        uploaded_count: params.uploadedCount,
        failed_count: params.failedCount,
        status: params.status,
        error_log: params.errorLog || null,
      })
      .eq('id', batchId)
      .select()
      .single();

    if (error) {
      throw new Error(`Lỗi khi cập nhật batch upload: ${error.message}`);
    }

    return data;
  }
}
