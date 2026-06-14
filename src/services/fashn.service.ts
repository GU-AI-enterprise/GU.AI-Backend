import { TryOnCategory, TryOnMode, FashnResolution, FashnGenerationMode } from '../constants/ai';
export { TryOnCategory, TryOnMode };

const FASHN_BASE_URL = 'https://api.fashn.ai/v1';
const POLL_INTERVAL_MS = 3_000;

// ─── Result types ──────────────────────────────────────────────────────────────

export interface FashnResult {
  outputUrl: string;
  predictionId: string;
  /** Raw Fashn credits consumed (from x-fashn-credits-used header). GU.AI cost = this × 2. */
  fashnCreditsUsed: number;
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
  productImage: string;
  modelImage: string;
  resolution?: FashnResolution;
  generationMode?: 'balanced' | 'quality';
  numImages?: number;
  prompt?: string;
}

export interface ProductToModelOptions {
  productImage: string;
  prompt?: string;
  imagePrompt?: string;
  faceReference?: string;
  faceReferenceMode?: 'match_base' | 'match_reference';
  backgroundReference?: string;
  aspectRatio?: string;
  resolution?: FashnResolution;
  generationMode?: FashnGenerationMode;
  seed?: number;
  numImages?: number;
  outputFormat?: 'png' | 'jpeg';
}

export interface ReframeOptions {
  image: string;
  aspectRatio: string;
  resolution?: FashnResolution;
  generationMode?: FashnGenerationMode;
  numImages?: number;
  seed?: number;
  outputFormat?: 'png' | 'jpeg';
}

export interface EditImageOptions {
  image: string;
  prompt: string;
  /** PNG mask cùng kích thước: trắng = vùng ưu tiên, đen = giữ nguyên */
  mask?: string;
  imageContext?: string;
  resolution?: FashnResolution;
  generationMode?: FashnGenerationMode;
  seed?: number;
  numImages?: number;
  outputFormat?: 'png' | 'jpeg';
}

export interface FaceToModelOptions {
  faceImage: string;
  prompt?: string;
  aspectRatio?: string;
  resolution?: FashnResolution;
  generationMode?: FashnGenerationMode;
  numImages?: number;
  seed?: number;
  outputFormat?: 'png' | 'jpeg';
}

export interface ModelCreateOptions {
  prompt: string;
  imageReference?: string;
  /** Ảnh khuôn mặt tham chiếu để khóa identity qua nhiều generation (+3 Fashn credits/image) */
  faceReference?: string;
  faceReferenceMode?: 'match_base' | 'match_reference';
  aspectRatio?: string;
  resolution?: FashnResolution;
  generationMode?: FashnGenerationMode;
  numImages?: number;
  seed?: number;
  outputFormat?: 'png' | 'jpeg';
}

export interface ModelSwapOptions {
  modelImage: string;
  prompt?: string;
  faceReference?: string;
  faceReferenceMode?: 'match_base' | 'match_reference';
  resolution?: FashnResolution;
  generationMode?: FashnGenerationMode;
  seed?: number;
  numImages?: number;
  outputFormat?: 'png' | 'jpeg';
}

export interface ImageToVideoOptions {
  image: string;
  prompt?: string;
  duration?: 5 | 10;
  /** 480p | 720p | 1080p */
  resolution?: string;
  /** Frame cuối video — chỉ hợp lệ khi resolution = "1080p" */
  endImage?: string;
}

// ─── Fashn status response type ────────────────────────────────────────────────

interface FashnStatusResponse {
  id: string;
  status: 'starting' | 'in_queue' | 'processing' | 'completed' | 'failed';
  // Most endpoints: output is string[]; face-to-model: output is { images: string[] }
  output?: string[] | { images: string[] };
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

  public async submitJob(modelName: string, inputs: Record<string, any>): Promise<{ predictionId: string; fashnCreditsUsed: number }> {
    const { id, fashnCreditsUsed } = await this.run(modelName, inputs);
    return { predictionId: id, fashnCreditsUsed };
  }

  public async waitForJob(predictionId: string): Promise<string> {
    return this.pollUntilDone(predictionId);
  }

  private async run(modelName: string, inputs: Record<string, any>): Promise<{ id: string; fashnCreditsUsed: number }> {
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
    const fashnCreditsUsed = parseInt(res.headers.get('x-fashn-credits-used') ?? '0', 10) || 0;
    return { id: data.id, fashnCreditsUsed };
  }

