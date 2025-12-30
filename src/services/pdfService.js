const pdfParse = require('pdf-parse');
const fs = require('fs').promises;
const sharp = require('sharp');
const getOCRService = require('./ocrService');

class PDFService {
  /**
   * Extract text from PDF
   */
  async extractTextFromPDF(pdfPath) {
    try {
      const dataBuffer = await fs.readFile(pdfPath);
      const data = await pdfParse(dataBuffer);
      
      // If PDF has extractable text, return it
      if (data.text && data.text.trim().length > 0) {
        return data.text.trim();
      }

      // If PDF is image-based, extract first page as image and use OCR
      console.log('PDF appears to be image-based, using OCR...');
      return await this.extractTextFromPDFImage(pdfPath);
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF buffer
   */
  async extractTextFromPDFBuffer(pdfBuffer) {
    try {
      const data = await pdfParse(pdfBuffer);
      
      if (data.text && data.text.trim().length > 0) {
        return data.text.trim();
      }

      throw new Error('PDF appears to be image-based. Please convert to image first.');
    } catch (error) {
      console.error('Error extracting text from PDF buffer:', error);
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from image-based PDF using OCR
   */
  async extractTextFromPDFImage(pdfPath) {
    // Note: This is a simplified approach. For production, consider using pdf2pic or similar
    // to convert PDF pages to images first
    const ocrService = getOCRService();
    const dataBuffer = await fs.readFile(pdfPath);
    
    // Try to extract text using OCR on the PDF buffer
    // This works for some image-based PDFs
    try {
      return await ocrService.extractTextFromBuffer(dataBuffer);
    } catch (error) {
      throw new Error('Unable to extract text from image-based PDF. Please provide an image file instead.');
    }
  }
}

module.exports = new PDFService();

