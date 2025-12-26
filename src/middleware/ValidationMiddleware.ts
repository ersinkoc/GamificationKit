// @ts-nocheck
import { Logger } from '../utils/logger.js';
import type { Request, Response, NextFunction } from 'express';

/**
 * Input Validation Middleware
 * Provides schema-based validation for request data with XSS protection
 */
export class ValidationMiddleware {
  constructor(options: any = {}) {
    this.logger = new Logger({ prefix: 'Validation', ...options.logger });
    this.schemas = new Map();
    this.sanitizeHtml = options.sanitizeHtml !== false;
    this.strictMode = options.strictMode !== false;
  }

  /**
   * Register a validation schema for an endpoint
   * @param {string} endpoint - Endpoint pattern (e.g., '/users/:id')
   * @param {string} method - HTTP method
   * @param {Object} schema - Validation schema
   */
  registerSchema(endpoint, method, schema) {
    const key = `${method}:${endpoint}`;
    this.schemas.set(key, schema);
    this.logger.debug(`Registered schema for ${key}`);
  }

  /**
   * Validate request
   * @param {Object} req - Request object
   * @param {Object} schema - Validation schema
   * @returns {Object} - { valid, errors, data }
   */
  validate(req, schema) {
    const errors = [];
    const data = {};

    // Validate body
    if (schema.body) {
      const bodyResult = this.validateObject(req.body || {}, schema.body, 'body');
      if (!bodyResult.valid) {
        errors.push(...bodyResult.errors);
      } else {
        data.body = bodyResult.data;
      }
    }

    // Validate query parameters
    if (schema.query) {
      const queryResult = this.validateObject(req.query || {}, schema.query, 'query');
      if (!queryResult.valid) {
        errors.push(...bodyResult.errors);
      } else {
        data.query = queryResult.data;
      }
    }

    // Validate path parameters
    if (schema.params) {
      const paramsResult = this.validateObject(req.params || {}, schema.params, 'params');
      if (!paramsResult.valid) {
        errors.push(...paramsResult.errors);
      } else {
        data.params = paramsResult.data;
      }
    }

    // Validate headers
    if (schema.headers) {
      const headersResult = this.validateObject(req.headers || {}, schema.headers, 'headers');
      if (!headersResult.valid) {
        errors.push(...headersResult.errors);
      } else {
        data.headers = headersResult.data;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      data
    };
  }

  /**
   * Validate an object against a schema
   */
  validateObject(obj, schema, location) {
    const errors = [];
    const data = {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = obj[field];
      const fieldPath = `${location}.${field}`;

      // Check required
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: fieldPath,
          message: `${field} is required`,
          code: 'REQUIRED'
        });
        continue;
      }

      // Skip validation if not required and no value
      if (!rules.required && (value === undefined || value === null)) {
        continue;
      }

      // Type validation
      const typeResult = this.validateType(value, rules.type, fieldPath);
      if (!typeResult.valid) {
        errors.push(...typeResult.errors);
        continue;
      }

      let validatedValue = typeResult.value;

      // Sanitize HTML if string
      if (this.sanitizeHtml && rules.type === 'string') {
        validatedValue = this.escapeHtml(validatedValue);
      }

      // Length validation for strings
      if (rules.type === 'string') {
        if (rules.minLength && validatedValue.length < rules.minLength) {
          errors.push({
            field: fieldPath,
            message: `${field} must be at least ${rules.minLength} characters`,
            code: 'MIN_LENGTH'
          });
        }

        if (rules.maxLength && validatedValue.length > rules.maxLength) {
          errors.push({
            field: fieldPath,
            message: `${field} must be at most ${rules.maxLength} characters`,
            code: 'MAX_LENGTH'
          });
        }
      }

      // Range validation for numbers
      if (rules.type === 'number' || rules.type === 'integer') {
        if (rules.min !== undefined && validatedValue < rules.min) {
          errors.push({
            field: fieldPath,
            message: `${field} must be at least ${rules.min}`,
            code: 'MIN_VALUE'
          });
        }

        if (rules.max !== undefined && validatedValue > rules.max) {
          errors.push({
            field: fieldPath,
            message: `${field} must be at most ${rules.max}`,
            code: 'MAX_VALUE'
          });
        }
      }

