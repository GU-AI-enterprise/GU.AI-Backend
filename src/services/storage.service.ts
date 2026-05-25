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
    const client = this.getClient();
    const path = `${userId}/${Date.now()}_${fileName}`;

    const { error: uploadError } = await client.storage
      .from('assets')
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data } = client.storage.from('assets').getPublicUrl(path);
    return data.publicUrl;
  }
}
