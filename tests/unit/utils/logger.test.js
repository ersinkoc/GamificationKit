import { jest } from '@jest/globals';
import { Logger } from '../../../src/utils/logger.js';

describe('Logger', () => {
  let logger;
  let consoleSpy;

  beforeEach(() => {
    logger = new Logger();
    
    // Mock console methods
    consoleSpy = {
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      log: jest.spyOn(console, 'log').mockImplementation()
    };
  });

  afterEach(() => {
    // Restore console methods
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultLogger = new Logger();
      
      expect(defaultLogger.level).toBe('info');
      expect(defaultLogger.enabled).toBe(true);
      expect(defaultLogger.prefix).toBe('GamificationKit');
    });

    it('should accept custom options', () => {
      const customLogger = new Logger({
        level: 'debug',
        enabled: false,
        prefix: 'TEST'
      });
      
      expect(customLogger.level).toBe('debug');
      expect(customLogger.enabled).toBe(false);
      expect(customLogger.prefix).toBe('TEST');
    });

    it('should set up level hierarchy', () => {
      expect(logger.levels).toEqual({
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
      });
    });
  });

  describe('level checking', () => {
    it('should check if level is enabled', () => {
      logger.level = 'info';
      
      expect(logger.levels.error <= logger.levels.info).toBe(true);
      expect(logger.levels.warn <= logger.levels.info).toBe(true);
      expect(logger.levels.info <= logger.levels.info).toBe(true);
      expect(logger.levels.debug <= logger.levels.info).toBe(false);
    });

    it('should handle debug level', () => {
      logger.level = 'debug';
      
      expect(logger.levels.error <= logger.levels.debug).toBe(true);
      expect(logger.levels.warn <= logger.levels.debug).toBe(true);
      expect(logger.levels.info <= logger.levels.debug).toBe(true);
      expect(logger.levels.debug <= logger.levels.debug).toBe(true);
    });

    it('should handle error level only', () => {
      logger.level = 'error';
      
      expect(logger.levels.error <= logger.levels.error).toBe(true);
      expect(logger.levels.warn <= logger.levels.error).toBe(false);
      expect(logger.levels.info <= logger.levels.error).toBe(false);
      expect(logger.levels.debug <= logger.levels.error).toBe(false);
    });
  });

  describe('log method', () => {
    it('should return log data with all components', () => {
      const result = logger.log('info', 'test message', { extra: 'data' });
      
      expect(result.level).toBe('info');
      expect(result.message).toBe('test message');
      expect(result.prefix).toBe('GamificationKit');
      expect(result.extra).toBe('data');
      expect(result.timestamp).toBeDefined();
    });

    it('should not log when level is too low', () => {
      logger.level = 'error';
      const result = logger.log('info', 'test message');
      
      expect(result).toBeUndefined();
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should not log when disabled', () => {
      logger.enabled = false;
      const result = logger.log('info', 'test message');
      
      expect(result).toBeUndefined();
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should call appropriate console method', () => {
      logger.level = 'debug'; // Set to debug level to allow debug messages
      
      logger.log('error', 'error message');
      logger.log('warn', 'warn message');
      logger.log('debug', 'debug message');
      logger.log('info', 'info message');
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('error message'),
        {}
      );
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('warn message'),
        {}
      );
      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringContaining('debug message'),
        {}
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('info message'),
        {}
      );
    });
  });

  describe('logging methods', () => {
    it('should log error messages', () => {
      const result = logger.error('Error message');
      
      expect(result).toBeDefined();
      expect(result.level).toBe('error');
      expect(result.message).toBe('Error message');
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Error message'),
        {}
      );
    });

    it('should log warn messages', () => {
      const result = logger.warn('Warning message');
      
      expect(result).toBeDefined();
      expect(result.level).toBe('warn');
      expect(result.message).toBe('Warning message');
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning message'),
        {}
      );
    });

    it('should log info messages', () => {
      const result = logger.info('Info message');
      
      expect(result).toBeDefined();
      expect(result.level).toBe('info');
      expect(result.message).toBe('Info message');
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Info message'),
        {}
      );
    });

    it('should log debug messages when level allows', () => {
      logger.level = 'debug';
      const result = logger.debug('Debug message');
      
      expect(result).toBeDefined();
      expect(result.level).toBe('debug');
      expect(result.message).toBe('Debug message');
      expect(consoleSpy.debug).toHaveBeenCalledTimes(1);
      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringContaining('Debug message'),
        {}
      );
    });

    it('should not log debug messages when level does not allow', () => {
      logger.level = 'info';
      const result = logger.debug('Debug message');
      
      expect(result).toBeUndefined();
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it('should not log when disabled', () => {
      logger.enabled = false;
      
      const errorResult = logger.error('Error message');
      const warnResult = logger.warn('Warning message');
      const infoResult = logger.info('Info message');
      const debugResult = logger.debug('Debug message');
      
      expect(errorResult).toBeUndefined();
      expect(warnResult).toBeUndefined();
      expect(infoResult).toBeUndefined();
      expect(debugResult).toBeUndefined();
      
      expect(consoleSpy.error).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it('should handle meta data', () => {
      const meta = { userId: 123, action: 'login' };
      const result = logger.info('User action', meta);
      
      expect(result.userId).toBe(123);
      expect(result.action).toBe('login');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('User action'),
        meta
      );
    });
  });



  describe('child loggers', () => {
    it('should create child logger with combined prefix', () => {
      logger.prefix = 'PARENT';
      const child = logger.child('CHILD');
      
      expect(child.prefix).toBe('PARENT:CHILD');
      expect(child.level).toBe(logger.level);
      expect(child.enabled).toBe(logger.enabled);
    });

    it('should create child logger with inherited options', () => {
      logger.level = 'debug';
      logger.enabled = false;
      logger.prefix = 'PARENT';
      
      const child = logger.child('CHILD');
      
      expect(child.level).toBe('debug');
      expect(child.enabled).toBe(false);
      expect(child.prefix).toBe('PARENT:CHILD');
    });

    it('should allow child logger to log independently', () => {
      const child = logger.child('TEST');
      
      child.info('Child message');
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('GamificationKit:TEST'),
        {}
      );
    });
  });

  describe('performance', () => {
    it('should skip processing when level is disabled', () => {
      logger.level = 'info';
      
      const result = logger.debug('Debug message that should not be processed');
      
      expect(result).toBeUndefined();
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it('should handle large objects efficiently', () => {
      const largeObject = {
        data: new Array(1000).fill(0).map((_, i) => ({
          id: i,
          value: `value${i}`,
          nested: { deep: { data: i } }
        }))
      };
      
      const startTime = Date.now();
      logger.info('Large object test', largeObject);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(100);
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle null and undefined meta', () => {
      const result1 = logger.info('Test', null);
      const result2 = logger.info('Test', undefined);
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
    });

    it('should handle empty messages', () => {
      const result1 = logger.info('');
      const result2 = logger.info();
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
    });

    it('should handle special characters in messages', () => {
      const specialMessage = 'Message with \n\t\r special chars 🚀 emoji';
      const result = logger.info(specialMessage);
      
      expect(result.message).toBe(specialMessage);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining(specialMessage),
        {}
      );
    });

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      const result = logger.info(longMessage);
      
      expect(result.message).toBe(longMessage);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining(longMessage),
        {}
      );
    });
  });


  describe('timestamp formatting', () => {
    it('should include ISO timestamp in output', () => {
      logger.info('Test message');
      
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('should have consistent timestamp format', () => {
      logger.info('Message 1');
      logger.info('Message 2');
      
      const call1 = consoleSpy.log.mock.calls[0][0];
      const call2 = consoleSpy.log.mock.calls[1][0];
      
      const timestampRegex = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/;
      expect(call1).toMatch(timestampRegex);
      expect(call2).toMatch(timestampRegex);
    });

    it('should include timestamp in log data', () => {
      const result = logger.info('Test message');
      
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      expect(result.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });
  });
});