const fs = require('fs').promises;
const path = require('path');

/**
 * Utility functions for file operations
 */
class FileUtils {
  /**
   * Clean up file asynchronously
   */
  static async cleanupFile(filePath) {
    try {
      if (filePath && await this.fileExists(filePath)) {
        await fs.unlink(filePath);
      }
    } catch (error) {
      // Silently fail cleanup - log but don't throw
      console.warn(`Failed to cleanup file ${filePath}:`, error.message);
    }
  }

  /**
   * Check if file exists
   */
  static async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file extension
   */
  static getFileExtension(filename) {
    return path.extname(filename).toLowerCase();
  }

  /**
   * Validate file type
   */
  static isValidFileType(mimetype, allowedTypes) {
    return allowedTypes.includes(mimetype);
  }

  /**
   * Clean up directory
   */
  static async cleanupDirectory(dirPath, maxAge = 3600000) {
    // Clean up files older than maxAge (default 1 hour)
    try {
      const files = await fs.readdir(dirPath);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await this.cleanupFile(filePath);
        }
      }
    } catch (error) {
      console.warn(`Failed to cleanup directory ${dirPath}:`, error.message);
    }
  }
}

module.exports = FileUtils;

