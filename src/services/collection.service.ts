import { supabaseAdmin, supabase } from '../config/supabase';

export class CollectionService {
  private static getClient() {
    return supabaseAdmin || supabase;
  }

  // 1. Tạo bộ sưu tập mới
  public static async createCollection(params: {
    userId: string;
    name: string;
    coverImageId?: string;
    isPublic?: boolean;
  }) {
    const client = this.getClient();
    const { data, error } = await client
      .from('collections')
      .insert([
        {
          user_id: params.userId,
          name: params.name,
          cover_image_id: params.coverImageId || null,
          is_public: params.isPublic || false,
          image_count: 0,
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Lỗi khi tạo bộ sưu tập: ${error.message}`);
    }

    return data;
  }

  // 2. Lấy danh sách bộ sưu tập của user kèm ảnh bìa
  public static async getUserCollections(userId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('collections')
      .select(`
        *,
        cover_image:images(id, file_url, thumbnail_url)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Lỗi khi lấy danh sách bộ sưu tập: ${error.message}`);
    }

    return data;
  }

  // 3. Thêm ảnh vào bộ sưu tập
  public static async addImageToCollection(collectionId: string, imageId: string) {
    const client = this.getClient();
    
    // Thêm bản ghi vào collection_items
    const { data: itemData, error: itemError } = await client
      .from('collection_items')
      .insert([
        {
          collection_id: collectionId,
          image_id: imageId,
        },
      ])
      .select()
      .single();

    if (itemError) {
      // Nếu đã tồn tại ảnh trong bộ sưu tập (Unique Constraint), ta bỏ qua hoặc thông báo
      if (itemError.code === '23505') {
        throw new Error('Ảnh đã tồn tại trong bộ sưu tập này.');
      }
      throw new Error(`Lỗi khi thêm ảnh vào bộ sưu tập: ${itemError.message}`);
    }

    // Lấy thông tin bộ sưu tập hiện tại
    const { data: collection } = await client
      .from('collections')
      .select('image_count')
      .eq('id', collectionId)
      .single();

    const currentCount = collection?.image_count || 0;

    // Cập nhật số lượng ảnh và tự động gán ảnh bìa nếu chưa có ảnh bìa
    const updateParams: any = { image_count: currentCount + 1 };
    
    const { data: colDetails } = await client
      .from('collections')
      .select('cover_image_id')
      .eq('id', collectionId)
      .single();

    if (!colDetails?.cover_image_id) {
      updateParams.cover_image_id = imageId;
    }

    await client
      .from('collections')
      .update(updateParams)
      .eq('id', collectionId);

    return itemData;
  }

  // 4. Lấy danh sách ảnh thuộc bộ sưu tập
  public static async getCollectionItems(collectionId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('collection_items')
      .select(`
        id,
        sort_order,
        image:images(*)
      `)
      .eq('collection_id', collectionId);

    if (error) {
      throw new Error(`Lỗi khi lấy danh sách ảnh trong bộ sưu tập: ${error.message}`);
    }

    // Map kết quả trả ra mảng phẳng chứa thông tin ảnh
    return data.map((item: any) => item.image).filter((img: any) => img !== null && !img.is_deleted);
  }

  // 5. Xóa bộ sưu tập
  public static async deleteCollection(userId: string, collectionId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('collections')
      .delete()
      .eq('id', collectionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Lỗi khi xóa bộ sưu tập: ${error.message}`);
    }

    return data;
  }
}
