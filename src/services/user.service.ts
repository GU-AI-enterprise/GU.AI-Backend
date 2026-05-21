import { supabaseAdmin, supabase } from '../config/supabase';

export class UserService {
  // Lấy thông tin user profile từ Database
  public static async getUserProfile(userId: string) {
    const client = supabaseAdmin || supabase; // Fallback sang supabase client thông thường nếu không cấu hình admin
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
}
