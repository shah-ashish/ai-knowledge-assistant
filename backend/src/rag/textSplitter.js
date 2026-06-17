/**
 * Split a text string into overlapping chunks.
 * Attempts to align chunk boundaries with whitespace (word boundaries) to avoid cutting words in half.
 * 
 * @param {string} text - The raw string content to split.
 * @param {number} chunkSize - Maximum characters per chunk (default 1000).
 * @param {number} overlap - Overlapping character count between consecutive chunks (default 200).
 * @returns {string[]} - Array of text chunks.
 */
export function chunkText(text, chunkSize = 1000, overlap = 200) {
  if (!text) return [];
  
  // Clean up excessive whitespace but maintain paragraphs
  const cleanText = text.replace(/[ \t]+/g, ' ').trim();
  
  if (cleanText.length <= chunkSize) {
    return [cleanText];
  }
  
  const chunks = [];
  let start = 0;
  
  while (start < cleanText.length) {
    let end = start + chunkSize;
    
    // If we're not at the very end of the text, try to find the nearest space 
    // to break the chunk nicely without splitting a word.
    if (end < cleanText.length) {
      const lastSpace = cleanText.lastIndexOf(' ', end);
      // Only adjust if the last space is within the overlap buffer
      if (lastSpace > start + chunkSize - overlap) {
        end = lastSpace;
      }
    }
    
    const chunkContent = cleanText.substring(start, end).trim();
    if (chunkContent.length > 0) {
      chunks.push(chunkContent);
    }
    
    // Move start pointer forward, accounting for overlap
    // Ensure we always make progress to prevent infinite loops
    const nextStart = end - overlap;
    if (nextStart <= start) {
      start = end; // Force advancement if overlap is too large/small
    } else {
      start = nextStart;
    }
  }
  
  return chunks;
}

/**
 * Split a list of document pages into metadata-linked chunks.
 * 
 * @param {Array<{page: number, text: string}>} pages - List of page objects.
 * @param {number} chunkSize - Characters per chunk.
 * @param {number} overlap - Overlapping character count.
 * @returns {Array<{text: string, pageNumber: number, chunkIndex: number}>} - Formatted chunks list.
 */
export function chunkPages(pages, chunkSize = 1000, overlap = 200) {
  const allChunks = [];
  let chunkIndex = 0;
  
  for (const page of pages) {
    const pageTextChunks = chunkText(page.text, chunkSize, overlap);
    
    pageTextChunks.forEach((chunkContent) => {
      allChunks.push({
        text: chunkContent,
        pageNumber: page.page,
        chunkIndex: chunkIndex++
      });
    });
  }
  
  return allChunks;
}
