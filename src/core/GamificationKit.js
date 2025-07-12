import { EventManager } from './EventManager.js';
import { RuleEngine } from './RuleEngine.js';
import { APIServer } from './APIServer.js';
import { WebhookManager } from './WebhookManager.js';
import { MetricsCollector } from './MetricsCollector.js';
import { Logger } from '../utils/logger.js';
import { validators, validateConfig } from '../utils/validators.js';
import { MemoryStorage } from '../storage/MemoryStorage.js';

export class GamificationKit {
  constructor(config = {}) {
    this.config = this.validateAndMergeConfig(config);
    this.logger = new Logger({ 
      prefix: 'GamificationKit', 
      ...this.config.logger 
    });
    
    this.modules = new Map();
    this.storage = null;
    this.eventManager = null;
    this.ruleEngine = null;
    this.apiServer = null;
    this.webhookManager = null;
    this.metricsCollector = null;
    this.initialized = false;

    this.logger.info('GamificationKit instance created');
  }

  validateAndMergeConfig(config) {
    const defaultConfig = {
      appName: 'gamification-app',
      storage: { type: 'memory' },
      api: {
        enabled: true,
        port: 3001,
        prefix: '/gamification',
        cors: true,
        rateLimit: {
          windowMs: 60000,
          max: 100
        }
      },
      webhooks: {
        enabled: false,
        timeout: 5000,
        retries: 3
      },
      metrics: {
        enabled: true,
        collectInterval: 60000
      },
      logger: {
        level: 'info',
        enabled: true
      },
      security: {
        apiKey: null,
        encryption: false
      }
    };

    return { ...defaultConfig, ...config };
  }

  async initialize() {
    if (this.initialized) {
      this.logger.warn('GamificationKit already initialized');
      return this;
    }

    try {
      this.logger.info('Initializing GamificationKit...');

      await this.initializeStorage();
      this.initializeEventManager();
      this.initializeRuleEngine();
      
      if (this.config.webhooks.enabled) {
        this.initializeWebhookManager();
      }

      if (this.config.metrics.enabled) {
        this.initializeMetricsCollector();
      }

      await this.initializeModules();

      if (this.config.api.enabled) {
        await this.initializeAPIServer();
      }

      this.initialized = true;
      this.logger.info('GamificationKit initialized successfully');

      await this.eventManager.emitAsync('gamification.initialized', {
        config: this.config,
        modules: Array.from(this.modules.keys())
      });

      return this;
    } catch (error) {
      this.logger.error('Failed to initialize GamificationKit', { error });
      throw error;
    }
  }

  async initializeStorage() {
    const { type, ...storageConfig } = this.config.storage;
    
    switch (type) {
      case 'memory':
        const { MemoryStorage } = await import('../storage/MemoryStorage.js');
        this.storage = new MemoryStorage(storageConfig);
        break;
      case 'redis':
        const { RedisStorage } = await import('../storage/RedisStorage.js');
        this.storage = new RedisStorage(storageConfig);
        break;
      case 'mongodb':
        const { MongoStorage } = await import('../storage/MongoStorage.js');
        this.storage = new MongoStorage(storageConfig);
        break;
      case 'postgres':
        const { PostgresStorage } = await import('../storage/PostgresStorage.js');
        this.storage = new PostgresStorage(storageConfig);
        break;
      default:
        throw new Error(`Unknown storage type: ${type}`);
    }

    await this.storage.connect();
    this.logger.info(`Storage initialized: ${type}`);
  }

  initializeEventManager() {
    this.eventManager = new EventManager({
      logger: this.config.logger,
      maxListeners: 200
    });
    this.logger.info('EventManager initialized');
  }

  initializeRuleEngine() {
    this.ruleEngine = new RuleEngine({
      logger: this.config.logger
    });
    this.logger.info('RuleEngine initialized');
  }

  initializeWebhookManager() {
    this.webhookManager = new WebhookManager({
      logger: this.config.logger,
      eventManager: this.eventManager,
      ...this.config.webhooks
    });
    this.logger.info('WebhookManager initialized');
  }

  initializeMetricsCollector() {
    this.metricsCollector = new MetricsCollector({
      logger: this.config.logger,
      eventManager: this.eventManager,
      storage: this.storage,
      collectInterval: this.config.metrics.collectInterval
    });
    this.metricsCollector.start();
    this.logger.info('MetricsCollector initialized');
  }

  async initializeModules() {
    for (const [name, module] of this.modules) {
      await this.initializeModule(name, module);
    }
  }

