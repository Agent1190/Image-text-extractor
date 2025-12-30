class DataExtractor {
  /**
   * Extract CNIC data from text
   */
  extractCNICData(text) {
    const data = {
      name: null,
      fatherName: null,
      country: null,
      cnicNumber: null,
      dateOfBirth: null,
      dateOfIssue: null,
      dateOfExpiry: null,
      gender: null,
      address: null,
      rawText: text,
    };

    // Normalize text - remove extra spaces and newlines
    const normalizedText = text.replace(/\s+/g, " ").trim();

    // Extract CNIC number (format: XXXXX-XXXXXXX-X)
    const cnicPattern = /(\d{5}[-]?\s?\d{7}[-]?\s?\d{1})/;
    const cnicMatch = normalizedText.match(cnicPattern);
    if (cnicMatch) {
      // Format CNIC number properly
      let cnic = cnicMatch[1].replace(/\s/g, "").replace(/-/g, "");
      if (cnic.length === 13) {
        data.cnicNumber = `${cnic.substring(0, 5)}-${cnic.substring(
          5,
          12
        )}-${cnic.substring(12)}`;
      } else {
        data.cnicNumber = cnicMatch[1];
      }
    }

    // Extract dates (DD.MM.YYYY or DD/MM/YYYY format)
    const datePattern = /(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/g;
    const dates = normalizedText.match(datePattern) || [];

    // Try to find dates near keywords for better accuracy
    const dobPattern =
      /(?:DOB|Date\s+of\s+Birth|Birth)[:\s]*(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/i;
    const issuePattern =
      /(?:DOI|Date\s+of\s+Issue|Issue)[:\s]*(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/i;
    const expiryPattern =
      /(?:DOE|Date\s+of\s+Expiry|Expiry|Valid\s+Until)[:\s]*(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/i;

    const dobMatch = normalizedText.match(dobPattern);
    const issueMatch = normalizedText.match(issuePattern);
    const expiryMatch = normalizedText.match(expiryPattern);

    if (dobMatch) {
      data.dateOfBirth = dobMatch[1];
    } else if (dates.length >= 1) {
      data.dateOfBirth = dates[0];
    }

    if (issueMatch) {
      data.dateOfIssue = issueMatch[1];
    } else if (dates.length >= 2) {
      data.dateOfIssue = dates[1];
    }

    if (expiryMatch) {
      data.dateOfExpiry = expiryMatch[1];
    } else if (dates.length >= 3) {
      data.dateOfExpiry = dates[2];
    }

    // Extract gender
    const genderPattern = /\b(MALE|FEMALE|M|F)\b/i;
    const genderMatch = normalizedText.match(genderPattern);
    if (genderMatch) {
      data.gender = genderMatch[1].toUpperCase();
    }

    // Extract name - find "Name" label and get value from line below it
    // Split text into lines for better extraction (keep empty lines for structure)
    const allLines = text.split(/\n|\r\n?/);
    const lines = allLines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Extended exclusion list for CNIC headers and labels
    const excludeKeywords = [
      "PAKISTAN",
      "PAK",
      "NATIONAL",
      "IDENTITY",
      "CARD",
      "ISLAMIC",
      "REPUBLIC",
      "CNIC",
      "MALE",
      "FEMALE",
      "GENDER",
      "COUNTRY",
      "DATE",
      "BIRTH",
      "ISSUE",
      "EXPIRY",
      "ADDRESS",
      "HOLDER",
      "SIGNATURE",
      "STAY",
      "OF",
      "NUMBER",
    ];

    // Find "Name" label and get the value from the line below it
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      // Very flexible matching for "Name" label
      // Check if line contains "Name" but not "Father Name" or "Husband Name"
      const hasName = lineUpper.includes("NAME");
      const hasFather = lineUpper.includes("FATHER");
      const hasHusband = lineUpper.includes("HUSBAND");
      const isNameLabel = hasName && !hasFather && !hasHusband;

      if (isNameLabel) {
        // Try to get value from same line first (Name: Value)
        const sameLineMatch = line.match(/Name[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let name = sameLineMatch[1].trim();
          name = name.replace(/\s+/g, " ");
          const nameUpper = name.toUpperCase();

          // Skip if it's clearly another label or excluded
          const containsExcluded = excludeKeywords.some(
            (keyword) =>
              nameUpper === keyword ||
              nameUpper.startsWith(keyword + " ") ||
              nameUpper.endsWith(" " + keyword)
          );
          const isAnotherLabel = nameUpper.match(
            /^(FATHER|HUSBAND|GENDER|COUNTRY|IDENTITY|CNIC|DATE|BIRTH|ISSUE|EXPIRY)/
          );

          if (
            name.length >= 2 &&
            !name.match(/^\d/) &&
            !containsExcluded &&
            !isAnotherLabel
          ) {
            data.name = name.toUpperCase();
            break;
          }
        }

        // If not found on same line, get the next line as the name value
        if (!data.name && i + 1 < lines.length) {
          let name = lines[i + 1].trim();
          name = name.replace(/\s+/g, " ");
          const nameUpper = name.toUpperCase();

          // Check if name contains excluded keywords (but be more lenient)
          const containsExcluded = excludeKeywords.some(
            (keyword) =>
              nameUpper === keyword ||
              (nameUpper.length < 20 && nameUpper.includes(keyword))
          );

          // Very lenient validation - just check it's not empty, not a number, and not clearly excluded
          if (
            name.length >= 2 &&
            !name.match(/^\d/) &&
            !containsExcluded &&
            !nameUpper.match(
              /^(FATHER|HUSBAND|GENDER|COUNTRY|IDENTITY|CNIC|DATE|BIRTH|ISSUE|EXPIRY|MALE|FEMALE)/
            )
          ) {
            data.name = name.toUpperCase();
            break;
          }
        }
      }
    }

    // Fallback: If name not found by label, look for name pattern after header lines
    // Typically name appears early in the document (after PAKISTAN/IDENTITY CARD lines)
    if (!data.name && lines.length > 1) {
      // Look for lines that appear after header (PAKISTAN, IDENTITY CARD, etc.)
      let headerEndIndex = -1;
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const lineUpper = lines[i].toUpperCase();
        if (
          lineUpper.includes("PAKISTAN") ||
          lineUpper.includes("IDENTITY") ||
          lineUpper.includes("CARD")
        ) {
          headerEndIndex = i;
        }
      }

      // Start searching from after header (usually line 1-3)
      const startIndex = headerEndIndex >= 0 ? headerEndIndex + 1 : 1;
      for (
        let i = startIndex;
        i < Math.min(lines.length, startIndex + 5);
        i++
      ) {
        const line = lines[i].trim();
        const lineUpper = line.toUpperCase();

        // Skip if it's clearly a label or excluded
        const containsExcluded = excludeKeywords.some(
          (keyword) => lineUpper.includes(keyword) && lineUpper.length < 30
        );
        const isLabel = lineUpper.match(
          /^(FATHER|HUSBAND|GENDER|COUNTRY|IDENTITY|CNIC|DATE|BIRTH|ISSUE|EXPIRY|MALE|FEMALE)/
        );
        const hasNumbers = line.match(/\d{5}/); // Skip lines with CNIC numbers

        // Check if line looks like a name (2-4 words, mostly letters, not too short)
        const wordCount = line.split(/\s+/).length;
        const isNameLike =
          wordCount >= 1 &&
          wordCount <= 4 &&
          line.length >= 3 &&
          line.length <= 30 &&
          !line.match(/^\d/) &&
          !containsExcluded &&
          !isLabel &&
          !hasNumbers;

        if (isNameLike) {
          // Clean up OCR errors (common: 'fnam' -> 'Inam', etc.)
          let cleanedName = line.replace(/\s+/g, " ").trim();
          data.name = cleanedName.toUpperCase();
          break;
        }
      }
    }

    // Extract father's/husband's name - find "Father Name" or "Father/Husband Name" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      // Very flexible matching for "Father Name" label
      const hasFather = lineUpper.includes("FATHER");
      const hasHusband = lineUpper.includes("HUSBAND");
      const hasName = lineUpper.includes("NAME");
      const isFatherNameLabel =
        (hasFather && hasName) ||
        (hasHusband && hasName) ||
        lineUpper.includes("S/O") ||
        lineUpper.includes("D/O") ||
        lineUpper.includes("W/O");

      if (isFatherNameLabel) {
        // Try to get value from same line first (Father Name: Value)
        const sameLineMatch = line.match(
          /(?:Father\s+Name|Father|Husband\s+Name|Husband|S\/O|D\/O|W\/O)[:\s]+(.+)$/i
        );
        if (sameLineMatch && sameLineMatch[1]) {
          let fatherName = sameLineMatch[1].trim();
          fatherName = fatherName.replace(/\s+/g, " ");
          const fatherNameUpper = fatherName.toUpperCase();

          // Skip if it's clearly another label or excluded
          const containsExcluded = excludeKeywords.some(
            (keyword) =>
              fatherNameUpper === keyword ||
              fatherNameUpper.startsWith(keyword + " ") ||
              fatherNameUpper.endsWith(" " + keyword)
          );
          const isAnotherLabel = fatherNameUpper.match(
            /^(GENDER|COUNTRY|IDENTITY|CNIC|DATE|BIRTH|ISSUE|EXPIRY|NAME)/
          );

          if (
            fatherName.length >= 2 &&
            !fatherName.match(/^\d/) &&
            !containsExcluded &&
            !isAnotherLabel
          ) {
            // Make sure it's not the same as the name
            if (
              !data.name ||
              fatherName.toUpperCase() !== data.name.toUpperCase()
            ) {
              data.fatherName = fatherName.toUpperCase();
              break;
            }
          }
        }

        // If not found on same line, get the next line as the father/husband name value
        if (!data.fatherName && i + 1 < lines.length) {
          let fatherName = lines[i + 1].trim();
          fatherName = fatherName.replace(/\s+/g, " ");
          const fatherNameUpper = fatherName.toUpperCase();

          // Check if father name contains excluded keywords (but be more lenient)
          const containsExcluded = excludeKeywords.some(
            (keyword) =>
              fatherNameUpper === keyword ||
              (fatherNameUpper.length < 20 && fatherNameUpper.includes(keyword))
          );

          // Very lenient validation
          if (
            fatherName.length >= 2 &&
            !fatherName.match(/^\d/) &&
            !containsExcluded &&
            !fatherNameUpper.match(
              /^(GENDER|COUNTRY|IDENTITY|CNIC|DATE|BIRTH|ISSUE|EXPIRY|MALE|FEMALE|NAME)/
            )
          ) {
            // Make sure it's not the same as the name
            if (
              !data.name ||
              fatherName.toUpperCase() !== data.name.toUpperCase()
            ) {
              data.fatherName = fatherName.toUpperCase();
              break;
            }
          }
        }
      }
    }

    // Fallback: If father name not found by label, look for it after the name line
    if (!data.fatherName && data.name && lines.length > 2) {
      // Find the line index where name appears
      let nameLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const lineUpper = lines[i].toUpperCase();
        const nameUpper = data.name.toUpperCase();
        // Check if this line contains the name (handle OCR errors)
        if (
          lineUpper.includes(nameUpper) ||
          nameUpper.includes(lineUpper) ||
          (nameUpper.length > 5 &&
            lineUpper
              .substring(0, nameUpper.length)
              .includes(nameUpper.substring(0, 5)))
        ) {
          nameLineIndex = i;
          break;
        }
      }

      // Start searching from 2-4 lines after the name (skip immediate next lines which might be garbage)
      const startIndex = nameLineIndex >= 0 ? nameLineIndex + 2 : 3;
      for (
        let i = startIndex;
        i < Math.min(lines.length, startIndex + 6);
        i++
      ) {
        const line = lines[i].trim();
        const lineUpper = line.toUpperCase();

        // Skip very short lines (less than 6 chars) or lines with only special characters
        if (line.length < 6) continue;
        if (line.match(/^[^A-Za-z]*$/)) continue; // Only special chars, no letters

        // Skip if it's clearly a label or excluded
        const containsExcluded = excludeKeywords.some(
          (keyword) => lineUpper.includes(keyword) && lineUpper.length < 30
        );
        const isLabel = lineUpper.match(
          /^(GENDER|COUNTRY|IDENTITY|CNIC|DATE|BIRTH|ISSUE|EXPIRY|MALE|FEMALE|NAME)/
        );
        const hasNumbers = line.match(/\d{5}/); // Skip lines with CNIC numbers

        // Check if line has enough letters (at least 60% should be letters for a name)
        const letterCount = (line.match(/[A-Za-z]/g) || []).length;
        const hasEnoughLetters = letterCount >= line.length * 0.6; // At least 60% letters

        // Skip lines with suspicious patterns (like "TTT", "XXX", repeated characters)
        const hasSuspiciousPattern = line.match(/(.)\1{2,}/); // 3+ repeated characters
        const hasAllCapsShortWords = line.match(/\b[A-Z]{1,2}\b/); // Very short all-caps words

        // Check if words look like proper names (at least one word with 3+ letters)
        const words = line.split(/\s+/).filter((w) => w.length > 0);
        const hasProperNameWord = words.some((word) => {
          const cleanWord = word.replace(/[^A-Za-z]/g, "");
          return cleanWord.length >= 3;
        });

        // Check if line looks like a father/husband name (2-4 words, mostly letters, reasonable length)
        const wordCount = words.length;
        const isFatherNameLike =
          wordCount >= 1 &&
          wordCount <= 4 &&
          line.length >= 8 && // Increased minimum length to 8
          line.length <= 35 &&
          !line.match(/^\d/) &&
          !containsExcluded &&
          !isLabel &&
          !hasNumbers &&
          hasEnoughLetters &&
          !line.match(/^[—\-_|]+/) && // Doesn't start with special chars only
          !line.match(/^[^A-Za-z]{2,}/) && // Doesn't start with 2+ non-letters
          !hasSuspiciousPattern && // No repeated character patterns
          hasProperNameWord; // Has at least one proper name-like word

        if (isFatherNameLike) {
          // Make sure it's not the same as the name
          if (line.toUpperCase() !== data.name.toUpperCase()) {
            // Clean up OCR errors
            let cleanedFatherName = line.replace(/\s+/g, " ").trim();
            // Remove trailing special characters like "|", "—", "-"
            cleanedFatherName = cleanedFatherName
              .replace(/[|\-—_\s]+$/, "")
              .trim();
            // Remove leading special characters
            cleanedFatherName = cleanedFatherName
              .replace(/^[|\-—_\s]+/, "")
              .trim();

            // Final validation - must have at least 8 characters after cleaning and look like a name
            if (
              cleanedFatherName.length >= 8 &&
              cleanedFatherName.match(/[A-Za-z]{3,}/)
            ) {
              data.fatherName = cleanedFatherName.toUpperCase();
              break;
            }
          }
        }
      }
    }

    // Extract country name - more comprehensive patterns
    const countryKeywords = [
      "PAKISTAN",
      "PAK",
      "USA",
      "UNITED STATES",
      "UNITED STATES OF AMERICA",
      "UK",
      "UNITED KINGDOM",
      "CANADA",
      "AUSTRALIA",
      "INDIA",
      "CHINA",
      "GERMANY",
      "FRANCE",
      "ITALY",
      "SPAIN",
      "SAUDI ARABIA",
      "UAE",
      "UNITED ARAB EMIRATES",
      "BANGLADESH",
      "SRI LANKA",
      "AFGHANISTAN",
      "IRAN",
      "TURKEY",
      "EGYPT",
      "JAPAN",
      "SOUTH KOREA",
      "THAILAND",
      "MALAYSIA",
      "INDONESIA",
      "SINGAPORE",
      "PHILIPPINES",
      "VIETNAM",
    ];

    // First, try to find country with keywords
    for (const keyword of countryKeywords) {
      const pattern = new RegExp(
        `\\b${keyword.replace(/\s+/g, "\\s+")}\\b`,
        "i"
      );
      if (pattern.test(text)) {
        // Normalize country names
        if (keyword === "PAK") {
          data.country = "PAKISTAN";
        } else if (keyword === "USA" || keyword === "US") {
          data.country = "UNITED STATES";
        } else if (keyword === "UK") {
          data.country = "UNITED KINGDOM";
        } else if (keyword === "UAE") {
          data.country = "UNITED ARAB EMIRATES";
        } else {
          data.country = keyword;
        }
        break;
      }
    }

    // If not found, try pattern-based extraction
    if (!data.country) {
      const countryPatterns = [
        // Pattern 1: "Country:", "Nationality:" followed by country name
        /(?:Country|Nationality|Country\s+of\s+Birth|Country\s+Name|Nationality\s+Code)[:\s]+([A-Z\s]{2,}?)(?:\s+\d|$)/im,
        // Pattern 2: "Issued in" or "Issued by" followed by country
        /(?:Issued\s+in|Issued\s+by|Place\s+of\s+Issue)[:\s]+([A-Z\s]{2,}?)(?:\s+\d|$)/i,
      ];

      for (const pattern of countryPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          let country = match[1].trim().toUpperCase();
          // Check if extracted country matches any known country
          const matchedCountry = countryKeywords.find(
            (keyword) =>
              country.includes(keyword) ||
              keyword.includes(country) ||
              country
                .replace(/\s+/g, " ")
                .includes(keyword.replace(/\s+/g, " "))
          );

          if (matchedCountry) {
            // Normalize
            if (matchedCountry === "PAK") {
              data.country = "PAKISTAN";
            } else if (matchedCountry === "USA" || matchedCountry === "US") {
              data.country = "UNITED STATES";
            } else if (matchedCountry === "UK") {
              data.country = "UNITED KINGDOM";
            } else if (matchedCountry === "UAE") {
              data.country = "UNITED ARAB EMIRATES";
            } else {
              data.country = matchedCountry;
            }
            break;
          } else if (country.length >= 3 && !country.match(/^\d/)) {
            data.country = country;
            break;
          }
        }
      }
    }

    // Last resort: check if PAKISTAN or PAK appears anywhere (very common on Pakistani CNICs)
    if (!data.country) {
      if (text.match(/\bPAKISTAN\b/i)) {
        data.country = "PAKISTAN";
      } else if (text.match(/\bPAK\b/i) && !text.match(/PAKISTAN/i)) {
        data.country = "PAKISTAN";
      }
    }

    // Extract address (usually longer text after main fields)
    const addressPattern = /(?:Address|Residence)[:\s]+(.+?)(?:\s+\d{5}|$)/i;
    const addressMatch = normalizedText.match(addressPattern);
    if (addressMatch && addressMatch[1]) {
      data.address = addressMatch[1].trim();
    }

    return data;
  }

  /**
   * Extract Passport data from text
   */
  extractPassportData(text) {
    const data = {
      passportNumber: null,
      surname: null,
      givenNames: null,
      nationality: null,
      dateOfBirth: null,
      placeOfBirth: null,
      gender: null,
      dateOfIssue: null,
      dateOfExpiry: null,
      issuingAuthority: null,
      rawText: text,
    };

    // Normalize text
    const normalizedText = text.replace(/\s+/g, " ").trim();

    // Extract passport number (usually alphanumeric, 6-9 characters)
    const passportPattern =
      /(?:Passport|P\s*No|Passport\s*No)[:\s]*([A-Z0-9]{6,9})/i;
    const passportMatch = normalizedText.match(passportPattern);
    if (passportMatch) {
      data.passportNumber = passportMatch[1].toUpperCase();
    }

    // Extract dates (DD.MM.YYYY or DD/MM/YYYY format)
    const datePattern = /(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/g;
    const dates = normalizedText.match(datePattern) || [];

    // Try to find dates near keywords for better accuracy
    const dobPattern =
      /(?:DOB|Date\s+of\s+Birth|Birth)[:\s]*(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/i;
    const issuePattern =
      /(?:DOI|Date\s+of\s+Issue|Issue)[:\s]*(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/i;
    const expiryPattern =
      /(?:DOE|Date\s+of\s+Expiry|Expiry|Valid\s+Until)[:\s]*(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/i;

    const dobMatch = normalizedText.match(dobPattern);
    const issueMatch = normalizedText.match(issuePattern);
    const expiryMatch = normalizedText.match(expiryPattern);

    if (dobMatch) {
      data.dateOfBirth = dobMatch[1];
    } else if (dates.length >= 1) {
      data.dateOfBirth = dates[0];
    }

    if (issueMatch) {
      data.dateOfIssue = issueMatch[1];
    } else if (dates.length >= 2) {
      data.dateOfIssue = dates[1];
    }

    if (expiryMatch) {
      data.dateOfExpiry = expiryMatch[1];
    } else if (dates.length >= 3) {
      data.dateOfExpiry = dates[2];
    }

    // Extract gender
    const genderPattern = /\b(MALE|FEMALE|M|F)\b/i;
    const genderMatch = normalizedText.match(genderPattern);
    if (genderMatch) {
      data.gender = genderMatch[1].toUpperCase();
    }

    // Extract nationality
    const nationalityPattern = /(?:Nationality|Country)[:\s]+([A-Z\s]{2,})/i;
    const nationalityMatch = normalizedText.match(nationalityPattern);
    if (nationalityMatch) {
      data.nationality = nationalityMatch[1].trim();
    }

    // Extract surname (usually appears first in name field)
    const surnamePatterns = [
      /(?:Surname|Last\s+Name)[:\s]+([A-Z\s]+?)(?:\s+Given|$)/i,
      /^([A-Z]{2,})\s+(?=[A-Z])/,
    ];

    for (const pattern of surnamePatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        data.surname = match[1].trim();
        break;
      }
    }

    // Extract given names
    const givenNamesPatterns = [
      /(?:Given\s+Names?|First\s+Name)[:\s]+([A-Z\s]+?)(?:\s+Nationality|$)/i,
      /(?:Surname[:\s]+[A-Z\s]+)[:\s]+([A-Z\s]{3,})/,
    ];

    for (const pattern of givenNamesPatterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        data.givenNames = match[1].trim();
        break;
      }
    }

    // Extract place of birth
    const placeOfBirthPattern =
      /(?:Place\s+of\s+Birth|Born\s+in)[:\s]+([A-Z\s,]+?)(?:\s+\d|$)/i;
    const placeOfBirthMatch = normalizedText.match(placeOfBirthPattern);
    if (placeOfBirthMatch) {
      data.placeOfBirth = placeOfBirthMatch[1].trim();
    }

    // Extract issuing authority
    const authorityPattern =
      /(?:Issuing\s+Authority|Authority)[:\s]+([A-Z\s]+?)(?:\s+\d|$)/i;
    const authorityMatch = normalizedText.match(authorityPattern);
    if (authorityMatch) {
      data.issuingAuthority = authorityMatch[1].trim();
    }

    return data;
  }

  /**
   * Clean and validate extracted data
   */
  cleanData(data) {
    const cleaned = { ...data };

    // Always keep these important fields even if null
    const requiredFields = ["name", "fatherName", "country", "cnicNumber"];

    // Remove null values for cleaner output, but keep required fields
    Object.keys(cleaned).forEach((key) => {
      if (cleaned[key] === null || cleaned[key] === "") {
        // Keep required fields even if null/empty
        if (!requiredFields.includes(key)) {
          delete cleaned[key];
        }
      }
    });

    // Ensure required fields are always present (set to null if missing)
    requiredFields.forEach((field) => {
      if (!(field in cleaned)) {
        cleaned[field] = null;
      }
    });

    return cleaned;
  }
}

module.exports = new DataExtractor();
