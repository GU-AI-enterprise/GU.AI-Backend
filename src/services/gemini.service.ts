import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export interface GenerateImageOptions {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageSize?: '1K' | '2K' | '4K';
}

export interface GenerateImageResult {
  base64Image: string;
  mimeType: string;
  textResponse?: string;
  modelUsed: string;
  keyIndex: number;
}

export interface TestKeyResult {
  keyIndex: number;
  ok: boolean;
  error?: string;
  modelUsed?: string;
}

class GeminiService {
  private clients: { keyIndex: number; client: GoogleGenerativeAI }[] = [];
  private modelName: string;
  private currentKeyIndex = 0;

  constructor() {
    const keys = [
      process.env.GEMINI_API_KEY_1,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY_4,
    ].filter(Boolean) as string[];

    if (keys.length === 0) {
      console.warn('[GeminiService] No GEMINI_API_KEY_* env vars found. AI features will be disabled.');
    }

    this.clients = keys.map((key, idx) => ({
      keyIndex: idx + 1,
      client: new GoogleGenerativeAI(key),
    }));

    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  private getModel(client: GoogleGenerativeAI): GenerativeModel {
    return client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseModalities: ['Text', 'Image'],
      } as any,
    });
  }

  private getNextClient() {
    if (this.clients.length === 0) {
      throw new Error('No Gemini API keys configured');
    }
    const entry = this.clients[this.currentKeyIndex % this.clients.length];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.clients.length;
    return entry;
  }

  /**
   * Test tất cả các API key có hoạt động không.
   * Trả về kết quả từng key.
   */
  public async testAllKeys(): Promise<TestKeyResult[]> {
    const results: TestKeyResult[] = [];

    for (const entry of this.clients) {
      try {
        const model = this.getModel(entry.client);
        const result = await model.generateContent('Say "OK" in one word.');
        const text = result.response.text();
        results.push({
          keyIndex: entry.keyIndex,
          ok: text.toLowerCase().includes('ok'),
          modelUsed: this.modelName,
        });
      } catch (err: any) {
        results.push({
          keyIndex: entry.keyIndex,
          ok: false,
          error: err.message || String(err),
        });
      }
    }

    return results;
  }

  /**
   * Generate image từ text prompt với rotate key + fallback.
   */
  public async generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
    const { prompt, aspectRatio = '1:1', imageSize = '1K' } = options;

    const augmentedPrompt = `[Aspect ratio: ${aspectRatio}, Resolution: ${imageSize}] ${prompt}`;

    const startIndex = this.currentKeyIndex;
    let attempts = 0;

    while (attempts < this.clients.length) {
      const entry = this.getNextClient();
      attempts++;

      try {
        const model = this.getModel(entry.client);
        const result = await model.generateContent(augmentedPrompt);
        const response = result.response;

        let base64Image = '';
        let mimeType = 'image/png';
        let textResponse = '';

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            base64Image = part.inlineData.data;
            mimeType = part.inlineData.mimeType || 'image/png';
          } else if (part.text) {
            textResponse += part.text;
          }
        }

        if (!base64Image) {
          throw new Error('Model returned no image data');
        }

        return {
          base64Image,
          mimeType,
          textResponse: textResponse || undefined,
          modelUsed: this.modelName,
          keyIndex: entry.keyIndex,
        };
      } catch (err: any) {
        const isQuotaError =
          err.message?.includes('429') ||
          err.message?.includes('quota') ||
          err.message?.includes('Resource exhausted') ||
          err.message?.includes('rate limit');

        if (isQuotaError && attempts < this.clients.length) {
          console.warn(`[GeminiService] Key ${entry.keyIndex} quota exceeded. Trying next key...`);
          continue;
        }

        throw err;
      }
    }

    throw new Error('All Gemini API keys exhausted or failed');
  }

  /**
   * Edit/conversational image generation: upload ảnh + prompt để chỉnh sửa.
   */
  public async editImage(
    imageBuffer: Buffer,
    mimeType: string,
    prompt: string
  ): Promise<GenerateImageResult> {
    const startIndex = this.currentKeyIndex;
    let attempts = 0;

    while (attempts < this.clients.length) {
      const entry = this.getNextClient();
      attempts++;

      try {
        const model = this.getModel(entry.client);
        const base64Data = imageBuffer.toString('base64');

        const result = await model.generateContent([
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          prompt,
        ]);

        const response = result.response;

        let outBase64 = '';
        let outMimeType = 'image/png';
        let textResponse = '';

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            outBase64 = part.inlineData.data;
            outMimeType = part.inlineData.mimeType || 'image/png';
          } else if (part.text) {
            textResponse += part.text;
          }
        }

        if (!outBase64) {
          throw new Error('Model returned no edited image data');
        }

        return {
          base64Image: outBase64,
          mimeType: outMimeType,
          textResponse: textResponse || undefined,
          modelUsed: this.modelName,
          keyIndex: entry.keyIndex,
        };
      } catch (err: any) {
        const isQuotaError =
          err.message?.includes('429') ||
          err.message?.includes('quota') ||
          err.message?.includes('Resource exhausted') ||
          err.message?.includes('rate limit');

        if (isQuotaError && attempts < this.clients.length) {
          console.warn(`[GeminiService] Key ${entry.keyIndex} quota exceeded. Trying next key...`);
          continue;
        }

        throw err;
      }
    }

    throw new Error('All Gemini API keys exhausted or failed');
  }

  public getConfiguredKeyCount(): number {
    return this.clients.length;
  }
}

export const geminiService = new GeminiService();
