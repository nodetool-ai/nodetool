/**
 * Validation utilities for identifiers (property names, output names, etc.)
 */

/**
 * Result of identifier validation
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates that a name is a valid identifier.
 * Identifiers must:
 * - Not start with a number (0-9)
 * - Not be empty (after trimming)
 *
 * @param name - The identifier name to validate
 * @returns ValidationResult with isValid flag and optional error message
 */
export function validateIdentifierName(name: string): ValidationResult {
  const trimmedName = name.trim();

  if (trimmedName.length === 0) {
    return {
      isValid: false,
      error: "Name cannot be empty"
    };
  }

  // Check if the first character is a digit
  if (/^[0-9]/.test(trimmedName)) {
    return {
      isValid: false,
      error: "Name cannot start with a number. Use a letter or underscore instead."
    };
  }

  return {
    isValid: true
  };
}

/**
 * Checks if a name starts with a number
 * @param name - The name to check
 * @returns true if name starts with a number, false otherwise
 */
export function startsWithNumber(name: string): boolean {
  return /^[0-9]/.test(name.trim());
}
