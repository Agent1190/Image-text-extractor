const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { createWorker } = require('tesseract.js');
const { parse } = require('mrz');
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
  let worker = null;

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
    let mrzData = null;
    let ocrConfidence = 0;

    // Process based on file type
    if (fileMimeType === 'application/pdf') {
      // Extract text from PDF
      extractedText = await pdfService.extractTextFromPDF(filePath);
      ocrConfidence = 85; // PDFs typically have better text quality
    } else {
      // Extract text from image using OCR with createWorker (as per user's implementation)
      // Note: Cannot pass logger function due to Worker cloning limitations
      worker = await createWorker();

      await worker.loadLanguage('eng');
      await worker.initialize('eng');

      // OCR the image
      const result = await worker.recognize(filePath);
      extractedText = result.data.text;

      // Calculate average confidence from words if available
      if (result.data.words && result.data.words.length > 0) {
        const confidences = result.data.words
          .map(word => word.confidence || 0)
          .filter(conf => conf > 0);
        if (confidences.length > 0) {
          ocrConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        }
      }

      await worker.terminate();
      worker = null;
    }

    // Extract MRZ lines (usually last 2 lines)
    // MRZ lines are typically 44 characters long and contain '<' characters
    const allLines = extractedText.split('\n').map(l => l.trim());
    
    // Find MRZ lines - look for lines that:
    // 1. Are long enough (>= 30 chars)
    // 2. Contain '<' characters
    // 3. Start with P<, I<, A< or have passport-like patterns
    // 4. Usually appear at the end of the document
    let mrzLines = [];
    
    // First, try to find lines at the end (MRZ is usually at bottom)
    // Look at last 15 lines to catch MRZ
    for (let i = allLines.length - 1; i >= Math.max(0, allLines.length - 15); i--) {
      let line = allLines[i];
      const originalLine = line;
      
      // Remove common OCR artifacts first
      line = line
        .replace(/\|/g, '') // Remove pipe characters
        .replace(/vo\s*/gi, '') // Remove "vo" prefix (case insensitive)
        .replace(/peor\s*/gi, '') // Remove "peor" prefix
        .replace(/\s/g, ''); // Remove all spaces
      
      // Check if line looks like MRZ (long enough or has MRZ patterns)
      // Check before cleaning to catch lines that might be shorter after cleaning
      const hasMRZPattern = line.match(/PSPAK|P<PAK|AA\d+|PAK\d{6}[MF]|CLL|LLL/) || 
                           (line.length >= 20 && (line.includes('PAK') || line.includes('<<')));
      
      if (line.length >= 20 || hasMRZPattern) { // Lower threshold to catch more lines
        // Clean up common OCR errors
        let cleanedLine = line
          .replace(/[^A-Z0-9<]/g, '') // Remove invalid characters
          .replace(/PS/g, 'P<') // Fix PS -> P< (important!)
          .replace(/^P([A-Z])/g, 'P<$1') // Fix P[A-Z] -> P<[A-Z]
          .replace(/CLL/g, '<') // Fix CLL -> < (important!)
          .replace(/LLL/g, '<') // Fix LLL -> <
          .replace(/LL/g, '<') // Fix LL -> <
          .replace(/([A-Z])K([A-Z])/g, '$1<$2') // Fix K -> < in some contexts
          .replace(/K<<</g, '<<<') // Fix K<<< -> <<<
          .replace(/K<</g, '<<') // Fix K<< -> <<
          .replace(/K</g, '<'); // Fix K< -> <
        
        // Ensure line is long enough after cleaning
        if (cleanedLine.length >= 20) {
          // Line 1 should start with P<, I<, or A< or have country code pattern
          if (mrzLines.length === 0) {
            // More flexible matching for line 1 - check for PAK country code or P/I/A pattern
            const isLine1 = cleanedLine.startsWith('P<') || 
                           cleanedLine.startsWith('I<') || 
                           cleanedLine.startsWith('A<') ||
                           cleanedLine.match(/^P[A-Z]{3}/) || // P followed by country code (e.g., PPAK)
                           cleanedLine.match(/^I[A-Z]{3}/) || // I followed by country code
                           cleanedLine.match(/^A[A-Z]{3}/) || // A followed by country code
                           (cleanedLine.includes('PAK') && cleanedLine.includes('<')) || // Has PAK and <
                           (cleanedLine.includes('<') && cleanedLine.match(/[A-Z]{3}[A-Z]+/)); // Has country code + name
            
            if (isLine1) {
              // Fix if it doesn't have < after first letter
              if (!cleanedLine.startsWith('P<') && !cleanedLine.startsWith('I<') && !cleanedLine.startsWith('A<')) {
                cleanedLine = cleanedLine.replace(/^([PIA])([A-Z])/, '$1<$2');
              }
              mrzLines.push(cleanedLine);
              console.log('✅ Found MRZ line 1:', originalLine.substring(0, 50), '->', cleanedLine.substring(0, 50));
            }
          }
          // Line 2 should be alphanumeric with passport number pattern
          else if (mrzLines.length === 1) {
            // More flexible matching for line 2 - look for passport number + PAK + dates
            const isLine2 = (cleanedLine.match(/^[A-Z0-9]{9,}/) && // Starts with alphanumeric (passport number)
                            (cleanedLine.includes('<') || cleanedLine.match(/\d{6}[MF]\d{6}/) || cleanedLine.includes('PAK'))) || // Has dates pattern, <, or PAK
                           (cleanedLine.length >= 25 && cleanedLine.match(/^[A-Z]{2}\d{7,}/)); // Starts with 2 letters + 7+ digits (passport number)
            
            if (isLine2) {
              mrzLines.push(cleanedLine);
              console.log('✅ Found MRZ line 2:', originalLine.substring(0, 50), '->', cleanedLine.substring(0, 50));
            } else if (cleanedLine.length >= 25 && cleanedLine.match(/^[A-Z0-9]/) && 
                      !cleanedLine.startsWith('P<') && !cleanedLine.startsWith('I<') && !cleanedLine.startsWith('A<') &&
                      !cleanedLine.match(/^[PIA][A-Z]{3}/)) {
              // Fallback: if it's long, starts with alphanumeric, and not line 1 pattern, it's likely line 2
              mrzLines.push(cleanedLine);
              console.log('✅ Found MRZ line 2 (fallback):', originalLine.substring(0, 50), '->', cleanedLine.substring(0, 50));
            }
          }
        }
        
        if (mrzLines.length >= 2) break;
      }
    }
    
    console.log('Total MRZ lines found:', mrzLines.length, mrzLines.length >= 2 ? '✅' : '❌');
    
    // If we found MRZ lines, clean and pad them to 44 characters (standard MRZ length)
    if (mrzLines.length >= 2) {
      try {
        // Clean and pad MRZ lines to standard length
        let line1 = mrzLines[0].padEnd(44, '<').substring(0, 44);
        let line2 = mrzLines[1].padEnd(44, '<').substring(0, 44);
        
        // Ensure line 1 starts correctly
        if (!line1.startsWith('P<') && !line1.startsWith('I<') && !line1.startsWith('A<')) {
          if (line1.startsWith('P')) {
            line1 = 'P<' + line1.substring(1);
          } else if (line1.startsWith('I')) {
            line1 = 'I<' + line1.substring(1);
          } else if (line1.startsWith('A')) {
            line1 = 'A<' + line1.substring(1);
          }
        }
        
        const mrzText = line1 + '\n' + line2;
        console.log('✅ Extracted MRZ lines:', mrzText);
        
        // Parse MRZ
        const mrzResult = parse(mrzText);
        console.log('MRZ parse result:', mrzResult.valid ? 'VALID' : 'INVALID', mrzResult);

        if (mrzResult.valid) {
          // Format dates from MRZ (usually YYYY-MM-DD) to our format (DD MMM YYYY)
          const formatDate = (dateStr) => {
            if (!dateStr) return null;
            try {
              // Handle different date formats
              if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // YYYY-MM-DD format
                const [year, month, day] = dateStr.split('-');
                const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                                'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                return `${day} ${months[parseInt(month) - 1]} ${year}`;
              } else if (dateStr.match(/^\d{2}\s+\w{3}\s+\d{4}$/)) {
                // Already in DD MMM YYYY format
                return dateStr;
              }
              return dateStr; // Return as-is if format is unknown
            } catch (e) {
              return dateStr;
            }
          };

          // Extract citizenship number from MRZ optional data (Pakistani passports)
          let citizenshipNumber = null;
          if (mrzResult.fields.optionalData) {
            const optionalData = mrzResult.fields.optionalData.replace(/\s/g, '');
            // Pakistani CNIC format: XXXXX-XXXXXXX-X (13 digits)
            const cnicMatch = optionalData.match(/(\d{5}[-]?\d{7}[-]?\d{1})/);
            if (cnicMatch) {
              let cnic = cnicMatch[1].replace(/-/g, '');
              if (cnic.length === 13) {
                citizenshipNumber = `${cnic.substring(0, 5)}-${cnic.substring(5, 12)}-${cnic.substring(12)}`;
              }
            } else if (optionalData.match(/^\d{13}$/)) {
              // If optional data is exactly 13 digits, it's likely a CNIC
              const cnic = optionalData;
              citizenshipNumber = `${cnic.substring(0, 5)}-${cnic.substring(5, 12)}-${cnic.substring(12)}`;
            }
          }

          // Format MRZ data to match our structure
          mrzData = {
            passportNumber: mrzResult.fields.documentNumber || null,
            surname: mrzResult.fields.lastName || null,
            givenNames: mrzResult.fields.firstName || null,
            nationality: mrzResult.fields.nationality || null,
            dateOfBirth: formatDate(mrzResult.fields.birthDate),
            gender: mrzResult.fields.sex ? (mrzResult.fields.sex === 'M' ? 'MALE' : 'FEMALE') : null,
            dateOfExpiry: formatDate(mrzResult.fields.expirationDate),
            issuingAuthority: mrzResult.fields.issuingCountry || null,
            citizenshipNumber: citizenshipNumber,
          };

          console.log('✅ MRZ data extracted successfully');
        }
      } catch (mrzError) {
        console.warn('MRZ parsing failed, falling back to OCR extraction:', mrzError.message);
        // Continue with OCR extraction as fallback
      }
    }

    // Extract additional data from OCR text (for fields not in MRZ like place of birth, date of issue, father name)
    const extractedData = dataExtractor.extractPassportData(extractedText, mrzData);
    const cleanedData = dataExtractor.cleanData(extractedData);

    // Calculate extraction accuracy
    const fieldsToCheck = ['passportNumber', 'surname', 'givenNames', 'nationality', 'dateOfBirth', 
                          'placeOfBirth', 'gender', 'dateOfIssue', 'dateOfExpiry', 'issuingAuthority', 
                          'husbandName', 'citizenshipNumber'];
    const totalFields = fieldsToCheck.length;
    const extractedFields = fieldsToCheck.filter(field => 
      cleanedData[field] !== null && 
      cleanedData[field] !== '' && 
      cleanedData[field] !== undefined
    ).length;
    const extractionAccuracy = totalFields > 0 ? Math.round((extractedFields / totalFields) * 100) : 0;
    
    // Overall confidence - MRZ data increases confidence significantly
    const mrzBonus = mrzData ? 20 : 0;
    const overallConfidence = Math.min(100, Math.round((ocrConfidence * 0.5) + (extractionAccuracy * 0.3) + mrzBonus));

    // Clean up uploaded file
    await FileUtils.cleanupFile(filePath);

    // Always include raw text and lines for debugging if key fields are missing
    const includeRawText =
      req.query.debug === "true" ||
      (!cleanedData.surname && !cleanedData.givenNames && !cleanedData.passportNumber);

    const response = {
      success: true,
      data: cleanedData,
      message: "Passport data extracted successfully",
      confidence: {
        ocrConfidence: Math.round(ocrConfidence),
        extractionAccuracy: extractionAccuracy,
        overallConfidence: overallConfidence,
        mrzUsed: mrzData !== null
      }
    };

    // Add raw extracted text and lines for debugging if needed
    if (includeRawText) {
      const textLines = extractedText.split(/\n|\r\n?/).map((line, idx) => `${idx}: "${line.trim()}"`);
      response.debug = {
        rawText: extractedText,
        lines: textLines.slice(0, 30), // First 30 lines
        note: "Raw text and lines included for debugging. Add ?debug=true to always include.",
        mrzLines: mrzData ? "MRZ data was successfully extracted and parsed" : "No MRZ data found"
      };
    }

    res.json(response);

  } catch (error) {
    // Clean up worker if still active
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {
        // Ignore termination errors
      }
    }

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

