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
  //    Nếu cover_asset bị archive/null → tự tìm ảnh active đầu tiên trong collection làm fallback
  public static async getUserCollections(userId: string) {
    const client = this.getClient();

    // Query 1: lấy collections + cover_asset (kèm status để check)
    const { data: collections, error } = await client
      .from('collections')
      .select(`*, cover_asset:assets!cover_asset_id(id, url, thumbnail_url, status)`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Lỗi khi lấy danh sách bộ sưu tập: ${error.message}`);
    if (!collections?.length) return [];

    // Xác định collections cần fallback thumbnail
    const needsFallbackIds = collections
      .filter(col => !(col as any).cover_asset || (col as any).cover_asset?.status !== 'active')
      .map(col => col.id);

    if (!needsFallbackIds.length) return collections;

    // Query 2: lấy tất cả collection_assets cho các collections cần fallback
    const { data: caRows } = await client
      .from('collection_assets')
      .select('collection_id, asset_id, added_at')
      .in('collection_id', needsFallbackIds)
      .order('added_at', { ascending: false });

    if (!caRows?.length) return collections;

    // Query 3: lấy active assets từ danh sách asset_id trên
    const assetIds = [...new Set(caRows.map(r => r.asset_id))];
    const { data: activeAssets } = await client
      .from('assets')
      .select('id, url, thumbnail_url')
      .in('id', assetIds)
      .eq('status', 'active');

    // Build fallback map: collectionId → ảnh active đầu tiên (theo thứ tự added_at desc)
    const activeSet = new Set((activeAssets ?? []).map(a => a.id));
    const fallbackMap = new Map<string, { id: string; url: string; thumbnail_url: string }>();

    for (const row of caRows) {
      if (!fallbackMap.has(row.collection_id) && activeSet.has(row.asset_id)) {
        const asset = (activeAssets ?? []).find(a => a.id === row.asset_id);
        if (asset) fallbackMap.set(row.collection_id, asset);
      }
    }

    // Merge: nếu cover không hợp lệ → dùng fallback
    return collections.map(col => {
      const cover = (col as any).cover_asset;
      if (cover && cover.status === 'active') return col;
      const fallback = fallbackMap.get(col.id) ?? null;
      return { ...col, cover_asset: fallback };
    });
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
        cover_asset:assets!cover_asset_id(id, url, thumbnail_url, status)
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
