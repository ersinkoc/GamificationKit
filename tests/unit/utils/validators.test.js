import { jest } from '@jest/globals';
import { validators, ValidationError, validateConfig } from '../../../src/utils/validators.js';

describe('validators', () => {
  describe('ValidationError', () => {
    it('should create error with message and field', () => {
      const error = new ValidationError('Test error', 'testField', 'testValue');
      
      expect(error.message).toBe('Test error');
      expect(error.field).toBe('testField');
      expect(error.value).toBe('testValue');
      expect(error.name).toBe('ValidationError');
      expect(error instanceof Error).toBe(true);
    });

    it('should work without field and value', () => {
      const error = new ValidationError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.field).toBeUndefined();
      expect(error.value).toBeUndefined();
    });
  });

  describe('isString', () => {
    it('should validate string values', () => {
      expect(validators.isString('hello', 'test')).toBe(true);
      expect(validators.isString('', 'test')).toBe(true);
      expect(validators.isString('123', 'test')).toBe(true);
    });

    it('should reject non-string values', () => {
      expect(() => validators.isString(123, 'test')).toThrow('test must be a string');
      expect(() => validators.isString(null, 'test')).toThrow('test must be a string');
      expect(() => validators.isString(undefined, 'test')).toThrow('test must be a string');
      expect(() => validators.isString([], 'test')).toThrow('test must be a string');
      expect(() => validators.isString({}, 'test')).toThrow('test must be a string');
      expect(() => validators.isString(true, 'test')).toThrow('test must be a string');
    });

    it('should include field and value in error', () => {
      try {
        validators.isString(123, 'testField');
      } catch (error) {
        expect(error.field).toBe('testField');
        expect(error.value).toBe(123);
        expect(error instanceof ValidationError).toBe(true);
      }
    });
  });

  describe('isNumber', () => {
    it('should validate number values', () => {
      expect(validators.isNumber(123, 'test')).toBe(true);
      expect(validators.isNumber(0, 'test')).toBe(true);
      expect(validators.isNumber(-123, 'test')).toBe(true);
      expect(validators.isNumber(3.14, 'test')).toBe(true);
      expect(() => validators.isNumber(Infinity, 'test')).toThrow('test must be a finite number');
      expect(() => validators.isNumber(-Infinity, 'test')).toThrow('test must be a finite number');
    });

    it('should reject NaN', () => {
      expect(() => validators.isNumber(NaN, 'test')).toThrow('test must be a number');
    });

    it('should reject non-number values', () => {
      expect(() => validators.isNumber('123', 'test')).toThrow('test must be a number');
      expect(() => validators.isNumber(null, 'test')).toThrow('test must be a number');
      expect(() => validators.isNumber(undefined, 'test')).toThrow('test must be a number');
      expect(() => validators.isNumber([], 'test')).toThrow('test must be a number');
      expect(() => validators.isNumber({}, 'test')).toThrow('test must be a number');
      expect(() => validators.isNumber(true, 'test')).toThrow('test must be a number');
    });
  });

  describe('isPositiveNumber', () => {
    it('should validate positive numbers', () => {
      expect(validators.isPositiveNumber(123, 'test')).toBe(true);
      expect(validators.isPositiveNumber(0.1, 'test')).toBe(true);
      expect(() => validators.isPositiveNumber(Infinity, 'test')).toThrow('test must be a finite number');
    });

    it('should reject zero and negative numbers', () => {
      expect(() => validators.isPositiveNumber(0, 'test')).toThrow('test must be a positive number');
      expect(() => validators.isPositiveNumber(-123, 'test')).toThrow('test must be a positive number');
      expect(() => validators.isPositiveNumber(-0.1, 'test')).toThrow('test must be a positive number');
    });

    it('should chain with number validation', () => {
      expect(() => validators.isPositiveNumber('123', 'test')).toThrow('test must be a number');
    });
  });

  describe('isInteger', () => {
    it('should validate integer values', () => {
      expect(validators.isInteger(123, 'test')).toBe(true);
      expect(validators.isInteger(0, 'test')).toBe(true);
      expect(validators.isInteger(-123, 'test')).toBe(true);
    });

    it('should reject float values', () => {
      expect(() => validators.isInteger(3.14, 'test')).toThrow('test must be an integer');
      expect(() => validators.isInteger(0.1, 'test')).toThrow('test must be an integer');
    });

    it('should reject non-number values', () => {
      expect(() => validators.isInteger('123', 'test')).toThrow('test must be a number');
      expect(() => validators.isInteger(NaN, 'test')).toThrow('test must be a number');
    });
  });

  describe('isArray', () => {
    it('should validate arrays', () => {
      expect(validators.isArray([], 'test')).toBe(true);
      expect(validators.isArray([1, 2, 3], 'test')).toBe(true);
      expect(validators.isArray(['a', 'b'], 'test')).toBe(true);
    });

    it('should reject non-array values', () => {
      expect(() => validators.isArray('[]', 'test')).toThrow('test must be an array');
      expect(() => validators.isArray(null, 'test')).toThrow('test must be an array');
      expect(() => validators.isArray(undefined, 'test')).toThrow('test must be an array');
      expect(() => validators.isArray({}, 'test')).toThrow('test must be an array');
      expect(() => validators.isArray(123, 'test')).toThrow('test must be an array');
    });
  });

  describe('isObject', () => {
    it('should validate objects', () => {
      expect(validators.isObject({}, 'test')).toBe(true);
      expect(validators.isObject({ key: 'value' }, 'test')).toBe(true);
      expect(validators.isObject(new Date(), 'test')).toBe(true);
    });

    it('should reject non-object values', () => {
      expect(() => validators.isObject(null, 'test')).toThrow('test must be an object');
      expect(() => validators.isObject(undefined, 'test')).toThrow('test must be an object');
      expect(() => validators.isObject([], 'test')).toThrow('test must be an object');
      expect(() => validators.isObject('{}', 'test')).toThrow('test must be an object');
      expect(() => validators.isObject(123, 'test')).toThrow('test must be an object');
      expect(() => validators.isObject(true, 'test')).toThrow('test must be an object');
    });
  });

  describe('isFunction', () => {
    it('should validate functions', () => {
      expect(validators.isFunction(() => {}, 'test')).toBe(true);
      expect(validators.isFunction(function() {}, 'test')).toBe(true);
      expect(validators.isFunction(async () => {}, 'test')).toBe(true);
      expect(validators.isFunction(Date, 'test')).toBe(true);
    });

    it('should reject non-function values', () => {
      expect(() => validators.isFunction(null, 'test')).toThrow('test must be a function');
      expect(() => validators.isFunction(undefined, 'test')).toThrow('test must be a function');
      expect(() => validators.isFunction('function', 'test')).toThrow('test must be a function');
      expect(() => validators.isFunction({}, 'test')).toThrow('test must be a function');
      expect(() => validators.isFunction(123, 'test')).toThrow('test must be a function');
    });
  });

  describe('isBoolean', () => {
    it('should validate boolean values', () => {
      expect(validators.isBoolean(true, 'test')).toBe(true);
      expect(validators.isBoolean(false, 'test')).toBe(true);
    });

    it('should reject non-boolean values', () => {
      expect(() => validators.isBoolean(1, 'test')).toThrow('test must be a boolean');
      expect(() => validators.isBoolean(0, 'test')).toThrow('test must be a boolean');
      expect(() => validators.isBoolean('true', 'test')).toThrow('test must be a boolean');
      expect(() => validators.isBoolean('false', 'test')).toThrow('test must be a boolean');
      expect(() => validators.isBoolean(null, 'test')).toThrow('test must be a boolean');
      expect(() => validators.isBoolean(undefined, 'test')).toThrow('test must be a boolean');
    });
  });

  describe('isDate', () => {
    it('should validate Date objects', () => {
      expect(validators.isDate(new Date(), 'test')).toBe(true);
      expect(validators.isDate(new Date('2024-01-01'), 'test')).toBe(true);
    });

    it('should reject invalid dates', () => {
      expect(() => validators.isDate(new Date('invalid'), 'test')).toThrow('test must be a valid date');
    });

    it('should reject non-date values', () => {
      expect(() => validators.isDate('2024-01-01', 'test')).toThrow('test must be a valid date');
      expect(() => validators.isDate(1640995200000, 'test')).toThrow('test must be a valid date');
      expect(() => validators.isDate(null, 'test')).toThrow('test must be a valid date');
      expect(() => validators.isDate({}, 'test')).toThrow('test must be a valid date');
    });
  });

  describe('isEmail', () => {
    it('should validate email addresses', () => {
      expect(validators.isEmail('test@example.com', 'test')).toBe(true);
      expect(validators.isEmail('user.name@domain.co.uk', 'test')).toBe(true);
      expect(validators.isEmail('test+tag@example.org', 'test')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(() => validators.isEmail('invalid-email', 'test')).toThrow('test must be a valid email');
      expect(() => validators.isEmail('@example.com', 'test')).toThrow('test must be a valid email');
      expect(() => validators.isEmail('test@', 'test')).toThrow('test must be a valid email');
      expect(() => validators.isEmail('test@.com', 'test')).toThrow('test must be a valid email');
      expect(() => validators.isEmail('', 'test')).toThrow('test must be a valid email');
    });

    it('should reject non-string values', () => {
      expect(() => validators.isEmail(null, 'test')).toThrow('test must be a string');
      expect(() => validators.isEmail(123, 'test')).toThrow('test must be a string');
    });
  });

  describe('isUserId', () => {
    it('should validate user IDs', () => {
      expect(validators.isUserId('user123', 'test')).toBe(true);
      expect(validators.isUserId('john-doe', 'test')).toBe(true);
      expect(validators.isUserId('a', 'test')).toBe(true);
    });

    it('should reject empty user IDs', () => {
      expect(() => validators.isUserId('', 'test')).toThrow('test cannot be empty');
    });

    it('should reject non-string values', () => {
      expect(() => validators.isUserId(123, 'test')).toThrow('test must be a string');
      expect(() => validators.isUserId(null, 'test')).toThrow('test must be a string');
    });

    it('should use default field name', () => {
      expect(() => validators.isUserId('')).toThrow('userId cannot be empty');
    });
  });

  describe('isEventName', () => {
    it('should validate event names', () => {
      expect(validators.isEventName('user.login', 'test')).toBe(true);
      expect(validators.isEventName('points_awarded', 'test')).toBe(true);
      expect(validators.isEventName('level-up', 'test')).toBe(true);
      expect(validators.isEventName('achievement123', 'test')).toBe(true);
    });

    it('should reject invalid event names', () => {
      expect(() => validators.isEventName('user login', 'test')).toThrow('test must contain only alphanumeric characters, dots, hyphens, and underscores');
      expect(() => validators.isEventName('user@login', 'test')).toThrow('test must contain only alphanumeric characters, dots, hyphens, and underscores');
      expect(() => validators.isEventName('user/login', 'test')).toThrow('test must contain only alphanumeric characters, dots, hyphens, and underscores');
      expect(() => validators.isEventName('', 'test')).toThrow('test must contain only alphanumeric characters, dots, hyphens, and underscores');
    });

    it('should use default field name', () => {
      expect(() => validators.isEventName('invalid name')).toThrow('eventName must contain only alphanumeric characters, dots, hyphens, and underscores');
    });
  });

  describe('isNonEmptyString', () => {
    it('should validate non-empty strings', () => {
      expect(validators.isNonEmptyString('hello', 'test')).toBe(true);
      expect(validators.isNonEmptyString('123', 'test')).toBe(true);
      expect(validators.isNonEmptyString(' a ', 'test')).toBe(true);
    });

    it('should reject empty strings', () => {
      expect(() => validators.isNonEmptyString('', 'test')).toThrow('test cannot be empty');
    });

    it('should reject strings with only whitespace', () => {
      expect(() => validators.isNonEmptyString('   ', 'test')).toThrow('test cannot be empty');
      expect(() => validators.isNonEmptyString('\t', 'test')).toThrow('test cannot be empty');
      expect(() => validators.isNonEmptyString('\n', 'test')).toThrow('test cannot be empty');
    });

    it('should reject non-string values', () => {
      expect(() => validators.isNonEmptyString(null, 'test')).toThrow('test must be a string');
      expect(() => validators.isNonEmptyString(123, 'test')).toThrow('test must be a string');
    });
  });

  describe('isOptional', () => {
    it('should allow undefined values', () => {
      expect(validators.isOptional(undefined, validators.isString, 'test')).toBe(true);
      expect(validators.isOptional(null, validators.isString, 'test')).toBe(true);
    });

    it('should validate non-null values', () => {
      expect(validators.isOptional('hello', validators.isString, 'test')).toBe(true);
      expect(validators.isOptional(123, validators.isNumber, 'test')).toBe(true);
    });

    it('should reject invalid non-null values', () => {
      expect(() => validators.isOptional(123, validators.isString, 'test')).toThrow('test must be a string');
      expect(() => validators.isOptional('hello', validators.isNumber, 'test')).toThrow('test must be a number');
    });

    it('should pass additional arguments to validator', () => {
      expect(validators.isOptional(5, validators.isPositiveNumber, 'test')).toBe(true);
      expect(() => validators.isOptional(-5, validators.isPositiveNumber, 'test')).toThrow('test must be a positive number');
    });
  });

  describe('validateConfig', () => {
    it('should validate configuration with schema', () => {
      const config = {
        name: 'test',
        port: 3000,
        enabled: true
      };

      const schema = {
        name: [validators.isNonEmptyString],
        port: [validators.isInteger],
        enabled: [validators.isBoolean]
      };

      expect(validateConfig(config, schema)).toBe(true);
    });

    it('should collect multiple validation errors', () => {
      const config = {
        name: '',
        port: 'invalid',
        enabled: 'yes'
      };

      const schema = {
        name: [validators.isNonEmptyString],
        port: [validators.isInteger],
        enabled: [validators.isBoolean]
      };

      expect(() => validateConfig(config, schema)).toThrow('Configuration validation failed');
    });

    it('should validate with multiple rules per field', () => {
      const config = {
        count: 5
      };

      const schema = {
        count: [validators.isInteger, validators.isPositiveNumber]
      };

      expect(validateConfig(config, schema)).toBe(true);
    });

    it('should fail when multiple rules fail', () => {
      const config = {
        count: -3.5
      };

      const schema = {
        count: [validators.isInteger, validators.isPositiveNumber]
      };

      expect(() => validateConfig(config, schema)).toThrow('Configuration validation failed');
    });

    it('should handle missing config fields', () => {
      const config = {};

      const schema = {
        name: [validators.isNonEmptyString]
      };

      expect(() => validateConfig(config, schema)).toThrow('Configuration validation failed');
    });

    it('should return error with details', () => {
      const config = {
        name: 123,
        port: 'invalid'
      };

      const schema = {
        name: [validators.isString],
        port: [validators.isInteger]
      };

      try {
        validateConfig(config, schema);
      } catch (error) {
        expect(error.errors).toHaveLength(2);
        expect(error.errors[0] instanceof ValidationError).toBe(true);
        expect(error.errors[1] instanceof ValidationError).toBe(true);
      }
    });
  });

  describe('chaining validation', () => {
    it('should stop at first validation error', () => {
      try {
        validators.isPositiveNumber('not-a-number', 'test');
      } catch (error) {
        expect(error.message).toBe('test must be a number');
        // Should not reach the positive number check
      }
    });

    it('should validate through chain when all pass', () => {
      expect(validators.isPositiveNumber(5, 'test')).toBe(true);
      expect(validators.isInteger(5, 'test')).toBe(true);
    });
  });

  describe('error context', () => {
    it('should provide field and value in all validation errors', () => {
      const testCases = [
        () => validators.isString(123, 'stringField'),
        () => validators.isNumber('text', 'numberField'),
        () => validators.isArray({}, 'arrayField'),
        () => validators.isObject([], 'objectField'),
        () => validators.isFunction('text', 'functionField'),
        () => validators.isBoolean('text', 'booleanField')
      ];

      testCases.forEach((testCase) => {
        try {
          testCase();
        } catch (error) {
          expect(error instanceof ValidationError).toBe(true);
          expect(error.field).toBeDefined();
          expect(error.value).toBeDefined();
        }
      });
    });
  });

  describe('isInRange', () => {
    it('should validate values within range', () => {
      expect(validators.isInRange(5, 1, 10, 'test')).toBe(true);
      expect(validators.isInRange(1, 1, 10, 'test')).toBe(true);
      expect(validators.isInRange(10, 1, 10, 'test')).toBe(true);
    });

    it('should reject values outside range', () => {
      expect(() => validators.isInRange(0, 1, 10, 'test')).toThrow('test must be between 1 and 10');
      expect(() => validators.isInRange(11, 1, 10, 'test')).toThrow('test must be between 1 and 10');
      expect(() => validators.isInRange(-5, 1, 10, 'test')).toThrow('test must be between 1 and 10');
    });

    it('should validate number first', () => {
      expect(() => validators.isInRange('5', 1, 10, 'test')).toThrow('test must be a number');
    });
  });

  describe('isInArray', () => {
    it('should validate values in array', () => {
      expect(validators.isInArray('red', ['red', 'green', 'blue'], 'color')).toBe(true);
      expect(validators.isInArray(1, [1, 2, 3], 'number')).toBe(true);
    });

    it('should reject values not in array', () => {
      expect(() => validators.isInArray('yellow', ['red', 'green', 'blue'], 'color'))
        .toThrow('color must be one of: red, green, blue');
      expect(() => validators.isInArray(4, [1, 2, 3], 'number'))
        .toThrow('number must be one of: 1, 2, 3');
    });

    it('should handle empty arrays', () => {
      expect(() => validators.isInArray('any', [], 'test'))
        .toThrow('test must be one of: ');
    });
  });

  describe('hasProperties', () => {
    it('should validate object has required properties', () => {
      const obj = { name: 'test', age: 25, email: 'test@example.com' };
      expect(validators.hasProperties(obj, ['name', 'age'], 'user')).toBe(true);
    });

    it('should reject object missing required properties', () => {
      const obj = { name: 'test' };
      expect(() => validators.hasProperties(obj, ['name', 'age'], 'user'))
        .toThrow('user must have property: age');
    });

    it('should validate object type first', () => {
      expect(() => validators.hasProperties('not object', ['prop'], 'test'))
        .toThrow('test must be an object');
    });

    it('should handle empty property list', () => {
      const obj = { any: 'value' };
      expect(validators.hasProperties(obj, [], 'test')).toBe(true);
    });

    it('should check nested properties', () => {
      const obj = { nested: { prop: 'value' } };
      expect(validators.hasProperties(obj, ['nested'], 'test')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined field names', () => {
      try {
        validators.isString(123, undefined);
      } catch (error) {
        expect(error.message).toContain('must be a string');
      }
    });

    it('should handle special number values', () => {
      expect(() => validators.isNumber(Infinity, 'test')).toThrow('test must be a finite number');
      expect(() => validators.isNumber(-Infinity, 'test')).toThrow('test must be a finite number');
      expect(() => validators.isNumber(NaN, 'test')).toThrow();
    });

    it('should handle very large numbers', () => {
      const largeNumber = Number.MAX_SAFE_INTEGER;
      expect(validators.isNumber(largeNumber, 'test')).toBe(true);
      expect(validators.isInteger(largeNumber, 'test')).toBe(true);
    });

    it('should handle empty objects and arrays', () => {
      expect(validators.isObject({}, 'test')).toBe(true);
      expect(validators.isArray([], 'test')).toBe(true);
    });
  });
});