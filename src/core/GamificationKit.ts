import { EventManager } from './EventManager.js';
import { RuleEngine } from './RuleEngine.js';
import { APIServer } from './APIServer.js';
import { WebhookManager } from './WebhookManager.js';
import { MetricsCollector } from './MetricsCollector.js';
import { HealthChecker } from './HealthChecker.js';
import { Logger } from '../utils/logger.js';
import { validators } from '../utils/validators.js';
import { SecretManager } from '../config/SecretManager.js';
import type { WebSocketServer } from './WebSocketServer.js';
import type { StorageInterface } from '../types/storage.js';
import type { BaseModule } from '../modules/BaseModule.js';
import type {
  GamificationConfig,
  GamificationKitInstance,
  // RuleAction - defined in modules.ts
} from '../types/config.js';

/**
 * Track event result
 */
export interface TrackEventResult {
  eventId: string;
  processed: boolean;
  rulesMatched: number;
  timestamp: number;
}

/**
 * User stats result
 */
export interface UserStatsResult {
  userId: string;
  modules: Record<string, any>;
}

/**
 * Reset user result
 */
export interface ResetUserResult {
  success: boolean;
  userId: string;
}

/**
 * Basic health result
 */
export interface BasicHealthResult {
  status: 'healthy' | 'unhealthy';
  initialized: boolean;
  storage: boolean;
  modules: string[];
  uptime: number;
  timestamp: number;
}

/**
 * GamificationKit - Main class for gamification system
 */
export class GamificationKit implements GamificationKitInstance {
  config: GamificationConfig;
  logger: Logger;
  modules: Map<string, BaseModule>;
  storage!: StorageInterface;
  eventManager!: EventManager;
  ruleEngine!: RuleEngine;
  apiServer: APIServer | null;
  webhookManager: WebhookManager | null;
  metricsCollector: MetricsCollector | null;
  healthChecker: HealthChecker | null;
  secretManager: SecretManager | null;
  websocketServer?: WebSocketServer;
  initialized: boolean;
  private isShuttingDown: boolean;

  constructor(config: Partial<GamificationConfig> = {}) {
    this.config = this.validateAndMergeConfig(config);
    this.logger = new Logger({
      prefix: 'GamificationKit',
      ...this.config.logger
    });

    this.modules = new Map();
    this.apiServer = null;
    this.webhookManager = null;
    this.metricsCollector = null;
    this.healthChecker = null;
    this.secretManager = null;
    this.initialized = false;
    this.isShuttingDown = false;

    this.logger.info('GamificationKit instance created');
  }

