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
import { setupSwagger } from './config/swagger';

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
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Cho phép server-to-server (không có origin) hoặc origin nằm trong whitelist
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin "${origin}" không được phép.`));
      }
    },
    credentials: true,
  })
);

// Setup Swagger UI at /api-docs
setupSwagger(app);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);

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
