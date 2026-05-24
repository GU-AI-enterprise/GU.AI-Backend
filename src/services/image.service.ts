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

  // 1. Lưu bản ghi asset mới vào database (thay thế bảng images cũ)
  public static async createImage(params: {
    userId: string;
    fileUrl: string;
    thumbnailUrl?: string;
    type?: 'image' | 'video' | 'file';
    category?: 'product' | 'model' | 'background' | 'output' | 'reference';
    fileSize?: number;
    fileName?: string;
    mimeType?: string;
    width?: number;
    height?: number;
  }) {
    const client = this.getClient();
    const { data, error } = await client
      .from('assets')
      .insert([
        {
          user_id: params.userId,
          url: params.fileUrl,
          thumbnail_url: params.thumbnailUrl || null,
          type: params.type || 'image',
          category: params.category || 'product',
          file_size: params.fileSize || 0,
          file_name: params.fileName || null,
          mime_type: params.mimeType || null,
          width: params.width || null,
          height: params.height || null,
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Lỗi khi tạo bản ghi asset: ${error.message}`);
    }

    return data;
  }

  // 2. Lấy danh sách ảnh (assets) của người dùng
  public static async getUserImages(userId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('assets')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'image')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Lỗi khi lấy danh sách ảnh: ${error.message}`);
    }

    return data;
  }

  // 3. Xóa ảnh (hard delete – bảng assets mới không có cột is_deleted)
  public static async deleteImage(userId: string, imageId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('assets')
      .delete()
      .eq('id', imageId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Lỗi khi xóa ảnh: ${error.message}`);
    }

    return data;
  }
}
