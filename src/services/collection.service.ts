import { supabaseAdmin, supabase } from '../config/supabase';

export class CollectionService {
  private static getClient() {
    if (!supabaseAdmin) {
      throw new Error('Supabase Service Role key not configured – cannot bypass RLS.');
    }
    return supabaseAdmin;
  }

  // 1. Tạo bộ sưu tập mới
  public static async createCollection(params: {
    userId: string;
    name: string;
    description?: string;
    coverAssetId?: string;
    visibility?: 'private' | 'public';
  }) {
    const client = this.getClient();
    const { data, error } = await client
      .from('collections')
      .insert([
        {
          user_id: params.userId,
          name: params.name,
          description: params.description || null,
          cover_asset_id: params.coverAssetId || null,
          visibility: params.visibility || 'private',
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
        cover_asset:assets!cover_asset_id(id, url, thumbnail_url)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Lỗi khi lấy danh sách bộ sưu tập: ${error.message}`);
    }

    return data;
  }

  // 3. Thêm asset vào bộ sưu tập
  public static async addAssetToCollection(collectionId: string, assetId: string) {
    const client = this.getClient();
    
    // Thêm bản ghi vào collection_assets (composite PK: collection_id + asset_id)
    const { data: itemData, error: itemError } = await client
      .from('collection_assets')
      .insert([
        {
          collection_id: collectionId,
          asset_id: assetId,
        },
      ])
      .select()
      .single();

    if (itemError) {
      // Nếu đã tồn tại asset trong bộ sưu tập (Unique Constraint), ta thông báo
      if (itemError.code === '23505') {
        throw new Error('Asset đã tồn tại trong bộ sưu tập này.');
      }
      throw new Error(`Lỗi khi thêm asset vào bộ sưu tập: ${itemError.message}`);
    }

    // Tự động gán ảnh bìa nếu chưa có
    const { data: colDetails } = await client
      .from('collections')
      .select('cover_asset_id')
      .eq('id', collectionId)
      .single();

    if (!colDetails?.cover_asset_id) {
      await client
        .from('collections')
        .update({ cover_asset_id: assetId })
        .eq('id', collectionId);
    }

    return itemData;
  }

  // 4. Lấy danh sách assets thuộc bộ sưu tập
  public static async getCollectionItems(collectionId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('collection_assets')
      .select(`
        collection_id,
        asset_id,
        added_at,
        asset:assets(*)
      `)
      .eq('collection_id', collectionId);

    if (error) {
      throw new Error(`Lỗi khi lấy danh sách asset trong bộ sưu tập: ${error.message}`);
    }

    // Map kết quả trả ra mảng phẳng chứa thông tin asset
    return data.map((item: any) => item.asset).filter((a: any) => a !== null);
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

  // 6. Cập nhật bộ sưu tập
  public static async updateCollection(collectionId: string, userId: string, params: {
    name?: string;
    description?: string;
    coverAssetId?: string;
    visibility?: 'private' | 'public';
  }) {
    const client = this.getClient();
    const { data, error } = await client
      .from('collections')
      .update({
        name: params.name,
        description: params.description,
        cover_asset_id: params.coverAssetId,
        visibility: params.visibility,
        updated_at: new Date().toISOString(),
      })
      .eq('id', collectionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Lỗi khi cập nhật bộ sưu tập: ${error.message}`);
    }

    return data;
  }

  // 7. Xóa asset khỏi bộ sưu tập
  public static async removeAssetFromCollection(collectionId: string, assetId: string) {
    const client = this.getClient();
    const { error } = await client
      .from('collection_assets')
      .delete()
      .eq('collection_id', collectionId)
      .eq('asset_id', assetId);

    if (error) {
      throw new Error(`Lỗi khi xóa asset khỏi bộ sưu tập: ${error.message}`);
    }

    return { success: true };
  }

  // 8. Lấy chi tiết bộ sưu tập
  public static async getCollectionById(collectionId: string, userId: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from('collections')
      .select(`
        *,
        cover_asset:assets!cover_asset_id(id, url, thumbnail_url)
      `)
      .eq('id', collectionId)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error(`Lỗi khi lấy chi tiết bộ sưu tập: ${error.message}`);
    }

    return data;
  }
}
