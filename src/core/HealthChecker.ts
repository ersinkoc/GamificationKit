import { Logger } from '../utils/logger.js';
import type { GamificationKitInstance } from '../types/config.js';

/**
 * Health check result structure
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  message: string;
  details?: Record<string, any>;
  duration?: number;
  timestamp?: string;
}

/**
 * Health check function type
 */
export type HealthCheckFunction = () => Promise<HealthCheckResult>;

/**
 * Health check thresholds configuration
 */
export interface HealthCheckThresholds {
  memoryUsagePercent?: number;
  eventLoopLag?: number;
  storageResponseTime?: number;
  [key: string]: number | undefined;
}

/**
 * HealthChecker options
 */
export interface HealthCheckerOptions {
  gamificationKit: GamificationKitInstance;
  checkInterval?: number;
  logger?: any;
  memoryThreshold?: number;
  eventLoopLagThreshold?: number;
  storageResponseThreshold?: number;
  thresholds?: HealthCheckThresholds;
}

/**
 * Overall health check results
 */
export interface HealthCheckResults {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: Record<string, HealthCheckResult>;
}

/**
 * Liveness probe result
 */
export interface LivenessResult {
  status: 'alive';
  timestamp: string;
  uptime: number;
  pid: number;
}

/**
 * Readiness probe result
 */
export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: Record<string, HealthCheckResult>;
}

/**
 * Detailed health result with system and app info
 */
export interface DetailedHealthResult extends HealthCheckResults {
  system: {
    uptime: number;
    pid: number;
    platform: string;
    nodeVersion: string;
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
  };
  application: {
    name: string;
    initialized: boolean;
    modulesCount: number;
    storageType: string;
  };
}

/**
 * HealthChecker provides comprehensive health check endpoints
 * for monitoring system status and dependencies
 */
export class HealthChecker {
  private logger: Logger;
  private gamificationKit: GamificationKitInstance;
  private checks: Map<string, HealthCheckFunction>;
  private lastCheckResults: Map<string, HealthCheckResult>;
  private checkInterval: number;
  private checkTimer: NodeJS.Timeout | null;
  private thresholds: Required<HealthCheckThresholds>;

  constructor(options: HealthCheckerOptions) {
    this.logger = new Logger({ prefix: 'HealthChecker', ...options.logger });
    this.gamificationKit = options.gamificationKit;
    this.checks = new Map();
    this.lastCheckResults = new Map();
    this.checkInterval = options.checkInterval || 30000; // 30 seconds
    this.checkTimer = null;
    this.thresholds = {
      memoryUsagePercent: options.memoryThreshold || 90,
      eventLoopLag: options.eventLoopLagThreshold || 100, // ms
      storageResponseTime: options.storageResponseThreshold || 1000, // ms
      ...options.thresholds
    };
  }

  /**
   * Initialize health checker
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing HealthChecker...');

    // Register default health checks
    this.registerCheck('process', this.checkProcess.bind(this));
    this.registerCheck('memory', this.checkMemory.bind(this));
    this.registerCheck('eventLoop', this.checkEventLoop.bind(this));
    this.registerCheck('storage', this.checkStorage.bind(this));
    this.registerCheck('modules', this.checkModules.bind(this));

    if (this.gamificationKit.webhookManager) {
      this.registerCheck('webhooks', this.checkWebhooks.bind(this));
    }

    if (this.gamificationKit.apiServer) {
      this.registerCheck('apiServer', this.checkApiServer.bind(this));
    }

    // Start periodic health checks
    if (this.checkInterval > 0) {
      this.startPeriodicChecks();
    }

    this.logger.info('HealthChecker initialized');
  }

  /**
   * Register a custom health check
   * @param name - Check name
   * @param checkFn - Check function (should return {status, message, details})
   */
  registerCheck(name: string, checkFn: HealthCheckFunction): void {
    if (typeof checkFn !== 'function') {
      throw new Error('Check function must be a function');
    }

    this.checks.set(name, checkFn);
    this.logger.debug(`Registered health check: ${name}`);
  }

  /**
   * Remove a health check
   * @param name - Check name
   */
  unregisterCheck(name: string): void {
    this.checks.delete(name);
    this.lastCheckResults.delete(name);
    this.logger.debug(`Unregistered health check: ${name}`);
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(): void {
    if (this.checkTimer) {
      return;
    }

    this.checkTimer = setInterval(async () => {
      try {
        await this.runAllChecks();
      } catch (error: any) {
        this.logger.error('Periodic health check failed', { error: error.message });
      }
    }, this.checkInterval);

    this.logger.info(`Started periodic health checks (interval: ${this.checkInterval}ms)`);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      this.logger.info('Stopped periodic health checks');
    }
  }

