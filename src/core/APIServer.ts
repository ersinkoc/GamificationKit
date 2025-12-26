import http, { Server as HTTPServer, IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { URL } from 'url';
import { Socket } from 'net';
import { Logger } from '../utils/logger.js';
import type { GamificationKitInstance } from '../types/config.js';

/**
 * Route handler context
 */
export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  url: URL;
}

/**
 * Route handler function
 */
export type RouteHandler = (context: RouteContext) => Promise<void>;

/**
 * Route definition
 */
interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

/**
 * Rate limit options
 */
interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/**
 * WebSocket client wrapper
 */
interface WebSocketClient {
  socket: Socket;
  send: (data: any) => void;
  close: () => void;
}

/**
 * CORS configuration
 */
export interface CorsConfig {
  origin?: string | string[] | ((origin: string) => boolean);
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAge?: number;
}

/**
 * API Server options
 */
export interface APIServerOptions {
  gamificationKit: GamificationKitInstance;
  port?: number;
  prefix?: string;
  cors?: boolean | CorsConfig;
  corsOrigins?: string[] | null;
  apiKey?: string;
  adminKeys?: string[];
  trustProxy?: boolean | number | string;
  rateLimit?: RateLimitOptions;
  logger?: any;
}

/**
 * API Server for GamificationKit
 */
export class APIServer {
  private logger: Logger;
  private gamificationKit: GamificationKitInstance;
  private port: number;
  private prefix: string;
  private corsEnabled: boolean;
  private corsOrigins: string[] | null;
  private apiKey?: string;
  private adminKeys: Set<string>;
  private trustProxy: boolean;
  server: HTTPServer | null;
  private routes: Map<string, Route>;
  private rateLimiter: Map<string, number[]>;
  private rateLimitOptions: RateLimitOptions;
  private rateLimiterCleanupInterval: NodeJS.Timeout | null;
  private websocketClients: Set<WebSocketClient>;
  private websocketBroadcastListenerRegistered: boolean;

  constructor(options: APIServerOptions) {
    this.logger = new Logger({ prefix: 'APIServer', ...options.logger });
    this.gamificationKit = options.gamificationKit;
    this.port = options.port || 3001;
    this.prefix = options.prefix || '/gamification';
    this.corsEnabled = options.cors !== false;
    // Fix CRIT-002: Support CORS origin whitelist instead of wildcard
    this.corsOrigins = options.corsOrigins || null; // null = allow all (dev mode), array = whitelist
    this.apiKey = options.apiKey;
    this.adminKeys = new Set(options.adminKeys || []); // Fix BUG-003/004: Admin authentication
    this.trustProxy = Boolean(options.trustProxy || false); // Fix CRIT-001: Enable to trust X-Forwarded-For headers
    this.server = null;
    this.routes = new Map();
    this.rateLimiter = new Map();
    this.rateLimitOptions = options.rateLimit || { windowMs: 60000, max: 100 };
    this.rateLimiterCleanupInterval = null; // Fix BUG-022: Store cleanup interval
    this.websocketClients = new Set();
    this.websocketBroadcastListenerRegistered = false; // Fix: Prevent memory leak from multiple listeners

    this.setupRoutes();
    this.startRateLimiterCleanup(); // Fix BUG-022: Periodic cleanup
  }

  private setupRoutes(): void {
    // Health check endpoints (Kubernetes compatible)
    this.addRoute('GET', '/health', this.handleHealth.bind(this));
    this.addRoute('GET', '/health/live', this.handleLiveness.bind(this));
    this.addRoute('GET', '/health/ready', this.handleReadiness.bind(this));
    this.addRoute('GET', '/health/detailed', this.handleDetailedHealth.bind(this));

    this.addRoute('GET', '/metrics', this.handleMetrics.bind(this));
    this.addRoute('GET', '/users/:userId', this.handleGetUser.bind(this));
    this.addRoute('GET', '/users/:userId/points', this.handleGetUserPoints.bind(this));
    this.addRoute('GET', '/users/:userId/badges', this.handleGetUserBadges.bind(this));
    this.addRoute('GET', '/users/:userId/level', this.handleGetUserLevel.bind(this));
    this.addRoute('GET', '/users/:userId/streaks', this.handleGetUserStreaks.bind(this));
    this.addRoute('GET', '/users/:userId/quests', this.handleGetUserQuests.bind(this));
    this.addRoute('GET', '/users/:userId/history', this.handleGetUserHistory.bind(this));
    this.addRoute('GET', '/leaderboards/:type', this.handleGetLeaderboard.bind(this));
    this.addRoute('GET', '/leaderboards/:type/user/:userId', this.handleGetUserPosition.bind(this));
    this.addRoute('GET', '/badges', this.handleGetBadges.bind(this));
    this.addRoute('GET', '/levels', this.handleGetLevels.bind(this));
    this.addRoute('GET', '/quests', this.handleGetQuests.bind(this));
    this.addRoute('POST', '/events', this.handleTrackEvent.bind(this));
    this.addRoute('POST', '/admin/reset/:userId', this.handleResetUser.bind(this));
    this.addRoute('POST', '/admin/award', this.handleManualAward.bind(this));
  }

