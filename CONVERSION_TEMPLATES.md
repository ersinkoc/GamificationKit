# TypeScript Conversion Templates

This document provides templates and patterns for converting the remaining JavaScript files to TypeScript.

## Table of Contents
1. [HealthChecker Template](#healthchecker-template)
2. [WebSocketServer Template](#websocketserver-template)
3. [BaseModule Template](#basemodule-template)
4. [Module Patterns](#module-patterns)
5. [Middleware Patterns](#middleware-patterns)
6. [Test File Patterns](#test-file-patterns)

---

## HealthChecker Template

```typescript
import { Logger } from '../utils/logger.js';
import type { LoggerConfig } from '../types/config.js';
import type { GamificationKit } from './GamificationKit.js';

export interface HealthCheckerOptions {
  logger?: LoggerConfig;
  gamificationKit: GamificationKit;
  checkInterval?: number;
  memoryThreshold?: number;
  eventLoopLagThreshold?: number;
  storageResponseThreshold?: number;
  thresholds?: Record<string, number>;
}

export interface HealthCheckFunction {
  (): Promise<HealthCheckResult>;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  details?: Record<string, any>;
  timestamp?: string;
  duration?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: Record<string, HealthCheckResult>;
  system?: SystemInfo;
  application?: ApplicationInfo;
}

export interface SystemInfo {
  uptime: number;
  pid: number;
  platform: string;
  nodeVersion: string;
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
}

export interface ApplicationInfo {
  name: string;
  initialized: boolean;
  modulesCount: number;
  storageType: string;
}

export class HealthChecker {
  private logger: Logger;
  private gamificationKit: GamificationKit;
  private checks: Map<string, HealthCheckFunction>;
  private lastCheckResults: Map<string, HealthCheckResult>;
  private checkInterval: number;
  private checkTimer: NodeJS.Timeout | null;
  private thresholds: {
    memoryUsagePercent: number;
    eventLoopLag: number;
    storageResponseTime: number;
    [key: string]: number;
  };

  constructor(options: HealthCheckerOptions) {
    this.logger = new Logger({ prefix: 'HealthChecker', ...options.logger });
    this.gamificationKit = options.gamificationKit;
    this.checks = new Map();
    this.lastCheckResults = new Map();
    this.checkInterval = options.checkInterval || 30000;
    this.checkTimer = null;
    this.thresholds = {
      memoryUsagePercent: options.memoryThreshold || 90,
      eventLoopLag: options.eventLoopLagThreshold || 100,
      storageResponseTime: options.storageResponseThreshold || 1000,
      ...options.thresholds
    };
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing HealthChecker...');

    // Register default health checks
    this.registerCheck('process', this.checkProcess.bind(this));
    this.registerCheck('memory', this.checkMemory.bind(this));
    this.registerCheck('eventLoop', this.checkEventLoop.bind(this));
    this.registerCheck('storage', this.checkStorage.bind(this));
    this.registerCheck('modules', this.checkModules.bind(this));

    // Register optional checks
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

  registerCheck(name: string, checkFn: HealthCheckFunction): void {
    if (typeof checkFn !== 'function') {
      throw new Error('Check function must be a function');
    }

    this.checks.set(name, checkFn);
    this.logger.debug(`Registered health check: ${name}`);
  }

  unregisterCheck(name: string): void {
    this.checks.delete(name);
    this.lastCheckResults.delete(name);
    this.logger.debug(`Unregistered health check: ${name}`);
  }

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

  stopPeriodicChecks(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      this.logger.info('Stopped periodic health checks');
    }
  }

  async runAllChecks(): Promise<HealthStatus> {
    const results: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {}
    };

    const checkPromises = Array.from(this.checks.entries()).map(async ([name, checkFn]): Promise<[string, HealthCheckResult]> => {
      try {
        const startTime = Date.now();
        const result = await Promise.race([
          checkFn(),
          new Promise<HealthCheckResult>((_, reject) =>
            setTimeout(() => reject(new Error('Check timeout')), 5000)
          )
        ]);

        const duration = Date.now() - startTime;

        const checkResult: HealthCheckResult = {
          status: result.status || 'healthy',
          message: result.message || '',
          duration,
          timestamp: new Date().toISOString(),
          ...result
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

  async getLiveness(): Promise<{ status: string; timestamp: string; uptime: number; pid: number }> {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid
    };
  }

  async getReadiness(): Promise<HealthStatus> {
    // Check critical components only
    const criticalChecks = ['storage', 'modules'];
    const results: HealthStatus = {
      status: 'healthy',
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
            results.status = 'unhealthy';
          }
        } catch (error: any) {
          results.checks[checkName] = {
            status: 'unhealthy',
            message: error.message
          };
          results.status = 'unhealthy';
        }
      }
    }

    return results;
  }

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

  private async checkModules(): Promise<HealthCheckResult> {
    const modules = Array.from(this.gamificationKit.modules.keys());
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

  private async checkWebhooks(): Promise<HealthCheckResult> {
    if (!this.gamificationKit.webhookManager) {
      return {
        status: 'healthy',
        message: 'Webhooks not enabled'
      };
    }

    const queueSize = this.gamificationKit.webhookManager.queue?.length || 0;
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
        webhooksCount: this.gamificationKit.webhookManager.webhooks?.size || 0
      }
    };
  }

  private async checkApiServer(): Promise<HealthCheckResult> {
    if (!this.gamificationKit.apiServer) {
      return {
        status: 'healthy',
        message: 'API server not enabled'
      };
    }

    const isRunning = this.gamificationKit.apiServer.server?.listening || false;

    return {
      status: isRunning ? 'healthy' : 'unhealthy',
      message: isRunning ? 'API server is running' : 'API server is not running',
      details: {
        port: this.gamificationKit.config.api.port,
        running: isRunning
      }
    };
  }

  getLastCheckResults(): HealthStatus {
    const results: HealthStatus = {
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

  shutdown(): void {
    this.stopPeriodicChecks();
    this.checks.clear();
    this.lastCheckResults.clear();
    this.logger.info('HealthChecker shut down');
  }
}
```

---

## WebSocketServer Template

```typescript
import { createServer } from 'http';
import type { Server as HTTPServer } from 'http';
import type { Logger } from '../utils/logger.js';
import type { EventManager } from './EventManager.js';

export interface WebSocketServerOptions {
  port?: number;
  path?: string;
  authHandler?: (userId: string, req: any) => boolean | Promise<boolean>;
}

export interface WebSocketContext {
  eventManager: EventManager;
  logger: Logger;
}

export interface ExtendedWebSocket extends WebSocket {
  subscribedEvents?: string[];
  pingInterval?: NodeJS.Timeout;
}

export class WebSocketServer {
  private port: number;
  private path: string;
  private server: HTTPServer | null;
  private wss: any; // WebSocket.Server from 'ws' package
  private clients: Map<string, ExtendedWebSocket>;
  private eventManager: EventManager | null;
  private logger: Logger | null;
  private authHandler: (userId: string, req: any) => boolean | Promise<boolean>;

  constructor(options: WebSocketServerOptions = {}) {
    this.port = options.port || 3002;
    this.path = options.path || '/gamification/ws';
    this.server = null;
    this.wss = null;
    this.clients = new Map();
    this.eventManager = null;
    this.logger = null;
    this.authHandler = options.authHandler || (() => true);
  }

  setContext(context: WebSocketContext): void {
    this.eventManager = context.eventManager;
    this.logger = context.logger;
  }

  async start(): Promise<void> {
    try {
      // Dynamically import ws module
      const { WebSocketServer: WSServer } = await import('ws');

      this.server = createServer();
      this.wss = new WSServer({
        server: this.server,
        path: this.path
      });

      this.wss.on('connection', (ws: any, req: any) => {
        this.handleConnection(ws, req);
      });

      // Fix BUG-008: Subscribe to all gamification events using onWildcard instead of on
      // The on('*') only listens for literal '*' events, not all events
      this.eventManager!.onWildcard('*', (data) => {
        this.broadcastToRelevantClients(data);
      });

      return new Promise((resolve) => {
        this.server!.listen(this.port, () => {
          this.logger!.info(`WebSocket server listening on port ${this.port}`);
          resolve();
        });
      });
    } catch (error: any) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        this.logger!.warn('WebSocket module (ws) not installed. Install with: npm install ws');
        throw new Error('WebSocket support requires the "ws" package to be installed');
      }
      throw error;
    }
  }

  private async handleConnection(ws: ExtendedWebSocket, req: any): Promise<void> {
    const userId = this.extractUserId(req);

    if (!userId || !await this.authHandler(userId, req)) {
      (ws as any).close(1008, 'Unauthorized');
      return;
    }

    this.logger!.info(`WebSocket client connected: ${userId}`);

    // Store client connection
    this.clients.set(userId, ws);

    // Send initial connection success
    (ws as any).send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      userId
    }));

    // Handle messages from client
    (ws as any).on('message', (message: Buffer) => {
      this.handleMessage(userId, message);
    });

    // Handle client disconnect
    // Fix BUG-010: Clear ping interval immediately on close to prevent memory leak
    (ws as any).on('close', () => {
      this.logger!.info(`WebSocket client disconnected: ${userId}`);
      this.clients.delete(userId);
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval);
        ws.pingInterval = undefined;
      }
    });

    (ws as any).on('error', (error: Error) => {
      this.logger!.error(`WebSocket error for ${userId}:`, error);
    });

    // Send ping every 30 seconds
    // Fix BUG-010: Store interval reference for cleanup
    ws.pingInterval = setInterval(() => {
      if ((ws as any).readyState === (ws as any).OPEN) {
        (ws as any).ping();
      } else {
        clearInterval(ws.pingInterval);
        ws.pingInterval = undefined;
      }
    }, 30000);
  }

  private extractUserId(req: any): string | null {
    // Extract from query params
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const userId = url.searchParams.get('userId');

    if (userId) return userId;

    // Extract from authorization header
    const auth = req.headers.authorization;
    if (auth) {
      // Simple extraction, in production use proper JWT/token validation
      const parts = auth.split(' ');
      if (parts.length === 2) {
        return parts[1]; // Assume token is userId for demo
      }
    }

    return null;
  }

  private handleMessage(userId: string, message: Buffer): void {
    try {
      const data = JSON.parse(message.toString());
      this.logger!.debug(`Received message from ${userId}:`, data);

      switch (data.type) {
        case 'subscribe':
          // Client can subscribe to specific event types
          this.handleSubscribe(userId, data.events);
          break;
        case 'ping':
          // Respond to ping
          const ws = this.clients.get(userId);
          if (ws) {
            (ws as any).send(JSON.stringify({ type: 'pong' }));
          }
          break;
        default:
          this.logger!.warn(`Unknown message type from ${userId}: ${data.type}`);
      }
    } catch (error: any) {
      this.logger!.error(`Error handling message from ${userId}:`, error);
    }
  }

  private handleSubscribe(userId: string, events: string[]): void {
    const ws = this.clients.get(userId);
    if (ws) {
      ws.subscribedEvents = events || ['*'];
      (ws as any).send(JSON.stringify({
        type: 'subscribed',
        events: ws.subscribedEvents
      }));
    }
  }

  private broadcastToRelevantClients(eventData: any): void {
    const { userId, module, type } = eventData;

    // Send to specific user if event has userId
    if (userId) {
      const ws = this.clients.get(userId);
      if (ws && (ws as any).readyState === (ws as any).OPEN) {
        // Check if client subscribed to this event type
        if (!ws.subscribedEvents ||
            ws.subscribedEvents.includes('*') ||
            ws.subscribedEvents.includes(module) ||
            ws.subscribedEvents.includes(`${module}.${type}`)) {
          (ws as any).send(JSON.stringify({
            type: 'event',
            data: eventData,
            timestamp: Date.now()
          }));
        }
      }
    }

    // Also broadcast to admin clients (those subscribed to '*')
    this.clients.forEach((ws, clientId) => {
      if (clientId !== userId && (ws as any).readyState === (ws as any).OPEN) {
        if (ws.subscribedEvents && ws.subscribedEvents.includes('*')) {
          (ws as any).send(JSON.stringify({
            type: 'event',
            data: eventData,
            timestamp: Date.now()
          }));
        }
      }
    });
  }

  broadcast(message: any): void {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((ws) => {
      if ((ws as any).readyState === (ws as any).OPEN) {
        (ws as any).send(messageStr);
      }
    });
  }

  async stop(): Promise<void> {
    this.clients.forEach((ws) => {
      (ws as any).close();
    });
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
    }

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(resolve);
      });
    }
  }
}
```

---

## BaseModule Template

```typescript
import type { IStorageAdapter } from '../types/storage.js';
import type { EventManager } from '../core/EventManager.js';
import type { RuleEngine } from '../core/RuleEngine.js';
import type { Logger } from '../utils/logger.js';
import type { ModuleContext, IBaseModule, ModuleRoute } from '../types/modules.js';
import type { UserId } from '../types/common.js';

export abstract class BaseModule implements IBaseModule {
  readonly name: string;
  readonly version?: string;

  protected storage!: IStorageAdapter;
  protected eventManager!: EventManager;
  protected ruleEngine!: RuleEngine;
  protected logger!: Logger;
  protected config: any;

  public initialized: boolean = false;

  constructor(name: string, version?: string) {
    this.name = name;
    this.version = version;
  }

  setContext(context: ModuleContext): void {
    this.storage = context.storage;
    this.eventManager = context.eventManager;
    this.ruleEngine = context.ruleEngine;
    this.logger = context.logger;
    this.config = context.config;
  }

  async initialize(): Promise<void> {
    this.logger.info(`Initializing ${this.name} module...`);
    await this.onInitialize();
    this.initialized = true;
    this.logger.info(`${this.name} module initialized`);
  }

  protected abstract onInitialize(): Promise<void>;

  abstract getUserStats(userId: UserId): Promise<any>;

  async resetUser(userId: UserId): Promise<void> {
    this.logger.info(`Resetting user ${userId} in ${this.name} module`);
    await this.onResetUser(userId);
  }

  protected abstract onResetUser(userId: UserId): Promise<void>;

  async shutdown(): Promise<void> {
    this.logger.info(`Shutting down ${this.name} module...`);
    await this.onShutdown();
    this.initialized = false;
    this.logger.info(`${this.name} module shut down`);
  }

  protected async onShutdown(): Promise<void> {
    // Default implementation - override if needed
  }

  getRoutes?(): ModuleRoute[];
  getMetrics?(): Record<string, any>;
  getHealth?(): { healthy: boolean; message?: string; details?: any };
}
```

---

## Module Patterns

### Points Module Pattern

```typescript
import { BaseModule } from './BaseModule.js';
import { validators } from '../utils/validators.js';
import type { UserId } from '../types/common.js';
import type { PointsData, PointsTransaction, PointsMultiplier } from '../types/modules.js';

export class PointsModule extends BaseModule {
  private limits: {
    daily: number;
    weekly: number;
    monthly: number;
  };

  constructor() {
    super('points', '1.0.0');
    this.limits = {
      daily: 10000,
      weekly: 50000,
      monthly: 200000
    };
  }

  protected async onInitialize(): Promise<void> {
    // Module-specific initialization
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Listen to events
    this.eventManager.on('user.action', this.handleUserAction.bind(this));
  }

  async awardPoints(userId: UserId, points: number, reason?: string): Promise<PointsData> {
    validators.isNonEmptyString(userId, 'userId');
    validators.isPositiveNumber(points, 'points');

    // Implementation...
    const data: PointsData = {
      total: 0,
      daily: 0,
      weekly: 0,
      monthly: 0,
      lastUpdated: new Date().toISOString()
    };

    return data;
  }

  async getUserStats(userId: UserId): Promise<PointsData> {
    // Implementation...
    return {
      total: 0,
      daily: 0,
      weekly: 0,
      monthly: 0,
      lastUpdated: new Date().toISOString()
    };
  }

  protected async onResetUser(userId: UserId): Promise<void> {
    await this.storage.delete(`points:${userId}`);
  }

  private async handleUserAction(data: any): Promise<void> {
    // Handle events
  }
}
```

---

## Middleware Patterns

### Express Middleware Pattern

```typescript
import type { Request, Response, NextFunction } from 'express';
import type { GamificationKit } from '../core/GamificationKit.js';

export function gamificationMiddleware(kit: GamificationKit) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Attach gamification methods to request
    (req as any).gamification = {
      trackEvent: async (eventName: string, data: any) => {
        await kit.eventManager.emitAsync(eventName, data);
      },
      getUserStats: async (userId: string) => {
        return await kit.getUserStats(userId);
      },
      awardPoints: async (userId: string, points: number, reason?: string) => {
        const pointsModule = kit.modules.get('points');
        return await pointsModule.awardPoints(userId, points, reason);
      }
    };

    next();
  };
}
```

---

## Test File Patterns

### Test Setup Pattern

```typescript
import { jest } from '@jest/globals';

// Mock console to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({}),
  } as Response)
);

// Setup/teardown
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.resetAllMocks();
});
```

### Test File Pattern

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventManager } from '../../src/core/EventManager.js';

describe('EventManager', () => {
  let eventManager: EventManager;

  beforeEach(() => {
    eventManager = new EventManager({
      logger: { level: 'error' }
    });
  });

  afterEach(() => {
    eventManager.destroy();
  });

  describe('emitAsync', () => {
    it('should emit events asynchronously', async () => {
      const handler = jest.fn();
      eventManager.on('test.event', handler);

      await eventManager.emitAsync('test.event', { foo: 'bar' });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('wildcards', () => {
    it('should support wildcard patterns', async () => {
      const handler = jest.fn();
      eventManager.onWildcard('user.*', handler);

      await eventManager.emitAsync('user.created', { userId: '123' });

      expect(handler).toHaveBeenCalled();
    });
  });
});
```

---

## Next Steps

1. Use these templates as reference when converting files
2. Copy the patterns for similar files
3. Ensure all types are properly imported from `src/types/`
4. Run `tsc --noEmit` after each file to check for errors
5. Test the module after conversion