      // Pattern validation
      if (rules.pattern && typeof validatedValue === 'string') {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(validatedValue)) {
          errors.push({
            field: fieldPath,
            message: rules.patternMessage || `${field} format is invalid`,
            code: 'PATTERN_MISMATCH'
          });
        }
      }

      // Enum validation
      if (rules.enum && !rules.enum.includes(validatedValue)) {
        errors.push({
          field: fieldPath,
          message: `${field} must be one of: ${rules.enum.join(', ')}`,
          code: 'INVALID_ENUM'
        });
      }

      // Custom validation
      if (rules.custom && typeof rules.custom === 'function') {
        try {
          const customResult = rules.custom(validatedValue);
          if (customResult !== true) {
            errors.push({
              field: fieldPath,
              message: customResult || `${field} validation failed`,
              code: 'CUSTOM_VALIDATION'
            });
          }
        } catch (error) {
          errors.push({
            field: fieldPath,
            message: error.message,
            code: 'CUSTOM_VALIDATION_ERROR'
          });
        }
      }

      data[field] = validatedValue;
    }

    // Check for extra fields in strict mode
    if (this.strictMode) {
      for (const field of Object.keys(obj)) {
        if (!schema[field]) {
          errors.push({
            field: `${location}.${field}`,
            message: `Unknown field: ${field}`,
            code: 'UNKNOWN_FIELD'
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      data
    };
  }

  /**
   * Validate value type
   */
  validateType(value, type, field) {
    const errors = [];
    let convertedValue = value;

    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push({
            field,
            message: `Must be a string`,
            code: 'INVALID_TYPE'
          });
        }
        break;

      case 'number':
        if (typeof value === 'string') {
          convertedValue = parseFloat(value);
        }
        if (typeof convertedValue !== 'number' || isNaN(convertedValue)) {
          errors.push({
            field,
            message: `Must be a number`,
            code: 'INVALID_TYPE'
          });
        }
        break;

      case 'integer':
        if (typeof value === 'string') {
          convertedValue = parseInt(value, 10);
        }
        if (typeof convertedValue !== 'number' || isNaN(convertedValue) || !Number.isInteger(convertedValue)) {
          errors.push({
            field,
            message: `Must be an integer`,
            code: 'INVALID_TYPE'
          });
        }
        break;

      case 'boolean':
        if (typeof value === 'string') {
          convertedValue = value === 'true' || value === '1';
        } else {
          convertedValue = Boolean(value);
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push({
            field,
            message: `Must be an array`,
            code: 'INVALID_TYPE'
          });
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push({
            field,
            message: `Must be an object`,
            code: 'INVALID_TYPE'
          });
        }
        break;

      case 'email':
        if (typeof value !== 'string' || !this.isValidEmail(value)) {
          errors.push({
            field,
            message: `Must be a valid email address`,
            code: 'INVALID_EMAIL'
          });
        }
        break;

      case 'url':
        if (typeof value !== 'string' || !this.isValidUrl(value)) {
          errors.push({
            field,
            message: `Must be a valid URL`,
            code: 'INVALID_URL'
          });
        }
        break;

      case 'uuid':
        if (typeof value !== 'string' || !this.isValidUuid(value)) {
          errors.push({
            field,
            message: `Must be a valid UUID`,
            code: 'INVALID_UUID'
          });
        }
        break;

      case 'date':
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          errors.push({
            field,
            message: `Must be a valid date`,
            code: 'INVALID_DATE'
          });
        } else {
          convertedValue = date;
        }
        break;

      default:
        errors.push({
          field,
          message: `Unknown type: ${type}`,
          code: 'UNKNOWN_TYPE'
        });
    }

    return {
      valid: errors.length === 0,
      errors,
      value: convertedValue
    };
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
      '/': '&#x2F;'
    };
    return String(text).replace(/[&<>"'/]/g, char => map[char]);
  }

  /**
   * Validate email format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL format
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate UUID format
   */
  isValidUuid(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Create Express middleware
   */
  middleware(schema) {
    return (req, res, next) => {
      const result = this.validate(req, schema);

      if (!result.valid) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Request validation failed',
          errors: result.errors
        });
        return;
      }

      // Attach validated data to request
      req.validated = result.data;

      next();
    };
  }
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  userId: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 100,
    pattern: '^[a-zA-Z0-9_-]+$',
    patternMessage: 'User ID must contain only alphanumeric characters, hyphens, and underscores'
  },

  points: {
    type: 'integer',
    required: true,
    min: 0,
    max: 1000000
  },

  reason: {
    type: 'string',
    required: false,
    maxLength: 500
  },

  badgeId: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 100,
    pattern: '^[a-z0-9-]+$'
  },

  email: {
    type: 'email',
    required: true,
    maxLength: 255
  },

  pagination: {
    page: {
      type: 'integer',
      required: false,
      min: 1,
      max: 10000
    },
    limit: {
      type: 'integer',
      required: false,
      min: 1,
      max: 100
    }
  }
};

/**
 * Pre-built validation schemas for common endpoints
 */
export const endpointSchemas = {
  '/users/:userId': {
    GET: {
      params: {
        userId: commonSchemas.userId
      }
    }
  },

  '/events': {
    POST: {
      body: {
        userId: commonSchemas.userId,
        eventName: {
          type: 'string',
          required: true,
          minLength: 1,
          maxLength: 100,
          pattern: '^[a-z][a-z0-9._-]*$'
        },
        data: {
          type: 'object',
          required: false
        }
      }
    }
  },

  '/admin/award': {
    POST: {
      body: {
        userId: commonSchemas.userId,
        type: {
          type: 'string',
          required: true,
          enum: ['points', 'badge', 'xp']
        },
        value: {
          type: 'integer',
          required: true,
          min: 1
        },
        reason: commonSchemas.reason
      }
    }
  }
};