  private addRoute(method: string, path: string, handler: RouteHandler): void {
    const routeKey = `${method}:${path}`;
    this.routes.set(routeKey, { method, path, handler });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.handleRequest.bind(this));

      this.server.on('upgrade', this.handleWebSocketUpgrade.bind(this));

      this.server.listen(this.port, (error?: Error) => {
        if (error) {
          this.logger.error('Failed to start API server', { error });
          reject(error);
        } else {
          this.logger.info(`API server started on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Fix BUG-022: Clear rate limiter cleanup interval
      if (this.rateLimiterCleanupInterval) {
        clearInterval(this.rateLimiterCleanupInterval);
        this.rateLimiterCleanupInterval = null;
      }

      for (const ws of this.websocketClients) {
        ws.close();
      }
      this.websocketClients.clear();

      this.server.close(() => {
        this.logger.info('API server stopped');
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (this.corsEnabled) {
        this.setCorsHeaders(res, req);
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (this.apiKey && req.headers['x-api-key'] !== this.apiKey) {
        this.sendError(res, 401, 'Unauthorized');
        return;
      }

      if (!this.checkRateLimit(req)) {
        this.sendError(res, 429, 'Too Many Requests');
        return;
      }

      const url = new URL(req.url || '', `http://${req.headers.host}`);

      if (!url.pathname.startsWith(this.prefix)) {
        this.sendError(res, 404, 'Not Found');
        return;
      }

      const path = url.pathname.substring(this.prefix.length) || '/';
      const route = this.findRoute(req.method || 'GET', path);

      if (!route) {
        this.sendError(res, 404, 'Route Not Found');
        return;
      }

      const params = this.extractParams(route.path, path);
      const query = Object.fromEntries(url.searchParams);

      let body: any = null;
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        body = await this.parseBody(req);
      }

      const context: RouteContext = {
        req,
        res,
        params,
        query,
        body,
        url
      };

      await route.handler(context);
    } catch (error: any) {
      this.logger.error('Request handler error', { error });
      this.sendError(res, 500, 'Internal Server Error');
    }
  }

  private findRoute(method: string, path: string): Route | null {
    for (const [_key, route] of this.routes) {
      if (route.method !== method) continue;

      const pattern = route.path.replace(/:(\w+)/g, '([^/]+)');
      const regex = new RegExp(`^${pattern}$`);

      if (regex.test(path)) {
        return route;
      }
    }

    return null;
  }

  private extractParams(routePath: string, actualPath: string): Record<string, string> {
    const params: Record<string, string> = {};
    const routeParts = routePath.split('/');
    const actualParts = actualPath.split('/');

    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        const paramName = routeParts[i].substring(1);
        params[paramName] = actualParts[i];
      }
    }