  async initializeModule(name, module) {
    try {
      module.setContext({
        storage: this.storage,
        eventManager: this.eventManager,
        ruleEngine: this.ruleEngine,
        logger: this.logger.child(name),
        config: this.config.modules?.[name] || {}
      });

      await module.initialize();
      this.logger.info(`Module initialized: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to initialize module: ${name}`, { error });
      throw error;
    }
  }

  async initializeAPIServer() {
    this.apiServer = new APIServer({
      logger: this.config.logger,
      gamificationKit: this,
      ...this.config.api
    });

    await this.apiServer.start();
    this.logger.info(`API server started on port ${this.config.api.port}`);
  }

  use(module) {
    if (!module || !module.name) {
      throw new Error('Module must have a name property');
    }

    if (this.modules.has(module.name)) {
      throw new Error(`Module already registered: ${module.name}`);
    }

    this.modules.set(module.name, module);
    
    if (this.initialized) {
      this.initializeModule(module.name, module).catch(error => {
        this.logger.error(`Failed to initialize module: ${module.name}`, { error });
      });
    }

    return this;
  }

  async track(eventName, data = {}) {
    validators.isEventName(eventName);
    validators.isObject(data, 'event data');
    
    if (!this.initialized) {
      throw new Error('GamificationKit not initialized. Call initialize() first.');
    }

    const event = {
      eventName,
      ...data,
      timestamp: Date.now()
    };

    const ruleResults = await this.ruleEngine.evaluate(event);
    
    for (const result of ruleResults.passed) {
      if (result.actions) {
        await this.processActions(result.actions, event);
      }
    }

    const emitResult = await this.eventManager.emitAsync(eventName, event);

    if (this.metricsCollector) {
      this.metricsCollector.recordEvent(eventName, event);
    }

    return {
      eventId: emitResult.eventId,
      processed: true,
      rulesMatched: ruleResults.passed.length,
      timestamp: event.timestamp
    };
  }

  async processActions(actions, context) {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'award_points':
            const pointsModule = this.modules.get('points');
            if (pointsModule) {
              await pointsModule.award(
                context.userId,
                action.points,
                action.reason || context.eventName
              );
            }
            break;
          
          case 'award_badge':
            const badgeModule = this.modules.get('badges');
            if (badgeModule) {
              await badgeModule.award(context.userId, action.badgeId);
            }
            break;
          
          case 'complete_quest':
            const questModule = this.modules.get('quests');
            if (questModule) {
              await questModule.completeObjective(
                context.userId,
                action.questId,
                action.objectiveId
              );
            }
            break;
          
          case 'custom':
            if (action.handler) {
              await action.handler(context, this);
            }
            break;
        }
      } catch (error) {
        this.logger.error(`Failed to process action: ${action.type}`, { error });
      }
    }
  }

  async getUserStats(userId) {
    validators.isUserId(userId);
    
    const stats = {
      userId,
      modules: {}
    };

    for (const [name, module] of this.modules) {
      if (module.getUserStats) {
        stats.modules[name] = await module.getUserStats(userId);
      }
    }

    return stats;
  }

  async resetUser(userId) {
    validators.isUserId(userId);
    
    this.logger.warn(`Resetting user: ${userId}`);

    for (const [name, module] of this.modules) {
      if (module.resetUser) {
        await module.resetUser(userId);
        this.logger.debug(`Reset user in module: ${name}`);
      }
    }

    await this.eventManager.emitAsync('user.reset', { userId });
    
    return { success: true, userId };
  }

  express() {
    const { expressMiddleware } = require('../middleware/express.js');
    return expressMiddleware(this);
  }

  fastify() {
    const { fastifyPlugin } = require('../middleware/fastify.js');
    return fastifyPlugin;
  }

  koa() {
    const { koaMiddleware } = require('../middleware/koa.js');
    return koaMiddleware(this);
  }

  async shutdown() {
    this.logger.info('Shutting down GamificationKit...');

    if (this.apiServer) {
      await this.apiServer.stop();
    }

    if (this.metricsCollector) {
      this.metricsCollector.stop();
    }

    for (const [name, module] of this.modules) {
      if (module.shutdown) {
        await module.shutdown();
      }
    }

    if (this.storage) {
      await this.storage.disconnect();
    }

    if (this.eventManager) {
      this.eventManager.destroy();
    }

    this.initialized = false;
    this.logger.info('GamificationKit shut down successfully');
  }

  getMetrics() {
    if (!this.metricsCollector) {
      return null;
    }
    return this.metricsCollector.getMetrics();
  }

  getHealth() {
    return {
      status: this.initialized ? 'healthy' : 'unhealthy',
      initialized: this.initialized,
      storage: this.storage?.isConnected() || false,
      modules: Array.from(this.modules.keys()),
      uptime: process.uptime(),
      timestamp: Date.now()
    };
  }
}