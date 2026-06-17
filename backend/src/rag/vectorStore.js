/**
 * Cosine Similarity calculation between two numerical vectors.
 * 
 * @param {number[]} vecA - First vector.
 * @param {number[]} vecB - Second vector.
 * @returns {number} - Similarity score between -1 and 1.
 */
export function calculateCosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
  }
  
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0; // Prevent division by zero
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Global in-memory storage maps session IDs to their document indexes and history
// Structure of each session:
// {
//   documents: Array<{ text, pageNumber, chunkIndex, embedding }>,
//   history: Array<{ role: 'user'|'model', content }>
// }
const sessionDb = new Map();

/**
 * Get or initialize a session container.
 * @param {string} sessionId - The session identifier.
 * @returns {object} - Session object.
 */
function getOrCreateSession(sessionId) {
  if (!sessionDb.has(sessionId)) {
    sessionDb.set(sessionId, {
      documents: [],
      history: [],
      lastAccessed: Date.now()
    });
  } else {
    sessionDb.get(sessionId).lastAccessed = Date.now();
  }
  return sessionDb.get(sessionId);
}

/**
 * Store documents (chunks matched with their embeddings) for a specific session.
 * 
 * @param {string} sessionId - Unique session ID.
 * @param {Array<{text: string, pageNumber: number, chunkIndex: number}>} chunks - Extracted text chunks.
 * @param {number[][]} embeddings - Matching 2D array of embeddings for chunks.
 * @param {string} filename - Name of the source file.
 */
export function addDocuments(sessionId, chunks, embeddings, filename) {
  if (chunks.length !== embeddings.length) {
    throw new Error('Size mismatch between chunks and embeddings list');
  }

  const session = getOrCreateSession(sessionId);
  
  // Append new document chunks with their corresponding vectors and filename
  chunks.forEach((chunk, index) => {
    session.documents.push({
      text: chunk.text,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      filename: filename,
      embedding: embeddings[index]
    });
  });
}

/**
 * Search the stored session chunks for the top matches similar to the query.
 * 
 * @param {string} sessionId - Unique session ID.
 * @param {number[]} queryEmbedding - Vector embedding of the search query.
 * @param {number} topK - Max relevant documents to retrieve (default 3).
 * @returns {Array<{text: string, pageNumber: number, chunkIndex: number, filename: string, score: number}>} - Top relevant matches.
 */
export function similaritySearch(sessionId, queryEmbedding, topK = 3) {
  const session = sessionDb.get(sessionId);
  if (!session || session.documents.length === 0) {
    return [];
  }
  
  // Update last accessed time to maintain session during activity
  session.lastAccessed = Date.now();

  // Calculate similarity score for each stored document chunk
  const scoredDocs = session.documents.map((doc) => {
    const score = calculateCosineSimilarity(queryEmbedding, doc.embedding);
    return {
      text: doc.text,
      pageNumber: doc.pageNumber,
      chunkIndex: doc.chunkIndex,
      filename: doc.filename,
      score: score
    };
  });

  // Sort by score in descending order and return top K
  return scoredDocs
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Translate similarity score to confidence levels (High, Medium, Low).
 * 
 * @param {number} score - Highest similarity score in search results.
 * @returns {'High'|'Medium'|'Low'} - Mapped confidence rating.
 */
export function getConfidenceLevel(score) {
  if (score >= 0.80) {
    return 'High';
  } else if (score >= 0.65) {
    return 'Medium';
  } else {
    return 'Low';
  }
}

/**
 * Retrieve chat history for a session.
 * @param {string} sessionId - Unique session ID.
 * @returns {Array<{role: string, content: string}>} - Array of history objects.
 */
export function getChatHistory(sessionId) {
  const session = sessionDb.get(sessionId);
  if (session) {
    session.lastAccessed = Date.now(); // Update timestamp
    return session.history;
  }
  return [];
}

/**
 * Append a user or AI message to session chat history.
 * @param {string} sessionId - Unique session ID.
 * @param {'user'|'model'} role - Message sender.
 * @param {string} content - Message text content.
 */
export function addChatMessage(sessionId, role, content) {
  const session = getOrCreateSession(sessionId);
  session.history.push({ role, content });
  
  // Cap chat history to last 10 messages to keep context window tight
  if (session.history.length > 10) {
    session.history.shift();
  }
}

/**
 * Set the document summary/outline for a session.
 * @param {string} sessionId - Unique session ID.
 * @param {string} summary - The generated outline.
 */
export function setSessionSummary(sessionId, summary) {
  const session = getOrCreateSession(sessionId);
  session.summary = summary;
}

/**
 * Get the document summary/outline for a session.
 * @param {string} sessionId - Unique session ID.
 * @returns {string|null} - Stored summary or null.
 */
export function getSessionSummary(sessionId) {
  const session = sessionDb.get(sessionId);
  return session ? session.summary : null;
}

/**
 * Check if a session has any indexed documents.
 * @param {string} sessionId - Unique session ID.
 * @returns {boolean}
 */
export function hasDocuments(sessionId) {
  const session = sessionDb.get(sessionId);
  return !!(session && session.documents && session.documents.length > 0);
}

/**
 * Clear all stored documents, embeddings and chat history for a session.
 * @param {string} sessionId - Unique session ID.
 */
export function clearSession(sessionId) {
  if (sessionDb.has(sessionId)) {
    sessionDb.delete(sessionId);
  }
}

/**
 * Get internal database statistics (useful for health checks/debugging).
 * @returns {object} - Session database summary statistics.
 */
export function getDbStats() {
  const stats = {};
  for (const [sid, data] of sessionDb.entries()) {
    stats[sid] = {
      chunksCount: data.documents.length,
      historyCount: data.history.length
    };
  }
  return stats;
}

// Background session cleaner (Garbage Collector)
// Checks every 10 minutes and cleans up any session that has been inactive for more than 30 minutes.
// This handles cases where tabs are closed, releasing the server's memory.
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const SWEEP_INTERVAL = 10 * 60 * 1000;      // 10 minutes

setInterval(() => {
  const now = Date.now();
  let cleanCount = 0;
  for (const [sid, data] of sessionDb.entries()) {
    if (now - data.lastAccessed > INACTIVITY_TIMEOUT) {
      sessionDb.delete(sid);
      cleanCount++;
    }
  }
  if (cleanCount > 0) {
    console.log(`[Session GC] Purged ${cleanCount} inactive/closed tab sessions from memory.`);
  }
}, SWEEP_INTERVAL);

