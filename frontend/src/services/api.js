const API_BASE_URL = '/api';

/**
 * Upload a PDF document to the RAG backend.
 * 
 * @param {File} file - The PDF file object.
 * @param {string} sessionId - The current active session ID.
 * @returns {Promise<{success: boolean, message: string, filename: string, pagesCount: number, chunksCount: number}>}
 */
export async function uploadDocument(file, sessionId) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sessionId', sessionId);

  try {
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to upload and parse document');
    }

    return data;
  } catch (error) {
    console.error('Error in uploadDocument API service:', error);
    throw error;
  }
}

/**
 * Send a chat question to the RAG backend.
 * 
 * @param {string} question - The user's query.
 * @param {string} sessionId - The current active session ID.
 * @returns {Promise<{success: boolean, answer: string, citations: Array<{file: string, page: number}>, confidence: 'High'|'Medium'|'Low'}>}
 */
export async function sendChatMessage(question, sessionId) {
  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        sessionId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch answer from assistant');
    }

    return data;
  } catch (error) {
    console.error('Error in sendChatMessage API service:', error);
    throw error;
  }
}

/**
 * Send a chat question to the RAG backend and stream the response.
 * 
 * @param {string} question - The user's query.
 * @param {string} sessionId - The current active session ID.
 * @param {Function} onMeta - Callback with metadata { citations, confidence }.
 * @param {Function} onChunk - Callback with new text tokens.
 */
export async function sendChatMessageStream(question, sessionId, onMeta, onChunk) {
  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        sessionId,
      }),
    });

    if (!response.ok) {
      let errMessage = 'Failed to fetch answer from assistant';
      try {
        const data = await response.json();
        errMessage = data.error || errMessage;
      } catch (e) {
        // Response not JSON
      }
      throw new Error(errMessage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep last incomplete line

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        if (cleanLine.startsWith('data: ')) {
          try {
            const jsonStr = cleanLine.substring(6);
            const data = JSON.parse(jsonStr);

            if (data.type === 'meta') {
              onMeta({
                citations: data.citations || [],
                confidence: data.confidence || 'Low'
              });
            } else if (data.type === 'text') {
              onChunk(data.delta);
            } else if (data.type === 'done') {
              return;
            } else if (data.type === 'error') {
              throw new Error(data.error || 'Error during streaming completion');
            }
          } catch (err) {
            console.error('Failed to parse SSE line:', cleanLine, err);
          }
        }
      }
    }

    // Process remainder of buffer
    if (buffer.trim()) {
      const cleanLine = buffer.trim();
      if (cleanLine.startsWith('data: ')) {
        try {
          const jsonStr = cleanLine.substring(6);
          const data = JSON.parse(jsonStr);
          if (data.type === 'meta') {
            onMeta({
              citations: data.citations || [],
              confidence: data.confidence || 'Low'
            });
          } else if (data.type === 'text') {
            onChunk(data.delta);
          } else if (data.type === 'error') {
            throw new Error(data.error || 'Error during streaming completion');
          }
        } catch (err) {
          // Ignore
        }
      }
    }
  } catch (error) {
    console.error('Error in sendChatMessageStream API service:', error);
    throw error;
  }
}

/**
 * Reset the document index and conversation history for the session.
 * 
 * @param {string} sessionId - The current active session ID.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function resetSession(sessionId) {
  try {
    const response = await fetch(`${API_BASE_URL}/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset session data');
    }

    return data;
  } catch (error) {
    console.error('Error in resetSession API service:', error);
    throw error;
  }
}
