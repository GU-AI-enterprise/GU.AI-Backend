import { supabaseAdmin } from '../config/supabase';

export class LibraryService {
  static async getAll() {
    const { data, error } = await supabaseAdmin!
      .from('library_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }
}
