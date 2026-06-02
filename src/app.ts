import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.routes';
import imageRoutes from './routes/image.routes';
import collectionRoutes from './routes/collection.routes';
import historyRoutes from './routes/history.routes';
import userRoutes from './routes/user.routes';
import aiRoutes from './routes/ai.routes';
import supportRoutes from './routes/support.routes';
import adminRoutes from './routes/admin.routes';
import notificationRoutes from './routes/notification.routes';
import webhookRoutes from './routes/webhook.routes';
import { setupSwagger } from './config/swagger';
import { globalLimiter, authLimiter, aiLimiter, supportLimiter } from './middlewares/rateLimit.middleware';

const app: Application = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  helmet({
    contentSecurityPolicy: false, // Tắt CSP để tránh chặn Swagger UI assets
  })
);
// Skip logging OPTIONS preflight requests
app.use(morgan('dev', {
  skip: (req) => req.method === 'OPTIONS',
}));

// CORS config – CLIENT_URL có thể là danh sách cách nhau bởi dấu phẩy
// Ví dụ: https://guai.vercel.app,https://www.guai.app
const allowedOrigins: string[] = (
  process.env.CLIENT_URL || 'http://localhost:3000'
)
  .split(',')
  .map((s) => s.trim().replace(/\/$/, '')) // Loại bỏ dấu slash / ở cuối nếu có
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Chuẩn hóa origin đầu vào (loại bỏ slash cuối)
      const cleanOrigin = origin ? origin.trim().replace(/\/$/, '') : '';
      
      // Cho phép server-to-server (không có origin), localhost trong môi trường dev, hoặc origin nằm trong whitelist
      if (
        !origin || 
        process.env.NODE_ENV !== 'production' || 
        allowedOrigins.includes(cleanOrigin) ||
        allowedOrigins.some(allowed => cleanOrigin.startsWith(allowed))
      ) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked for origin: ${origin}. Allowed:`, allowedOrigins);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  })
);

// Setup Swagger UI at /api-docs
setupSwagger(app);

// Global rate limiter (must come before routes)
app.use(globalLimiter);

// Routes
app.use('/api/auth',    authLimiter,    authRoutes);
app.use('/api/images',                  imageRoutes);
app.use('/api/collections',             collectionRoutes);
app.use('/api/history',                 historyRoutes);
app.use('/api/users',                   userRoutes);
app.use('/api/ai',      aiLimiter,      aiRoutes);
app.use('/api/support', supportLimiter, supportRoutes);
app.use('/api/admin',                   adminRoutes);
app.use('/api/notifications',           notificationRoutes);
app.use('/api/webhooks',                webhookRoutes);

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Server is running properly' });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

export default app;
