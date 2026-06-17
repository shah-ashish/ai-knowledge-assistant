import { generateEmbedding, rephraseQuery, generateResponse } from '../services/geminiService.js';
import { chunkPages, chunkText } from './textSplitter.js';
import { addDocuments, similaritySearch, getConfidenceLevel, addChatMessage, getChatHistory, setSessionSummary, getSessionSummary, hasDocuments } from './vectorStore.js';

/**
 * Helper to check if a user message is a simple greeting.
 */
function isGreeting(text) {
  const patterns = [
    /^\s*hi\s*$/i,
    /^\s*hello\s*$/i,
    /^\s*hey\s*$/i,
    /^\s*greetings\s*$/i,
    /^\s*good\s+(morning|afternoon|evening)\s*$/i,
    /^\s*how\s+are\s+you\s*$/i,
    /^\s*how\s+r\s+u\s*$/i,
    /^\s*what's\s+up\s*$/i,
    /^\s*who\s+are\s+you\s*$/i,
    /^\s*who\s+(are|r)\s+(you|u)\s*$/i
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Helper to check if a user is asking about their chat history.
 */
function isHistoryQuery(text) {
  const patterns = [
    /last\s+message/i,
    /previous\s+message/i,
    /what\s+did\s+i\s+(say|ask)/i
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Generate a short outline of the document using the first few pages.
 * @param {Array<{page: number, text: string}>} pages - Extracted document pages.
 * @returns {Promise<string>} - Bulleted short outline.
 */
async function generateDocumentOutline(pages) {
  // Use first 3 pages of text up to 5000 chars for safety
  const textSample = pages.slice(0, 3).map(p => p.text).join('\n').substring(0, 5000).trim();

  if (!textSample) {
    return 'No text content found in the document to outline.';
  }

  const systemPrompt = "You are a helpful AI Assistant Romeo. Summarize documents concisely.";
  const prompt = `Generate a very short, high-level outline of what this document covers in 2-3 key bullet points. Do not include introductory text, just return the bullet points.

Document Sample:
-----------------
${textSample}
-----------------

Outline:`;

  try {
    return await generateResponse(systemPrompt, prompt);
  } catch (error) {
    console.error('Failed to generate document outline:', error.message);
    return '- Standard PDF Document\n- In-memory retrieval active';
  }
}

/**
 * Clean and ingest raw document content into the session-based vector store.
 * Supports both raw text (as a single string) and structured pages (from PDF parser).
 * 
 * @param {string} sessionId - Active session ID.
 * @param {string} filename - Name of the uploaded file.
 * @param {string|Array<{page: number, text: string}>} content - Raw content.
 * @returns {Promise<{success: boolean, chunksCount: number, summary: string}>} - Ingestion result.
 */
export async function ingestDocument(sessionId, filename, content) {
  try {
    let pages = [];

    if (typeof content === 'string') {
      pages = [{ page: 1, text: content }];
    } else if (Array.isArray(content)) {
      pages = content;
    } else {
      throw new Error('Invalid content format provided for ingestion');
    }

    // 1. Chunk the pages
    const chunks = chunkPages(pages, 1000, 200);
    if (chunks.length === 0) {
      throw new Error('Document resulted in 0 text chunks');
    }

    // 2. Generate embeddings in parallel for fast indexing
    console.log(`Generating embeddings for ${chunks.length} chunks of "${filename}"...`);
    const embeddingPromises = chunks.map(chunk => generateEmbedding(chunk.text));
    const embeddings = await Promise.all(embeddingPromises);

    // 3. Add to our session-based memory database
    addDocuments(sessionId, chunks, embeddings, filename);

    // 4. Generate a short document outline
    console.log(`Generating document outline for "${filename}"...`);
    const outline = await generateDocumentOutline(pages);

    // Save summary to session DB so it is accessible during query generation
    setSessionSummary(sessionId, outline);

    return {
      success: true,
      chunksCount: chunks.length,
      summary: outline
    };
  } catch (error) {
    console.error(`Error ingesting document "${filename}":`, error);
    throw error;
  }
}


/**
 * Handle a user query using the streaming RAG pipeline.
 * 
 * @param {string} sessionId - Active session ID.
 * @param {string} userQuestion - Raw question from user.
 * @param {Function} onMeta - Callback function for metadata chunk.
 * @param {Function} onChunk - Callback function for answer stream delta.
 * @returns {Promise<{answer: string, citations: Array<{file: string, page: number}>, confidence: 'High'|'Medium'|'Low'}>}
 */
export async function queryPipelineStream(sessionId, userQuestion, onMeta, onChunk) {
  try {
    // 1. Greeting Bypass
    if (isGreeting(userQuestion)) {
      const prompt = `The user says: "${userQuestion}". Respond with a short, warm greeting stating that you are the AI Knowledge Assistant and ready to answer questions about their uploaded document. Keep it to one short sentence.`;
      const systemInstruction = "You are the AI Knowledge Assistant. Under no circumstances should you call yourself ChatGPT, OpenAI, Gemini, or Google. Your name is AI Knowledge Assistant.";

      // Send metadata first
      onMeta({ citations: [], confidence: 'High' });

      const answer = await generateResponse(systemInstruction, prompt, onChunk);
      addChatMessage(sessionId, 'user', userQuestion);
      addChatMessage(sessionId, 'model', answer);
      return { answer, citations: [], confidence: 'High' };
    }

    // 2. Chat History Bypass
    if (isHistoryQuery(userQuestion)) {
      const history = getChatHistory(sessionId);
      const lastUserTurn = history.filter(h => h.role === 'user').pop();
      let answer;
      if (lastUserTurn) {
        answer = `Your last message was: "${lastUserTurn.content}"`;
      } else {
        answer = "This is your first message in our chat session.";
      }

      // Send metadata first
      onMeta({ citations: [], confidence: 'High' });

      // Stream the history answer in chunks
      onChunk(answer);

      addChatMessage(sessionId, 'user', userQuestion);
      addChatMessage(sessionId, 'model', answer);
    }

    // Check if session contains documents (index wiped by restart or expiration)
    if (!hasDocuments(sessionId)) {
      const answer = "Your session has expired or the server restarted. Please re-upload your PDF document to start chatting.";
      onMeta({ citations: [], confidence: 'Low' });
      onChunk(answer);
      addChatMessage(sessionId, 'user', userQuestion);
      addChatMessage(sessionId, 'model', answer);
      return { answer, citations: [], confidence: 'Low' };
    }

    // 3. Fetch history for RAG flow
    const history = getChatHistory(sessionId);

    // 4. Rephrase follow-up questions if history exists
    const standaloneQuestion = await rephraseQuery(history, userQuestion);
    console.log(`Query: "${userQuestion}" -> Standalone Query: "${standaloneQuestion}"`);

    // 5. Generate query vector embedding
    const queryVector = await generateEmbedding(standaloneQuestion);

    // 6. Retrieve top relevant chunks from memory (retrieve top 3 chunks)
    const matchedChunks = similaritySearch(sessionId, queryVector, 3);

    // Default values if no chunks found
    let confidence = 'Low';
    let citations = [];
    let contextText = '';

    if (matchedChunks.length > 0) {
      const topScore = matchedChunks[0].score;
      confidence = getConfidenceLevel(topScore);

      const citationMap = new Map();
      matchedChunks.forEach(c => {
        citationMap.set(`${c.filename}::${c.pageNumber}`, { file: c.filename, page: c.pageNumber });
      });
      citations = Array.from(citationMap.values()).sort((a, b) => a.page - b.page);

      contextText = matchedChunks
        .map((c, i) => `[Context Block ${i + 1} - Source: ${c.filename}, Page: ${c.pageNumber}]\nContent: ${c.text}`)
        .join('\n\n');
    }

    // Send metadata callback
    onMeta({ citations, confidence });

    const documentSummary = getSessionSummary(sessionId);

    // 7. System instructions demanding answers ONLY from provided context & summary
    const systemPrompt = `You are the AI Knowledge Assistant. Under no circumstances should you call yourself ChatGPT, OpenAI, Gemini, or Google. Your name is AI Knowledge Assistant.

Guidelines:
1. Answer the question using the provided Document Context and Document Summary as accurately as possible.
2. If the user's question cannot be answered using the provided document context, summary, or conversation history, respond exactly with:
'I could not find that information in the uploaded document.'
3. Do not invent details or assume facts not supported by the document. Keep answers grounded.`;

    // 8. User prompt injecting context blocks, summary, and standalone question
    const userPrompt = `Document Summary:
---------------------
${documentSummary || 'No summary available.'}
---------------------

Context Blocks:
---------------------
${contextText || 'No relevant context blocks found in the document.'}
---------------------

Question: ${standaloneQuestion}

Answer:`;

    // 9. Generate answer from LLM with streaming callback
    const answer = await generateResponse(systemPrompt, userPrompt, onChunk);

    // 10. Save QA turn to session conversation memory
    addChatMessage(sessionId, 'user', userQuestion);
    addChatMessage(sessionId, 'model', answer);

    return {
      answer,
      citations,
      confidence
    };
  } catch (error) {
    console.error('Error in queryPipelineStream:', error);
    throw error;
  }
}
