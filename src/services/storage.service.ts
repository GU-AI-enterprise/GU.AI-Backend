import { supabaseAdmin } from '../config/supabase';

export class StorageService {
  private static getClient() {
    if (!supabaseAdmin) {
      throw new Error('Supabase Service Role key not configured');
    }
    return supabaseAdmin;
  }

  /**
   * Upload buffer lên Supabase Storage bucket 'assets'.
   * Trả về public URL.
   */
  public static async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    userId: string
  ): Promise<string> {
    return StorageService.uploadToPath(buffer, `${userId}/${Date.now()}_${fileName}`, mimeType);
  }

  public static async uploadSupportImage(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    conversationId: string
  ): Promise<string> {
    const ext = fileName.split('.').pop() ?? 'jpg';
    const path = `support/${conversationId}/${Date.now()}.${ext}`;
    return StorageService.uploadToPath(buffer, path, mimeType);
  }

  private static async uploadToPath(
    buffer: Buffer,
    path: string,
    mimeType: string
  ): Promise<string> {
    const client = this.getClient();
    const { error } = await client.storage
      .from('assets')
      .upload(path, buffer, { contentType: mimeType, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { data } = client.storage.from('assets').getPublicUrl(path);
    return data.publicUrl;
  }
}
