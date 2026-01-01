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
  extractPassportData(text, mrzData = null) {
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
      husbandName: null,
      fatherName: null,
      citizenshipNumber: null,
      trackingNumber: null,
      rawText: text,
    };

    // If MRZ data is available, use it as primary source (most accurate)
    if (mrzData) {
      if (mrzData.passportNumber) data.passportNumber = mrzData.passportNumber;
      if (mrzData.surname) data.surname = mrzData.surname;
      if (mrzData.givenNames) data.givenNames = mrzData.givenNames;
      if (mrzData.nationality) data.nationality = mrzData.nationality;
      if (mrzData.dateOfBirth) data.dateOfBirth = mrzData.dateOfBirth;
      if (mrzData.gender) data.gender = mrzData.gender;
      if (mrzData.dateOfExpiry) data.dateOfExpiry = mrzData.dateOfExpiry;
      if (mrzData.citizenshipNumber)
        data.citizenshipNumber = mrzData.citizenshipNumber;
    }

    // Normalize text - remove extra spaces and newlines
    const normalizedText = text.replace(/\s+/g, " ").trim();

    // Split text into lines for better extraction (keep empty lines for structure)
    const allLines = text.split(/\n|\r\n?/);
    const lines = allLines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Extract Passport Number - find "Passport Number" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (lineUpper.includes("PASSPORT") && lineUpper.includes("NUMBER")) {
        // Try to get value from same line first (Passport Number: Value)
        const sameLineMatch = line.match(/Passport\s+Number[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let passportNumber = sameLineMatch[1].trim();
          if (passportNumber.length >= 6 && passportNumber.length <= 12) {
            data.passportNumber = passportNumber.toUpperCase();
            break;
          }
        }

        // Try next line
        if (!data.passportNumber && i + 1 < lines.length) {
          let passportNumber = lines[i + 1].trim();
          if (
            passportNumber.length >= 6 &&
            passportNumber.length <= 12 &&
            passportNumber.match(/^[A-Z0-9]+$/)
          ) {
            data.passportNumber = passportNumber.toUpperCase();
            break;
          }
        }
      }
    }

    // Fallback: Extract passport number using pattern
    if (!data.passportNumber) {
      // Try pattern matching in normalized text
      const passportPattern =
        /(?:Passport|P\s*No|Passport\s*No)[:\s]*([A-Z0-9]{6,12})/i;
      const passportMatch = normalizedText.match(passportPattern);
      if (passportMatch) {
        data.passportNumber = passportMatch[1].toUpperCase();
      }

      // Fallback: Look for passport number pattern in lines (format: 2 letters + 7-8 digits, e.g., AP0341892)
      if (!data.passportNumber) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const passportMatch = line.match(/\b([A-Z]{2}\d{7,8})\b/);
          if (passportMatch) {
            data.passportNumber = passportMatch[1].toUpperCase();
            break;
          }
        }
      }
    }

    // Extract Date of Birth - find "Date of Birth" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (lineUpper.includes("DATE") && lineUpper.includes("BIRTH")) {
        // Try to get value from same line first
        const sameLineMatch = line.match(/Date\s+of\s+Birth[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let dateOfBirth = sameLineMatch[1].trim();
          if (dateOfBirth.match(/\d/)) {
            data.dateOfBirth = dateOfBirth.toUpperCase();
            break;
          }
        }

        // Try next line
        if (!data.dateOfBirth && i + 1 < lines.length) {
          let dateOfBirth = lines[i + 1].trim();
          if (dateOfBirth.match(/\d/)) {
            data.dateOfBirth = dateOfBirth.toUpperCase();
            break;
          }
        }
      }
    }

    // Fallback: Extract date of birth from lines (look for date patterns with month names)
    if (!data.dateOfBirth) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineUpper = line.toUpperCase();

        // Look for date patterns like "10 FEB 1984" or "lo FEB 1984" (OCR error: lo = 10)
        // Also handle patterns like "- lo FEB 1984" (with leading dash)
        const dateMatch = line.match(
          /(?:-?\s*)?(\d{1,2}|[a-z]{2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})/i
        );
        if (dateMatch) {
          let day = dateMatch[1];
          // Fix common OCR errors
          const dayLower = day.toLowerCase();
          if (dayLower === "lo" || dayLower === "io" || dayLower === "1o")
            day = "10";
          if (dayLower === "o1" || dayLower === "01") day = "01";
          if (dayLower === "o2" || dayLower === "02") day = "02";
          if (!day.match(/^\d{1,2}$/)) {
            // If still not a number, try to extract digits
            const digitMatch = day.match(/\d/);
            if (digitMatch) day = digitMatch[0].padStart(2, "0");
            else day = "10"; // Default fallback
          }
          const month = dateMatch[2].toUpperCase();
          const year = dateMatch[3];

          // Check if this line also has citizenship number (usually DOB and CNIC are on same line)
          if (line.match(/\d{5}-\d{7}-\d{1}/) || line.match(/\d{13}/)) {
            data.dateOfBirth = `${day.padStart(2, "0")} ${month} ${year}`;
            break;
          }
        }
      }
    }

    // Extract Date of Expiry - find "Date of Expiry" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (
        lineUpper.includes("DATE") &&
        (lineUpper.includes("EXPIRY") || lineUpper.includes("EXPIR"))
      ) {
        // Try to get value from same line first
        const sameLineMatch = line.match(/Date\s+of\s+Expiry[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let dateOfExpiry = sameLineMatch[1].trim();
          if (dateOfExpiry.match(/\d/)) {
            data.dateOfExpiry = dateOfExpiry.toUpperCase();
            break;
          }
        }

        // Try next line
        if (!data.dateOfExpiry && i + 1 < lines.length) {
          let dateOfExpiry = lines[i + 1].trim();
          if (dateOfExpiry.match(/\d/)) {
            data.dateOfExpiry = dateOfExpiry.toUpperCase();
            break;
          }
        }
      }
    }

    // Fallback: Extract dates using patterns (support multiple formats: DD MMM YYYY, DD.MM.YYYY, DD/MM/YYYY)
    // Also handle OCR errors like "lo" -> "10"
    if (!data.dateOfExpiry) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineUpper = line.toUpperCase();

        // Look for date patterns with month names (e.g., "01 MAY 2021")
        // Handle patterns like "pm "01 MAY 2021" (with leading text)
        const dateMatch = line.match(
          /(?:[^0-9]*?)(\d{1,2}|[a-z]{2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})/i
        );
        if (dateMatch && !lineUpper.includes("BIRTH")) {
          let day = dateMatch[1];
          // Fix common OCR errors
          const dayLower = day.toLowerCase();
          if (dayLower === "lo" || dayLower === "io" || dayLower === "1o")
            day = "10";
          if (dayLower === "o1" || dayLower === "01") day = "01";
          if (dayLower === "o2" || dayLower === "02") day = "02";
          if (!day.match(/^\d{1,2}$/)) {
            const digitMatch = day.match(/\d/);
            if (digitMatch) day = digitMatch[0].padStart(2, "0");
            else day = "01"; // Default fallback
          }
          const month = dateMatch[2].toUpperCase();
          const year = dateMatch[3];

          // Check if this line also has tracking number (usually expiry date and tracking number are on same line)
          if (line.match(/\d{10,12}/)) {
            data.dateOfExpiry = `${day.padStart(2, "0")} ${month} ${year}`;
            break;
          }
        }
      }
    }

    // Fallback: Extract dates using patterns (support multiple formats: DD MMM YYYY, DD.MM.YYYY, DD/MM/YYYY)
    if (!data.dateOfBirth || !data.dateOfExpiry) {
      const datePatterns = [
        /(\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{4})/gi, // DD MMM YYYY
        /(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/g, // DD.MM.YYYY or DD/MM/YYYY
      ];

      const dates = [];
      for (const pattern of datePatterns) {
        const matches = normalizedText.matchAll(pattern);
        for (const match of matches) {
          if (match[0]) {
            dates.push(match[0]);
          }
        }
      }

      const dobPatterns = [
        /(?:DOB|Date\s+of\s+Birth|Birth)[:\s]*(\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{4})/i,
        /(?:DOB|Date\s+of\s+Birth|Birth)[:\s]*(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/i,
      ];
      const expiryPatterns = [
        /(?:DOE|Date\s+of\s+Expiry|Expiry|Valid\s+Until)[:\s]*(\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{4})/i,
        /(?:DOE|Date\s+of\s+Expiry|Expiry|Valid\s+Until)[:\s]*(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/i,
      ];

      for (const pattern of dobPatterns) {
        const match = normalizedText.match(pattern);
        if (match && match[1] && !data.dateOfBirth) {
          data.dateOfBirth = match[1].trim();
          break;
        }
      }
      if (!data.dateOfBirth && dates.length >= 1) {
        data.dateOfBirth = dates[0];
      }

      for (const pattern of expiryPatterns) {
        const match = normalizedText.match(pattern);
        if (match && match[1] && !data.dateOfExpiry) {
          data.dateOfExpiry = match[1].trim();
          break;
        }
      }
      if (!data.dateOfExpiry && dates.length >= 2) {
        data.dateOfExpiry = dates[1];
      }
    }

    // Extract gender
    const genderPattern = /\b(MALE|FEMALE|M|F)\b/i;
    const genderMatch = normalizedText.match(genderPattern);
    if (genderMatch) {
      data.gender = genderMatch[1].toUpperCase();
    }

    // Extract Nationality - find "Nationality" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (lineUpper.includes("NATIONALITY") && !lineUpper.includes("NUMBER")) {
        // Try to get value from same line first (Nationality: Value)
        const sameLineMatch = line.match(/Nationality[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let nationality = sameLineMatch[1].trim();
          if (nationality.length >= 3) {
            data.nationality = nationality.toUpperCase();
            break;
          }
        }

        // Try next line
        if (!data.nationality && i + 1 < lines.length) {
          let nationality = lines[i + 1].trim();
          if (nationality.length >= 3 && !nationality.match(/^\d/)) {
            data.nationality = nationality.toUpperCase();
            break;
          }
        }
      }
    }

    // Fallback: Look for PAKISTANI in lines
    if (!data.nationality) {
      for (let i = 0; i < lines.length; i++) {
        const lineUpper = lines[i].toUpperCase();
        if (lineUpper.includes("PAKISTANI")) {
          data.nationality = "PAKISTANI";
          break;
        }
      }
    }

    // Extract Surname - find "Surname" or "Sur Name" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (
        (lineUpper.includes("SURNAME") || lineUpper.includes("SUR NAME")) &&
        !lineUpper.includes("GIVEN")
      ) {
        // Try to get value from same line first (Surname: Value)
        const sameLineMatch = line.match(/(?:Sur\s*)?Name[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let surname = sameLineMatch[1].trim();
          if (surname.length >= 2 && !surname.match(/^\d/)) {
            data.surname = surname.toUpperCase();
            break;
          }
        }

        // Try next line
        if (!data.surname && i + 1 < lines.length) {
          let surname = lines[i + 1].trim();
          if (
            surname.length >= 2 &&
            !surname.match(/^\d/) &&
            !surname.toUpperCase().includes("GIVEN")
          ) {
            data.surname = surname.toUpperCase();
            break;
          }
        }
      }
    }

    // Extract Given Name - find "Given Name" or "Given Names" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (lineUpper.includes("GIVEN") && lineUpper.includes("NAME")) {
        // Try to get value from same line first (Given Name: Value)
        const sameLineMatch = line.match(/Given\s+Names?[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let givenNames = sameLineMatch[1].trim();
          // Handle multiple words (e.g., "SYEDA FAREEHA")
          givenNames = givenNames.replace(/\s+/g, " "); // Normalize spaces
          if (givenNames.length >= 2 && !givenNames.match(/^\d/)) {
            data.givenNames = givenNames.toUpperCase();
            break;
          }
        }

        // Try next line
        if (!data.givenNames && i + 1 < lines.length) {
          let givenNames = lines[i + 1].trim();
          // Handle multiple words
          givenNames = givenNames.replace(/\s+/g, " "); // Normalize spaces
          if (
            givenNames.length >= 2 &&
            !givenNames.match(/^\d/) &&
            !givenNames.toUpperCase().includes("NATIONALITY")
          ) {
            data.givenNames = givenNames.toUpperCase();
            break;
          }
        }
      }
    }

    // Fallback: Extract given names from lines (look for name patterns after PASSPORT)
    if (!data.givenNames) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineUpper = line.toUpperCase();

        // Look for lines that contain "PASSPORT" followed by a name (e.g., "PASSPORT SYEDA FAREEHA")
        if (lineUpper.includes("PASSPORT") && !lineUpper.includes("NUMBER")) {
          // Try to extract name from same line after "PASSPORT"
          // Handle patterns like "PASSPORT SYEDA FAREEHA i j" (with trailing junk)
          const nameMatch = line.match(/PASSPORT\s+([A-Z\s]{3,40})/i);
          if (nameMatch && nameMatch[1]) {
            let givenNames = nameMatch[1].trim();
            // Remove trailing single letters/junk (e.g., "i j" at the end)
            givenNames = givenNames.replace(/\s+[a-z]\s*$/i, "").trim();
            givenNames = givenNames.replace(/\s+[a-z]\s+[a-z]\s*$/i, "").trim(); // Remove "i j"
            givenNames = givenNames.replace(/\s+/g, " ");
            // Check if it looks like a name (not just "PAKISTAN" or other keywords)
            if (
              givenNames.length >= 3 &&
              !givenNames.toUpperCase().includes("PAKISTAN") &&
              !givenNames.toUpperCase().includes("NUMBER") &&
              givenNames.split(/\s+/).length >= 1 &&
              givenNames.split(/\s+/).length <= 4
            ) {
              // Usually 1-4 words
              data.givenNames = givenNames.toUpperCase();
              break;
            }
          }
        }
      }
    }

    // Extract place of birth - find "Place of Birth" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (lineUpper.includes("PLACE") && lineUpper.includes("BIRTH")) {
        // Try to get value from same line first
        const sameLineMatch = line.match(/Place\s+of\s+Birth[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let placeOfBirth = sameLineMatch[1].trim();
          if (placeOfBirth.length >= 3) {
            data.placeOfBirth = placeOfBirth.toUpperCase();
            break;
          }
        }

        // Try next line
        if (!data.placeOfBirth && i + 1 < lines.length) {
          let placeOfBirth = lines[i + 1].trim();
          if (placeOfBirth.length >= 3) {
            data.placeOfBirth = placeOfBirth.toUpperCase();
            break;
          }
        }
      }
    }

    // Fallback: Extract place of birth from lines (look for city names followed by PAK)
    if (!data.placeOfBirth) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineUpper = line.toUpperCase();

        // Look for patterns like "SIALKOT, PAK" or "LAHORE, PAK" or "KARACHI, PAK"
        const placeMatch = line.match(/([A-Z\s]{3,20}),\s*PAK/i);
        if (placeMatch) {
          let place = placeMatch[1].trim();
          // Clean up OCR errors
          place = place.replace(/Fy\s+/i, ""); // Remove "Fy" OCR error
          if (place.length >= 3 && place.length <= 30) {
            data.placeOfBirth = `${place.toUpperCase()}, PAK`;
            break;
          }
        }
      }
    }

    // Extract Father Name - find "Father Name" or "Father" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (
        (lineUpper.includes("FATHER") && lineUpper.includes("NAME")) ||
        (lineUpper.includes("FATHER") && !lineUpper.includes("HUSBAND"))
      ) {
        // Try to get value from same line first (Father Name: Value)
        const sameLineMatch = line.match(/Father\s+Name[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let fatherName = sameLineMatch[1].trim();
          // Handle comma-separated names (e.g., "SHAH, SYED MUKHTAR HUSSAIN")
          fatherName = fatherName.replace(/\s+/g, " "); // Normalize spaces
          if (fatherName.length >= 2 && !fatherName.match(/^\d/)) {
            data.fatherName = fatherName.toUpperCase();
            break;
          }
        }

        // Try next line
        if (!data.fatherName && i + 1 < lines.length) {
          let fatherName = lines[i + 1].trim();
          // Handle comma-separated names
          fatherName = fatherName.replace(/\s+/g, " "); // Normalize spaces
          if (fatherName.length >= 2 && !fatherName.match(/^\d/)) {
            data.fatherName = fatherName.toUpperCase();
            break;
          }
        }
      }
    }

    // Fallback: Extract father name from lines (look for comma-separated name patterns)
    if (!data.fatherName) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineUpper = line.toUpperCase();

        // Look for lines with comma-separated names (e.g., "SHAH, SYED MUKHTAR HUSSAIN")
        // Usually appears after place of birth or gender
        if (
          line.includes(",") &&
          line.match(/^[A-Z][A-Z\s,]{5,40}$/) && // Starts with capital, has comma, reasonable length
          !lineUpper.includes("PAKISTAN") &&
          !lineUpper.includes("SIALKOT") &&
          !lineUpper.includes("LAHORE") &&
          !lineUpper.includes("KARACHI") &&
          line.split(",").length === 2
        ) {
          // Has exactly one comma
          // Clean up OCR errors (remove leading "a" or other single letters/words)
          let fatherName = line.replace(/^[a-z]\s+/i, "").trim(); // Remove leading single letter
          fatherName = fatherName.replace(/^[a-z]{1,2}\s+/i, "").trim(); // Remove leading 1-2 letter words
          fatherName = fatherName.replace(/\s+/g, " ");
          // Make sure it still has a comma after cleaning
          if (
            fatherName.includes(",") &&
            fatherName.length >= 5 &&
            fatherName.length <= 50
          ) {
            data.fatherName = fatherName.toUpperCase();
            break;
          }
        }
      }
    }

    // Extract Date of Issue - find "Date of Issue" or "Date of Issuance" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (
        (lineUpper.includes("DATE") && lineUpper.includes("ISSUE")) ||
        (lineUpper.includes("DATE") && lineUpper.includes("ISSUANCE"))
      ) {
        // Try to get value from same line first
        const sameLineMatch = line.match(
          /Date\s+of\s+(?:Issue|Issuance)[:\s]+(.+)$/i
        );
        if (sameLineMatch && sameLineMatch[1]) {
          let dateOfIssue = sameLineMatch[1].trim();
          if (dateOfIssue.match(/\d/)) {
            data.dateOfIssue = dateOfIssue.toUpperCase();
            break;
          }
        }

        // Try next line
        if (!data.dateOfIssue && i + 1 < lines.length) {
          let dateOfIssue = lines[i + 1].trim();
          if (dateOfIssue.match(/\d/)) {
            data.dateOfIssue = dateOfIssue.toUpperCase();
            break;
          }
        }
      }
    }

    // Extract Issuing Authority - find "Issuing Authority" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (lineUpper.includes("ISSUING") && lineUpper.includes("AUTHORITY")) {
        // Try to get value from same line first
        const sameLineMatch = line.match(/Issuing\s+Authority[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let authority = sameLineMatch[1].trim();
          if (authority.length >= 3) {
            data.issuingAuthority = authority.toUpperCase();
            break;
          }
        }

        // Try next line
        if (!data.issuingAuthority && i + 1 < lines.length) {
          let authority = lines[i + 1].trim();
          if (authority.length >= 3 && !authority.match(/^\d/)) {
            data.issuingAuthority = authority.toUpperCase();
            break;
          }
        }
      }
    }

    // Fallback: Look for PAKISTAN as issuing authority
    if (!data.issuingAuthority) {
      for (let i = 0; i < lines.length; i++) {
        const lineUpper = lines[i].toUpperCase();
        if (
          lineUpper.includes("PAKISTAN") &&
          (lineUpper.includes("AUTHORITY") ||
            lineUpper.includes("ISSUING") ||
            i > 5)
        ) {
          data.issuingAuthority = "PAKISTAN";
          break;
        }
      }
    }

    // Extract Tracking Number - find "Tracking Number" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (lineUpper.includes("TRACKING") && lineUpper.includes("NUMBER")) {
        // Try to get value from same line first
        const sameLineMatch = line.match(/Tracking\s+Number[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let trackingNumber = sameLineMatch[1].trim();
          if (trackingNumber.length >= 5) {
            data.trackingNumber = trackingNumber;
            break;
          }
        }

        // Try next line
        if (!data.trackingNumber && i + 1 < lines.length) {
          let trackingNumber = lines[i + 1].trim();
          if (trackingNumber.length >= 5 && trackingNumber.match(/^\d+$/)) {
            data.trackingNumber = trackingNumber;
            break;
          }
        }
      }
    }

    // Fallback: Extract tracking number from lines (look for long numeric patterns, usually 10-11 digits)
    if (!data.trackingNumber) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Look for long numeric strings (10-12 digits) that aren't dates or CNIC
        const trackingMatch = line.match(/\b(\d{10,12})\b/);
        if (trackingMatch) {
          const num = trackingMatch[1];
          // Make sure it's not a date (doesn't match date patterns)
          if (
            !num.match(/\d{4}$/) || // Doesn't end with 4 digits (year)
            (num.length === 11 && !num.match(/\d{5}-\d{7}-\d{1}/))
          ) {
            // Not CNIC format
            data.trackingNumber = num;
            break;
          }
        }
      }
    }

    // Extract Citizenship Number - find "Citizenship Number" label and get value from line below
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineUpper = line.toUpperCase();

      if (lineUpper.includes("CITIZENSHIP") && lineUpper.includes("NUMBER")) {
        // Try to get value from same line first
        const sameLineMatch = line.match(/Citizenship\s+Number[:\s]+(.+)$/i);
        if (sameLineMatch && sameLineMatch[1]) {
          let citizenshipNumber = sameLineMatch[1].trim();
          if (citizenshipNumber.match(/\d/)) {
            data.citizenshipNumber = citizenshipNumber;
            break;
          }
        }

        // Try next line
        if (!data.citizenshipNumber && i + 1 < lines.length) {
          let citizenshipNumber = lines[i + 1].trim();
          if (citizenshipNumber.match(/\d/)) {
            data.citizenshipNumber = citizenshipNumber;
            break;
          }
        }
      }
    }

    // Fallback: Extract citizenship number from lines (look for CNIC format: #####-#######-#)
    if (!data.citizenshipNumber) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Look for CNIC format: #####-#######-# (e.g., 61101-8823189-0)
        const cnicMatch = line.match(/(\d{5}-\d{7}-\d{1})/);
        if (cnicMatch) {
          data.citizenshipNumber = cnicMatch[1];
          break;
        }

        // Also try 13-digit format without dashes
        const cnicMatch2 = line.match(/\b(\d{13})\b/);
        if (cnicMatch2) {
          const cnic = cnicMatch2[1];
          // Format as #####-#######-#
          data.citizenshipNumber = `${cnic.substring(0, 5)}-${cnic.substring(
            5,
            12
          )}-${cnic.substring(12)}`;
          break;
        }
      }
    }

    // Fallback patterns for fields not found by labels
    if (!data.dateOfIssue) {
      const issuePattern =
        /(?:DOI|Date\s+of\s+Issue|Date\s+of\s+Issuance|Issue)[:\s]*(\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{4})/i;
      const issueMatch = normalizedText.match(issuePattern);
      if (issueMatch) {
        data.dateOfIssue = issueMatch[1].trim();
      }
    }

    return data;
  }

  /**
   * Clean and validate extracted data
   */
  cleanData(data) {
    const cleaned = { ...data };

    // Always keep these important fields even if null
    // CNIC fields
    const cnicRequiredFields = ["name", "fatherName", "country", "cnicNumber"];
    // Passport fields
    const passportRequiredFields = [
      "passportNumber",
      "surname",
      "givenNames",
      "nationality",
      "fatherName",
      "dateOfIssue",
      "issuingAuthority",
      "trackingNumber",
      "husbandName",
      "citizenshipNumber",
    ];

    // Determine which set of required fields to use based on data structure
    const isPassport = "passportNumber" in data || "surname" in data;
    const requiredFields = isPassport
      ? passportRequiredFields
      : cnicRequiredFields;

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
