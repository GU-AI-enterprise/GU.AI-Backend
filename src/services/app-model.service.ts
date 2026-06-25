import { supabaseAdmin } from '../config/supabase';

export type PlanType = 'free' | 'basic' | 'pro' | 'agency';
const PLAN_ORDER: PlanType[] = ['free', 'basic', 'pro', 'agency'];

export interface AppModelRow {
  id: string;
  name: string;
  image_url: string;
  gender: 'male' | 'female' | 'unisex' | null;
  tags: string[] | null;
  required_tier: PlanType;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppModelForUser extends AppModelRow {
  unlocked: boolean;
}

export interface AppModelInput {
  name: string;
  image_url: string;
  gender?: 'male' | 'female' | 'unisex' | null;
  tags?: string[];
  required_tier?: PlanType;
  display_order?: number;
  is_active?: boolean;
}

let _cache: AppModelRow[] | null = null;
let _cacheAt = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 phút

function db() {
  if (!supabaseAdmin) throw new Error('Supabase chưa được cấu hình');
  return supabaseAdmin;
}

export class AppModelService {
  /** Danh sách active, cache để giảm tải DB — dùng cho user-facing GET /api/models. */
  static async getActive(): Promise<AppModelRow[]> {
    if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;

    const { data, error } = await db()
      .from('app_models')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    _cache = (data ?? []) as AppModelRow[];
    _cacheAt = Date.now();
    return _cache;
  }

  static async getForUser(userTier: PlanType): Promise<AppModelForUser[]> {
    const all = await this.getActive();
    const userIdx = PLAN_ORDER.indexOf(userTier);
    return all.map((m) => ({
      ...m,
      unlocked: PLAN_ORDER.indexOf(m.required_tier) <= userIdx,
    }));
  }

  // ── Admin CRUD (không cache, luôn đọc mới nhất) ─────────────────────────────

  static async getAllAdmin(): Promise<AppModelRow[]> {
    const { data, error } = await db()
      .from('app_models')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;
    return (data ?? []) as AppModelRow[];
  }

  static async create(input: AppModelInput): Promise<AppModelRow> {
    const { data, error } = await db()
      .from('app_models')
      .insert({ ...input })
      .select('*')
      .single();

    if (error) throw error;
    this.invalidate();
    return data as AppModelRow;
  }

  static async update(id: string, input: Partial<AppModelInput>): Promise<AppModelRow> {
    const { data, error } = await db()
      .from('app_models')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    this.invalidate();
    return data as AppModelRow;
  }

  static async remove(id: string): Promise<void> {
    const { error } = await db().from('app_models').delete().eq('id', id);
    if (error) throw error;
    this.invalidate();
  }

  static async reorder(items: { id: string; display_order: number }[]): Promise<void> {
    for (const item of items) {
      const { error } = await db()
        .from('app_models')
        .update({ display_order: item.display_order })
        .eq('id', item.id);
      if (error) throw error;
    }
    this.invalidate();
  }

  static invalidate() {
    _cache = null;
  }
}
