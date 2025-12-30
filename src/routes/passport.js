const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const getOCRService = require('../services/ocrService');
const pdfService = require('../services/pdfService');
const dataExtractor = require('../services/dataExtractor');
const FileUtils = require('../utils/fileUtils');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'passport-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'));
    }
  }
});

/**
 * @swagger
 * /api/extract/passport:
 *   post:
 *     summary: Extract data from Passport document
 *     tags: [Passport]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Passport image (JPG/PNG) or PDF file
 *     responses:
 *       200:
 *         description: Successfully extracted Passport data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     passportNumber:
 *                       type: string
 *                     surname:
 *                       type: string
 *                     givenNames:
 *                       type: string
 *                     nationality:
 *                       type: string
 *                     dateOfBirth:
 *                       type: string
 *                     placeOfBirth:
 *                       type: string
 *                     gender:
 *                       type: string
 *                     dateOfIssue:
 *                       type: string
 *                     dateOfExpiry:
 *                       type: string
 *                     issuingAuthority:
 *                       type: string
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/passport', upload.single('file'), async (req, res, next) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    filePath = req.file.path;
    const fileMimeType = req.file.mimetype;
    let extractedText = '';

    // Process based on file type
    if (fileMimeType === 'application/pdf') {
      // Extract text from PDF
      extractedText = await pdfService.extractTextFromPDF(filePath);
    } else {
      // Extract text from image using OCR
      const ocrService = getOCRService();
      extractedText = await ocrService.extractTextFromImage(filePath);
    }

    // Extract structured data from text
    const extractedData = dataExtractor.extractPassportData(extractedText);
    const cleanedData = dataExtractor.cleanData(extractedData);

    // Clean up uploaded file
    await FileUtils.cleanupFile(filePath);

    res.json({
      success: true,
      data: cleanedData,
      message: 'Passport data extracted successfully'
    });

  } catch (error) {
    // Clean up file on error
    await FileUtils.cleanupFile(filePath);

    // Provide more specific error messages
    const errorMessage = error.message || 'Failed to extract Passport data';
    const statusCode = error.statusCode || 500;

    res.status(statusCode).json({
      success: false,
      message: errorMessage
    });
  }
});

module.exports = router;

