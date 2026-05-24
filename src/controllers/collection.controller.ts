import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { CollectionService } from '../services/collection.service';
import { sendSuccess, sendError } from '../utils/response';

export class CollectionController {
  // 1. Lấy toàn bộ bộ sưu tập của user hiện tại
  public async getCollections(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }

      const collections = await CollectionService.getUserCollections(userId);
      sendSuccess(res, {
        message: 'Lấy danh sách bộ sưu tập thành công.',
        data: collections,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 2. Tạo một bộ sưu tập mới
  public async createCollection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }

      const { name, description, coverAssetId, visibility } = req.body;
      if (!name) {
        sendError(res, 400, 'Thiếu thông số tên bộ sưu tập (name).');
        return;
      }

      const collection = await CollectionService.createCollection({
        userId,
        name,
        description,
        coverAssetId,
        visibility,
      });

      sendSuccess(res, {
        statusCode: 201,
        message: 'Tạo bộ sưu tập thành công.',
        data: collection,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 3. Thêm ảnh vào bộ sưu tập
  public async addCollectionItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      const collectionId = req.params.id as string;
      const { assetId } = req.body;

      if (!collectionId) {
        sendError(res, 400, 'Thiếu thông số mã bộ sưu tập (id).');
        return;
      }
      if (!assetId) {
        sendError(res, 400, 'Thiếu thông số mã ảnh (assetId).');
        return;
      }

      const item = await CollectionService.addAssetToCollection(collectionId, assetId);
      sendSuccess(res, {
        message: 'Thêm ảnh vào bộ sưu tập thành công.',
        data: item,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 4. Lấy toàn bộ ảnh trong một bộ sưu tập cụ thể
  public async getCollectionItems(req: AuthRequest, res: Response): Promise<void> {
    try {
      const collectionId = req.params.id as string;

      if (!collectionId) {
        sendError(res, 400, 'Thiếu thông số mã bộ sưu tập (id).');
        return;
      }

      const items = await CollectionService.getCollectionItems(collectionId);
      sendSuccess(res, {
        message: 'Lấy danh sách ảnh trong bộ sưu tập thành công.',
        data: items,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 5. Xóa bộ sưu tập
  public async deleteCollection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const collectionId = req.params.id as string;

      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }
      if (!collectionId) {
        sendError(res, 400, 'Thiếu thông số mã bộ sưu tập (id).');
        return;
      }

      const deleted = await CollectionService.deleteCollection(userId, collectionId);
      sendSuccess(res, {
        message: 'Xóa bộ sưu tập thành công.',
        data: deleted,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 6. Cập nhật bộ sưu tập
  public async updateCollection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const collectionId = req.params.id as string;
      const { name, description, coverAssetId, visibility } = req.body;

      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }
      if (!collectionId) {
        sendError(res, 400, 'Thiếu thông số mã bộ sưu tập (id).');
        return;
      }

      const updated = await CollectionService.updateCollection(collectionId, userId, {
        name,
        description,
        coverAssetId,
        visibility,
      });

      sendSuccess(res, {
        message: 'Cập nhật bộ sưu tập thành công.',
        data: updated,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 7. Xóa asset khỏi bộ sưu tập
  public async removeCollectionItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      const collectionId = req.params.id as string;
      const { assetId } = req.body;

      if (!collectionId) {
        sendError(res, 400, 'Thiếu thông số mã bộ sưu tập (id).');
        return;
      }
      if (!assetId) {
        sendError(res, 400, 'Thiếu thông số mã ảnh (assetId).');
        return;
      }

      const result = await CollectionService.removeAssetFromCollection(collectionId, assetId);
      sendSuccess(res, {
        message: 'Xóa ảnh khỏi bộ sưu tập thành công.',
        data: result,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }

  // 8. Lấy chi tiết bộ sưu tập
  public async getCollectionById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const collectionId = req.params.id as string;

      if (!userId) {
        sendError(res, 401, 'Không tìm thấy thông tin xác thực người dùng.');
        return;
      }
      if (!collectionId) {
        sendError(res, 400, 'Thiếu thông số mã bộ sưu tập (id).');
        return;
      }

      const collection = await CollectionService.getCollectionById(collectionId, userId);
      sendSuccess(res, {
        message: 'Lấy chi tiết bộ sưu tập thành công.',
        data: collection,
      });
    } catch (err: any) {
      sendError(res, 500, err.message);
    }
  }
}
export const collectionController = new CollectionController();
