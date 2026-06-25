import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { fashnService } from '../services/fashn.service';
import { CreditService } from '../services/credit.service';
import { StorageService } from '../services/storage.service';
import { SocketService } from '../services/socket.service';
import { sendSuccess, sendError } from '../utils/response';
import {
  AIJobType,
  AIJobStatus,
  AIProvider,
  TryOnCategory,
  TryOnMode,
  FashnResolution,
  FashnGenerationMode,
  CREDIT_COST,
  computeVariableCreditCost,
  computeVideoCredits,
} from '../constants/ai';
import { AssetCategory, AssetRole, AssetType } from '../constants/asset';
import { StorageBucket } from '../services/storage.service';
import { AdminEventService } from '../services/adminEvent.service';
import { pendingWebhookJobs } from './webhook.controller';
import {
  suggestPrompt as suggestPromptService,
  verifyImage as verifyImageService,
  VALID_EXPECTED_TYPES,
  type ExpectedImageType,
} from '../services/gemini-assist.service';

const VALID_CATEGORIES  = Object.values(TryOnCategory);
const VALID_MODES       = Object.values(TryOnMode);
const VALID_RESOLUTIONS = Object.values(FashnResolution);
const VALID_GEN_MODES   = Object.values(FashnGenerationMode);
const VALID_ASPECT_RATIOS = ['21:9', '1:1', '4:3', '3:2', '2:3', '5:4', '4:5', '3:4', '16:9', '9:16'];
const VALID_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'];

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function downloadAndUpload(
  outputUrl: string,
  fileName: string,
  userId: string,
  mimeType: string = 'image/png',
  bucket: StorageBucket = 'assets'
): Promise<string> {
  const res = await fetch(outputUrl);
  if (!res.ok) throw new Error('Không tải được output từ Fashn.');
  const buffer = Buffer.from(await res.arrayBuffer());
  return StorageService.uploadBuffer(buffer, fileName, mimeType, userId, bucket);
}

/**
 * Runs the Fashn job in the background after the HTTP 202 response has been sent.
 * On success: uploads output, saves asset, deducts credit, notifies via Socket.IO.
 * On failure: refunds credit, updates job status, notifies via Socket.IO.
 */
async function runInBackground(params: {
  userId: string;
  jobId: string;
  cost: number;
  description: string;
  filePrefix: string;
  isVideo?: boolean;
  fashnCall: () => Promise<{ outputUrl: string; predictionId: string; fashnCreditsUsed: number }>;
}): Promise<void> {
  const { userId, jobId, cost, description, filePrefix, isVideo = false, fashnCall } = params;

  try {
    const result = await fashnCall();
    // Use actual Fashn credits × 2 (GU.AI markup); fall back to estimated cost if header was missing
    const actualCost = result.fashnCreditsUsed > 0 ? result.fashnCreditsUsed * 2 : cost;

    const ext    = isVideo ? 'mp4'       : 'png';
    const mime   = isVideo ? 'video/mp4' : 'image/png';
    const aType  = isVideo ? AssetType.VIDEO : AssetType.IMAGE;

    const fileName = `${filePrefix}_${Date.now()}.${ext}`;

    const publicUrl = await downloadAndUpload(result.outputUrl, fileName, userId, mime, isVideo ? 'videos' : 'assets');

    const asset = await CreditService.saveOutputAsset({
      userId,
      url: publicUrl,
      category: AssetCategory.OUTPUT,
      mimeType: mime,
      fileName,
      assetType: aType,
    });

    await CreditService.linkAssetToJob(jobId, asset.id, AssetRole.OUTPUT);
    await CreditService.deductCredit(userId, actualCost, description, jobId);
    await CreditService.updateAIJob(jobId, AIJobStatus.COMPLETED);

    SocketService.emitAIJobUpdate(userId, {
      jobId,
      status: 'completed',
      imageUrl: publicUrl,
      assetId: asset.id,
      creditsUsed: actualCost,
    });

    AdminEventService.emit({
      type: 'job_completed',
      message: `Hoàn thành: ${description}`,
      userId,
      metadata: { jobId, assetId: asset.id },
    });
  } catch (err: any) {
    console.error(`[AIController] Background job ${jobId} failed:`, err.message);
    await CreditService.updateAIJob(jobId, AIJobStatus.FAILED, err.message).catch(() => {});
    SocketService.emitAIJobUpdate(userId, { jobId, status: 'failed', error: err.message });
    AdminEventService.emit({
      type: 'job_failed',
      message: `Thất bại: ${description}`,
      userId,
      metadata: { jobId, error: err.message },
    });
  }
}

