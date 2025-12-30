const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const getOCRService = require("../services/ocrService");
const pdfService = require("../services/pdfService");
const dataExtractor = require("../services/dataExtractor");
const FileUtils = require("../utils/fileUtils");

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../../uploads");
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "cnic-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, and PDF files are allowed."
        )
      );
    }
  },
});

/**
 * @swagger
 * /api/extract/cnic:
 *   post:
 *     summary: Extract data from CNIC document
 *     tags: [CNIC]
 *     parameters:
 *       - in: query
 *         name: debug
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Include raw extracted text in response for debugging
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
 *                 description: CNIC image (JPG/PNG) or PDF file
 *     responses:
 *       200:
 *         description: Successfully extracted CNIC data
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
 *                     name:
 *                       type: string
 *                       nullable: true
 *                       description: Full name of the CNIC holder (always included, null if not extracted)
 *                     fatherName:
 *                       type: string
 *                       nullable: true
 *                       description: Father's/Husband's name (S/O, D/O, or W/O) (always included, null if not extracted)
 *                     country:
 *                       type: string
 *                       description: Country name
 *                     cnicNumber:
 *                       type: string
 *                       description: CNIC number in format XXXXX-XXXXXXX-X
 *                     dateOfBirth:
 *                       type: string
 *                       description: Date of birth
 *                     dateOfIssue:
 *                       type: string
 *                       description: Date of issue
 *                     dateOfExpiry:
 *                       type: string
 *                       description: Date of expiry
 *                     gender:
 *                       type: string
 *                       description: Gender (MALE/FEMALE)
 *                     address:
 *                       type: string
 *                       description: Address
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post("/cnic", upload.single("file"), async (req, res, next) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    filePath = req.file.path;
    const fileMimeType = req.file.mimetype;
    let extractedText = "";

    // Process based on file type
    if (fileMimeType === "application/pdf") {
      // Extract text from PDF
      extractedText = await pdfService.extractTextFromPDF(filePath);
    } else {
      // Extract text from image using OCR
      const ocrService = getOCRService();
      extractedText = await ocrService.extractTextFromImage(filePath);
    }

    // Extract structured data from text
    const extractedData = dataExtractor.extractCNICData(extractedText);
    const cleanedData = dataExtractor.cleanData(extractedData);

    // Clean up uploaded file
    await FileUtils.cleanupFile(filePath);

    // Always include raw text and lines for debugging if key fields are missing
    const includeRawText =
      req.query.debug === "true" ||
      (!cleanedData.name && !cleanedData.fatherName);

    const response = {
      success: true,
      data: cleanedData,
      message: "CNIC data extracted successfully",
    };

    // Add raw extracted text and lines for debugging if needed
    if (includeRawText) {
      const lines = extractedText
        .split(/\n|\r\n?/)
        .map((line, idx) => `${idx}: "${line.trim()}"`);
      response.debug = {
        rawText: extractedText,
        lines: lines.slice(0, 20), // First 20 lines
        note: "Raw text and lines included for debugging. Add ?debug=true to always include.",
      };
    }

    res.json(response);
  } catch (error) {
    // Clean up file on error
    await FileUtils.cleanupFile(filePath);

    // Provide more specific error messages
    const errorMessage = error.message || "Failed to extract CNIC data";
    const statusCode = error.statusCode || 500;

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
    });
  }
});

module.exports = router;
