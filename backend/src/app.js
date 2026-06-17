import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './routes/api.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and parsing of JSON/URL-encoded request bodies
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register api endpoints
app.use('/api', apiRouter);

// Resolve static path to frontend build assets
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticPath = path.join(__dirname, '../../frontend/dist');

// Serve static assets from frontend build
app.use(express.static(staticPath));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'AI Knowledge Assistant Backend is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Wildcard GET handler to serve index.html for client routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Custom 404 Route Not Found handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Resource not found'
  });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start the server (local development and persistent server environments)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/api/health`);
  });
}

export default app;