  // ── Core: poll until completed or timeout ────────────────────────────────────

  private async pollUntilDone(predictionId: string, maxAttempts = 120): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
        // face-to-model returns { images: [...] }; all other endpoints return string[]
        const outputUrl = Array.isArray(data.output)
          ? data.output[0]
          : (data.output as { images: string[] } | undefined)?.images?.[0];

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
    throw new Error(`Fashn job ${predictionId} timed out after ${(maxAttempts * POLL_INTERVAL_MS) / 1000}s`);
  }

  // ── Virtual Try-On v1.6 ──────────────────────────────────────────────────────

  public async tryOn(options: TryOnOptions): Promise<FashnResult> {
    const { modelImage, garmentImage, category, mode = TryOnMode.BALANCED } = options;
    const { id, fashnCreditsUsed } = await this.run('tryon-v1.6', {
      model_image: modelImage, garment_image: garmentImage, category, mode,
    });
    const outputUrl = await this.pollUntilDone(id);
    return { outputUrl, predictionId: id, fashnCreditsUsed };
  }

  // ── Virtual Try-On Max ───────────────────────────────────────────────────────

  public async tryOnMax(options: TryOnMaxOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = {
      product_image: options.productImage,
      model_image: options.modelImage,
    };
    if (options.resolution)    inputs.resolution      = options.resolution;
    if (options.generationMode)inputs.generation_mode = options.generationMode;
    if (options.numImages)     inputs.num_images      = options.numImages;
    if (options.prompt)        inputs.prompt          = options.prompt;

    const { id, fashnCreditsUsed } = await this.run('tryon-max', inputs);
    const outputUrl = await this.pollUntilDone(id);
    return { outputUrl, predictionId: id, fashnCreditsUsed };
  }

  // ── Background Remove ────────────────────────────────────────────────────────

  public async removeBackground(imageUrl: string): Promise<FashnResult> {
    const { id, fashnCreditsUsed } = await this.run('background-remove', { image: imageUrl });
    const outputUrl = await this.pollUntilDone(id);
    return { outputUrl, predictionId: id, fashnCreditsUsed };
  }

  // ── Product to Model ─────────────────────────────────────────────────────────

  public async productToModel(options: ProductToModelOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = { product_image: options.productImage };
    if (options.prompt)              inputs.prompt               = options.prompt;
    if (options.imagePrompt)         inputs.image_prompt         = options.imagePrompt;
    if (options.faceReference)       inputs.face_reference       = options.faceReference;
    if (options.faceReferenceMode)   inputs.face_reference_mode  = options.faceReferenceMode;
    if (options.backgroundReference) inputs.background_reference = options.backgroundReference;
    if (options.aspectRatio)         inputs.aspect_ratio         = options.aspectRatio;
    if (options.resolution)          inputs.resolution           = options.resolution;
    if (options.generationMode)      inputs.generation_mode      = options.generationMode;
    if (options.seed !== undefined)  inputs.seed                 = options.seed;
    if (options.numImages)           inputs.num_images           = options.numImages;
    if (options.outputFormat)        inputs.output_format        = options.outputFormat;

    const { id, fashnCreditsUsed } = await this.run('product-to-model', inputs);
    const outputUrl = await this.pollUntilDone(id);
    return { outputUrl, predictionId: id, fashnCreditsUsed };
  }

  // ── Reframe ──────────────────────────────────────────────────────────────────

  public async reframe(options: ReframeOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = { image: options.image, aspect_ratio: options.aspectRatio };
    if (options.resolution)          inputs.resolution      = options.resolution;
    if (options.generationMode)      inputs.generation_mode = options.generationMode;
    if (options.numImages && options.numImages > 1) inputs.num_images = options.numImages;
    if (options.seed !== undefined)  inputs.seed            = options.seed;
    if (options.outputFormat)        inputs.output_format   = options.outputFormat;

    const { id, fashnCreditsUsed } = await this.run('reframe', inputs);
    const outputUrl = await this.pollUntilDone(id);
    return { outputUrl, predictionId: id, fashnCreditsUsed };
  }

  // ── Edit Image ───────────────────────────────────────────────────────────────

  public async editImage(options: EditImageOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = { image: options.image, prompt: options.prompt };
    if (options.mask)                inputs.mask            = options.mask;
    if (options.imageContext)        inputs.image_context   = options.imageContext;
    if (options.resolution)          inputs.resolution      = options.resolution;
    if (options.generationMode)      inputs.generation_mode = options.generationMode;
    if (options.seed !== undefined)  inputs.seed            = options.seed;
    if (options.numImages && options.numImages > 1) inputs.num_images = options.numImages;
    if (options.outputFormat)        inputs.output_format   = options.outputFormat;

    const { id, fashnCreditsUsed } = await this.run('edit', inputs);
    const outputUrl = await this.pollUntilDone(id);
    return { outputUrl, predictionId: id, fashnCreditsUsed };
  }

  // ── Face to Model ────────────────────────────────────────────────────────────

  public async faceToModel(options: FaceToModelOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = { face_image: options.faceImage };
    if (options.prompt)              inputs.prompt          = options.prompt;
    if (options.aspectRatio)         inputs.aspect_ratio    = options.aspectRatio;
    if (options.resolution)          inputs.resolution      = options.resolution;
    if (options.generationMode)      inputs.generation_mode = options.generationMode;
    if (options.numImages && options.numImages > 1) inputs.num_images = options.numImages;
    if (options.seed !== undefined)  inputs.seed            = options.seed;
    if (options.outputFormat)        inputs.output_format   = options.outputFormat;

    const { id, fashnCreditsUsed } = await this.run('face-to-model', inputs);
    // face-to-model returns output.images[] — handled in pollUntilDone
    const outputUrl = await this.pollUntilDone(id);
    return { outputUrl, predictionId: id, fashnCreditsUsed };
  }

  // ── Model Create ─────────────────────────────────────────────────────────────

  public async modelCreate(options: ModelCreateOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = { prompt: options.prompt };
    if (options.imageReference)      inputs.image_reference     = options.imageReference;
    if (options.faceReference)       inputs.face_reference      = options.faceReference;
    if (options.faceReferenceMode)   inputs.face_reference_mode = options.faceReferenceMode;
    if (options.aspectRatio)         inputs.aspect_ratio        = options.aspectRatio;
    if (options.resolution)          inputs.resolution          = options.resolution;
    if (options.generationMode)      inputs.generation_mode     = options.generationMode;
    if (options.numImages && options.numImages > 1) inputs.num_images = options.numImages;
    if (options.seed !== undefined)  inputs.seed                = options.seed;
    if (options.outputFormat)        inputs.output_format       = options.outputFormat;

    const { id, fashnCreditsUsed } = await this.run('model-create', inputs);
    const outputUrl = await this.pollUntilDone(id);
    return { outputUrl, predictionId: id, fashnCreditsUsed };
  }

  // ── Model Swap ───────────────────────────────────────────────────────────────

  public async modelSwap(options: ModelSwapOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = { model_image: options.modelImage };
    if (options.prompt)             inputs.prompt               = options.prompt;
    if (options.faceReference)      inputs.face_reference       = options.faceReference;
    if (options.faceReferenceMode)  inputs.face_reference_mode  = options.faceReferenceMode;
    if (options.resolution)         inputs.resolution           = options.resolution;
    if (options.generationMode)     inputs.generation_mode      = options.generationMode;
    if (options.seed !== undefined) inputs.seed                 = options.seed;
    if (options.numImages)          inputs.num_images           = options.numImages;
    if (options.outputFormat)       inputs.output_format        = options.outputFormat;

    const { id, fashnCreditsUsed } = await this.run('model-swap', inputs);
    const outputUrl = await this.pollUntilDone(id);
    return { outputUrl, predictionId: id, fashnCreditsUsed };
  }

  // ── Image to Video ───────────────────────────────────────────────────────────

  public async imageToVideo(options: ImageToVideoOptions): Promise<FashnResult> {
    const inputs: Record<string, any> = { image: options.image };
    if (options.prompt)     inputs.prompt      = options.prompt;
    if (options.duration)   inputs.duration    = options.duration;
    if (options.resolution) inputs.resolution  = options.resolution;
    // end_image only valid when resolution = "1080p"
    if (options.endImage && options.resolution === '1080p') inputs.end_image = options.endImage;

    const { id, fashnCreditsUsed } = await this.run('image-to-video', inputs);
    const outputUrl = await this.pollUntilDone(id);
    return { outputUrl, predictionId: id, fashnCreditsUsed };
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
