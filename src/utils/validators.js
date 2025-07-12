export class ValidationError extends Error {
  constructor(message, field, value) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

export const validators = {
  isString(value, field) {
    if (typeof value !== 'string') {
      throw new ValidationError(`${field} must be a string`, field, value);
    }
    return true;
  },

  isNumber(value, field) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new ValidationError(`${field} must be a number`, field, value);
    }
    if (!isFinite(value)) {
      throw new ValidationError(`${field} must be a finite number`, field, value);
    }
    return true;
  },

  isPositiveNumber(value, field) {
    this.isNumber(value, field);
    if (value <= 0) {
      throw new ValidationError(`${field} must be a positive number`, field, value);
    }
    return true;
  },

  isInteger(value, field) {
    this.isNumber(value, field);
    if (!Number.isInteger(value)) {
      throw new ValidationError(`${field} must be an integer`, field, value);
    }
    return true;
  },

  isArray(value, field) {
    if (!Array.isArray(value)) {
      throw new ValidationError(`${field} must be an array`, field, value);
    }
    return true;
  },

  isObject(value, field) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ValidationError(`${field} must be an object`, field, value);
    }
    return true;
  },

  isFunction(value, field) {
    if (typeof value !== 'function') {
      throw new ValidationError(`${field} must be a function`, field, value);
    }
    return true;
  },

  isBoolean(value, field) {
    if (typeof value !== 'boolean') {
      throw new ValidationError(`${field} must be a boolean`, field, value);
    }
    return true;
  },

  isDate(value, field) {
    if (!(value instanceof Date) || isNaN(value.getTime())) {
      throw new ValidationError(`${field} must be a valid date`, field, value);
    }
    return true;
  },

  isEmail(value, field) {
    this.isString(value, field);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new ValidationError(`${field} must be a valid email`, field, value);
    }
    return true;
  },

  isUserId(value, field = 'userId') {
    this.isString(value, field);
    if (value.length === 0) {
      throw new ValidationError(`${field} cannot be empty`, field, value);
    }
    return true;
  },

  isEventName(value, field = 'eventName') {
    this.isString(value, field);
    const eventRegex = /^[a-zA-Z0-9._-]+$/;
    if (!eventRegex.test(value)) {
      throw new ValidationError(`${field} must contain only alphanumeric characters, dots, hyphens, and underscores`, field, value);
    }
    return true;
  },

  isInRange(value, min, max, field) {
    this.isNumber(value, field);
    if (value < min || value > max) {
      throw new ValidationError(`${field} must be between ${min} and ${max}`, field, value);
    }
    return true;
  },

  isInArray(value, allowedValues, field) {
    if (!allowedValues.includes(value)) {
      throw new ValidationError(`${field} must be one of: ${allowedValues.join(', ')}`, field, value);
    }
    return true;
  },

  hasProperties(obj, requiredProps, objectName = 'object') {
    this.isObject(obj, objectName);
    for (const prop of requiredProps) {
      if (!(prop in obj)) {
        throw new ValidationError(`${objectName} must have property: ${prop}`, prop, obj);
      }
    }
    return true;
  },

  isNonEmptyString(value, field) {
    this.isString(value, field);
    if (value.trim().length === 0) {
      throw new ValidationError(`${field} cannot be empty`, field, value);
    }
    return true;
  },

  isOptional(value, validator, ...args) {
    if (value === undefined || value === null) return true;
    return validator.call(this, value, ...args);
  }
};

export function validateConfig(config, schema) {
  const errors = [];
  
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
    const error = new Error(message);
    error.errors = errors;
    throw error;
  }

  return true;
}