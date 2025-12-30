const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

class OCRService {
  constructor() {
    this.worker = null;
    this.initializeWorker();
  }

  async initializeWorker() {
    try {
      if (this.worker) {
        return; // Worker already initialized
      }

      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
          // Only log progress for recognizing status to reduce noise
          if (m.status === 'recognizing text' && m.progress % 0.25 < 0.1) {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      // Set page segmentation mode for better accuracy
      await this.worker.setParameters({
        tessedit_pageseg_mode: '6', // Assume uniform block of text
      });
      
      console.log('OCR Worker initialized successfully');
    } catch (error) {
      console.error('Error initializing OCR worker:', error);
      throw error;
    }
  }

  /**
   * Preprocess image for better OCR accuracy
   */
  async preprocessImage(imagePath) {
    try {
      const outputPath = path.join(path.dirname(imagePath), `processed_${Date.now()}_${path.basename(imagePath)}`);
      
      await sharp(imagePath)
        .greyscale() // Convert to grayscale
        .normalize() // Enhance contrast
        .sharpen({ sigma: 1 }) // Sharpen edges
        .threshold(128) // Apply threshold for better text recognition
        .toFile(outputPath);

      return outputPath;
    } catch (error) {
      console.error('Error preprocessing image:', error);
      return imagePath; // Return original if preprocessing fails
    }
  }

  /**
   * Extract text from image using OCR
   */
  async extractTextFromImage(imagePath, options = {}) {
    try {
      if (!this.worker) {
        await this.initializeWorker();
      }

      // Preprocess image for better accuracy
      const processedImagePath = await this.preprocessImage(imagePath);
      
      const { data: { text } } = await this.worker.recognize(processedImagePath, {
        ...options
      });

      // Clean up processed image
      if (processedImagePath !== imagePath) {
        await fs.unlink(processedImagePath).catch(() => {});
      }

      return text.trim();
    } catch (error) {
      console.error('Error extracting text from image:', error);
      throw new Error(`OCR extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from image buffer
   */
  async extractTextFromBuffer(imageBuffer, options = {}) {
    try {
      if (!this.worker) {
        await this.initializeWorker();
      }

      const { data: { text } } = await this.worker.recognize(imageBuffer, {
        ...options
      });

      return text.trim();
    } catch (error) {
      console.error('Error extracting text from buffer:', error);
      throw new Error(`OCR extraction failed: ${error.message}`);
    }
  }

  /**
   * Cleanup worker
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

// Singleton instance
let ocrServiceInstance = null;

function getOCRService() {
  if (!ocrServiceInstance) {
    ocrServiceInstance = new OCRService();
  }
  return ocrServiceInstance;
}

module.exports = getOCRService;

