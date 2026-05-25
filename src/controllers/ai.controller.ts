import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { geminiService } from '../services/gemini.service';
import { CreditService } from '../services/credit.service';
import { StorageService } from '../services/storage.service';
import { sendSuccess, sendError } from '../utils/response';

export class AIController {
  /**
   * POST /api/ai/test
   * Test tất cả 4 API key xem key nào còn hoạt động.
   */
  public async testKeys(req: AuthRequest, res: Response): Promise<void> {
    try {
      const results = await geminiService.testAllKeys();
      const allFailed = results.every((r) => !r.ok);

      sendSuccess(res, {
        message: allFailed
          ? 'Tất cả key đều lỗi — kiểm tra lại API key hoặc quota.'
          : `Test xong. ${results.filter((r) => r.ok).length}/${results.length} key hoạt động.`,
        data: {
          keyCount: geminiService.getConfiguredKeyCount(),
          results,
        },
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  /**
   * POST /api/ai/generate
   * Generate image từ text prompt.
   * Body: { prompt: string, aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4', imageSize?: '1K' | '2K' | '4K' }
   */
  public async generateImage(req: AuthRequest, res: Response): Promise<void> {
    let jobId: string | undefined;
    const CREDIT_COST = 10;

    try {
      const userId = req.user?.id;
      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }

      const { prompt, aspectRatio, imageSize } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        sendError(res, 400, 'Thiếu hoặc sai định dạng prompt.');
        return;
      }

      // 1. Check credit
      const creditCheck = await CreditService.checkCredit(userId, CREDIT_COST);
      if (!creditCheck.ok) {
        sendError(res, 402, `Credit không đủ. Cần ${CREDIT_COST}, hiện có ${creditCheck.userCredit}.`);
        return;
      }

      // 2. Tạo AI job
      const job = await CreditService.createAIJob({
        userId,
        type: 'generate',
        prompt,
        creditCost: CREDIT_COST,
        provider: 'nano_banana',
        inputParams: { aspectRatio, imageSize },
      });
      jobId = job.jobId;

      // 3. Gọi Gemini
      const result = await geminiService.generateImage({
        prompt,
        aspectRatio,
        imageSize,
      });

      // 4. Upload ảnh output lên storage
      const imageBuffer = Buffer.from(result.base64Image, 'base64');
      const fileName = `generated_${Date.now()}.png`;
      const publicUrl = await StorageService.uploadBuffer(
        imageBuffer,
        fileName,
        result.mimeType,
        userId
      );

      // 5. Lưu asset record
      const asset = await CreditService.saveOutputAsset({
        userId,
        url: publicUrl,
        category: 'output',
        mimeType: result.mimeType,
        fileName,
      });

      // 6. Liên kết asset với job
      await CreditService.linkAssetToJob(jobId, asset.id, 'output');

      // 7. Update job completed
      await CreditService.updateAIJob(jobId, 'completed');

      // 8. Trừ credit
      await CreditService.deductCredit(
        userId,
        CREDIT_COST,
        `Generate ảnh: ${prompt.slice(0, 50)}...`,
        jobId
      );

      sendSuccess(res, {
        statusCode: 201,
        message: 'Generate ảnh thành công.',
        data: {
          imageUrl: publicUrl,
          assetId: asset.id,
          jobId,
          textResponse: result.textResponse,
          modelUsed: result.modelUsed,
          keyIndex: result.keyIndex,
          creditsUsed: CREDIT_COST,
        },
      });
    } catch (err: any) {
      console.error('[AIController.generateImage]', err);
      if (jobId) {
        await CreditService.updateAIJob(jobId, 'failed', err.message).catch(() => {});
      }
      sendError(res, 500, err.message);
    }
  }

  /**
   * POST /api/ai/edit
   * Edit ảnh bằng conversational editing (upload ảnh + prompt).
   * Body: multipart/form-data với file ảnh + prompt
   */
  public async editImage(req: AuthRequest, res: Response): Promise<void> {
    let jobId: string | undefined;
    const CREDIT_COST = 8;

    try {
      const userId = req.user?.id;
      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }

      const { prompt } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        sendError(res, 400, 'Thiếu hoặc sai định dạng prompt.');
        return;
      }

      const file = (req as any).file;
      if (!file || !Buffer.isBuffer(file.buffer)) {
        sendError(res, 400, 'Thiếu file ảnh. Gửi multipart/form-data với field "image".');
        return;
      }

      // 1. Check credit
      const creditCheck = await CreditService.checkCredit(userId, CREDIT_COST);
      if (!creditCheck.ok) {
        sendError(res, 402, `Credit không đủ. Cần ${CREDIT_COST}, hiện có ${creditCheck.userCredit}.`);
        return;
      }

      // 2. Tạo AI job
      const job = await CreditService.createAIJob({
        userId,
        type: 'edit',
        prompt,
        creditCost: CREDIT_COST,
        provider: 'nano_banana',
        inputParams: { originalMimeType: file.mimetype },
      });
      jobId = job.jobId;

      // 3. Lưu input asset
      const inputAsset = await CreditService.saveOutputAsset({
        userId,
        url: '', // input không cần public URL trong MVP
        category: 'reference',
        mimeType: file.mimetype,
        fileName: file.originalname || 'input.png',
      });
      await CreditService.linkAssetToJob(jobId, inputAsset.id, 'input');

      // 4. Gọi Gemini edit
      const result = await geminiService.editImage(
        file.buffer,
        file.mimetype || 'image/png',
        prompt
      );

      // 5. Upload ảnh output
      const imageBuffer = Buffer.from(result.base64Image, 'base64');
      const fileName = `edited_${Date.now()}.png`;
      const publicUrl = await StorageService.uploadBuffer(
        imageBuffer,
        fileName,
        result.mimeType,
        userId
      );

      // 6. Lưu output asset
      const outputAsset = await CreditService.saveOutputAsset({
        userId,
        url: publicUrl,
        category: 'output',
        mimeType: result.mimeType,
        fileName,
      });
      await CreditService.linkAssetToJob(jobId, outputAsset.id, 'output');

      // 7. Update job completed
      await CreditService.updateAIJob(jobId, 'completed');

      // 8. Trừ credit
      await CreditService.deductCredit(
        userId,
        CREDIT_COST,
        `Edit ảnh: ${prompt.slice(0, 50)}...`,
        jobId
      );

      sendSuccess(res, {
        statusCode: 201,
        message: 'Edit ảnh thành công.',
        data: {
          imageUrl: publicUrl,
          assetId: outputAsset.id,
          jobId,
          textResponse: result.textResponse,
          modelUsed: result.modelUsed,
          keyIndex: result.keyIndex,
          creditsUsed: CREDIT_COST,
        },
      });
    } catch (err: any) {
      console.error('[AIController.editImage]', err);
      if (jobId) {
        await CreditService.updateAIJob(jobId, 'failed', err.message).catch(() => {});
      }
      sendError(res, 500, err.message);
    }
  }
}

export const aiController = new AIController();
