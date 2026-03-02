/**
 * Utility functions for input validation
 */

export interface ValidationError {
  field: string;
  message: string;
}

export class ValidationException extends Error {
  constructor(
    public errors: ValidationError[],
    message: string = 'Validation failed'
  ) {
    super(message);
    this.name = 'ValidationException';
  }
}

/**
 * Validate required fields
 */
export function validateRequired(
  data: Record<string, any>,
  fields: string[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of fields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push({
        field,
        message: `${field} is required`,
      });
    }
  }

  return errors;
}

/**
 * Validate string length
 */
export function validateStringLength(
  value: string | undefined,
  field: string,
  min?: number,
  max?: number
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (value === undefined || value === null) {
    return errors;
  }

  if (min !== undefined && value.length < min) {
    errors.push({
      field,
      message: `${field} must be at least ${min} characters`,
    });
  }

  if (max !== undefined && value.length > max) {
    errors.push({
      field,
      message: `${field} must be at most ${max} characters`,
    });
  }

  return errors;
}

/**
 * Validate and throw if errors exist
 */
export function validateOrThrow(errors: ValidationError[]): void {
  if (errors.length > 0) {
    throw new ValidationException(errors);
  }
}
