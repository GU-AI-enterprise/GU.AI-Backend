import { supabaseAdmin } from '../config/supabase';

export type AssetStatus = 'active' | 'archived';

export class ImageService {
  private static getClient() {
    if (!supabaseAdmin) {
      throw new Error('Supabase Service Role key not configured – cannot bypass RLS.');
    }
    return supabaseAdmin;
  }

  // 1. Lưu bản ghi asset mới
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
      .insert([{
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
        status: 'active',
      }])
      .select()
      .single();
    if (error) throw new Error(`Lỗi khi tạo bản ghi asset: ${error.message}`);
    return data;
  }

  // 2. Lấy assets active (ảnh + video, tuỳ chọn lọc theo category hoặc type)
  public static async getUserImages(userId: string, category?: string, type?: string) {
    const client = this.getClient();
    let query = client
      .from('assets')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (category) query = query.eq('category', category);
    if (type) query = query.eq('type', type);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(`Lỗi khi lấy danh sách assets: ${error.message}`);
    return data;
  }

  // 2b. Bản phân trang của getUserImages — dùng cho lazy-load (modal picker trong Studio).
  // Lấy limit+1 dòng để biết hasMore mà không cần query count riêng.
  public static async getUserImagesPaginated(
    userId: string, category: string | undefined, type: string | undefined, limit: number, offset: number
  ): Promise<{ items: any[]; hasMore: boolean }> {
    const client = this.getClient();
    let query = client
      .from('assets')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (category) query = query.eq('category', category);
    if (type) query = query.eq('type', type);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit);
    if (error) throw new Error(`Lỗi khi lấy danh sách assets: ${error.message}`);
    const rows = data ?? [];
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  }

  // 3. Lấy assets trong Archive (ảnh + video)
  public static async getArchivedImages(userId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('assets')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'archived')
      .order('archived_at', { ascending: false });
    if (error) throw new Error(`Lỗi khi lấy danh sách assets archive: ${error.message}`);
    return data;
  }

  // 4. Chuyển vào Archive (soft delete)
  public static async archiveImage(userId: string, imageId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('assets')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', imageId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .select()
      .single();
    if (error) throw new Error(`Lỗi khi chuyển ảnh vào archive: ${error.message}`);
    if (!data) throw new Error('Không tìm thấy ảnh.');

    // Xóa cover của collection nếu ảnh này đang là thumbnail
    await client
      .from('collections')
      .update({ cover_asset_id: null })
      .eq('user_id', userId)
      .eq('cover_asset_id', imageId);

    return data;
  }

  // 5. Khôi phục từ Archive về gallery
  public static async restoreFromArchive(userId: string, imageId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('assets')
      .update({ status: 'active', archived_at: null })
      .eq('id', imageId)
      .eq('user_id', userId)
      .eq('status', 'archived')
      .select()
      .single();
    if (error) throw new Error(`Lỗi khi khôi phục ảnh: ${error.message}`);
    if (!data) throw new Error('Không tìm thấy ảnh trong archive.');
    return data;
  }

  // 6. Xóa vĩnh viễn một ảnh từ Archive
  public static async permanentlyDeleteImage(userId: string, imageId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('assets')
      .delete()
      .eq('id', imageId)
      .eq('user_id', userId)
      .eq('status', 'archived')
      .select()
      .single();
    if (error) throw new Error(`Lỗi khi xóa vĩnh viễn ảnh: ${error.message}`);
    if (!data) throw new Error('Không tìm thấy ảnh trong archive.');
    return data;
  }

  // 7. Dọn sạch toàn bộ Archive
  public static async emptyArchive(userId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('assets')
      .delete()
      .eq('user_id', userId)
      .eq('status', 'archived')
      .select('id');
    if (error) throw new Error(`Lỗi khi dọn archive: ${error.message}`);
    return { deletedCount: data?.length ?? 0 };
  }

  // 8. Chuyển nhiều ảnh vào Archive
  public static async bulkArchive(userId: string, imageIds: string[]) {
    const client = this.getClient();
    const { data, error } = await client
      .from('assets')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('id', imageIds)
      .eq('status', 'active')
      .select('id');
    if (error) throw new Error(`Lỗi khi archive hàng loạt: ${error.message}`);

    // Xóa cover của bất kỳ collection nào đang dùng các ảnh này làm thumbnail
    if (imageIds.length > 0) {
      await client
        .from('collections')
        .update({ cover_asset_id: null })
        .eq('user_id', userId)
        .in('cover_asset_id', imageIds);
    }

    return { archivedCount: data?.length ?? 0 };
  }

  // 9. [Cron] Xóa vĩnh viễn ảnh đã archive quá 2 ngày
  public static async cleanupExpiredArchive(): Promise<{ deletedCount: number }> {
    const client = this.getClient();
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await client
      .from('assets')
      .delete()
      .eq('status', 'archived')
      .lt('archived_at', cutoff)
      .select('id');
    if (error) throw new Error(`Lỗi khi cleanup archive: ${error.message}`);
    return { deletedCount: data?.length ?? 0 };
  }

  // 10. [Admin] Thống kê archive toàn hệ thống
  public static async getArchiveStats() {
    const client = this.getClient();
    const { data, error } = await client
      .from('assets')
      .select('id, user_id, file_size, archived_at')
      .eq('status', 'archived');
    if (error) throw new Error(`Lỗi khi lấy thống kê archive: ${error.message}`);
    const totalSize = (data ?? []).reduce((sum, a) => sum + (a.file_size || 0), 0);
    const uniqueUsers = new Set((data ?? []).map(a => a.user_id)).size;
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const expiredCount = (data ?? []).filter(a => a.archived_at && a.archived_at < cutoff).length;
    return { totalItems: data?.length ?? 0, totalSizeBytes: totalSize, uniqueUsers, expiredItems: expiredCount };
  }
}
