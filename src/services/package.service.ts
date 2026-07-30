import { supabaseAdmin } from '../config/supabase';
import { PLAN_ORDER, type PlanType } from '../utils/planExpiry.util';

export type { PlanType };

export interface PackageDescription {
  ai_assistant?: boolean;
  models_unlocked?: number | 'all';
  perks?: string[];
}

export interface CreditPackageRow {
  id: string;
  name: string;
  price: number;
  credit_amount: number;
  bonus_credit: number;
  is_active: boolean;
  sort_order: number;
  grants_plan_type: PlanType | null;
  description: PackageDescription | null;
  created_at: string;
  updated_at: string;
}

export interface CreditPackageInput {
  name: string;
  price: number;
  credit_amount: number;
  bonus_credit?: number;
  is_active?: boolean;
  sort_order?: number;
  grants_plan_type?: PlanType | null;
  description?: PackageDescription | null;
}

function db() {
  if (!supabaseAdmin) throw new Error('Supabase chưa được cấu hình');
  return supabaseAdmin;
}

export class PackageService {
  static async getAllAdmin(): Promise<CreditPackageRow[]> {
    const { data, error } = await db()
      .from('credit_packages')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CreditPackageRow[];
  }

  static async create(input: CreditPackageInput): Promise<CreditPackageRow> {
    const { data, error } = await db()
      .from('credit_packages')
      .insert({ ...input })
      .select('*')
      .single();

    if (error) throw error;
    return data as CreditPackageRow;
  }

  static async update(id: string, input: Partial<CreditPackageInput>): Promise<CreditPackageRow> {
    const { data, error } = await db()
      .from('credit_packages')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as CreditPackageRow;
  }

  static async remove(id: string): Promise<void> {
    const { error } = await db().from('credit_packages').delete().eq('id', id);
    if (error) throw error;
  }
}

export const VALID_GRANTS_PLAN_TYPES: PlanType[] = [...PLAN_ORDER];
