import pdf from 'pdf-parse';

/**
 * Extracts text from a PDF Buffer page-by-page.
 * Utilizes custom pagerender callback in pdf-parse to hook into pdf.js and capture page-level boundaries.
 * 
 * @param {Buffer} dataBuffer - The raw file buffer of the uploaded PDF.
 * @returns {Promise<Array<{page: number, text: string}>>} - Extracted pages with text content.
 */
export async function extractTextByPage(dataBuffer) {
  const pages = [];

  // Custom page rendering handler to capture page boundaries and contents
  const renderPageCallback = async (pageData) => {
    const renderOptions = {
      normalizeWhitespace: true,
      disableCombineTextItems: false
    };

    try {
      const textContent = await pageData.getTextContent(renderOptions);
      let lastY = null;
      let text = '';

      for (const item of textContent.items) {
        // Simple heuristic to reconstruct text lines based on Y-coordinates (vertical alignment)
        const yCoordinate = item.transform[5];
        
        if (lastY === null || lastY === yCoordinate) {
          text += item.str;
        } else {
          text += '\n' + item.str;
        }
        
        lastY = yCoordinate;
      }

      // pageData.pageIndex is 0-based index of the page
      const pageNumber = pageData.pageIndex + 1;
      
      pages.push({
        page: pageNumber,
        text: text
      });

      return text;
    } catch (error) {
      console.error(`Error rendering page index ${pageData.pageIndex}:`, error);
      throw error;
    }
  };

  try {
    const options = {
      pagerender: renderPageCallback
    };

    // Parse PDF (this triggers our renderPageCallback for each page)
    await pdf(dataBuffer, options);

    // Sort pages in ascending order to guarantee correct sequence
    pages.sort((a, b) => a.page - b.page);

    return pages;
  } catch (error) {
    console.error('Error extracting text from PDF in pdfService:', error);
    throw error;
  }
}
