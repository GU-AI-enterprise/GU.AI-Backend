import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { fashnService } from '../services/fashn.service';
import { CreditService } from '../services/credit.service';
import { StorageService } from '../services/storage.service';
import { sendSuccess, sendError } from '../utils/response';
import { AIJobType, AIJobStatus, AIProvider, TryOnCategory, TryOnMode, CREDIT_COST } from '../constants/ai';
import { AssetCategory, AssetRole } from '../constants/asset';

const VALID_CATEGORIES = Object.values(TryOnCategory);
const VALID_MODES = Object.values(TryOnMode);

export class AIController {
  /**
   * POST /api/ai/test
   * Kiểm tra kết nối tới Fashn.ai với API key hiện tại.
   */
  public async testConnection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await fashnService.testConnection();
      sendSuccess(res, {
        message: result.ok
          ? 'Kết nối Fashn.ai thành công.'
          : `Kết nối Fashn.ai thất bại: ${result.error}`,
        data: {
          ok: result.ok,
          configured: fashnService.isConfigured(),
          error: result.error,
        },
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  /**
   * GET /api/ai/credits
   * Trả về số credits còn lại trên tài khoản Fashn.ai.
   */
  public async getCredits(req: AuthRequest, res: Response): Promise<void> {
    try {
      const credits = await fashnService.getCredits();
      sendSuccess(res, {
        message: 'Lấy credits Fashn.ai thành công.',
        data: credits,
      });
    } catch (err: any) {
      console.error('[AIController.getCredits]', err.message);
      sendError(res, 500, err.message);
    }
  }

  /**
   * POST /api/ai/try-on
   * Virtual try-on: ghép quần áo lên ảnh người mẫu.
   *
   * Chấp nhận multipart/form-data với:
   *   - modelImage  (file)  HOẶC  modelImageUrl  (string trong body)
   *   - garmentImage (file) HOẶC  garmentImageUrl (string trong body)
   *   - category: 'tops' | 'bottoms' | 'one-pieces'
   *   - mode?:     'quality' | 'balanced' | 'speed'  (mặc định: 'balanced')
   */
  public async tryOn(req: AuthRequest, res: Response): Promise<void> {
    let jobId: string | undefined;
    const cost = CREDIT_COST[AIJobType.TRY_ON];

    try {
      const userId = req.user?.id;
      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }

      // ── Lấy category & mode ──────────────────────────────────────────────
      const category: TryOnCategory = req.body.category;
      const mode: TryOnMode = req.body.mode || 'balanced';

      if (!category || !VALID_CATEGORIES.includes(category)) {
        sendError(res, 400, `category phải là một trong: ${VALID_CATEGORIES.join(', ')}.`);
        return;
      }
      if (!VALID_MODES.includes(mode)) {
        sendError(res, 400, `mode phải là một trong: ${VALID_MODES.join(', ')}.`);
        return;
      }

      // ── Xây dựng model_image và garment_image ────────────────────────────
      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;

      const modelImageFile = files?.['modelImage']?.[0];
      const garmentImageFile = files?.['garmentImage']?.[0];

      const modelImageUrl: string | undefined = req.body.modelImageUrl;
      const garmentImageUrl: string | undefined = req.body.garmentImageUrl;

      // Ưu tiên file upload, nếu không có thì dùng URL
      const modelImage = modelImageFile
        ? `data:${modelImageFile.mimetype};base64,${modelImageFile.buffer.toString('base64')}`
        : modelImageUrl;

      const garmentImage = garmentImageFile
        ? `data:${garmentImageFile.mimetype};base64,${garmentImageFile.buffer.toString('base64')}`
        : garmentImageUrl;

      if (!modelImage) {
        sendError(res, 400, 'Cần cung cấp modelImage (file) hoặc modelImageUrl.');
        return;
      }
      if (!garmentImage) {
        sendError(res, 400, 'Cần cung cấp garmentImage (file) hoặc garmentImageUrl.');
        return;
      }

      // ── Kiểm tra credit ──────────────────────────────────────────────────
      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) {
        sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`);
        return;
      }

      // ── Tạo AI job ───────────────────────────────────────────────────────
      const job = await CreditService.createAIJob({
        userId,
        type: AIJobType.TRY_ON,
        prompt: `Try-on: category=${category}, mode=${mode}`,
        creditCost: cost,
        provider: AIProvider.FASHN,
        inputParams: { category, mode },
      });
      jobId = job.jobId;

      // ── Gọi Fashn.ai ─────────────────────────────────────────────────────
      const result = await fashnService.tryOn({ modelImage, garmentImage, category, mode });

      // ── Tải ảnh output về và upload lên Supabase Storage ─────────────────
      const outputFetch = await fetch(result.outputUrl);
      if (!outputFetch.ok) throw new Error('Không tải được ảnh output từ Fashn.');
      const outputBuffer = Buffer.from(await outputFetch.arrayBuffer());
      const fileName = `tryon_${Date.now()}.png`;

      const publicUrl = await StorageService.uploadBuffer(outputBuffer, fileName, 'image/png', userId);

      // ── Lưu asset record ─────────────────────────────────────────────────
      const asset = await CreditService.saveOutputAsset({
        userId,
        url: publicUrl,
        category: AssetCategory.OUTPUT,
        mimeType: 'image/png',
        fileName,
      });

      await CreditService.linkAssetToJob(jobId, asset.id, AssetRole.OUTPUT);
      await CreditService.updateAIJob(jobId, AIJobStatus.COMPLETED);

      // ── Trừ credit ───────────────────────────────────────────────────────
      await CreditService.deductCredit(userId, cost, `Virtual try-on (${category})`, jobId);

      sendSuccess(res, {
        statusCode: 201,
        message: 'Virtual try-on thành công.',
        data: {
          imageUrl: publicUrl,
          assetId: asset.id,
          jobId,
          predictionId: result.predictionId,
          creditsUsed: cost,
        },
      });
    } catch (err: any) {
      console.error('[AIController.tryOn]', err);
      if (jobId) {
        await CreditService.updateAIJob(jobId, AIJobStatus.FAILED, err.message).catch(() => {});
      }
      sendError(res, 500, err.message);
    }
  }
}

export const aiController = new AIController();
