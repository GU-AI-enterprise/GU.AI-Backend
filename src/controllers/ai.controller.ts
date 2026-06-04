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
} from '../constants/ai';
import { AssetCategory, AssetRole } from '../constants/asset';
import { AdminEventService } from '../services/adminEvent.service';
import { pendingWebhookJobs } from './webhook.controller';

const VALID_CATEGORIES = Object.values(TryOnCategory);
const VALID_MODES = Object.values(TryOnMode);
const VALID_RESOLUTIONS = Object.values(FashnResolution);
const VALID_GEN_MODES = Object.values(FashnGenerationMode);
const VALID_ASPECT_RATIOS = ['21:9', '1:1', '4:3', '3:2', '2:3', '5:4', '4:5', '3:4', '16:9', '9:16'];

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function downloadAndUpload(
  outputUrl: string,
  fileName: string,
  userId: string,
  mimeType = 'image/png'
): Promise<string> {
  const res = await fetch(outputUrl);
  if (!res.ok) throw new Error('Không tải được ảnh output từ Fashn.');
  const buffer = Buffer.from(await res.arrayBuffer());
  return StorageService.uploadBuffer(buffer, fileName, mimeType, userId);
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
  fashnCall: () => Promise<{ outputUrl: string; predictionId: string }>;
}): Promise<void> {
  const { userId, jobId, cost, description, filePrefix, fashnCall } = params;

  try {
    const result = await fashnCall();

    const fileName = `${filePrefix}_${Date.now()}.png`;
    const publicUrl = await downloadAndUpload(result.outputUrl, fileName, userId);

    const asset = await CreditService.saveOutputAsset({
      userId,
      url: publicUrl,
      category: AssetCategory.OUTPUT,
      mimeType: 'image/png',
      fileName,
    });

    await CreditService.linkAssetToJob(jobId, asset.id, AssetRole.OUTPUT);
    await CreditService.updateAIJob(jobId, AIJobStatus.COMPLETED);
    await CreditService.deductCredit(userId, cost, description, jobId);

    SocketService.emitAIJobUpdate(userId, {
      jobId,
      status: 'completed',
      imageUrl: publicUrl,
      assetId: asset.id,
      creditsUsed: cost,
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
  modelName: string;
  inputs: Record<string, any>;
  pollingFallback: () => Promise<{ outputUrl: string; predictionId: string }>;
}): Promise<void> {
  const { userId, jobId, cost, description, filePrefix, modelName, inputs, pollingFallback } = params;
  const serverUrl = process.env.SERVER_URL?.replace(/\/$/, '');

  AdminEventService.emit({
    type: 'job_created',
    message: `Bắt đầu: ${description}`,
    userId,
    metadata: { jobId },
  });

  if (serverUrl) {
    try {
      const webhookUrl = `${serverUrl}/api/webhooks/fashn`;
      const predictionId = await fashnService.submitJob(modelName, {
        ...inputs,
        webhook_url: webhookUrl,
      });
      pendingWebhookJobs.set(predictionId, { userId, jobId, cost, description, filePrefix });
      console.log(`[AIController] Webhook mode — predictionId=${predictionId} → ${webhookUrl}`);
      return;
    } catch (err: any) {
      console.warn('[AIController] Webhook submit failed, falling back to polling:', err.message);
    }
  }

  // Polling fallback
  setImmediate(() => runInBackground({ userId, jobId, cost, description, filePrefix, fashnCall: pollingFallback }));
}

// ─── Controller ───────────────────────────────────────────────────────────────

export class AIController {

  // ── POST /api/ai/test ────────────────────────────────────────────────────────

  public async testConnection(req: AuthRequest, res: Response): Promise<void> {
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

  public async getCredits(req: AuthRequest, res: Response): Promise<void> {
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

      sendSuccess(res, { data: { jobId: job.id, status: job.status, type: job.type, creditsUsed: job.credit_cost, error: job.error_message } });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/try-on ───────────────────────────────────────────────────────

  public async tryOn(req: AuthRequest, res: Response): Promise<void> {
    const cost = CREDIT_COST[AIJobType.TRY_ON];

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

      if (!modelImage) { sendError(res, 400, 'Cần cung cấp modelImage (file) hoặc modelImageUrl.'); return; }
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

      // Return 202 immediately — Fashn runs in background (webhook or polling)
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
    const cost = CREDIT_COST[AIJobType.TRY_ON_MAX];

    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const resolution: FashnResolution = req.body.resolution || FashnResolution.ONE_K;
      const generationMode: 'balanced' | 'quality' = req.body.generationMode || 'balanced';
      const numImages = Math.min(4, Math.max(1, parseInt(req.body.numImages) || 1));

      if (!VALID_RESOLUTIONS.includes(resolution)) {
        sendError(res, 400, `resolution phải là một trong: ${VALID_RESOLUTIONS.join(', ')}.`); return;
      }
      if (!['balanced', 'quality'].includes(generationMode)) {
        sendError(res, 400, 'generationMode phải là balanced hoặc quality.'); return;
      }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;

      const productImage = files?.['productImage']?.[0]
        ? `data:${files['productImage'][0].mimetype};base64,${files['productImage'][0].buffer.toString('base64')}`
        : (req.body.productImageUrl as string | undefined);

      const modelImage = files?.['modelImage']?.[0]
        ? `data:${files['modelImage'][0].mimetype};base64,${files['modelImage'][0].buffer.toString('base64')}`
        : (req.body.modelImageUrl as string | undefined);

      if (!productImage) { sendError(res, 400, 'Cần cung cấp productImage (file) hoặc productImageUrl.'); return; }
      if (!modelImage) { sendError(res, 400, 'Cần cung cấp modelImage (file) hoặc modelImageUrl.'); return; }

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

      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing' } });

      setImmediate(() => runInBackground({
        userId, jobId: job.jobId, cost,
        description: `Virtual try-on Max (${resolution})`,
        filePrefix: 'tryon_max',
        fashnCall: () => fashnService.tryOnMax({ productImage: productImage!, modelImage: modelImage!, resolution, generationMode, numImages }),
      }));
    } catch (err: any) {
      console.error('[AIController.tryOnMax]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/remove-background ────────────────────────────────────────────

  public async removeBackground(req: AuthRequest, res: Response): Promise<void> {
    const cost = CREDIT_COST[AIJobType.REMOVE_BG];

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

      setImmediate(() => runInBackground({
        userId, jobId: job.jobId, cost,
        description: 'Background remove',
        filePrefix: 'bg_remove',
        fashnCall: () => fashnService.removeBackground(imageInput!),
      }));
    } catch (err: any) {
      console.error('[AIController.removeBackground]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/product-to-model ─────────────────────────────────────────────

  public async productToModel(req: AuthRequest, res: Response): Promise<void> {
    const cost = CREDIT_COST[AIJobType.PRODUCT_TO_MODEL];

    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const resolution: FashnResolution = req.body.resolution || FashnResolution.ONE_K;
      const generationMode: FashnGenerationMode = req.body.generationMode || FashnGenerationMode.BALANCED;

      if (!VALID_RESOLUTIONS.includes(resolution)) {
        sendError(res, 400, `resolution phải là một trong: ${VALID_RESOLUTIONS.join(', ')}.`); return;
      }
      if (!VALID_GEN_MODES.includes(generationMode)) {
        sendError(res, 400, `generationMode phải là một trong: ${VALID_GEN_MODES.join(', ')}.`); return;
      }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const productImageFile = files?.['productImage']?.[0];

      const productImage = productImageFile
        ? `data:${productImageFile.mimetype};base64,${productImageFile.buffer.toString('base64')}`
        : (req.body.productImageUrl as string | undefined);

      if (!productImage) { sendError(res, 400, 'Cần cung cấp productImage (file) hoặc productImageUrl.'); return; }

      const prompt: string | undefined = req.body.prompt?.trim() || undefined;
      const aspectRatio: string | undefined = req.body.aspectRatio || undefined;
      const faceReference: string | undefined = req.body.faceReferenceUrl || undefined;

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) {
        sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return;
      }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.PRODUCT_TO_MODEL,
        prompt: prompt || 'Product to model',
        creditCost: cost, provider: AIProvider.FASHN,
        inputParams: { resolution, generationMode, aspectRatio },
      });

      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing' } });

      setImmediate(() => runInBackground({
        userId, jobId: job.jobId, cost,
        description: 'Product to model',
        filePrefix: 'product_to_model',
        fashnCall: () => fashnService.productToModel({ productImage: productImage!, prompt, aspectRatio, resolution, generationMode, faceReference }),
      }));
    } catch (err: any) {
      console.error('[AIController.productToModel]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/reframe ──────────────────────────────────────────────────────

  public async reframe(req: AuthRequest, res: Response): Promise<void> {
    const cost = CREDIT_COST[AIJobType.REFRAME];

    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const aspectRatio: string = req.body.aspectRatio;
      const resolution: FashnResolution = req.body.resolution || FashnResolution.ONE_K;

      if (!aspectRatio || !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
        sendError(res, 400, `aspectRatio phải là một trong: ${VALID_ASPECT_RATIOS.join(', ')}.`); return;
      }
      if (!VALID_RESOLUTIONS.includes(resolution)) {
        sendError(res, 400, `resolution phải là một trong: ${VALID_RESOLUTIONS.join(', ')}.`); return;
      }

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
        inputParams: { aspectRatio, resolution },
      });

      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing' } });

      setImmediate(() => runInBackground({
        userId, jobId: job.jobId, cost,
        description: `Reframe (${aspectRatio})`,
        filePrefix: 'reframe',
        fashnCall: () => fashnService.reframe({ image: image!, aspectRatio, resolution }),
      }));
    } catch (err: any) {
      console.error('[AIController.reframe]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/edit ────────────────────────────────────────────────────────

  public async editImage(req: AuthRequest, res: Response): Promise<void> {
    const cost = CREDIT_COST[AIJobType.EDIT];

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

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const imageFile = files?.['image']?.[0];
      const maskFile = files?.['mask']?.[0];

      const image = imageFile
        ? `data:${imageFile.mimetype};base64,${imageFile.buffer.toString('base64')}`
        : (req.body.imageUrl as string | undefined);

      if (!image) { sendError(res, 400, 'Cần cung cấp image (file) hoặc imageUrl.'); return; }

      const mask = maskFile
        ? `data:${maskFile.mimetype};base64,${maskFile.buffer.toString('base64')}`
        : (req.body.maskUrl as string | undefined);

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) {
        sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return;
      }

      const job = await CreditService.createAIJob({
        userId, type: AIJobType.EDIT, prompt,
        creditCost: cost, provider: AIProvider.FASHN,
        inputParams: { resolution, generationMode },
      });

      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing' } });

      setImmediate(() => runInBackground({
        userId, jobId: job.jobId, cost,
        description: `Edit image: ${prompt.slice(0, 60)}`,
        filePrefix: 'edit',
        fashnCall: () => fashnService.editImage({ image: image!, prompt, mask, resolution, generationMode }),
      }));
    } catch (err: any) {
      console.error('[AIController.editImage]', err);
      sendError(res, 500, err.message);
    }
  }

  // ── POST /api/ai/face-to-model ────────────────────────────────────────────────

  public async faceToModel(req: AuthRequest, res: Response): Promise<void> {
    const cost = CREDIT_COST[AIJobType.FACE_TO_MODEL];
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

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) { sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return; }

      const job = await CreditService.createAIJob({ userId, type: AIJobType.FACE_TO_MODEL, prompt: prompt || 'Face to model', creditCost: cost, provider: AIProvider.FASHN, inputParams: { resolution, aspectRatio } });
      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing' } });

      scheduleJob({ userId, jobId: job.jobId, cost, description: 'Face to model', filePrefix: 'face_to_model', modelName: 'face-to-model', inputs: { face_image: faceImage, prompt, aspect_ratio: aspectRatio, resolution }, pollingFallback: () => fashnService.faceToModel({ faceImage: faceImage!, prompt, aspectRatio, resolution }) });
    } catch (err: any) { console.error('[AIController.faceToModel]', err); sendError(res, 500, err.message); }
  }

  // ── POST /api/ai/model-create ─────────────────────────────────────────────────

  public async modelCreate(req: AuthRequest, res: Response): Promise<void> {
    const cost = CREDIT_COST[AIJobType.MODEL_CREATE];
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const prompt: string = req.body.prompt?.trim();
      if (!prompt) { sendError(res, 400, 'Cần cung cấp prompt mô tả model.'); return; }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const refFile = files?.['imageReference']?.[0];
      const imageReference = refFile
        ? `data:${refFile.mimetype};base64,${refFile.buffer.toString('base64')}`
        : (req.body.imageReferenceUrl as string | undefined);

      const aspectRatio: string | undefined = req.body.aspectRatio || undefined;
      const resolution: FashnResolution = req.body.resolution || FashnResolution.ONE_K;
      const generationMode: FashnGenerationMode = req.body.generationMode || FashnGenerationMode.BALANCED;

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) { sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return; }

      const job = await CreditService.createAIJob({ userId, type: AIJobType.MODEL_CREATE, prompt, creditCost: cost, provider: AIProvider.FASHN, inputParams: { resolution, generationMode, aspectRatio } });
      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing' } });

      scheduleJob({ userId, jobId: job.jobId, cost, description: `Create model: ${prompt.slice(0, 60)}`, filePrefix: 'model_create', modelName: 'model-create', inputs: { prompt, image_reference: imageReference, aspect_ratio: aspectRatio, resolution, generation_mode: generationMode }, pollingFallback: () => fashnService.modelCreate({ prompt, imageReference, aspectRatio, resolution, generationMode }) });
    } catch (err: any) { console.error('[AIController.modelCreate]', err); sendError(res, 500, err.message); }
  }

  // ── POST /api/ai/model-swap ───────────────────────────────────────────────────

  public async modelSwap(req: AuthRequest, res: Response): Promise<void> {
    const cost = CREDIT_COST[AIJobType.MODEL_SWAP];
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const modelImageFile = files?.['modelImage']?.[0];
      const modelImage = modelImageFile
        ? `data:${modelImageFile.mimetype};base64,${modelImageFile.buffer.toString('base64')}`
        : (req.body.modelImageUrl as string | undefined);
      if (!modelImage) { sendError(res, 400, 'Cần cung cấp modelImage hoặc modelImageUrl.'); return; }

      const prompt: string | undefined = req.body.prompt?.trim() || undefined;
      const resolution: FashnResolution = req.body.resolution || FashnResolution.ONE_K;
      const generationMode: FashnGenerationMode = req.body.generationMode || FashnGenerationMode.BALANCED;

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) { sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return; }

      const job = await CreditService.createAIJob({ userId, type: AIJobType.MODEL_SWAP, prompt: prompt || 'Model swap', creditCost: cost, provider: AIProvider.FASHN, inputParams: { resolution, generationMode } });
      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing' } });

      scheduleJob({ userId, jobId: job.jobId, cost, description: 'Model swap', filePrefix: 'model_swap', modelName: 'model-swap', inputs: { model_image: modelImage, prompt, resolution, generation_mode: generationMode }, pollingFallback: () => fashnService.modelSwap({ modelImage: modelImage!, prompt, resolution, generationMode }) });
    } catch (err: any) { console.error('[AIController.modelSwap]', err); sendError(res, 500, err.message); }
  }

  // ── POST /api/ai/image-to-video ───────────────────────────────────────────────

  public async imageToVideo(req: AuthRequest, res: Response): Promise<void> {
    const cost = CREDIT_COST[AIJobType.IMAGE_TO_VIDEO];
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }

      const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
      const imageFile = files?.['image']?.[0];
      const image = imageFile
        ? `data:${imageFile.mimetype};base64,${imageFile.buffer.toString('base64')}`
        : (req.body.imageUrl as string | undefined);
      if (!image) { sendError(res, 400, 'Cần cung cấp image hoặc imageUrl.'); return; }

      const prompt: string | undefined = req.body.prompt?.trim() || undefined;
      const duration: 5 | 10 = Number(req.body.duration) === 10 ? 10 : 5;
      const resolution: string = req.body.resolution || '720p';

      const creditCheck = await CreditService.checkCredit(userId, cost);
      if (!creditCheck.ok) { sendError(res, 402, `Credit không đủ. Cần ${cost}, hiện có ${creditCheck.userCredit}.`); return; }

      const job = await CreditService.createAIJob({ userId, type: AIJobType.IMAGE_TO_VIDEO, prompt: prompt || 'Image to video', creditCost: cost, provider: AIProvider.FASHN, inputParams: { duration, resolution } });
      res.status(202).json({ success: true, message: 'Đang xử lý...', data: { jobId: job.jobId, status: 'processing' } });

      // Image to video output is MP4 — download and save as video asset
      scheduleJob({ userId, jobId: job.jobId, cost, description: 'Image to video', filePrefix: 'video', modelName: 'image-to-video', inputs: { image, prompt, duration, resolution }, pollingFallback: () => fashnService.imageToVideo({ image: image!, prompt, duration, resolution }) });
    } catch (err: any) { console.error('[AIController.imageToVideo]', err); sendError(res, 500, err.message); }
  }
}

export const aiController = new AIController();
