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

  // 2. Thêm một bản ghi asset mới
  public async createImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }

      const { fileUrl, thumbnailUrl, type, category, fileSize, fileName, mimeType, width, height } = req.body;
      if (!fileUrl) {
        sendError(res, 400, 'Thiếu thông số bắt buộc fileUrl.');
        return;
      }

      const image = await ImageService.createImage({
        userId,
        fileUrl,
        thumbnailUrl,
        type,
        category,
        fileSize,
        fileName,
        mimeType,
        width,
        height
      });

      sendSuccess(res, {
        statusCode: 201,
        message: 'Lưu bản ghi ảnh thành công.',
        data: image,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 3. Xóa ảnh
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
}
export const imageController = new ImageController();
