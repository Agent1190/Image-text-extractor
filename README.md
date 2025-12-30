# CNIC & Passport Reader API

A Node.js service that extracts data from CNIC (Computerized National Identity Card) and Passport images and PDFs using OCR technology.

## Features

- ✅ Extract data from CNIC images (JPG, PNG)
- ✅ Extract data from Passport images (JPG, PNG)
- ✅ Extract data from CNIC/Passport PDFs
- ✅ RESTful API with Swagger documentation
- ✅ Optimized image processing with Sharp
- ✅ Accurate text extraction using Tesseract.js
- ✅ Automatic file cleanup
- ✅ Comprehensive error handling
- ✅ Support for both text-based and image-based PDFs

## Installation

```bash
npm install
```

## Usage

Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:3000/api-docs

The Swagger UI provides an interactive interface to test all endpoints directly from your browser.

## API Endpoints

### Health Check
```
GET /api/health
```

### Extract CNIC Data
```
POST /api/extract/cnic
Content-Type: multipart/form-data

Body:
  file: (image or PDF file)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "JOHN DOE",
    "fatherName": "FATHER NAME",
    "cnicNumber": "12345-1234567-1",
    "dateOfBirth": "01.01.1990",
    "dateOfIssue": "01.01.2010",
    "dateOfExpiry": "01.01.2025",
    "gender": "MALE",
    "address": "123 Street, City"
  },
  "message": "CNIC data extracted successfully"
}
```

### Extract Passport Data
```
POST /api/extract/passport
Content-Type: multipart/form-data

Body:
  file: (image or PDF file)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "passportNumber": "AB123456",
    "surname": "DOE",
    "givenNames": "JOHN",
    "nationality": "PAKISTAN",
    "dateOfBirth": "01.01.1990",
    "placeOfBirth": "LAHORE",
    "gender": "MALE",
    "dateOfIssue": "01.01.2020",
    "dateOfExpiry": "01.01.2030",
    "issuingAuthority": "PAKISTAN"
  },
  "message": "Passport data extracted successfully"
}
```

## Testing with Swagger

1. Start the server: `npm start`
2. Open http://localhost:3000/api-docs in your browser
3. Click on any endpoint to expand it
4. Click "Try it out"
5. Upload a file using the file picker
6. Click "Execute" to see the results

## Testing with cURL

### Extract CNIC Data
```bash
curl -X POST http://localhost:3000/api/extract/cnic \
  -F "file=@path/to/cnic.jpg"
```

### Extract Passport Data
```bash
curl -X POST http://localhost:3000/api/extract/passport \
  -F "file=@path/to/passport.jpg"
```

## Environment Variables

Create a `.env` file in the root directory:
```
PORT=3000
NODE_ENV=development
```

## Project Structure

```
├── src/
│   ├── config/          # Configuration files
│   ├── routes/          # API routes
│   │   ├── cnic.js      # CNIC extraction endpoint
│   │   ├── passport.js  # Passport extraction endpoint
│   │   └── health.js    # Health check endpoint
│   ├── services/        # Business logic
│   │   ├── ocrService.js      # OCR processing
│   │   ├── pdfService.js      # PDF parsing
│   │   └── dataExtractor.js   # Data extraction logic
│   ├── utils/           # Utility functions
│   │   └── fileUtils.js # File operations
│   └── server.js        # Express server setup
├── uploads/             # Temporary file storage (auto-created)
├── examples/            # Example test files
└── package.json
```

## Optimizations

- **Image Preprocessing**: Automatic grayscale conversion, contrast enhancement, and sharpening for better OCR accuracy
- **Worker Reuse**: OCR worker is initialized once and reused for multiple requests
- **File Cleanup**: Automatic cleanup of uploaded and processed files
- **Error Handling**: Comprehensive error handling with meaningful error messages
- **File Size Limits**: 10MB file size limit to prevent abuse
- **MIME Type Validation**: Only allows valid image and PDF file types

## Supported File Formats

- **Images**: JPEG, JPG, PNG
- **Documents**: PDF (both text-based and image-based)

## Notes

- The first request may take longer as the OCR worker initializes
- Image quality significantly affects extraction accuracy
- For best results, use high-resolution, clear images with good contrast
- PDFs with extractable text are processed faster than image-based PDFs

## License

ISC

