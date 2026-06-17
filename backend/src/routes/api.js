import express from 'express';
import multer from 'multer';
import { uploadDocument, resetSession } from '../controllers/documentController.js';
import { handleChat } from '../controllers/chatController.js';

const router = express.Router();

// Configure Multer to store uploaded files in-memory as buffers
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20 MB max file size
  }
});

/**
 * Route: POST /api/upload
 * Form-Data parameters:
 * - file: The PDF file to upload
 * - sessionId: Session identifier
 */
router.post('/upload', upload.single('file'), uploadDocument);

/**
 * Route: POST /api/chat
 * JSON Body parameters:
 * - sessionId: Session identifier
 * - question: User question string
 */
router.post('/chat', handleChat);

/**
 * Route: POST /api/reset
 * JSON Body parameters:
 * - sessionId: Session identifier
 */
router.post('/reset', resetSession);

export default router;