/**
 * If SERVER_URL is configured, submit job to Fashn with webhook URL and register
 * the context so the webhook endpoint can process the result.
 * Otherwise fall back to in-process polling via runInBackground.
 */
async function scheduleJob(params: {
  userId: string;
  jobId: string;
  cost: number;
  description: string;
  filePrefix: string;
  isVideo?: boolean;
  modelName: string;
  inputs: Record<string, any>;
  pollingFallback: () => Promise<{ outputUrl: string; predictionId: string; fashnCreditsUsed: number }>;
}): Promise<void> {
  const { userId, jobId, cost, description, filePrefix, isVideo = false, modelName, inputs, pollingFallback } = params;
  const serverUrl = process.env.SERVER_URL?.replace(/\/$/, '');

  AdminEventService.emit({
    type: 'job_created',
    message: `Bắt đầu: ${description}`,
    userId,
    metadata: { jobId },
  });

  if (serverUrl) {
    try {
      const webhookSecret = process.env.FASHN_WEBHOOK_SECRET;
      const webhookUrl = webhookSecret
        ? `${serverUrl}/api/webhooks/fashn?token=${encodeURIComponent(webhookSecret)}`
        : `${serverUrl}/api/webhooks/fashn`;
      const { predictionId, fashnCreditsUsed } = await fashnService.submitJob(modelName, {
        ...inputs,
        webhook_url: webhookUrl,
      });
      const actualCost = fashnCreditsUsed > 0 ? fashnCreditsUsed * 2 : cost;
      pendingWebhookJobs.set(predictionId, { userId, jobId, cost: actualCost, description, filePrefix, isVideo });
      console.log(`[AIController] Webhook mode — predictionId=${predictionId} → ${webhookUrl}`);
      return;
    } catch (err: any) {
      console.warn('[AIController] Webhook submit failed, falling back to polling:', err.message);
    }
  }

  // Polling fallback
  setImmediate(() => runInBackground({ userId, jobId, cost, description, filePrefix, isVideo, fashnCall: pollingFallback }));
}

// ─── Controller ───────────────────────────────────────────────────────────────

export class AIController {

  // ── POST /api/ai/test ────────────────────────────────────────────────────────

  public async testConnection(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await fashnService.testConnection();
      sendSuccess(res, {
        message: result.ok
          ? 'Kết nối Fashn.ai thành công.'
          : `Kết nối Fashn.ai thất bại: ${result.error}`,
        data: { ok: result.ok, configured: fashnService.isConfigured(), error: result.error },
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // ── GET /api/ai/credits ───────────────────────────────────────────────────────

  public async getCredits(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const credits = await fashnService.getCredits();
      sendSuccess(res, { message: 'Lấy credits Fashn.ai thành công.', data: credits });
    } catch (err: any) {
      console.error('[AIController.getCredits]', err.message);
      sendError(res, 500, err.message);
    }
  }

  // ── GET /api/ai/jobs/:jobId ───────────────────────────────────────────────────

  public async getJobStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const job = await CreditService.getJobById(jobId);
      if (!job) { sendError(res, 404, 'Không tìm thấy job.'); return; }

      sendSuccess(res, { data: { jobId: job.id, status: job.status, type: job.type, creditsUsed: job.credit_cost, error: job.error_message, imageUrl: job.outputUrl ?? undefined, assetId: job.outputAssetId ?? undefined } });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/try-on ───────────────────────────────────────────────────────

  public async tryOn(req: AuthRequest, res: Response): Promise<void> {
    const cost = CREDIT_COST[AIJobType.TRY_ON]; // fixed: 2

    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const category: TryOnCategory = req.body.category;
      const mode: TryOnMode = req.body.mode || TryOnMode.BALANCED;

      if (!category || !VALID_CATEGORIES.includes(category)) {
        sendError(res, 400, `category phải là một trong: ${VALID_CATEGORIES.join(', ')}.`); return;
      }
      if (!VALID_MODES.includes(mode)) {
        sendError(res, 400, `mode phải là một trong: ${VALID_MODES.join(', ')}.`); return;
      }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;

      const modelImage = files?.['modelImage']?.[0]
        ? `data:${files['modelImage'][0].mimetype};base64,${files['modelImage'][0].buffer.toString('base64')}`
        : (req.body.modelImageUrl as string | undefined);

      const garmentImage = files?.['garmentImage']?.[0]
        ? `data:${files['garmentImage'][0].mimetype};base64,${files['garmentImage'][0].buffer.toString('base64')}`
        : (req.body.garmentImageUrl as string | undefined);

      if (!modelImage)   { sendError(res, 400, 'Cần cung cấp modelImage (file) hoặc modelImageUrl.'); return; }
      if (!garmentImage) { sendError(res, 400, 'Cần cung cấp garmentImage (file) hoặc garmentImageUrl.'); return; }

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) {
        sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return;
      }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.TRY_ON,
        prompt: `Try-on v1.6: category=${category}, mode=${mode}`,
        creditCost: cost, provider: AIProvider.FASHN,
        inputParams: { category, mode },
      });

      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing' } });

