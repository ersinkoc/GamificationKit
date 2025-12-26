import { EventManager } from './EventManager.js';
import { RuleEngine } from './RuleEngine.js';
import { APIServer } from './APIServer.js';
import { WebhookManager } from './WebhookManager.js';
import { MetricsCollector } from './MetricsCollector.js';
import { HealthChecker } from './HealthChecker.js';
import { Logger } from '../utils/logger.js';
import { validators, validateConfig } from '../utils/validators.js';
import { MemoryStorage } from '../storage/MemoryStorage.js';
import { SecretManager } from '../config/SecretManager.js';

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
    this.healthChecker = null;
    this.secretManager = null;
    this.initialized = false;
    this.isShuttingDown = false;

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
      websocket: {
        enabled: false,
        port: 3002,
        path: '/gamification/ws'
      },
      metrics: {
        enabled: true,
        collectInterval: 60000
      },
      health: {
        enabled: true,
        checkInterval: 30000,
        memoryThreshold: 90,
        eventLoopLagThreshold: 100,
        storageResponseThreshold: 1000
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

    // Fix BUG-043: Deep merge config to preserve nested default values
    return this.mergeDeep(defaultConfig, config);
  }

  // Deep merge helper to properly merge nested objects
  mergeDeep(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeDeep(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  async initialize() {
    if (this.initialized) {
      this.logger.warn('GamificationKit already initialized');
      return this;
    }

    try {
      this.logger.info('Initializing GamificationKit...');

      // Initialize secret manager first
      await this.initializeSecretManager();

      await this.initializeStorage();
      this.initializeEventManager();
      this.initializeRuleEngine();
      
      if (this.config.webhooks.enabled) {
        this.initializeWebhookManager();
      }

      if (this.config.metrics.enabled) {
        this.initializeMetricsCollector();
      }

      if (this.config.health.enabled) {
        await this.initializeHealthChecker();
      }

      await this.initializeModules();

      if (this.config.api.enabled) {
        await this.initializeAPIServer();
      }

      if (this.config.websocket?.enabled) {
        await this.initializeWebSocketServer();
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

  async initializeSecretManager() {
    const secretBackend = process.env.VAULT_ENABLED === 'true' ? 'vault' :
                         process.env.AWS_SECRETS_ENABLED === 'true' ? 'aws' :
                         process.env.AZURE_KEYVAULT_ENABLED === 'true' ? 'azure' :
                         'env';

    this.secretManager = new SecretManager({
      backend: secretBackend,
      logger: this.config.logger
    });

    await this.secretManager.initialize();

    // Validate required secrets for production
    if (process.env.NODE_ENV === 'production') {
      const requiredSecrets = ['API_KEY'];

      if (this.config.api.enabled) {
        requiredSecrets.push('ADMIN_API_KEYS');
      }

      if (this.config.storage.type !== 'memory') {
        // Add storage-specific password requirements
        if (this.config.storage.type === 'redis' && this.config.storage.password) {
          requiredSecrets.push('REDIS_PASSWORD');
        }
        if (this.config.storage.type === 'mongodb' && this.config.storage.password) {
          requiredSecrets.push('MONGODB_PASSWORD');
        }
        if (this.config.storage.type === 'postgres') {
          requiredSecrets.push('POSTGRES_PASSWORD');
        }
      }

      this.secretManager.validateRequiredSecrets(requiredSecrets);
    }

    this.logger.info(`SecretManager initialized with backend: ${secretBackend}`);
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

  async initializeHealthChecker() {
    this.healthChecker = new HealthChecker({
      logger: this.config.logger,
      gamificationKit: this,
      checkInterval: this.config.health.checkInterval,
      memoryThreshold: this.config.health.memoryThreshold,
      eventLoopLagThreshold: this.config.health.eventLoopLagThreshold,
      storageResponseThreshold: this.config.health.storageResponseThreshold
    });
    await this.healthChecker.initialize();
    this.logger.info('HealthChecker initialized');
  }

  async initializeWebSocketServer() {
    if (!this.config.websocket?.enabled) return;
    
    try {
      const { WebSocketServer } = await import('./WebSocketServer.js');
      
      this.websocketServer = new WebSocketServer({
        port: this.config.websocket.port || 3002,
        path: this.config.websocket.path || '/gamification/ws',
        authHandler: this.config.websocket.authHandler
      });
      
      this.websocketServer.setContext({
        eventManager: this.eventManager,
        logger: this.logger.child('WebSocketServer')
      });
      
      await this.websocketServer.start();
      this.logger.info('WebSocketServer initialized');
    } catch (error) {
      this.logger.warn('Failed to initialize WebSocket server:', error.message);
      // Don't throw - WebSocket is optional
    }
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

  async express() {
    const { expressMiddleware } = await import('../middleware/express.js');
    return expressMiddleware(this);
  }

  async fastify() {
    // Fix BUG-001: Pass context to fastify plugin like express and koa
    const { fastifyPlugin } = await import('../middleware/fastify.js');
    return fastifyPlugin(this);
  }

  async koa() {
    const { koaMiddleware } = await import('../middleware/koa.js');
    return koaMiddleware(this);
  }

  async shutdown(timeout = 30000) {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Initiating graceful shutdown...');

    const shutdownPromise = this._performShutdown();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Shutdown timeout exceeded')), timeout)
    );

    try {
      await Promise.race([shutdownPromise, timeoutPromise]);
      this.logger.info('Graceful shutdown completed successfully');
    } catch (error) {
      this.logger.error('Shutdown failed or timed out', { error: error.message });
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  async _performShutdown() {
    // 1. Stop accepting new requests
    if (this.apiServer) {
      this.logger.info('Stopping API server...');
      await this.apiServer.stop();
    }

    // 2. Close WebSocket connections
    if (this.websocketServer) {
      this.logger.info('Closing WebSocket connections...');
      await this.websocketServer.stop();
    }

    // 3. Flush pending webhooks
    if (this.webhookManager) {
      this.logger.info('Flushing pending webhooks...');
      await this.webhookManager.flush();
    }

    // 4. Stop metrics collection
    if (this.metricsCollector) {
      this.logger.info('Stopping metrics collector...');
      this.metricsCollector.stop();
    }

    // 5. Shutdown modules
    this.logger.info('Shutting down modules...');
    for (const [name, module] of this.modules) {
      if (module.shutdown) {
        try {
          await module.shutdown();
          this.logger.debug(`Module ${name} shut down successfully`);
        } catch (error) {
          this.logger.error(`Failed to shutdown module ${name}`, { error: error.message });
        }
      }
    }

    // 6. Stop health checker
    if (this.healthChecker) {
      this.logger.info('Stopping health checker...');
      this.healthChecker.shutdown();
    }

    // 7. Close storage connection
    if (this.storage) {
      this.logger.info('Disconnecting from storage...');
      await this.storage.disconnect();
    }

    // 8. Destroy event manager
    if (this.eventManager) {
      this.logger.info('Destroying event manager...');
      this.eventManager.destroy();
    }

    // 9. Clear secrets from memory
    if (this.secretManager) {
      this.logger.info('Clearing secrets from memory...');
      this.secretManager.clear();
    }

    this.initialized = false;
    this.logger.info('GamificationKit shutdown sequence completed');
  }

  getMetrics() {
    if (!this.metricsCollector) {
      return null;
    }
    return this.metricsCollector.getMetrics();
  }

  /**
   * Get basic health status (legacy method, kept for compatibility)
   */
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

  /**
   * Get liveness probe (K8s compatible)
   */
  async getLiveness() {
    if (!this.healthChecker) {
      return {
        status: 'alive',
        timestamp: new Date().toISOString()
      };
    }
    return this.healthChecker.getLiveness();
  }

  /**
   * Get readiness probe (K8s compatible)
   */
  async getReadiness() {
    if (!this.healthChecker) {
      return {
        status: this.initialized ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString()
      };
    }
    return this.healthChecker.getReadiness();
  }

  /**
   * Get detailed health status with all checks
   */
  async getDetailedHealth() {
    if (!this.healthChecker) {
      return this.getHealth();
    }
    return this.healthChecker.getDetailedHealth();
  }
}