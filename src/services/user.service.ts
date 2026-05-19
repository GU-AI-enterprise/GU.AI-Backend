import { supabase } from '../config/supabase';

export class UserService {
  // Lấy thông tin user profile từ Database
  public static async getUserProfile(userId: string) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  }
}
