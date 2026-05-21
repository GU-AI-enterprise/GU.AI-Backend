import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { ImageService } from '../services/image.service';
import { sendSuccess, sendError } from '../utils/response';

export class ImageController {
  // 1. Lấy danh sách toàn bộ ảnh của người dùng hiện tại
  public async getImages(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }

      const images = await ImageService.getUserImages(userId);
      sendSuccess(res, {
        message: 'Lấy danh sách ảnh thành công.',
        data: images,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 2. Thêm một bản ghi ảnh mới (gọi sau khi upload thành công ở client)
  public async createImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }

      const { fileUrl, thumbnailUrl, type, fileSize, jobId } = req.body;
      if (!fileUrl) {
        sendError(res, 400, 'Thiếu thông số bắt buộc fileUrl.');
        return;
      }

      const image = await ImageService.createImage({
        userId,
        fileUrl,
        thumbnailUrl,
        type,
        fileSize,
        jobId,
      });

      sendSuccess(res, {
        statusCode: 211,
        message: 'Lưu bản ghi ảnh thành công.',
        data: image,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 3. Xóa mềm ảnh
  public async deleteImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const imageId = req.params.id as string;

      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }
      if (!imageId) {
        sendError(res, 400, 'Thiếu thông số mã ảnh (id).');
        return;
      }

      const deletedImage = await ImageService.deleteImage(userId, imageId);
      sendSuccess(res, {
        message: 'Xóa ảnh thành công.',
        data: deletedImage,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 4. Khởi tạo lô tải lên hàng loạt
  public async createBatchUpload(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { totalFiles } = req.body;

      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }
      if (typeof totalFiles !== 'number' || totalFiles <= 0) {
        sendError(res, 400, 'Số lượng file tải lên không hợp lệ.');
        return;
      }

      const batch = await ImageService.createBatchUpload(userId, totalFiles);
      sendSuccess(res, {
        message: 'Khởi tạo lô tải lên hàng loạt thành công.',
        data: batch,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 5. Cập nhật tiến độ tải lên hàng loạt
  public async updateBatchUpload(req: AuthRequest, res: Response): Promise<void> {
    try {
      const batchId = req.params.id as string;
      const { uploadedCount, failedCount, status, errorLog } = req.body;

      if (!batchId) {
        sendError(res, 400, 'Thiếu thông số mã lô tải (id).');
        return;
      }

      const updatedBatch = await ImageService.updateBatchUpload(batchId, {
        uploadedCount,
        failedCount,
        status,
        errorLog,
      });

      sendSuccess(res, {
        message: 'Cập nhật lô tải lên thành công.',
        data: updatedBatch,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }
}
export const imageController = new ImageController();
