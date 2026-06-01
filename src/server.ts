import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import app from './app';
import { initializeSocket } from './config/socket';

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📖 Swagger Docs:    http://localhost:${PORT}/api-docs`);
});
