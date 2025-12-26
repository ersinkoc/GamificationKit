export class ValidationError extends Error {
  public readonly field: string;
  public readonly value: any;

  constructor(message: string, field: string, value: any) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

type ValidatorFunction = (value: any, ...args: any[]) => boolean;

export const validators = {
  isString(value: any, field: string): boolean {
    if (typeof value !== 'string') {
      throw new ValidationError(`${field} must be a string`, field, value);
    }
    return true;
  },

  isNumber(value: any, field: string): boolean {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new ValidationError(`${field} must be a number`, field, value);
    }
    if (!isFinite(value)) {
      throw new ValidationError(`${field} must be a finite number`, field, value);
    }
    return true;
  },

  isPositiveNumber(value: any, field: string): boolean {
    this.isNumber(value, field);
    if (value <= 0) {
      throw new ValidationError(`${field} must be a positive number`, field, value);
    }
    return true;
  },

  isInteger(value: any, field: string): boolean {
    this.isNumber(value, field);
    if (!Number.isInteger(value)) {
      throw new ValidationError(`${field} must be an integer`, field, value);
    }
    return true;
  },

  isArray(value: any, field: string): boolean {
    if (!Array.isArray(value)) {
      throw new ValidationError(`${field} must be an array`, field, value);
    }
    return true;
  },

  isObject(value: any, field: string): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ValidationError(`${field} must be an object`, field, value);
    }
    return true;
  },

  isFunction(value: any, field: string): boolean {
    if (typeof value !== 'function') {
      throw new ValidationError(`${field} must be a function`, field, value);
    }
    return true;
  },

  isBoolean(value: any, field: string): boolean {
    if (typeof value !== 'boolean') {
      throw new ValidationError(`${field} must be a boolean`, field, value);
    }
    return true;
  },

  isDate(value: any, field: string): boolean {
    if (!(value instanceof Date) || isNaN(value.getTime())) {
      throw new ValidationError(`${field} must be a valid date`, field, value);
    }
    return true;
  },

  isEmail(value: any, field: string): boolean {
    this.isString(value, field);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new ValidationError(`${field} must be a valid email`, field, value);
    }
    return true;
  },

  isUserId(value: any, field: string = 'userId'): boolean {
    this.isString(value, field);
    if (value.length === 0) {
      throw new ValidationError(`${field} cannot be empty`, field, value);
    }
    return true;
  },

  isEventName(value: any, field: string = 'eventName'): boolean {
    this.isString(value, field);
    const eventRegex = /^[a-zA-Z0-9._-]+$/;
    if (!eventRegex.test(value)) {
      throw new ValidationError(`${field} must contain only alphanumeric characters, dots, hyphens, and underscores`, field, value);
    }
    return true;
  },

  isInRange(value: any, min: number, max: number, field: string): boolean {
    this.isNumber(value, field);
    if (value < min || value > max) {
      throw new ValidationError(`${field} must be between ${min} and ${max}`, field, value);
    }
    return true;
  },

  isInArray(value: any, allowedValues: any[], field: string): boolean {
    if (!allowedValues.includes(value)) {
      throw new ValidationError(`${field} must be one of: ${allowedValues.join(', ')}`, field, value);
    }
    return true;
  },

  hasProperties(obj: any, requiredProps: string[], objectName: string = 'object'): boolean {
    this.isObject(obj, objectName);
    for (const prop of requiredProps) {
      if (!(prop in obj)) {
        throw new ValidationError(`${objectName} must have property: ${prop}`, prop, obj);
      }
    }
    return true;
  },

  isNonEmptyString(value: any, field: string): boolean {
    this.isString(value, field);
    if (value.trim().length === 0) {
      throw new ValidationError(`${field} cannot be empty`, field, value);
    }
    return true;
  },

  isOptional(value: any, validator: ValidatorFunction, ...args: any[]): boolean {
    if (value === undefined || value === null) return true;
    return validator.call(this, value, ...args);
  }
};

export interface ValidationSchema {
  [key: string]: ValidatorFunction[];
}

export interface ValidationErrorWithErrors extends Error {
  errors: ValidationError[];
}

export function validateConfig(config: any, schema: ValidationSchema): boolean {
  const errors: ValidationError[] = [];

  for (const [key, rules] of Object.entries(schema)) {
    try {
      for (const rule of rules) {
        rule.call(validators, config[key], key);
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error);
      } else {
        throw error;
      }
    }
  }

  if (errors.length > 0) {
    const message = `Configuration validation failed:\n${errors.map(e => `  - ${e.message}`).join('\n')}`;
    const error = new Error(message) as ValidationErrorWithErrors;
    error.errors = errors;
    throw error;
  }

  return true;
}
