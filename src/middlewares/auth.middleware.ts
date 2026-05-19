import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

// Định nghĩa lại request object để chứa thông tin user
export interface AuthRequest extends Request {
  user?: any;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header.' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Xác thực token với Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
      return;
    }

    // Gán user vào request để các controller phía sau sử dụng
    req.user = user;
    next();
  } catch (err: any) {
    res.status(500).json({ error: 'Server Auth Error', details: err.message });
  }
};
