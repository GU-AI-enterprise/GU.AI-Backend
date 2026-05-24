import { supabaseAdmin } from '../config/supabase';

export class UserService {
  private static getClient() {
    if (!supabaseAdmin) {
      throw new Error('Supabase Service Role key not configured');
    }
    return supabaseAdmin;
  }

  // Lấy thông tin user profile từ Database
  public static async getUserProfile(userId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  // Cập nhật user profile
  public static async updateUserProfile(userId: string, params: {
    name?: string;
    avatar_url?: string;
  }) {
    const client = this.getClient();
    const { data, error } = await client
      .from('users')
      .update({
        name: params.name,
        avatar_url: params.avatar_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}
