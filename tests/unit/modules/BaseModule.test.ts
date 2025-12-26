import type { GamificationKit } from '../src/core/GamificationKit.js';
import { BaseModule } from '../../../src/modules/BaseModule.js';
import { EventManager } from '../../../src/core/EventManager.js';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';
import { Logger } from '../../../src/utils/logger.js';
import { jest } from '@jest/globals';

describe('BaseModule', (): void => {
  let baseModule;
  let mockContext;

  beforeEach(() => {
    mockContext = {
      storage: new MemoryStorage(),
      eventManager: new EventManager(),
      ruleEngine: { evaluate: jest.fn() },
      logger: new Logger({ prefix: 'Test' }),
      config: { testConfig: 'value' }
    };

    baseModule = new BaseModule('test-module', { 
      optionA: 'valueA',
      optionB: 'valueB' 
    });
  });

  describe('constructor', (): void => {
    it('should initialize with name and options', () => {
      expect(baseModule.name).toBe('test-module');
      expect(baseModule.options).toEqual({ 
        optionA: 'valueA', 
        optionB: 'valueB' 
      });
      expect(baseModule.initialized).toBe(false);
    });

    it('should initialize all properties to null', () => {
      expect(baseModule.storage).toBeNull();
      expect(baseModule.eventManager).toBeNull();
      expect(baseModule.ruleEngine).toBeNull();
      expect(baseModule.logger).toBeNull();
    });
  });

  describe('setContext', (): void => {
    it('should set context properties', () => {
      baseModule.setContext(mockContext);

      expect(baseModule.storage).toBe(mockContext.storage);
      expect(baseModule.eventManager).toBe(mockContext.eventManager);
      expect(baseModule.ruleEngine).toBe(mockContext.ruleEngine);
      expect(baseModule.logger).toBe(mockContext.logger);
    });

    it('should merge config with options', () => {
      baseModule.setContext(mockContext);

      expect(baseModule.config).toEqual({
        optionA: 'valueA',
        optionB: 'valueB',
        testConfig: 'value'
      });
    });

    it('should override options with context config', () => {
      const contextWithOverride = {
        ...mockContext,
        config: { optionA: 'overriddenValue' }
      };

      baseModule.setContext(contextWithOverride);
      expect(baseModule.config.optionA).toBe('overriddenValue');
      expect(baseModule.config.optionB).toBe('valueB');
    });
  });

  describe('initialize', (): void => {
    beforeEach(() => {
      baseModule.setContext(mockContext);
    });

    it('should initialize successfully', async (): Promise<void> => {
      const logSpy = jest.spyOn(mockContext.logger, 'info');
      await baseModule.initialize();

      expect(baseModule.initialized).toBe(true);
      expect(logSpy).toHaveBeenCalledWith('Initializing module: test-module');
      expect(logSpy).toHaveBeenCalledWith('Module initialized: test-module');
    });

    it('should not initialize twice', async (): Promise<void> => {
      const onInitSpy = jest.spyOn(baseModule, 'onInitialize');
      
      await baseModule.initialize();
      await baseModule.initialize();

      expect(onInitSpy).toHaveBeenCalledTimes(1);
    });

    it('should call onInitialize and setupEventListeners', async (): Promise<void> => {
      const onInitSpy = jest.spyOn(baseModule, 'onInitialize');
      const setupSpy = jest.spyOn(baseModule, 'setupEventListeners');

      await baseModule.initialize();

      expect(onInitSpy).toHaveBeenCalled();
      expect(setupSpy).toHaveBeenCalled();
    });
  });

  describe('shutdown', (): void => {
    beforeEach(() => {
      baseModule.setContext(mockContext);
    });

    it('should shutdown properly', async (): Promise<void> => {
      await baseModule.initialize();
      const logSpy = jest.spyOn(mockContext.logger, 'info');
      
      await baseModule.shutdown();

      expect(baseModule.initialized).toBe(false);
      expect(logSpy).toHaveBeenCalledWith('Shutting down module: test-module');
    });
  });

  describe('getStorageKey', (): void => {
    it('should generate storage key with module prefix', () => {
      const key = baseModule.getStorageKey('user:123');
      expect(key).toBe('test-module:user:123');
    });

    it('should handle empty suffix', () => {
      const key = baseModule.getStorageKey('');
      expect(key).toBe('test-module:');
    });
  });

  describe('emitEvent', (): void => {
    beforeEach(() => {
      baseModule.setContext(mockContext);
    });

    it('should emit event with module prefix', async (): Promise<void> => {
      const emitSpy = jest.spyOn(mockContext.eventManager, 'emitAsync');
      const eventData = { userId: 'user123', value: 100 };

      await baseModule.emitEvent('points.awarded', eventData);

      expect(emitSpy).toHaveBeenCalledWith('test-module.points.awarded', {
        module: 'test-module',
        userId: 'user123',
        value: 100
      });
    });

    it('should include module name in event data', async (): Promise<void> => {
      const emitSpy = jest.spyOn(mockContext.eventManager, 'emitAsync');

      await baseModule.emitEvent('test.event', {});

      expect(emitSpy).toHaveBeenCalledWith('test-module.test.event', {
        module: 'test-module'
      });
    });
  });

  describe('recordMetric', (): void => {
    it('should record metric when metricsCollector is available', async (): Promise<void> => {
      const mockMetricsCollector = {
        recordModuleMetric: jest.fn()
      };
      
      baseModule.setContext(mockContext);
      baseModule.metricsCollector = mockMetricsCollector;

      await baseModule.recordMetric('test.metric', 42);

      expect(mockMetricsCollector.recordModuleMetric).toHaveBeenCalledWith(
        'test-module',
        'test.metric',
        42
      );
    });

    it('should not throw when metricsCollector is not available', async (): Promise<void> => {
      baseModule.setContext(mockContext);
      
      await expect(baseModule.recordMetric('test.metric', 42))
        .resolves.not.toThrow();
    });
  });

  describe('getUserStats', (): void => {
    it('should return empty object by default', async (): Promise<void> => {
      const stats = await baseModule.getUserStats('user123');
      expect(stats).toEqual({});
    });
  });

  describe('resetUser', (): void => {
    beforeEach(() => {
      baseModule.setContext(mockContext);
    });

    it('should log reset action', async (): Promise<void> => {
      const logSpy = jest.spyOn(mockContext.logger, 'info');
      
      await baseModule.resetUser('user123');

      expect(logSpy).toHaveBeenCalledWith(
        'Resetting user user123 in module test-module'
      );
    });
  });

  describe('inheritance', (): void => {
    class TestModule extends BaseModule {
      constructor(options) {
        super('test-extended', options);
        this.customProperty = 'custom';
      }

      async onInitialize() {
        this.initCalled = true;
      }

      setupEventListeners() {
        this.listenersCalled = true;
      }

      async getUserStats(userId) {
        return { userId, custom: 'stats' };
      }
    }

    it('should allow extending BaseModule', async (): Promise<void> => {
      const testModule = new TestModule({ option: 'value' });
      testModule.setContext(mockContext);

      expect(testModule.name).toBe('test-extended');
      expect(testModule.customProperty).toBe('custom');
    });

    it('should call overridden methods', async (): Promise<void> => {
      const testModule = new TestModule();
      testModule.setContext(mockContext);

      await testModule.initialize();

      expect(testModule.initCalled).toBe(true);
      expect(testModule.listenersCalled).toBe(true);
    });

    it('should use overridden getUserStats', async (): Promise<void> => {
      const testModule = new TestModule();
      testModule.setContext(mockContext);

      const stats = await testModule.getUserStats('user123');
      expect(stats).toEqual({ userId: 'user123', custom: 'stats' });
    });
  });

  describe('error handling', (): void => {
    it('should handle missing logger gracefully', async (): Promise<void> => {
      baseModule.setContext({
        ...mockContext,
        logger: null
      });

      await expect(baseModule.initialize()).rejects.toThrow();
    });

    it('should handle errors in onInitialize', async (): Promise<void> => {
      class ErrorModule extends BaseModule {
        async onInitialize() {
          throw new Error('Init error');
        }
      }

      const errorModule = new ErrorModule('error-module');
      errorModule.setContext(mockContext);

      await expect(errorModule.initialize()).rejects.toThrow('Init error');
      expect(errorModule.initialized).toBe(false);
    });
  });
});