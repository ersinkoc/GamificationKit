import http from 'http';
import crypto from 'crypto';
import { URL } from 'url';
import { Logger } from '../utils/logger.js';
import { validators } from '../utils/validators.js';

export class APIServer {
  constructor(options = {}) {
    this.logger = new Logger({ prefix: 'APIServer', ...options.logger });
    this.gamificationKit = options.gamificationKit;
    this.port = options.port || 3001;
    this.prefix = options.prefix || '/gamification';
    this.corsEnabled = options.cors !== false;
    this.apiKey = options.apiKey;
    this.server = null;
    this.routes = new Map();
    this.rateLimiter = new Map();
    this.rateLimitOptions = options.rateLimit || { windowMs: 60000, max: 100 };
    this.websocketClients = new Set();
    
    this.setupRoutes();
  }

  setupRoutes() {
    this.addRoute('GET', '/health', this.handleHealth.bind(this));
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

  addRoute(method, path, handler) {
    const routeKey = `${method}:${path}`;
    this.routes.set(routeKey, { method, path, handler });
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.handleRequest.bind(this));
      
      this.server.on('upgrade', this.handleWebSocketUpgrade.bind(this));
      
      this.server.listen(this.port, (error) => {
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

  async stop() {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
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

  async handleRequest(req, res) {
    try {
      if (this.corsEnabled) {
        this.setCorsHeaders(res);
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

      const url = new URL(req.url, `http://${req.headers.host}`);
      
      if (!url.pathname.startsWith(this.prefix)) {
        this.sendError(res, 404, 'Not Found');
        return;
      }

      const path = url.pathname.substring(this.prefix.length) || '/';
      const route = this.findRoute(req.method, path);

      if (!route) {
        this.sendError(res, 404, 'Route Not Found');
        return;
      }

      const params = this.extractParams(route.path, path);
      const query = Object.fromEntries(url.searchParams);
      
      let body = null;
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        body = await this.parseBody(req);
      }

      const context = {
        req,
        res,
        params,
        query,
        body,
        url
      };

      await route.handler(context);
    } catch (error) {
      this.logger.error('Request handler error', { error });
      this.sendError(res, 500, 'Internal Server Error');
    }
  }

  findRoute(method, path) {
    for (const [key, route] of this.routes) {
      if (route.method !== method) continue;
      
      const pattern = route.path.replace(/:(\w+)/g, '([^/]+)');
      const regex = new RegExp(`^${pattern}$`);
      
      if (regex.test(path)) {
        return route;
      }
    }
    
    return null;
  }

  extractParams(routePath, actualPath) {
    const params = {};
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

  async parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          resolve(null);
        }
      });
      
      req.on('error', reject);
    });
  }

  setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  checkRateLimit(req) {
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    const windowStart = now - this.rateLimitOptions.windowMs;

    if (!this.rateLimiter.has(ip)) {
      this.rateLimiter.set(ip, []);
    }

    const requests = this.rateLimiter.get(ip);
    const recentRequests = requests.filter(time => time > windowStart);
    
    if (recentRequests.length >= this.rateLimitOptions.max) {
      return false;
    }

    recentRequests.push(now);
    this.rateLimiter.set(ip, recentRequests);
    
    return true;
  }

  sendResponse(res, data, statusCode = 200) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  sendError(res, statusCode, message) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }

  async handleHealth(context) {
    const health = this.gamificationKit.getHealth();
    this.sendResponse(context.res, health);
  }

  async handleMetrics(context) {
    const metrics = this.gamificationKit.getMetrics();
    this.sendResponse(context.res, metrics || { message: 'Metrics not enabled' });
  }

  async handleGetUser(context) {
    try {
      const { userId } = context.params;
      const stats = await this.gamificationKit.getUserStats(userId);
      this.sendResponse(context.res, stats);
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleGetUserPoints(context) {
    try {
      const { userId } = context.params;
      const module = this.gamificationKit.modules.get('points');
      
      if (!module) {
        this.sendError(context.res, 404, 'Points module not found');
        return;
      }

      const points = await module.getPoints(userId);
      this.sendResponse(context.res, { userId, points });
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleGetUserBadges(context) {
    try {
      const { userId } = context.params;
      const module = this.gamificationKit.modules.get('badges');
      
      if (!module) {
        this.sendError(context.res, 404, 'Badge module not found');
        return;
      }

      const badges = await module.getUserBadges(userId);
      this.sendResponse(context.res, { userId, badges });
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleGetUserLevel(context) {
    try {
      const { userId } = context.params;
      const module = this.gamificationKit.modules.get('levels');
      
      if (!module) {
        this.sendError(context.res, 404, 'Level module not found');
        return;
      }

      const level = await module.getUserLevel(userId);
      this.sendResponse(context.res, { userId, level });
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleGetUserStreaks(context) {
    try {
      const { userId } = context.params;
      const module = this.gamificationKit.modules.get('streaks');
      
      if (!module) {
        this.sendError(context.res, 404, 'Streak module not found');
        return;
      }

      const streaks = await module.getUserStreaks(userId);
      this.sendResponse(context.res, { userId, streaks });
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleGetUserQuests(context) {
    try {
      const { userId } = context.params;
      const module = this.gamificationKit.modules.get('quests');
      
      if (!module) {
        this.sendError(context.res, 404, 'Quest module not found');
        return;
      }

      const quests = await module.getUserQuests(userId);
      this.sendResponse(context.res, { userId, quests });
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleGetUserHistory(context) {
    try {
      const { userId } = context.params;
      const { limit = 100 } = context.query;
      
      const history = await this.gamificationKit.storage.get(`history:${userId}`) || [];
      const limitedHistory = history.slice(-parseInt(limit));
      
      this.sendResponse(context.res, { userId, history: limitedHistory });
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleGetLeaderboard(context) {
    try {
      const { type } = context.params;
      const { page = 1, limit = 100 } = context.query;
      const module = this.gamificationKit.modules.get('leaderboards');
      
      if (!module) {
        this.sendError(context.res, 404, 'Leaderboard module not found');
        return;
      }

      const leaderboard = await module.getLeaderboard(type, {
        page: parseInt(page),
        limit: parseInt(limit)
      });
      
      this.sendResponse(context.res, leaderboard);
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleGetUserPosition(context) {
    try {
      const { type, userId } = context.params;
      const module = this.gamificationKit.modules.get('leaderboards');
      
      if (!module) {
        this.sendError(context.res, 404, 'Leaderboard module not found');
        return;
      }

      const position = await module.getUserPosition(type, userId);
      this.sendResponse(context.res, { userId, type, position });
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleGetBadges(context) {
    try {
      const module = this.gamificationKit.modules.get('badges');
      
      if (!module) {
        this.sendError(context.res, 404, 'Badge module not found');
        return;
      }

      const badges = await module.getAllBadges();
      this.sendResponse(context.res, { badges });
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleGetLevels(context) {
    try {
      const module = this.gamificationKit.modules.get('levels');
      
      if (!module) {
        this.sendError(context.res, 404, 'Level module not found');
        return;
      }

      const levels = await module.getLevelStructure();
      this.sendResponse(context.res, { levels });
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleGetQuests(context) {
    try {
      const module = this.gamificationKit.modules.get('quests');
      
      if (!module) {
        this.sendError(context.res, 404, 'Quest module not found');
        return;
      }

      const quests = await module.getAllQuests();
      this.sendResponse(context.res, { quests });
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleTrackEvent(context) {
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
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleResetUser(context) {
    try {
      const { userId } = context.params;
      const result = await this.gamificationKit.resetUser(userId);
      this.sendResponse(context.res, result);
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  async handleManualAward(context) {
    try {
      if (!context.body) {
        this.sendError(context.res, 400, 'Invalid request body');
        return;
      }

      const { userId, type, value, reason } = context.body;
      
      if (!userId || !type || value === undefined) {
        this.sendError(context.res, 400, 'userId, type, and value are required');
        return;
      }

      let result;
      
      switch (type) {
        case 'points':
          const pointsModule = this.gamificationKit.modules.get('points');
          if (pointsModule) {
            result = await pointsModule.award(userId, value, reason);
          }
          break;
          
        case 'badge':
          const badgeModule = this.gamificationKit.modules.get('badges');
          if (badgeModule) {
            result = await badgeModule.award(userId, value);
          }
          break;
          
        case 'xp':
          const levelModule = this.gamificationKit.modules.get('levels');
          if (levelModule) {
            result = await levelModule.addXP(userId, value, reason);
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
    } catch (error) {
      this.sendError(context.res, 400, error.message);
    }
  }

  handleWebSocketUpgrade(request, socket, head) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    
    if (url.pathname !== `${this.prefix}/ws`) {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }

    this.acceptWebSocket(request, socket, head);
  }

  acceptWebSocket(request, socket, head) {
    const key = request.headers['sec-websocket-key'];
    const acceptKey = this.generateAcceptKey(key);
    
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
      '\r\n'
    );

    const ws = {
      socket,
      send: (data) => this.sendWebSocketMessage(socket, data),
      close: () => socket.end()
    };

    this.websocketClients.add(ws);
    
    socket.on('close', () => {
      this.websocketClients.delete(ws);
    });

    socket.on('error', (error) => {
      this.logger.error('WebSocket error', { error });
      this.websocketClients.delete(ws);
    });

    if (this.gamificationKit.eventManager) {
      this.gamificationKit.eventManager.onWildcard('*', (event) => {
        this.broadcastToWebSockets(event);
      });
    }
  }

  generateAcceptKey(key) {
    const WEBSOCKET_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return crypto
      .createHash('sha1')
      .update(key + WEBSOCKET_MAGIC_STRING)
      .digest('base64');
  }

  sendWebSocketMessage(socket, data) {
    const message = JSON.stringify(data);
    const length = Buffer.byteLength(message);
    
    let frame;
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

  broadcastToWebSockets(data) {
    for (const ws of this.websocketClients) {
      try {
        ws.send(data);
      } catch (error) {
        this.logger.error('Failed to send WebSocket message', { error });
      }
    }
  }
}