    return params;
  }

  private async parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      const maxSize = 1024 * 1024; // Fix BUG-006: 1MB limit to prevent DoS
      let size = 0;

      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxSize) {
          req.destroy();
          reject(new Error('Request body too large'));
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('Invalid JSON'));
        }
      });

      req.on('error', reject);
    });
  }

  // Fix CRIT-002: CORS origin validation with whitelist support
  private setCorsHeaders(res: ServerResponse, req: IncomingMessage): void {
    const origin = req?.headers?.origin;

    // If corsOrigins is configured as an array, validate against whitelist
    if (Array.isArray(this.corsOrigins) && this.corsOrigins.length > 0) {
      if (origin && this.corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      } else if (!origin) {
        // No origin header (same-origin requests, curl, etc.) - allow but don't set header
      } else {
        // Origin not in whitelist - don't set CORS headers (browser will block)
        this.logger.debug('CORS: Blocked origin not in whitelist', { origin });
      }
    } else {
      // No whitelist configured (dev mode) - allow all origins with warning
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      if (origin) {
        res.setHeader('Vary', 'Origin');
      }
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  private checkRateLimit(req: IncomingMessage): boolean {
    // Fix CRIT-001: Get client IP properly, considering proxies
    const ip = this.getClientIP(req);
    const now = Date.now();
    const windowStart = now - this.rateLimitOptions.windowMs;

    if (!this.rateLimiter.has(ip)) {
      this.rateLimiter.set(ip, []);
    }

    const requests = this.rateLimiter.get(ip)!;
    const recentRequests = requests.filter(time => time > windowStart);

    if (recentRequests.length >= this.rateLimitOptions.max) {
      return false;
    }

    recentRequests.push(now);
    this.rateLimiter.set(ip, recentRequests);

    return true;
  }

  // Fix CRIT-001: Properly extract client IP considering trusted proxies
  private getClientIP(req: IncomingMessage): string {
    // If trustProxy is enabled, check X-Forwarded-For header
    if (this.trustProxy) {
      const forwardedFor = req.headers['x-forwarded-for'];
      if (forwardedFor) {
        // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2
        // The first IP is the original client
        const ips = (typeof forwardedFor === 'string' ? forwardedFor : forwardedFor[0]).split(',').map(ip => ip.trim());
        // Validate it looks like an IP address (basic check)
        const clientIP = ips[0];
        if (clientIP && /^[\d.:a-fA-F]+$/.test(clientIP)) {
          return clientIP;
        }
      }

      // Also check X-Real-IP header (used by nginx)
      const realIP = req.headers['x-real-ip'];
      if (realIP && typeof realIP === 'string' && /^[\d.:a-fA-F]+$/.test(realIP)) {
        return realIP;
      }
    }

    // Fallback to socket remote address
    return req.socket.remoteAddress || 'unknown';
  }

  // Fix BUG-022: Periodic cleanup of old rate limiter entries
  private startRateLimiterCleanup(): void {
    this.rateLimiterCleanupInterval = setInterval(() => {
      const now = Date.now();
      const windowStart = now - this.rateLimitOptions.windowMs;

      for (const [ip, requests] of this.rateLimiter.entries()) {
        const recentRequests = requests.filter(time => time > windowStart);
        if (recentRequests.length === 0) {
          this.rateLimiter.delete(ip);
        } else {
          this.rateLimiter.set(ip, recentRequests);
        }
      }
    }, this.rateLimitOptions.windowMs);
  }

  // Helper method to check if request has admin privileges
  private isAdminRequest(req: IncomingMessage): boolean {
    const apiKey = req.headers['x-api-key'];
    return this.adminKeys.size > 0 && this.adminKeys.has(apiKey as string);
  }

  private sendResponse(res: ServerResponse, data: any, statusCode = 200): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private sendError(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }

  private async handleHealth(context: RouteContext): Promise<void> {
    const health = this.gamificationKit.getHealth();
    this.sendResponse(context.res, health);
  }

  private async handleLiveness(context: RouteContext): Promise<void> {
    try {
      const liveness = await this.gamificationKit.getLiveness();
      const statusCode = liveness.status === 'alive' ? 200 : 503;
      context.res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      context.res.end(JSON.stringify(liveness));
    } catch (error) {
      this.sendError(context.res, 503, 'Liveness check failed');
    }
  }

  private async handleReadiness(context: RouteContext): Promise<void> {
    try {
      const readiness = await this.gamificationKit.getReadiness();
      const statusCode = readiness.status === 'ready' ? 200 : 503;
      context.res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      context.res.end(JSON.stringify(readiness));
    } catch (error) {
      this.sendError(context.res, 503, 'Readiness check failed');
    }
  }

  private async handleDetailedHealth(context: RouteContext): Promise<void> {
    try {
      const detailed = await this.gamificationKit.getDetailedHealth();
      const statusCode = detailed.status === 'healthy' ? 200 :
                        detailed.status === 'degraded' ? 200 : 503;
      context.res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      context.res.end(JSON.stringify(detailed));
    } catch (error) {
      this.sendError(context.res, 503, 'Health check failed');
    }
  }

  private async handleMetrics(context: RouteContext): Promise<void> {
    const metrics = this.gamificationKit.getMetrics();
    this.sendResponse(context.res, metrics || { message: 'Metrics not enabled' });
  }

  private async handleGetUser(context: RouteContext): Promise<void> {
    try {
      const { userId } = context.params;
      const stats = await this.gamificationKit.getUserStats(userId);
      this.sendResponse(context.res, stats);
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleGetUserPoints(context: RouteContext): Promise<void> {
    try {
      const { userId } = context.params;
      const module = this.gamificationKit.modules.get('points');

      if (!module) {
        this.sendError(context.res, 404, 'Points module not found');
        return;
      }

      const points = await (module as any).getPoints(userId);
      this.sendResponse(context.res, { userId, points });
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleGetUserBadges(context: RouteContext): Promise<void> {
    try {
      const { userId } = context.params;
      const module = this.gamificationKit.modules.get('badges');

      if (!module) {
        this.sendError(context.res, 404, 'Badge module not found');
        return;
      }

      const badges = await (module as any).getUserBadges(userId);
      this.sendResponse(context.res, { userId, badges });
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleGetUserLevel(context: RouteContext): Promise<void> {
    try {
      const { userId } = context.params;
      const module = this.gamificationKit.modules.get('levels');

      if (!module) {
        this.sendError(context.res, 404, 'Level module not found');
        return;
      }

      const level = await (module as any).getUserLevel(userId);
      this.sendResponse(context.res, { userId, level });
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleGetUserStreaks(context: RouteContext): Promise<void> {
    try {
      const { userId } = context.params;
      const module = this.gamificationKit.modules.get('streaks');

      if (!module) {
        this.sendError(context.res, 404, 'Streak module not found');
        return;
      }

      const streaks = await (module as any).getUserStreaks(userId);
      this.sendResponse(context.res, { userId, streaks });
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleGetUserQuests(context: RouteContext): Promise<void> {
    try {
      const { userId } = context.params;
      const module = this.gamificationKit.modules.get('quests');

      if (!module) {
        this.sendError(context.res, 404, 'Quest module not found');
        return;
      }

      const quests = await (module as any).getUserQuests(userId);
      this.sendResponse(context.res, { userId, quests });
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleGetUserHistory(context: RouteContext): Promise<void> {
    try {
      const { userId } = context.params;
      const { limit = '100' } = context.query;

      const history = await this.gamificationKit.storage.get(`history:${userId}`) || [];
      const limitedHistory = history.slice(-parseInt(limit));

      this.sendResponse(context.res, { userId, history: limitedHistory });
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleGetLeaderboard(context: RouteContext): Promise<void> {
    try {
      const { type } = context.params;
      const { page = '1', limit = '100' } = context.query;
      const module = this.gamificationKit.modules.get('leaderboards');

      if (!module) {
        this.sendError(context.res, 404, 'Leaderboard module not found');
        return;
      }

      const leaderboard = await (module as any).getLeaderboard(type, {
        page: parseInt(page),
        limit: parseInt(limit)
      });

      this.sendResponse(context.res, leaderboard);
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleGetUserPosition(context: RouteContext): Promise<void> {
    try {
      const { type, userId } = context.params;
      const module = this.gamificationKit.modules.get('leaderboards');

      if (!module) {
        this.sendError(context.res, 404, 'Leaderboard module not found');
        return;
      }

      const position = await (module as any).getUserPosition(type, userId);
      this.sendResponse(context.res, { userId, type, position });
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleGetBadges(context: RouteContext): Promise<void> {
    try {
      const module = this.gamificationKit.modules.get('badges');

      if (!module) {
        this.sendError(context.res, 404, 'Badge module not found');
        return;
      }

      const badges = await (module as any).getAllBadges();
      this.sendResponse(context.res, { badges });
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleGetLevels(context: RouteContext): Promise<void> {
    try {
      const module = this.gamificationKit.modules.get('levels');

      if (!module) {
        this.sendError(context.res, 404, 'Level module not found');
        return;
      }

      const levels = await (module as any).getLevelStructure();
      this.sendResponse(context.res, { levels });
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleGetQuests(context: RouteContext): Promise<void> {
    try {
      const module = this.gamificationKit.modules.get('quests');

      if (!module) {
        this.sendError(context.res, 404, 'Quest module not found');
        return;
      }

      const quests = await (module as any).getAllQuests();
      this.sendResponse(context.res, { quests });
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleTrackEvent(context: RouteContext): Promise<void> {
    try {
      if (!context.body) {
        this.sendError(context.res, 400, 'Invalid request body');
        return;
      }

      const { eventName, ...data } = context.body;

      if (!eventName) {
        this.sendError(context.res, 400, 'eventName is required');
        return;
      }

      const result = await this.gamificationKit.track(eventName, data);
      this.sendResponse(context.res, result);
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleResetUser(context: RouteContext): Promise<void> {
    try {
      // Fix BUG-003: Require admin authorization for user reset
      if (!this.isAdminRequest(context.req)) {
        this.sendError(context.res, 403, 'Admin access required');
        return;
      }

      const { userId } = context.params;

      // Log admin action for audit trail
      const apiKey = context.req.headers['x-api-key'];
      this.logger.warn(`Admin action: User reset requested`, { userId, apiKey: apiKey ? (apiKey as string).substring(0, 8) + '...' : 'none' });

      const result = await this.gamificationKit.resetUser(userId);
      this.sendResponse(context.res, result);
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private async handleManualAward(context: RouteContext): Promise<void> {
    try {
      // Fix BUG-004: Require admin authorization for manual awards
      if (!this.isAdminRequest(context.req)) {
        this.sendError(context.res, 403, 'Admin access required');
        return;
      }

      if (!context.body) {
        this.sendError(context.res, 400, 'Invalid request body');
        return;
      }

      const { userId, type, value, reason } = context.body;

      if (!userId || !type || value === undefined) {
        this.sendError(context.res, 400, 'userId, type, and value are required');
        return;
      }

      // Fix BUG-019: Validate value is positive
      if (typeof value === 'number' && value <= 0) {
        this.sendError(context.res, 400, 'value must be greater than 0');
        return;
      }

      // Log admin action for audit trail
      const apiKey = context.req.headers['x-api-key'];
      this.logger.warn(`Admin action: Manual award`, { userId, type, value, reason, apiKey: apiKey ? (apiKey as string).substring(0, 8) + '...' : 'none' });

      let result;

      switch (type) {
        case 'points':
          const pointsModule = this.gamificationKit.modules.get('points');
          if (pointsModule) {
            result = await (pointsModule as any).award(userId, value, reason);
          }
          break;

        case 'badge':
          const badgeModule = this.gamificationKit.modules.get('badges');
          if (badgeModule) {
            result = await (badgeModule as any).award(userId, value);
          }
          break;

        case 'xp':
          const levelModule = this.gamificationKit.modules.get('levels');
          if (levelModule) {
            result = await (levelModule as any).addXP(userId, value, reason);
          }
          break;

        default:
          this.sendError(context.res, 400, `Unknown award type: ${type}`);
          return;
      }

      if (!result) {
        this.sendError(context.res, 404, `Module not found for type: ${type}`);
        return;
      }

      this.sendResponse(context.res, { success: true, result });
    } catch (error: any) {
      this.sendError(context.res, 400, error.message);
    }
  }

  private handleWebSocketUpgrade(request: IncomingMessage, socket: Socket, head: Buffer): void {
    const url = new URL(request.url || '', `http://${request.headers.host}`);

    if (url.pathname !== `${this.prefix}/ws`) {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }

    this.acceptWebSocket(request, socket, head);
  }

  private acceptWebSocket(request: IncomingMessage, socket: Socket, _head: Buffer): void {
    const key = request.headers['sec-websocket-key'];
    const acceptKey = this.generateAcceptKey(key as string);

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
      '\r\n'
    );

    const ws: WebSocketClient = {
      socket,
      send: (data: any) => this.sendWebSocketMessage(socket, data),
      close: () => socket.end()
    };

    this.websocketClients.add(ws);

    socket.on('close', () => {
      this.websocketClients.delete(ws);
    });

    socket.on('error', (error: Error) => {
      this.logger.error('WebSocket error', { error });
      this.websocketClients.delete(ws);
    });

    // Fix: Only register the wildcard listener once to prevent memory leak
    if (this.gamificationKit.eventManager && !this.websocketBroadcastListenerRegistered) {
      this.websocketBroadcastListenerRegistered = true;
      this.gamificationKit.eventManager.onWildcard('*', (event: any) => {
        this.broadcastToWebSockets(event);
      });
    }
  }

  private generateAcceptKey(key: string): string {
    const WEBSOCKET_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return crypto
      .createHash('sha1')
      .update(key + WEBSOCKET_MAGIC_STRING)
      .digest('base64');
  }

  private sendWebSocketMessage(socket: Socket, data: any): void {
    const message = JSON.stringify(data);
    const length = Buffer.byteLength(message);

    let frame: Buffer;
    if (length < 126) {
      frame = Buffer.allocUnsafe(2);
      frame[0] = 0x81;
      frame[1] = length;
    } else if (length < 65536) {
      frame = Buffer.allocUnsafe(4);
      frame[0] = 0x81;
      frame[1] = 126;
      frame.writeUInt16BE(length, 2);
    } else {
      frame = Buffer.allocUnsafe(10);
      frame[0] = 0x81;
      frame[1] = 127;
      frame.writeBigUInt64BE(BigInt(length), 2);
    }

    socket.write(frame);
    socket.write(message);
  }

  private broadcastToWebSockets(data: any): void {
    for (const ws of this.websocketClients) {
      try {
        ws.send(data);
      } catch (error: any) {
        this.logger.error('Failed to send WebSocket message', { error });
      }
    }
  }
}
