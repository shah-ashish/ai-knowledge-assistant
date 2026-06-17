import { extractTextByPage } from '../services/pdfService.js';
import { ingestDocument } from '../rag/pipeline.js';
import { clearSession } from '../rag/vectorStore.js';

// Max file size: 20 MB (20 * 1024 * 1024 bytes)
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Handle document upload and parsing.
 * 
 * Expected Form-Data:
 * - file: PDF file upload
 * - sessionId: Session identifier string
 */
export async function uploadDocument(req, res, next) {
  try {
    const { sessionId } = req.body;
    const file = req.file;

    // 1. Validate sessionId presence
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: sessionId'
      });
    }

    // 2. Validate file presence
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // 3. Validate file size (20 MB limit)
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        error: 'File size exceeds 20 MB limit'
      });
    }

    // 4. Validate file type (PDF only)
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return res.status(400).json({
        success: false,
        error: 'Only PDF documents are supported'
      });
    }

    console.log(`Uploading & parsing "${file.originalname}" for session: ${sessionId}`);

    // 5. Extract text page-by-page
    const pages = await extractTextByPage(file.buffer);
    if (pages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Document text could not be extracted or file is empty'
      });
    }

    // 6. Index document chunks & generate embeddings
    const result = await ingestDocument(sessionId, file.originalname, pages);

    res.status(200).json({
      success: true,
      message: 'Document processed successfully',
      filename: file.originalname,
      pagesCount: pages.length,
      chunksCount: result.chunksCount,
      summary: result.summary
    });

  } catch (error) {
    console.error('Error during uploadDocument controller:', error);
    next(error);
  }
}

/**
 * Reset and wipe session indexing and history.
 * 
 * Expected JSON Body:
 * - sessionId: Session identifier string
 */
export async function resetSession(req, res, next) {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: sessionId'
      });
    }

    console.log(`Wiping RAG index and chat history for session: ${sessionId}`);
    clearSession(sessionId);

    res.status(200).json({
      success: true,
      message: 'Document and chat history reset successfully'
    });

  } catch (error) {
    console.error('Error during resetSession controller:', error);
    next(error);
  }
}
