import { Request, Response } from 'express';
import { generateEcommerceSeo } from '../services/ecommerce.service';

export const generateSeo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      res.status(400).json({ success: false, error: 'Thiếu imageUrl' });
      return;
    }

    const seoData = await generateEcommerceSeo(imageUrl);
    res.json({ success: true, data: seoData });
  } catch (error: any) {
    console.error('Lỗi generate ecommerce SEO:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
