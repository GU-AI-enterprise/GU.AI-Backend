import { supabaseAdmin } from '../config/supabase';

export type StorageBucket = 'assets' | 'videos' | 'models';

export class StorageService {
  private static getClient() {
    if (!supabaseAdmin) {
      throw new Error('Supabase Service Role key not configured');
    }
    return supabaseAdmin;
  }

  /**
   * Upload buffer lên Supabase Storage.
   * bucket = 'assets' (default) cho ảnh, 'videos' cho video MP4.
   * Trả về public URL.
   */
  public static async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    userId: string,
    bucket: StorageBucket = 'assets'
  ): Promise<string> {
    return StorageService.uploadToPath(buffer, `${userId}/${Date.now()}_${fileName}`, mimeType, bucket);
  }

  public static async uploadSupportImage(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    conversationId: string
  ): Promise<string> {
    const ext = fileName.split('.').pop() ?? 'jpg';
    const path = `support/${conversationId}/${Date.now()}.${ext}`;
    return StorageService.uploadToPath(buffer, path, mimeType, 'assets');
  }

  /** Ảnh người mẫu do admin curate cho app_models — tách path khỏi ảnh user tự upload trong cùng bucket 'models'. */
  public static async uploadAppModelImage(
    buffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<string> {
    const path = `app-models/${Date.now()}_${fileName}`;
    return StorageService.uploadToPath(buffer, path, mimeType, 'models');
  }

  private static async uploadToPath(
    buffer: Buffer,
    path: string,
    mimeType: string,
    bucket: StorageBucket = 'assets'
  ): Promise<string> {
    const client = this.getClient();
    const { error } = await client.storage
      .from(bucket)
      .upload(path, buffer, { contentType: mimeType, upsert: false });
    if (error) throw new Error(`Upload failed (bucket=${bucket}): ${error.message}`);
    const { data } = client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
}