  /**
   * Run all registered health checks
   * @returns Health check results
   */
  async runAllChecks(): Promise<HealthCheckResults> {
    const results: HealthCheckResults = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {}
    };

    const checkPromises = Array.from(this.checks.entries()).map(async ([name, checkFn]): Promise<[string, HealthCheckResult]> => {
      try {
        const startTime = Date.now();
        const result = await Promise.race<HealthCheckResult>([
          checkFn(),
          new Promise<HealthCheckResult>((_, reject) =>
            setTimeout(() => reject(new Error('Check timeout')), 5000)
          )
        ]);

        const duration = Date.now() - startTime;

        const checkResult: HealthCheckResult = {
          ...result,
          duration,
          timestamp: new Date().toISOString()
        };

        this.lastCheckResults.set(name, checkResult);
        return [name, checkResult];
      } catch (error: any) {
        const checkResult: HealthCheckResult = {
          status: 'unhealthy',
          message: error.message,
          timestamp: new Date().toISOString()
        };

        this.lastCheckResults.set(name, checkResult);
        return [name, checkResult];
      }
    });

    const checkResults = await Promise.all(checkPromises);

    for (const [name, result] of checkResults) {
      results.checks[name] = result;

      // Update overall status
      if (result.status === 'unhealthy') {
        results.status = 'unhealthy';
      } else if (result.status === 'degraded' && results.status === 'healthy') {
        results.status = 'degraded';
      }
    }