      scheduleJob({
        userId, jobId: job.jobId, cost,
        description: `Virtual try-on v1.6 (${category})`,
        filePrefix: 'tryon',
        modelName: 'tryon-v1.6',
        inputs: { model_image: modelImage, garment_image: garmentImage, category, mode },
        pollingFallback: () => fashnService.tryOn({ modelImage: modelImage!, garmentImage: garmentImage!, category, mode }),
      });
    } catch (err: any) {
      console.error('[AIController.tryOn]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/try-on-max ───────────────────────────────────────────────────

  public async tryOnMax(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const resolution: FashnResolution = req.body.resolution || FashnResolution.ONE_K;
      const generationMode: 'balanced' | 'quality' = req.body.generationMode || 'balanced';
      const numImages = Math.min(4, Math.max(1, parseInt(req.body.numImages) || 1));
      const prompt: string | undefined = req.body.prompt?.trim() || undefined;

      if (!VALID_RESOLUTIONS.includes(resolution)) {
        sendError(res, 400, `resolution phải là một trong: ${VALID_RESOLUTIONS.join(', ')}.`); return;
      }
      if (!['balanced', 'quality'].includes(generationMode)) {
        sendError(res, 400, 'generationMode phải là balanced hoặc quality.'); return;
      }

      // tryon-max chỉ có balanced/quality (không có fast)
      const cost = computeVariableCreditCost(
        generationMode as FashnGenerationMode,
        resolution,
        numImages,
        false,
      );

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;

      const productImage = files?.['productImage']?.[0]
        ? `data:${files['productImage'][0].mimetype};base64,${files['productImage'][0].buffer.toString('base64')}`
        : (req.body.productImageUrl as string | undefined);

      const modelImage = files?.['modelImage']?.[0]
        ? `data:${files['modelImage'][0].mimetype};base64,${files['modelImage'][0].buffer.toString('base64')}`
        : (req.body.modelImageUrl as string | undefined);

      if (!productImage) { sendError(res, 400, 'Cần cung cấp productImage (file) hoặc productImageUrl.'); return; }
      if (!modelImage)   { sendError(res, 400, 'Cần cung cấp modelImage (file) hoặc modelImageUrl.'); return; }

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) {
        sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return;
      }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.TRY_ON_MAX,
        prompt: `Try-on Max: resolution=${resolution}, mode=${generationMode}`,
        creditCost: cost, provider: AIProvider.FASHN,
        inputParams: { resolution, generationMode, numImages },
      });

      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing', cost } });

      scheduleJob({
        userId, jobId: job.jobId, cost,
        description: `Virtual try-on Max (${resolution}, ${generationMode})`,
        filePrefix: 'tryon_max',
        modelName: 'tryon-max',
        inputs: {
          product_image: productImage,
          model_image: modelImage,
          resolution,
          generation_mode: generationMode,
          num_images: numImages,
          ...(prompt && { prompt }),
        },
        pollingFallback: () => fashnService.tryOnMax({ productImage: productImage!, modelImage: modelImage!, resolution, generationMode, numImages, prompt }),
      });
    } catch (err: any) {
      console.error('[AIController.tryOnMax]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/remove-background ────────────────────────────────────────────

  public async removeBackground(req: AuthRequest, res: Response): Promise<void> {
    const cost = CREDIT_COST[AIJobType.REMOVE_BG]; // fixed: 2

    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const imageFile = files?.['image']?.[0];

      const imageInput = imageFile
        ? `data:${imageFile.mimetype};base64,${imageFile.buffer.toString('base64')}`
        : (req.body.imageUrl as string | undefined);

      if (!imageInput) { sendError(res, 400, 'Cần cung cấp image (file) hoặc imageUrl.'); return; }

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) {
        sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return;
      }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.REMOVE_BG,
        creditCost: cost, provider: AIProvider.FASHN, inputParams: {},
      });

      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing' } });

      scheduleJob({
        userId, jobId: job.jobId, cost,
        description: 'Background remove',
        filePrefix: 'bg_remove',
        modelName: 'background-remove',
        inputs: { image: imageInput },
        pollingFallback: () => fashnService.removeBackground(imageInput!),
      });
    } catch (err: any) {
      console.error('[AIController.removeBackground]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/product-to-model ─────────────────────────────────────────────

  public async productToModel(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const resolution: FashnResolution    = req.body.resolution     || FashnResolution.ONE_K;
      const generationMode: FashnGenerationMode = req.body.generationMode || FashnGenerationMode.FAST;

      if (!VALID_RESOLUTIONS.includes(resolution)) {
        sendError(res, 400, `resolution phải là một trong: ${VALID_RESOLUTIONS.join(', ')}.`); return;
      }
      if (!VALID_GEN_MODES.includes(generationMode)) {
        sendError(res, 400, `generationMode phải là một trong: ${VALID_GEN_MODES.join(', ')}.`); return;
      }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const toBase64 = (file: Express.Multer.File) =>
        `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

      const productImage = files?.['productImage']?.[0]
        ? toBase64(files['productImage'][0])
        : (req.body.productImageUrl as string | undefined);
      if (!productImage) { sendError(res, 400, 'Cần cung cấp productImage (file) hoặc productImageUrl.'); return; }

      const imagePrompt = files?.['imagePrompt']?.[0]
        ? toBase64(files['imagePrompt'][0])
        : (req.body.imagePromptUrl as string | undefined);

      const faceReference = files?.['faceReference']?.[0]
        ? toBase64(files['faceReference'][0])
        : (req.body.faceReferenceUrl as string | undefined);

      const backgroundReference = files?.['backgroundReference']?.[0]
        ? toBase64(files['backgroundReference'][0])
        : (req.body.backgroundReferenceUrl as string | undefined);

      const prompt: string | undefined              = req.body.prompt?.trim() || undefined;
      const aspectRatio: string | undefined         = req.body.aspectRatio || undefined;
      const faceReferenceMode: 'match_base' | 'match_reference' | undefined =
        ['match_base', 'match_reference'].includes(req.body.faceReferenceMode)
          ? req.body.faceReferenceMode : undefined;
      const numImages: number = Math.min(4, Math.max(1, parseInt(req.body.numImages) || 1));
      const seed: number | undefined = req.body.seed ? parseInt(req.body.seed) : undefined;

      const cost = computeVariableCreditCost(generationMode, resolution, numImages, !!faceReference);

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) {
        sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return;
      }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.PRODUCT_TO_MODEL,
        prompt: prompt || 'Product to model',
        creditCost: cost, provider: AIProvider.FASHN,
        inputParams: { resolution, generationMode, aspectRatio, numImages, hasFaceRef: !!faceReference },
      });

      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing', cost } });

      scheduleJob({
        userId, jobId: job.jobId, cost,
        description: 'Product to model',
        filePrefix: 'product_to_model',
        modelName: 'product-to-model',
        inputs: {
          product_image: productImage,
          ...(imagePrompt         && { image_prompt:         imagePrompt }),
          ...(faceReference       && { face_reference:       faceReference }),
          ...(faceReferenceMode   && { face_reference_mode:  faceReferenceMode }),
          ...(backgroundReference && { background_reference: backgroundReference }),
          ...(prompt              && { prompt }),
          ...(aspectRatio         && { aspect_ratio:         aspectRatio }),
          resolution, generation_mode: generationMode,
          ...(seed !== undefined  && { seed }),
          num_images: numImages,
        },
        pollingFallback: () => fashnService.productToModel({
          productImage, imagePrompt, faceReference, faceReferenceMode,
          backgroundReference, prompt, aspectRatio, resolution,
          generationMode, seed, numImages,
        }),
      });
    } catch (err: any) {
      console.error('[AIController.productToModel]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/reframe ──────────────────────────────────────────────────────

  public async reframe(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const aspectRatio: string = req.body.aspectRatio;
      const resolution: FashnResolution = req.body.resolution || FashnResolution.ONE_K;
      const generationMode: FashnGenerationMode = req.body.generationMode || FashnGenerationMode.FAST;
      const numImages: number = Math.min(4, Math.max(1, parseInt(req.body.numImages) || 1));
      const seed: number | undefined = req.body.seed ? parseInt(req.body.seed) : undefined;

      if (!aspectRatio || !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
        sendError(res, 400, `aspectRatio phải là một trong: ${VALID_ASPECT_RATIOS.join(', ')}.`); return;
      }
      if (!VALID_RESOLUTIONS.includes(resolution)) {
        sendError(res, 400, `resolution phải là một trong: ${VALID_RESOLUTIONS.join(', ')}.`); return;
      }
      if (!VALID_GEN_MODES.includes(generationMode)) {
        sendError(res, 400, `generationMode phải là một trong: ${VALID_GEN_MODES.join(', ')}.`); return;
      }

      const cost = computeVariableCreditCost(generationMode, resolution, numImages, false);

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const imageFile = files?.['image']?.[0];

      const image = imageFile
        ? `data:${imageFile.mimetype};base64,${imageFile.buffer.toString('base64')}`
        : (req.body.imageUrl as string | undefined);

      if (!image) { sendError(res, 400, 'Cần cung cấp image (file) hoặc imageUrl.'); return; }

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) {
        sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return;
      }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.REFRAME,
        creditCost: cost, provider: AIProvider.FASHN,
        inputParams: { aspectRatio, resolution, generationMode, numImages },
      });

      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing', cost } });

      scheduleJob({
        userId, jobId: job.jobId, cost,
        description: `Reframe (${aspectRatio})`,
        filePrefix: 'reframe',
        modelName: 'reframe',
        inputs: {
          image, aspect_ratio: aspectRatio,
          resolution, generation_mode: generationMode,
          ...(numImages > 1      && { num_images: numImages }),
          ...(seed !== undefined && { seed }),
        },
        pollingFallback: () => fashnService.reframe({ image: image!, aspectRatio, resolution, generationMode, numImages, seed }),
      });
    } catch (err: any) {
      console.error('[AIController.reframe]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/edit ────────────────────────────────────────────────────────

  public async editImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const prompt: string = req.body.prompt?.trim();
      if (!prompt) { sendError(res, 400, 'prompt là bắt buộc.'); return; }

      const resolution: FashnResolution = req.body.resolution || FashnResolution.ONE_K;
      const generationMode: FashnGenerationMode = req.body.generationMode || FashnGenerationMode.BALANCED;

      if (!VALID_RESOLUTIONS.includes(resolution)) {
        sendError(res, 400, `resolution phải là một trong: ${VALID_RESOLUTIONS.join(', ')}.`); return;
      }
      if (!VALID_GEN_MODES.includes(generationMode)) {
        sendError(res, 400, `generationMode phải là một trong: ${VALID_GEN_MODES.join(', ')}.`); return;
      }

      const numImages = Math.min(4, Math.max(1, parseInt(req.body.numImages) || 1));
      const seed: number | undefined = req.body.seed !== undefined ? parseInt(req.body.seed) : undefined;

      const cost = computeVariableCreditCost(generationMode, resolution, numImages, false);

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const toBase64 = (f: Express.Multer.File) => `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;

      const image = files?.['image']?.[0]
        ? toBase64(files['image'][0])
        : (req.body.imageUrl as string | undefined);
      if (!image) { sendError(res, 400, 'Cần cung cấp image (file) hoặc imageUrl.'); return; }

      const mask = files?.['mask']?.[0]
        ? toBase64(files['mask'][0])
        : (req.body.maskUrl as string | undefined);

      const imageContext = files?.['imageContext']?.[0]
        ? toBase64(files['imageContext'][0])
        : (req.body.imageContextUrl as string | undefined);

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) {
        sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return;
      }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.EDIT, prompt,
        creditCost: cost, provider: AIProvider.FASHN,
        inputParams: { resolution, generationMode, numImages, hasMask: !!mask, hasContext: !!imageContext },
      });

      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing', cost } });

      scheduleJob({
        userId, jobId: job.jobId, cost,
        description: `Edit image: ${prompt.slice(0, 60)}`,
        filePrefix: 'edit',
        modelName: 'edit',
        inputs: {
          image, prompt,
          ...(mask         && { mask }),
          ...(imageContext && { image_context: imageContext }),
          resolution, generation_mode: generationMode,
          ...(seed !== undefined && { seed }),
          ...(numImages > 1      && { num_images: numImages }),
        },
        pollingFallback: () => fashnService.editImage({ image: image!, prompt, mask, imageContext, resolution, generationMode, seed, numImages }),
      });
    } catch (err: any) {
      console.error('[AIController.editImage]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/face-to-model ────────────────────────────────────────────────

  public async faceToModel(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const faceImageFile = files?.['faceImage']?.[0];
      const faceImage = faceImageFile
        ? `data:${faceImageFile.mimetype};base64,${faceImageFile.buffer.toString('base64')}`
        : (req.body.faceImageUrl as string | undefined);
      if (!faceImage) { sendError(res, 400, 'Cần cung cấp faceImage hoặc faceImageUrl.'); return; }

      const prompt: string | undefined = req.body.prompt?.trim() || undefined;
      const aspectRatio: string | undefined = req.body.aspectRatio || undefined;
      const resolution: FashnResolution = req.body.resolution || FashnResolution.ONE_K;
      const generationMode: FashnGenerationMode = req.body.generationMode || FashnGenerationMode.FAST;
      const numImages: number = Math.min(4, Math.max(1, parseInt(req.body.numImages) || 1));
      const seed: number | undefined = req.body.seed ? parseInt(req.body.seed) : undefined;

      if (!VALID_RESOLUTIONS.includes(resolution)) {
        sendError(res, 400, `resolution phải là một trong: ${VALID_RESOLUTIONS.join(', ')}.`); return;
      }
      if (!VALID_GEN_MODES.includes(generationMode)) {
        sendError(res, 400, `generationMode phải là một trong: ${VALID_GEN_MODES.join(', ')}.`); return;
      }

      const cost = computeVariableCreditCost(generationMode, resolution, numImages, false);

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) { sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return; }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.FACE_TO_MODEL,
        prompt: prompt || 'Face to model',
        creditCost: cost, provider: AIProvider.FASHN,
        inputParams: { resolution, generationMode, aspectRatio, numImages },
      });
      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing', cost } });

      scheduleJob({
        userId, jobId: job.jobId, cost,
        description: 'Face to model',
        filePrefix: 'face_to_model',
        modelName: 'face-to-model',
        inputs: {
          face_image: faceImage,
          ...(prompt      && { prompt }),
          ...(aspectRatio && { aspect_ratio: aspectRatio }),
          resolution,
          generation_mode: generationMode,
          ...(numImages > 1      && { num_images: numImages }),
          ...(seed !== undefined && { seed }),
        },
        pollingFallback: () => fashnService.faceToModel({ faceImage: faceImage!, prompt, aspectRatio, resolution, generationMode, numImages, seed }),
      });
    } catch (err: any) {
      console.error('[AIController.faceToModel]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/model-create ─────────────────────────────────────────────────

  public async modelCreate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const prompt: string = req.body.prompt?.trim();
      if (!prompt) { sendError(res, 400, 'Cần cung cấp prompt mô tả model.'); return; }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const toBase64 = (f: Express.Multer.File) => `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;

      const imageReference = files?.['imageReference']?.[0]
        ? toBase64(files['imageReference'][0])
        : (req.body.imageReferenceUrl as string | undefined);

      const faceReference = files?.['faceReference']?.[0]
        ? toBase64(files['faceReference'][0])
        : (req.body.faceReferenceUrl as string | undefined);

      const faceReferenceMode: 'match_base' | 'match_reference' | undefined =
        ['match_base', 'match_reference'].includes(req.body.faceReferenceMode)
          ? req.body.faceReferenceMode : undefined;

      const aspectRatio: string | undefined = req.body.aspectRatio || undefined;
      const resolution: FashnResolution = req.body.resolution || FashnResolution.ONE_K;
      const generationMode: FashnGenerationMode = req.body.generationMode || FashnGenerationMode.FAST;
      const numImages: number = Math.min(4, Math.max(1, parseInt(req.body.numImages) || 1));
      const seed: number | undefined = req.body.seed ? parseInt(req.body.seed) : undefined;

      if (!VALID_RESOLUTIONS.includes(resolution)) {
        sendError(res, 400, `resolution phải là một trong: ${VALID_RESOLUTIONS.join(', ')}.`); return;
      }
      if (!VALID_GEN_MODES.includes(generationMode)) {
        sendError(res, 400, `generationMode phải là một trong: ${VALID_GEN_MODES.join(', ')}.`); return;
      }

      const cost = computeVariableCreditCost(generationMode, resolution, numImages, !!faceReference);

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) { sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return; }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.MODEL_CREATE, prompt,
        creditCost: cost, provider: AIProvider.FASHN,
        inputParams: { resolution, generationMode, aspectRatio, numImages, hasFaceRef: !!faceReference },
      });
      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing', cost } });

      scheduleJob({
        userId, jobId: job.jobId, cost,
        description: `Create model: ${prompt.slice(0, 60)}`,
        filePrefix: 'model_create',
        modelName: 'model-create',
        inputs: {
          prompt,
          ...(imageReference    && { image_reference:    imageReference }),
          ...(faceReference     && { face_reference:     faceReference }),
          ...(faceReferenceMode && { face_reference_mode: faceReferenceMode }),
          ...(aspectRatio       && { aspect_ratio:       aspectRatio }),
          resolution,
          generation_mode: generationMode,
          num_images: numImages,
          ...(seed !== undefined && { seed }),
        },
        pollingFallback: () => fashnService.modelCreate({ prompt, imageReference, faceReference, faceReferenceMode, aspectRatio, resolution, generationMode, numImages, seed }),
      });
    } catch (err: any) {
      console.error('[AIController.modelCreate]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/model-swap ───────────────────────────────────────────────────

  public async modelSwap(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const toBase64 = (f: Express.Multer.File) => `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;

      const modelImage = files?.['modelImage']?.[0]
        ? toBase64(files['modelImage'][0])
        : (req.body.modelImageUrl as string | undefined);
      if (!modelImage) { sendError(res, 400, 'Cần cung cấp modelImage hoặc modelImageUrl.'); return; }

      const faceReference = files?.['faceReference']?.[0]
        ? toBase64(files['faceReference'][0])
        : (req.body.faceReferenceUrl as string | undefined);

      const prompt: string | undefined = req.body.prompt?.trim() || undefined;
      const resolution: FashnResolution = req.body.resolution || FashnResolution.ONE_K;
      const generationMode: FashnGenerationMode = req.body.generationMode || FashnGenerationMode.FAST;
      const faceReferenceMode: 'match_base' | 'match_reference' | undefined =
        ['match_base', 'match_reference'].includes(req.body.faceReferenceMode)
          ? req.body.faceReferenceMode : undefined;
      const seed: number | undefined = req.body.seed ? parseInt(req.body.seed) : undefined;
      const numImages: number = Math.min(4, Math.max(1, parseInt(req.body.numImages) || 1));

      if (!VALID_RESOLUTIONS.includes(resolution)) {
        sendError(res, 400, `resolution phải là một trong: ${VALID_RESOLUTIONS.join(', ')}.`); return;
      }
      if (!VALID_GEN_MODES.includes(generationMode)) {
        sendError(res, 400, `generationMode phải là một trong: ${VALID_GEN_MODES.join(', ')}.`); return;
      }

      const cost = computeVariableCreditCost(generationMode, resolution, numImages, !!faceReference);

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) { sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return; }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.MODEL_SWAP,
        prompt: prompt || 'Model swap',
        creditCost: cost, provider: AIProvider.FASHN,
        inputParams: { resolution, generationMode, numImages, hasFaceRef: !!faceReference },
      });
      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing', cost } });

      scheduleJob({
        userId, jobId: job.jobId, cost,
        description: 'Model swap',
        filePrefix: 'model_swap',
        modelName: 'model-swap',
        inputs: {
          model_image: modelImage,
          ...(prompt            && { prompt }),
          ...(faceReference     && { face_reference:      faceReference }),
          ...(faceReferenceMode && { face_reference_mode: faceReferenceMode }),
          resolution,
          generation_mode: generationMode,
          ...(seed !== undefined && { seed }),
          num_images: numImages,
        },
        pollingFallback: () => fashnService.modelSwap({
          modelImage, prompt, faceReference, faceReferenceMode,
          resolution, generationMode, seed, numImages,
        }),
      });
    } catch (err: any) {
      console.error('[AIController.modelSwap]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/image-to-video ───────────────────────────────────────────────

  public async imageToVideo(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const toBase64 = (f: Express.Multer.File) => `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;

      const imageFile = files?.['image']?.[0];
      const image = imageFile
        ? toBase64(imageFile)
        : (req.body.imageUrl as string | undefined);
      if (!image) { sendError(res, 400, 'Cần cung cấp image hoặc imageUrl.'); return; }

      const prompt: string | undefined = req.body.prompt?.trim() || undefined;
      const duration: 5 | 10 = Number(req.body.duration) === 10 ? 10 : 5;
      const resolution: '480p' | '720p' | '1080p' = VALID_VIDEO_RESOLUTIONS.includes(req.body.resolution)
        ? req.body.resolution
        : '1080p';

      // end_image chỉ hợp lệ với resolution = "1080p"
      const endImageFile = files?.['endImage']?.[0];
      const endImage = resolution === '1080p'
        ? (endImageFile ? toBase64(endImageFile) : (req.body.endImageUrl as string | undefined))
        : undefined;

      const cost = computeVideoCredits(duration, resolution);

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) { sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return; }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.IMAGE_TO_VIDEO,
        prompt: prompt || 'Image to video',
        creditCost: cost, provider: AIProvider.FASHN,
        inputParams: { duration, resolution, hasEndImage: !!endImage },
      });
      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing', cost } });

      scheduleJob({
        userId, jobId: job.jobId, cost,
        description: `Image to video (${duration}s/${resolution})`,
        filePrefix: 'video',
        isVideo: true,
        modelName: 'image-to-video',
        inputs: {
          image,
          ...(prompt   && { prompt }),
          duration,
          resolution,
          ...(endImage && { end_image: endImage }),
        },
        pollingFallback: () => fashnService.imageToVideo({ image: image!, prompt, duration, resolution, endImage }),
      });
    } catch (err: any) {
      console.error('[AIController.imageToVideo]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/suggest-prompt ───────────────────────────────────────────────
  // Tác vụ phụ: gợi ý prompt tiếng Anh cho các tool có field "prompt". Không trừ credit.

  public async suggestPrompt(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tool, userHint } = req.body as { tool?: string; userHint?: string };
      if (!tool?.trim()) { sendError(res, 400, 'tool là bắt buộc'); return; }

      const prompt = await suggestPromptService({ tool: tool.trim(), userHint: userHint ?? '' });
      sendSuccess(res, { data: { prompt } });
    } catch (err: any) {
      console.error('[AIController.suggestPrompt]', err.message);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/verify-image ─────────────────────────────────────────────────
  // Tác vụ phụ: kiểm tra nhanh ảnh đầu vào trước khi user chạy job tốn credit. Không trừ credit,
  // không block — chỉ trả về cảnh báo để frontend hiển thị, không hard-fail.

  public async verifyImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { expectedType, imageUrl } = req.body as { expectedType?: string; imageUrl?: string };
      if (!expectedType || !VALID_EXPECTED_TYPES.includes(expectedType as ExpectedImageType)) {
        sendError(res, 400, `expectedType phải là một trong: ${VALID_EXPECTED_TYPES.join(', ')}.`); return;
      }

      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const file = files?.['image']?.[0];

      let buffer: Buffer;
      let mimeType: string;

      if (file) {
        buffer = file.buffer;
        mimeType = file.mimetype;
      } else if (imageUrl) {
        const fetched = await fetch(imageUrl);
        if (!fetched.ok) { sendError(res, 400, 'Không tải được ảnh từ imageUrl.'); return; }
        buffer = Buffer.from(await fetched.arrayBuffer());
        mimeType = fetched.headers.get('content-type') ?? 'image/jpeg';
      } else {
        sendError(res, 400, 'Cần image (file) hoặc imageUrl.'); return;
      }

      const result = await verifyImageService(buffer, mimeType, expectedType as ExpectedImageType);
      sendSuccess(res, { data: result });
    } catch (err: any) {
      console.error('[AIController.verifyImage]', err.message);
      sendError(res, 500, err.message);
    }
  }
}

export const aiController = new AIController();
