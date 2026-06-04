import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { ImageService } from '../services/image.service';
import { sendSuccess, sendError } from '../utils/response';

export class ImageController {
  public async getImages(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }
      sendSuccess(res, { message: 'Lấy danh sách ảnh thành công.', data: await ImageService.getUserImages(userId) });
    } catch (err: any) { sendError(res, 500, err.message); }
  }

  public async getArchivedImages(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }
      sendSuccess(res, { message: 'Lấy danh sách ảnh archive thành công.', data: await ImageService.getArchivedImages(userId) });
    } catch (err: any) { sendError(res, 500, err.message); }
  }

  public async createImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }
      const { fileUrl, thumbnailUrl, type, category, fileSize, fileName, mimeType, width, height } = req.body;
      if (!fileUrl) { sendError(res, 400, 'Thiếu thông số bắt buộc fileUrl.'); return; }
      sendSuccess(res, { statusCode: 201, message: 'Lưu bản ghi ảnh thành công.', data: await ImageService.createImage({ userId, fileUrl, thumbnailUrl, type, category, fileSize, fileName, mimeType, width, height }) });
    } catch (err: any) { sendError(res, 500, err.message); }
  }

  // Soft delete — chuyển vào Archive
  public async archiveImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const imageId = req.params.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }
      if (!imageId) { sendError(res, 400, 'Thiếu thông số mã ảnh (id).'); return; }
      sendSuccess(res, { message: 'Đã chuyển ảnh vào Archive.', data: await ImageService.archiveImage(userId, imageId) });
    } catch (err: any) { sendError(res, 500, err.message); }
  }

  public async restoreFromArchive(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const imageId = req.params.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }
      if (!imageId) { sendError(res, 400, 'Thiếu thông số mã ảnh (id).'); return; }
      sendSuccess(res, { message: 'Đã khôi phục ảnh về thư viện.', data: await ImageService.restoreFromArchive(userId, imageId) });
    } catch (err: any) { sendError(res, 500, err.message); }
  }

  public async permanentlyDeleteImage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const imageId = req.params.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }
      if (!imageId) { sendError(res, 400, 'Thiếu thông số mã ảnh (id).'); return; }
      sendSuccess(res, { message: 'Đã xóa vĩnh viễn ảnh.', data: await ImageService.permanentlyDeleteImage(userId, imageId) });
    } catch (err: any) { sendError(res, 500, err.message); }
  }

  public async emptyArchive(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }
      const result = await ImageService.emptyArchive(userId);
      sendSuccess(res, { message: `Đã xóa vĩnh viễn ${result.deletedCount} ảnh.`, data: result });
    } catch (err: any) { sendError(res, 500, err.message); }
  }

  public async bulkArchive(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.'); return; }
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) { sendError(res, 400, 'Cần cung cấp danh sách id ảnh.'); return; }
      const result = await ImageService.bulkArchive(userId, ids);
      sendSuccess(res, { message: `Đã chuyển ${result.archivedCount} ảnh vào Archive.`, data: result });
    } catch (err: any) { sendError(res, 500, err.message); }
  }

  // DELETE /:id — backward-compat: chuyển vào Archive (soft delete)
  public async deleteImage(req: AuthRequest, res: Response): Promise<void> {
    return this.archiveImage(req, res);
  }
}

export const imageController = new ImageController();