    return results;
  }

  /**
   * Get liveness probe status (is the process running?)
   * @returns Liveness status
   */
  async getLiveness(): Promise<LivenessResult> {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid
    };
  }

  /**
   * Get readiness probe status (can accept traffic?)
   * @returns Readiness status
   */
  async getReadiness(): Promise<ReadinessResult> {
    // Check critical components only
    const criticalChecks = ['storage', 'modules'];
    const results: ReadinessResult = {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {}
    };

    for (const checkName of criticalChecks) {
      const checkFn = this.checks.get(checkName);
      if (checkFn) {
        try {
          const result = await checkFn();
          results.checks[checkName] = result;

          if (result.status === 'unhealthy') {
            results.status = 'not_ready';
          }
        } catch (error: any) {
          results.checks[checkName] = {
            status: 'unhealthy',
            message: error.message
          };
          results.status = 'not_ready';
        }
      }
    }

    return results;
  }

  /**
   * Get detailed health status
   * @returns Detailed health information
   */
  async getDetailedHealth(): Promise<DetailedHealthResult> {
    const checks = await this.runAllChecks();

    return {
      ...checks,
      system: {
        uptime: process.uptime(),
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      application: {
        name: this.gamificationKit.config.appName,
        initialized: this.gamificationKit.initialized,
        modulesCount: this.gamificationKit.modules.size,
        storageType: this.gamificationKit.config.storage.type
      }
    };
  }

  /**
   * Check process health
   */
  private async checkProcess(): Promise<HealthCheckResult> {
    const uptime = process.uptime();

    return {
      status: 'healthy',
      message: 'Process is running',
      details: {
        uptime: Math.floor(uptime),
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version
      }
    };
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<HealthCheckResult> {
    const mem = process.memoryUsage();
    const heapUsedPercent = (mem.heapUsed / mem.heapTotal) * 100;
    const rssMb = mem.rss / 1024 / 1024;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = 'Memory usage is normal';

    if (heapUsedPercent > this.thresholds.memoryUsagePercent) {
      status = 'unhealthy';
      message = `High memory usage: ${heapUsedPercent.toFixed(2)}%`;
    } else if (heapUsedPercent > this.thresholds.memoryUsagePercent * 0.8) {
      status = 'degraded';
      message = `Elevated memory usage: ${heapUsedPercent.toFixed(2)}%`;
    }

    return {
      status,
      message,
      details: {
        heapUsed: Math.floor(mem.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.floor(mem.heapTotal / 1024 / 1024) + ' MB',
        heapUsedPercent: heapUsedPercent.toFixed(2) + '%',
        rss: Math.floor(rssMb) + ' MB',
        external: Math.floor(mem.external / 1024 / 1024) + ' MB'
      }
    };
  }

  /**
   * Check event loop lag
   */
  private async checkEventLoop(): Promise<HealthCheckResult> {
    const start = Date.now();

    await new Promise(resolve => setImmediate(resolve));

    const lag = Date.now() - start;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = 'Event loop is responsive';

    if (lag > this.thresholds.eventLoopLag) {
      status = 'unhealthy';
      message = `High event loop lag: ${lag}ms`;
    } else if (lag > this.thresholds.eventLoopLag * 0.5) {
      status = 'degraded';
      message = `Elevated event loop lag: ${lag}ms`;
    }

    return {
      status,
      message,
      details: {
        lag: lag + 'ms',
        threshold: this.thresholds.eventLoopLag + 'ms'
      }
    };
  }

  /**
   * Check storage connection and performance
   */
  private async checkStorage(): Promise<HealthCheckResult> {
    if (!this.gamificationKit.storage) {
      return {
        status: 'unhealthy',
        message: 'Storage not initialized'
      };
    }

    try {
      const start = Date.now();

      // Test storage with a simple operation
      const testKey = 'health:check:' + Date.now();
      await this.gamificationKit.storage.set(testKey, 'test', 1);
      await this.gamificationKit.storage.get(testKey);
      await this.gamificationKit.storage.delete(testKey);

      const responseTime = Date.now() - start;

      let status: 'healthy' | 'degraded' = 'healthy';
      let message = 'Storage is responsive';

      if (responseTime > this.thresholds.storageResponseTime) {
        status = 'degraded';
        message = `Slow storage response: ${responseTime}ms`;
      }

      return {
        status,
        message,
        details: {
          type: this.gamificationKit.config.storage.type,
          connected: this.gamificationKit.storage.isConnected(),
          responseTime: responseTime + 'ms'
        }
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: 'Storage check failed: ' + error.message,
        details: {
          type: this.gamificationKit.config.storage.type,
          connected: this.gamificationKit.storage.isConnected(),
          error: error.message
        }
      };
    }
  }

  /**
   * Check modules status
   */
  private async checkModules(): Promise<HealthCheckResult> {
    const modules = Array.from(this.gamificationKit.modules.keys()) as string[];
    const moduleStatuses: Record<string, { initialized: boolean }> = {};

    for (const moduleName of modules) {
      const module = this.gamificationKit.modules.get(moduleName);
      moduleStatuses[moduleName] = {
        initialized: module?.initialized || false
      };
    }

    const uninitializedModules = modules.filter(name => {
      const module = this.gamificationKit.modules.get(name);
      return !module?.initialized;
    });

    let status: 'healthy' | 'degraded' = 'healthy';
    let message = `All ${modules.length} modules are healthy`;

    if (uninitializedModules.length > 0) {
      status = 'degraded';
      message = `${uninitializedModules.length} modules not initialized`;
    }

    return {
      status,
      message,
      details: {
        totalModules: modules.length,
        uninitializedModules,
        modules: moduleStatuses
      }
    };
  }

  /**
   * Check webhooks status
   */
  private async checkWebhooks(): Promise<HealthCheckResult> {
    if (!this.gamificationKit.webhookManager) {
      return {
        status: 'healthy',
        message: 'Webhooks not enabled'
      };
    }

    const queueSize = (this.gamificationKit.webhookManager as any).queue?.length || 0;
    const maxQueueSize = this.gamificationKit.config.webhooks.maxQueueSize || 1000;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = 'Webhook queue is normal';

    if (queueSize > maxQueueSize * 0.9) {
      status = 'unhealthy';
      message = `Webhook queue nearly full: ${queueSize}/${maxQueueSize}`;
    } else if (queueSize > maxQueueSize * 0.7) {
      status = 'degraded';
      message = `Webhook queue elevated: ${queueSize}/${maxQueueSize}`;
    }

    return {
      status,
      message,
      details: {
        queueSize,
        maxQueueSize,
        webhooksCount: (this.gamificationKit.webhookManager as any).webhooks?.size || 0
      }
    };
  }

  /**
   * Check API server status
   */
  private async checkApiServer(): Promise<HealthCheckResult> {
    if (!this.gamificationKit.apiServer) {
      return {
        status: 'healthy',
        message: 'API server not enabled'
      };
    }

    const isRunning = (this.gamificationKit.apiServer as any).server?.listening || false;

    return {
      status: isRunning ? 'healthy' : 'unhealthy',
      message: isRunning ? 'API server is running' : 'API server is not running',
      details: {
        port: this.gamificationKit.config.api.port,
        running: isRunning
      }
    };
  }

  /**
   * Get last check results (cached)
   * @returns Cached health check results
   */
  getLastCheckResults(): HealthCheckResults {
    const results: HealthCheckResults = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {}
    };

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    for (const [name, result] of this.lastCheckResults) {
      results.checks[name] = result;

      if (result.status === 'unhealthy') {
        overallStatus = 'unhealthy';
      } else if (result.status === 'degraded' && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    }

    results.status = overallStatus;
    return results;
  }

  /**
   * Shutdown health checker
   */
  shutdown(): void {
    this.stopPeriodicChecks();
    this.checks.clear();
    this.lastCheckResults.clear();
    this.logger.info('HealthChecker shut down');
  }
}
