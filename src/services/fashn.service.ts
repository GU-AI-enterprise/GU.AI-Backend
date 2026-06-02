import { TryOnCategory, TryOnMode, FashnResolution, FashnGenerationMode } from '../constants/ai';
export { TryOnCategory, TryOnMode };

const FASHN_BASE_URL = 'https://api.fashn.ai/v1';
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;

// ─── Result types ──────────────────────────────────────────────────────────────

export interface FashnResult {
  outputUrl: string;
  predictionId: string;
}

// kept for backward compat
export type TryOnResult = FashnResult;

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
}

// ─── Input option types ────────────────────────────────────────────────────────

export interface TryOnOptions {
  modelImage: string;
  garmentImage: string;
  category: TryOnCategory;
  mode?: TryOnMode;
}

export interface TryOnMaxOptions {
  /** Ảnh sản phẩm/trang phục */
  productImage: string;
  /** Ảnh người mẫu */
  modelImage: string;
  resolution?: FashnResolution;
  generationMode?: 'balanced' | 'quality';
  numImages?: number;
}

export interface ProductToModelOptions {
  productImage: string;
  prompt?: string;
  aspectRatio?: string;
  resolution?: FashnResolution;
  generationMode?: FashnGenerationMode;
  /** URL ảnh mặt tham chiếu (thêm ~3 Fashn credits) */
  faceReference?: string;
}

export interface ReframeOptions {
  image: string;
  aspectRatio: string;
  resolution?: FashnResolution;
}

export interface EditImageOptions {
  image: string;
  prompt: string;
  /** PNG mask cùng kích thước: trắng = vùng chỉnh, đen = giữ nguyên */
  mask?: string;
  resolution?: FashnResolution;
  generationMode?: FashnGenerationMode;
}

// ─── Fashn status response type ────────────────────────────────────────────────

interface FashnStatusResponse {
  id: string;
  status: 'starting' | 'in_queue' | 'processing' | 'completed' | 'failed';
  output?: string[];
  error?: { name?: string; message?: string } | string | null;
}

// ─── Service ───────────────────────────────────────────────────────────────────

