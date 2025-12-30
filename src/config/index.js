/**
 * Application configuration
 */
module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  uploads: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    directory: 'uploads'
  },
  ocr: {
    language: 'eng',
    pageSegMode: '6' // Assume uniform block of text
  }
};