  private validateAndMergeConfig(config: Partial<GamificationConfig>): GamificationConfig {
    const defaultConfig: GamificationConfig = {
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
        retries: 3,
        maxQueueSize: 1000
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
    return this.mergeDeep(defaultConfig, config) as GamificationConfig;
  }

  // Deep merge helper to properly merge nested objects
  private mergeDeep(target: any, source: any): any {
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

  async initialize(): Promise<this> {
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

      if (this.config.webhooks?.enabled) {
        this.initializeWebhookManager();
      }

      if (this.config.metrics?.enabled) {
        this.initializeMetricsCollector();
      }

      if (this.config.health?.enabled) {
        await this.initializeHealthChecker();
      }

      await this.initializeModules();

      if (this.config.api?.enabled) {
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
    } catch (error: any) {
      this.logger.error('Failed to initialize GamificationKit', { error });
      throw error;
    }
  }

  private async initializeStorage(): Promise<void> {
    if (!this.config.storage) {
      throw new Error('Storage configuration is required');
    }
    const { type, ...storageConfig } = this.config.storage;

    switch (type) {
      case 'memory':
        const { MemoryStorage } = await import('../storage/MemoryStorage.js');
        // @ts-expect-error - Storage adapters have different interfaces
        this.storage = new MemoryStorage(storageConfig as any);
        break;
      case 'redis':
        const { RedisStorage } = await import('../storage/RedisStorage.js');
        // @ts-expect-error - Storage adapters have different interfaces
        this.storage = new RedisStorage(storageConfig as any);
        break;
      case 'mongodb':
        const { MongoStorage } = await import('../storage/MongoStorage.js');
        // @ts-expect-error - Storage adapters have different interfaces
        this.storage = new MongoStorage(storageConfig as any);
        break;
      case 'postgres':
        const { PostgresStorage } = await import('../storage/PostgresStorage.js');
        // @ts-expect-error - Storage adapters have different interfaces
        this.storage = new PostgresStorage(storageConfig as any);
        break;
      default:
        throw new Error(`Unknown storage type: ${type}`);
    }

    await this.storage.connect();
    this.logger.info(`Storage initialized: ${type}`);
  }

  private async initializeSecretManager(): Promise<void> {
    const secretBackend = process.env.VAULT_ENABLED === 'true' ? 'vault' :
                         process.env.AWS_SECRETS_ENABLED === 'true' ? 'aws' :
                         process.env.AZURE_KEYVAULT_ENABLED === 'true' ? 'azure' :
                         'env';

    this.secretManager = new SecretManager({
      backend: secretBackend as 'env' | 'vault' | 'aws' | 'azure',
      logger: this.config.logger
    });

    await this.secretManager.initialize();

    // Validate required secrets for production
    if (process.env.NODE_ENV === 'production') {
      const requiredSecrets = ['API_KEY'];

      if (this.config.api?.enabled) {
        requiredSecrets.push('ADMIN_API_KEYS');
      }

      if (this.config.storage?.type !== 'memory') {
        // Add storage-specific password requirements
        if (this.config.storage?.type === 'redis' && (this.config.storage as any).password) {
          requiredSecrets.push('REDIS_PASSWORD');
        }
        if (this.config.storage?.type === 'mongodb' && (this.config.storage as any).password) {
          requiredSecrets.push('MONGODB_PASSWORD');
        }
        if (this.config.storage?.type === 'postgres') {
          requiredSecrets.push('POSTGRES_PASSWORD');
        }
      }

      this.secretManager!.validateRequiredSecrets(requiredSecrets);
    }

    this.logger.info(`SecretManager initialized with backend: ${secretBackend}`);
  }

  private initializeEventManager(): void {
    this.eventManager = new EventManager({
      logger: this.config.logger,
      maxListeners: 200
    });
    this.logger.info('EventManager initialized');
  }

  private initializeRuleEngine(): void {
    this.ruleEngine = new RuleEngine({
      logger: this.config.logger
    });
    this.logger.info('RuleEngine initialized');
  }

  private initializeWebhookManager(): void {
    this.webhookManager = new WebhookManager({
      logger: this.config.logger,
      eventManager: this.eventManager,
      ...this.config.webhooks
    });
    this.logger.info('WebhookManager initialized');
  }

  private initializeMetricsCollector(): void {
    this.metricsCollector = new MetricsCollector({
      logger: this.config.logger,
      eventManager: this.eventManager,
      storage: this.storage,
      collectInterval: this.config.metrics?.collectInterval
    });
    this.metricsCollector.start();
    this.logger.info('MetricsCollector initialized');
  }

  private async initializeHealthChecker(): Promise<void> {
    this.healthChecker = new HealthChecker({
      logger: this.config.logger,
      gamificationKit: this,
      checkInterval: this.config.health?.checkInterval,
      memoryThreshold: this.config.health?.memoryThreshold,
      eventLoopLagThreshold: this.config.health?.eventLoopLagThreshold,
      storageResponseThreshold: this.config.health?.storageResponseThreshold
    });
    await this.healthChecker.initialize();
    this.logger.info('HealthChecker initialized');
  }

  private async initializeWebSocketServer(): Promise<void> {
    if (!this.config.websocket?.enabled) return;

    try {
      const { WebSocketServer } = await import('./WebSocketServer.js');

      this.websocketServer = new WebSocketServer({
        port: this.config.websocket.port || 3002,
        path: this.config.websocket.path || '/gamification/ws',
        authHandler: (this.config.websocket as any).authHandler
      });

      this.websocketServer.setContext({
        eventManager: this.eventManager,
        logger: this.logger.child('WebSocketServer')
      });

      await this.websocketServer.start();
      this.logger.info('WebSocketServer initialized');
    } catch (error: any) {
      this.logger.warn('Failed to initialize WebSocket server:', error.message);
      // Don't throw - WebSocket is optional
    }
  }

  private async initializeModules(): Promise<void> {
    for (const [name, module] of this.modules) {
      await this.initializeModule(name, module);
    }
  }

  private async initializeModule(name: string, module: BaseModule): Promise<void> {
    try {
      module.setContext({
        storage: this.storage,
        eventManager: this.eventManager,
        ruleEngine: this.ruleEngine,
        logger: this.logger.child(name),
        config: (this.config as any).modules?.[name] || {}
      });

      await module.initialize();
      this.logger.info(`Module initialized: ${name}`);
    } catch (error: any) {
      this.logger.error(`Failed to initialize module: ${name}`, { error });
      throw error;
    }
  }

  private async initializeAPIServer(): Promise<void> {
    // @ts-expect-error - RateLimitConfig compatible with RateLimitOptions
    this.apiServer = new APIServer({
      logger: this.config.logger,
      gamificationKit: this,
      ...this.config.api
    });

    await this.apiServer.start();
    this.logger.info(`API server started on port ${this.config.api?.port || 3000}`);
  }

  use(module: BaseModule): this {
    const moduleName = (module as any).name;
    if (!module || !moduleName) {
      throw new Error('Module must have a name property');
    }

    if (this.modules.has(moduleName)) {
      throw new Error(`Module already registered: ${moduleName}`);
    }

    this.modules.set(moduleName, module);

    if (this.initialized) {
      this.initializeModule(moduleName, module).catch(error => {
        this.logger.error(`Failed to initialize module: ${moduleName}`, { error });
      });
    }

    return this;
  }

  async track(eventName: string, data: Record<string, any> = {}): Promise<TrackEventResult> {
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

    // Handle rule results - can be boolean or array
    if (Array.isArray(ruleResults.passed)) {
      for (const result of ruleResults.passed) {
        if (result.actions) {
          await this.processActions(result.actions, event);
        }
      }
    }

    const emitResult = await this.eventManager.emitAsync(eventName, event);

    if (this.metricsCollector) {
      this.metricsCollector.recordEvent(eventName, event);
    }

    return {
      eventId: emitResult.eventId,
      processed: true,
      rulesMatched: Array.isArray(ruleResults.passed) ? ruleResults.passed.length : 0,
      timestamp: event.timestamp
    };
  }

  private async processActions(actions: any[], context: any): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'award_points':
            const pointsModule = this.modules.get('points');
            if (pointsModule && 'award' in pointsModule) {
              await (pointsModule as any).award(
                context.userId,
                (action as any).points,
                (action as any).reason || context.eventName
              );
            }
            break;

          case 'award_badge':
            const badgeModule = this.modules.get('badges');
            if (badgeModule && 'award' in badgeModule) {
              await (badgeModule as any).award(context.userId, (action as any).badgeId);
            }
            break;

          case 'complete_quest':
            const questModule = this.modules.get('quests');
            if (questModule && 'completeObjective' in questModule) {
              await (questModule as any).completeObjective(
                context.userId,
                (action as any).questId,
                (action as any).objectiveId
              );
            }
            break;

          case 'custom':
            if ((action as any).handler) {
              await (action as any).handler(context, this);
            }
            break;
        }
      } catch (error: any) {
        this.logger.error(`Failed to process action: ${action.type}`, { error });
      }
    }
  }

  async getUserStats(userId: string): Promise<UserStatsResult> {
    validators.isUserId(userId);

    const stats: UserStatsResult = {
      userId,
      modules: {}
    };

    for (const [name, module] of this.modules) {
      if ('getUserStats' in module && typeof (module as any).getUserStats === 'function') {
        stats.modules[name] = await (module as any).getUserStats(userId);
      }
    }

    return stats;
  }

  async resetUser(userId: string): Promise<ResetUserResult> {
    validators.isUserId(userId);

    this.logger.warn(`Resetting user: ${userId}`);

    for (const [name, module] of this.modules) {
      if ('resetUser' in module && typeof (module as any).resetUser === 'function') {
        await (module as any).resetUser(userId);
        this.logger.debug(`Reset user in module: ${name}`);
      }
    }

    await this.eventManager.emitAsync('user.reset', { userId });

    return { success: true, userId };
  }

  async express(): Promise<any> {
    const { expressMiddleware } = await import('../middleware/express.js');
    return expressMiddleware(this);
  }

  async fastify(): Promise<any> {
    // Fix BUG-001: Pass context to fastify plugin like express and koa
    const { fastifyPlugin } = await import('../middleware/fastify.js');
    return fastifyPlugin(this);
  }

  async koa(): Promise<any> {
    const { koaMiddleware } = await import('../middleware/koa.js');
    return koaMiddleware(this);
  }

  async shutdown(timeout = 30000): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Initiating graceful shutdown...');

    const shutdownPromise = this._performShutdown();
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Shutdown timeout exceeded')), timeout)
    );

    try {
      await Promise.race([shutdownPromise, timeoutPromise]);
      this.logger.info('Graceful shutdown completed successfully');
    } catch (error: any) {
      this.logger.error('Shutdown failed or timed out', { error: error.message });
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  private async _performShutdown(): Promise<void> {
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
      this.logger.info('Stopping webhook manager...');
      // Note: WebhookManager doesn't have a flush method currently
    }

    // 4. Stop metrics collection
    if (this.metricsCollector) {
      this.logger.info('Stopping metrics collector...');
      this.metricsCollector.stop();
    }

    // 5. Shutdown modules
    this.logger.info('Shutting down modules...');
    for (const [name, module] of this.modules) {
      if ('shutdown' in module && typeof (module as any).shutdown === 'function') {
        try {
          await (module as any).shutdown();
          this.logger.debug(`Module ${name} shut down successfully`);
        } catch (error: any) {
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

  getMetrics(): any {
    if (!this.metricsCollector) {
      return null;
    }
    return this.metricsCollector.getMetrics();
  }

  /**
   * Get basic health status (legacy method, kept for compatibility)
   */
  getHealth(): BasicHealthResult {
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
  async getLiveness(): Promise<any> {
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
  async getReadiness(): Promise<any> {
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
  async getDetailedHealth(): Promise<any> {
    if (!this.healthChecker) {
      return this.getHealth();
    }
    return this.healthChecker.getDetailedHealth();
  }
}
