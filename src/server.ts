import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import app from './app';
import { initializeSocket } from './config/socket';
import { startCleanupJob } from './jobs/cleanup.job';

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

// Start scheduled jobs
startCleanupJob();

httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📖 Swagger Docs:    http://localhost:${PORT}/api-docs`);
});
