import { queryPipelineStream } from '../rag/pipeline.js';

/**
 * Handle user messages, retrieval from vector database, and streaming generation of response.
 * 
 * Expected JSON Body:
 * - sessionId: Session identifier string
 * - question: User query string
 */
export async function handleChat(req, res, next) {
  let headersSent = false;
  try {
    const { sessionId, question } = req.body;

    // 1. Validate fields
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: sessionId'
      });
    }

    if (!question || question.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Missing or empty required field: question'
      });
    }

    console.log(`Processing chat query stream for session "${sessionId}": "${question}"`);

    // Set headers for SSE stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    headersSent = true;

    // Helper to send events in SSE format
    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // 2. Query RAG stream pipeline
    await queryPipelineStream(
      sessionId,
      question.trim(),
      (meta) => {
        sendEvent({
          type: 'meta',
          citations: meta.citations,
          confidence: meta.confidence
        });
      },
      (delta) => {
        sendEvent({
          type: 'text',
          delta
        });
      }
    );

    // 3. Close the stream
    sendEvent({ type: 'done' });
    res.end();

  } catch (error) {
    console.error('Error during handleChat controller:', error);
    
    let userErrorMessage = error.message || 'Internal Server Error';
    if (error.message && error.message.includes('Quota exceeded')) {
      userErrorMessage = 'AI service rate limit exceeded. Please wait a moment and try again.';
    }

    if (headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: userErrorMessage })}\n\n`);
      res.end();
    } else {
      res.status(500).json({
        success: false,
        error: userErrorMessage
      });
    }
  }
}