class FashnService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.FASHN_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[FashnService] FASHN_API_KEY chưa được cấu hình. AI features sẽ bị vô hiệu hóa.');
    }
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Core: submit job → get predictionId ──────────────────────────────────────

  private async run(modelName: string, inputs: Record<string, any>): Promise<string> {
    if (!this.apiKey) throw new Error('FASHN_API_KEY chưa được cấu hình.');

    const res = await fetch(`${FASHN_BASE_URL}/run`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ model_name: modelName, inputs }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Fashn API lỗi ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { id: string; error?: string | null };
    if (data.error) throw new Error(`Fashn run error: ${data.error}`);
    return data.id;
  }

  // ── Core: poll until completed or timeout ────────────────────────────────────

  private async pollUntilDone(predictionId: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const res = await fetch(`${FASHN_BASE_URL}/status/${predictionId}`, {
        headers: this.headers,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Fashn status lỗi ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as FashnStatusResponse;
      console.log(`[FashnService] ${predictionId} → ${data.status}`);

      if (data.status === 'completed') {
        const outputUrl = data.output?.[0];
        if (!outputUrl) throw new Error('Fashn trả về kết quả rỗng.');
        return outputUrl;
      }

      if (data.status === 'failed') {
        const err = data.error;
        const name =
          err && typeof err === 'object' ? (err.name ?? 'UnknownError') : 'UnknownError';
        const msg =
          err && typeof err === 'object'
            ? (err.message ?? String(err))
            : String(err ?? 'lỗi không xác định');
        throw new Error(`Fashn ${name}: ${msg}`);
      }
    }

    throw new Error('Fashn prediction vượt quá 120 giây.');
  }

  // ── Virtual Try-On v1.6 ──────────────────────────────────────────────────────

  public async tryOn(options: TryOnOptions): Promise<FashnResult> {
    const { modelImage, garmentImage, category, mode = TryOnMode.BALANCED } = options;

    const predictionId = await this.run('tryon-v1.6', {
      model_image: modelImage,
      garment_image: garmentImage,
      category,
      mode,
    });

    const outputUrl = await this.pollUntilDone(predictionId);
    return { outputUrl, predictionId };
  }

  // ── Virtual Try-On Max ───────────────────────────────────────────────────────

  public async tryOnMax(options: TryOnMaxOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = {
      product_image: options.productImage,
      model_image: options.modelImage,
    };
    if (options.resolution) inputs.resolution = options.resolution;
    if (options.generationMode) inputs.generation_mode = options.generationMode;
    if (options.numImages) inputs.num_images = options.numImages;

    const predictionId = await this.run('tryon-max', inputs);
    const outputUrl = await this.pollUntilDone(predictionId);
    return { outputUrl, predictionId };
  }

  // ── Background Remove ────────────────────────────────────────────────────────

  public async removeBackground(imageUrl: string): Promise<FashnResult> {
    const predictionId = await this.run('background-remove', { image: imageUrl });
    const outputUrl = await this.pollUntilDone(predictionId);
    return { outputUrl, predictionId };
  }

  // ── Product to Model ─────────────────────────────────────────────────────────

  public async productToModel(options: ProductToModelOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = {
      product_image: options.productImage,
    };
    if (options.prompt) inputs.prompt = options.prompt;
    if (options.aspectRatio) inputs.aspect_ratio = options.aspectRatio;
    if (options.resolution) inputs.resolution = options.resolution;
    if (options.generationMode) inputs.generation_mode = options.generationMode;
    if (options.faceReference) inputs.face_reference = options.faceReference;

    const predictionId = await this.run('product-to-model', inputs);
    const outputUrl = await this.pollUntilDone(predictionId);
    return { outputUrl, predictionId };
  }

  // ── Reframe ──────────────────────────────────────────────────────────────────

  public async reframe(options: ReframeOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = {
      image: options.image,
      aspect_ratio: options.aspectRatio,
    };
    if (options.resolution) inputs.resolution = options.resolution;

    const predictionId = await this.run('reframe', inputs);
    const outputUrl = await this.pollUntilDone(predictionId);
    return { outputUrl, predictionId };
  }

  // ── Edit Image ───────────────────────────────────────────────────────────────

  public async editImage(options: EditImageOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = {
      image: options.image,
      prompt: options.prompt,
    };
    if (options.mask) inputs.mask = options.mask;
    if (options.resolution) inputs.resolution = options.resolution;
    if (options.generationMode) inputs.generation_mode = options.generationMode;

    const predictionId = await this.run('edit', inputs);
    const outputUrl = await this.pollUntilDone(predictionId);
    return { outputUrl, predictionId };
  }

  // ── Test connection ──────────────────────────────────────────────────────────

  public async testConnection(): Promise<TestConnectionResult> {
    if (!this.apiKey) {
      return { ok: false, error: 'FASHN_API_KEY chưa được cấu hình.' };
    }
    try {
      // GET /status với id giả — 404 = key hợp lệ, 401/403 = sai key
      const res = await fetch(`${FASHN_BASE_URL}/status/ping-test`, {
        headers: this.headers,
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: 'API key không hợp lệ hoặc không có quyền truy cập.' };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  // ── Get Fashn credits balance ────────────────────────────────────────────────

  public async getCredits(): Promise<{ total: number; subscription: number; onDemand: number }> {
    if (!this.apiKey) throw new Error('FASHN_API_KEY chưa được cấu hình.');

    const res = await fetch(`${FASHN_BASE_URL}/credits`, { headers: this.headers });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Fashn credits API lỗi ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as {
      credits: { total: number; subscription: number; on_demand: number };
    };
    return {
      total: data.credits.total,
      subscription: data.credits.subscription,
      onDemand: data.credits.on_demand,
    };
  }

  public isConfigured(): boolean {
    return !!this.apiKey;
  }
}

export const fashnService = new FashnService();
