import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { AuthRequest } from './auth.middleware';

const json = (message: string) => ({
  success: false,
  error: message,
  retryAfter: undefined as undefined | number,
});

/** Wraps a rate limiter: skips entirely for staff/admin users (req.user must be set by requireAuth first). */
export function staffBypass(limiter: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req as AuthRequest).user?.role;
    if (role === 'staff' || role === 'admin') return next();
    return limiter(req, res, next);
  };
}

function makeLimiter(windowMs: number, max: number, message: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      const retryAfter = Math.ceil(options.windowMs / 1000 / 60);
      res.status(429).json({
        ...json(message),
        retryAfter,
      });
    },
  });
}

// 200 req / 15 min – chặn flood toàn cục
export const globalLimiter = makeLimiter(
  15 * 60 * 1000,
  200,
  'Quá nhiều yêu cầu. Vui lòng thử lại sau.'
);

// 10 req / 15 min – bảo vệ login / register chống brute-force
export const authLimiter = makeLimiter(
  15 * 60 * 1000,
  10,
  'Quá nhiều lần xác thực. Vui lòng thử lại sau 15 phút.'
);

// 10 req / min – bảo vệ API key fashn.ai khỏi bị đốt credit
export const aiLimiter = makeLimiter(
  60 * 1000,
  10,
  'Quá nhiều yêu cầu AI. Vui lòng thử lại sau.'
);

// 60 req / min – giới hạn cho chat support
export const supportLimiter = makeLimiter(
  60 * 1000,
  60,
  'Gửi tin nhắn quá nhanh. Vui lòng thử lại sau.'
);
