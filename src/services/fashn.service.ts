const FASHN_BASE_URL = 'https://api.fashn.ai/v1';
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;

import { TryOnCategory, TryOnMode } from '../constants/ai';
export { TryOnCategory, TryOnMode };

export interface TryOnOptions {
  modelImage: string; // URL hoặc data URI base64
  garmentImage: string; // URL hoặc data URI base64
  category: TryOnCategory;
  mode?: TryOnMode;
}

export interface TryOnResult {
  outputUrl: string;
  predictionId: string;
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
}

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

  public async testConnection(): Promise<TestConnectionResult> {
    if (!this.apiKey) {
      return { ok: false, error: 'FASHN_API_KEY chưa được cấu hình.' };
    }
    try {
      // GET /status với một id giả — 404 nghĩa là key hợp lệ, 401/403 nghĩa là sai key
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

  public async tryOn(options: TryOnOptions): Promise<TryOnResult> {
    if (!this.apiKey) {
      throw new Error('FASHN_API_KEY chưa được cấu hình.');
    }

    const { modelImage, garmentImage, category, mode = 'balanced' } = options;

    // 1. Khởi tạo prediction
    const runRes = await fetch(`${FASHN_BASE_URL}/run`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model_image: modelImage,
        garment_image: garmentImage,
        category,
        mode,
      }),
    });

    if (!runRes.ok) {
      const errText = await runRes.text();
      throw new Error(`Fashn API lỗi ${runRes.status}: ${errText}`);
    }

    const runData = (await runRes.json()) as { id: string; error?: string };
    if (runData.error) throw new Error(`Fashn run error: ${runData.error}`);

    const predictionId = runData.id;

    // 2. Poll đến khi hoàn thành hoặc timeout
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const statusRes = await fetch(`${FASHN_BASE_URL}/status/${predictionId}`, {
        headers: this.headers,
      });

      if (!statusRes.ok) {
        const errText = await statusRes.text();
        throw new Error(`Fashn status lỗi ${statusRes.status}: ${errText}`);
      }

      const statusData = (await statusRes.json()) as {
        id: string;
        status: 'starting' | 'in_queue' | 'processing' | 'completed' | 'failed';
        output?: string[];
        error?: string;
      };

      console.log(`[FashnService] Prediction ${predictionId} — status: ${statusData.status}`);

      if (statusData.status === 'completed') {
        const outputUrl = statusData.output?.[0];
        if (!outputUrl) throw new Error('Fashn trả về kết quả rỗng.');
        return { outputUrl, predictionId };
      }

      if (statusData.status === 'failed') {
        throw new Error(`Fashn thất bại: ${statusData.error || 'lỗi không xác định'}`);
      }
    }

    throw new Error('Fashn prediction vượt quá 120 giây.');
  }

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
