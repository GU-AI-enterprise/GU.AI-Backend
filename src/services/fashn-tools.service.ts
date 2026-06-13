import { supabaseAdmin } from '../config/supabase';

export interface ParamDef {
  name: string;
  type: string;
  required: boolean;
  enum?: (string | number)[];
  min?: number;
  max?: number;
}

export interface FashnToolMeta {
  tool_key: string;        // internal snake_case key (e.g. 'remove_background')
  model_name: string;      // Fashn API kebab-case name (e.g. 'background-remove')
  display_name: string;
  output_type: 'image' | 'video';
  required_inputs: string[];
  optional_inputs: string[];
  param_schema: ParamDef[];
  base_credit: number;
  use_case: string | null;
  purpose: string | null;
}

let _cache: FashnToolMeta[] | null = null;
let _cacheAt = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function db() {
  if (!supabaseAdmin) throw new Error('Supabase chưa được cấu hình');
  return supabaseAdmin;
}

export class FashnToolsService {
  static async getAll(): Promise<FashnToolMeta[]> {
    if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache;

    const { data, error } = await db()
      .from('fashn_tools')
      .select('tool_key, model_name, display_name, output_type, required_inputs, optional_inputs, param_schema, base_credit, use_case, purpose')
      .eq('is_active', true)
      .order('display_order');

    if (error || !data) throw new Error(`Lỗi load fashn_tools: ${error?.message}`);
    // Fallback: if tool_key is missing (column not yet migrated), derive from model_name
    _cache = data.map(t => ({
      ...t,
      tool_key: t.tool_key ?? (t.model_name as string).replace(/-/g, '_'),
    })) as FashnToolMeta[];
    _cacheAt = Date.now();
    return _cache;
  }

  // Map keyed by tool_key — used by executor and validator
  static async getByToolKey(): Promise<Record<string, FashnToolMeta>> {
    const tools = await this.getAll();
    return Object.fromEntries(tools.map(t => [t.tool_key, t]));
  }

  static invalidate() {
    _cache = null;
  }
}
