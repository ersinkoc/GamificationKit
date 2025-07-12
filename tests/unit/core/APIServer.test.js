import { jest } from '@jest/globals';
import { APIServer } from '../../../src/core/APIServer.js';
import { GamificationKit } from '../../../src/core/GamificationKit.js';
import http from 'http';
import { EventEmitter } from 'events';

describe('APIServer', () => {
  let apiServer;
  let mockGamificationKit;
  let mockServer;
  let mockSocket;

  beforeEach(() => {
    mockGamificationKit = {
      getHealth: jest.fn().mockReturnValue({ status: 'healthy' }),
      getMetrics: jest.fn().mockReturnValue({ events: 100 }),
      getUserStats: jest.fn().mockResolvedValue({ points: 100, badges: ['badge1'] }),
      track: jest.fn().mockResolvedValue({ success: true }),
      resetUser: jest.fn().mockResolvedValue({ success: true }),
      storage: {
        get: jest.fn().mockResolvedValue([])
      },
      eventManager: {
        ...new EventEmitter(),
        onWildcard: jest.fn()
      },
      modules: new Map()
    };

    mockServer = {
      listen: jest.fn((port, cb) => cb()),
      close: jest.fn((cb) => cb()),
      on: jest.fn()
    };

    mockSocket = {
      remoteAddress: '127.0.0.1',
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn()
    };

    // Re-create the http.createServer mock for each test
    jest.spyOn(http, 'createServer').mockReturnValue(mockServer);

    apiServer = new APIServer({
      gamificationKit: mockGamificationKit,
      port: 3001,
      apiKey: 'test-api-key'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const server = new APIServer({ gamificationKit: mockGamificationKit });
      expect(server.port).toBe(3001);
      expect(server.prefix).toBe('/gamification');
      expect(server.corsEnabled).toBe(true);
      expect(server.apiKey).toBeUndefined();
    });

    it('should initialize with custom options', () => {
      const server = new APIServer({
        gamificationKit: mockGamificationKit,
        port: 4000,
        prefix: '/api',
        cors: false,
        apiKey: 'custom-key',
        rateLimit: { windowMs: 30000, max: 50 }
      });
      expect(server.port).toBe(4000);
      expect(server.prefix).toBe('/api');
      expect(server.corsEnabled).toBe(false);
      expect(server.apiKey).toBe('custom-key');
      expect(server.rateLimitOptions).toEqual({ windowMs: 30000, max: 50 });
    });

    it('should setup all routes', () => {
      expect(apiServer.routes.size).toBeGreaterThan(0);
      expect(apiServer.routes.has('GET:/health')).toBe(true);
      expect(apiServer.routes.has('POST:/events')).toBe(true);
    });
  });

  describe('start', () => {
    it('should start the server successfully', async () => {
      await apiServer.start();
      expect(http.createServer).toHaveBeenCalled();
      expect(mockServer.listen).toHaveBeenCalledWith(3001, expect.any(Function));
      expect(mockServer.on).toHaveBeenCalledWith('upgrade', expect.any(Function));
    });

    it('should handle server start error', async () => {
      mockServer.listen.mockImplementation((port, cb) => cb(new Error('Port in use')));
      await expect(apiServer.start()).rejects.toThrow('Port in use');
    });
  });

  describe('stop', () => {
    it('should stop the server', async () => {
      await apiServer.start();
      await apiServer.stop();
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should close all websocket clients', async () => {
      await apiServer.start();
      const mockWs = { close: jest.fn() };
      apiServer.websocketClients.add(mockWs);
      await apiServer.stop();
      expect(mockWs.close).toHaveBeenCalled();
      expect(apiServer.websocketClients.size).toBe(0);
    });

    it('should handle stop when server is not started', async () => {
      apiServer.server = null;
      await expect(apiServer.stop()).resolves.toBeUndefined();
    });
  });

  describe('handleRequest', () => {
    let mockReq, mockRes;

    beforeEach(() => {
      mockReq = {
        method: 'GET',
        url: '/gamification/health',
        headers: {
          host: 'localhost:3001',
          'x-api-key': 'test-api-key'
        },
        socket: mockSocket,
        on: jest.fn()
      };

      mockRes = {
        writeHead: jest.fn(),
        end: jest.fn(),
        setHeader: jest.fn()
      };
    });

    it('should handle OPTIONS request for CORS', async () => {
      mockReq.method = 'OPTIONS';
      await apiServer.handleRequest(mockReq, mockRes);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(mockRes.writeHead).toHaveBeenCalledWith(204);
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should reject request without API key', async () => {
      delete mockReq.headers['x-api-key'];
      await apiServer.handleRequest(mockReq, mockRes);
      expect(mockRes.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Unauthorized' }));
    });

    it('should reject request when rate limited', async () => {
      apiServer.rateLimitOptions.max = 1;
      await apiServer.handleRequest(mockReq, mockRes);
      await apiServer.handleRequest(mockReq, mockRes);
      expect(mockRes.writeHead).toHaveBeenLastCalledWith(429, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenLastCalledWith(JSON.stringify({ error: 'Too Many Requests' }));
    });

    it('should handle 404 for non-existent routes', async () => {
      mockReq.url = '/gamification/nonexistent';
      await apiServer.handleRequest(mockReq, mockRes);
      expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'application/json' });
    });

    it('should handle health endpoint', async () => {
      await apiServer.handleRequest(mockReq, mockRes);
      expect(mockGamificationKit.getHealth).toHaveBeenCalled();
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ status: 'healthy' }));
    });

    it('should handle request with body', async () => {
      mockReq.method = 'POST';
      mockReq.url = '/gamification/events';
      mockReq.on.mockImplementation((event, cb) => {
        if (event === 'data') cb(Buffer.from('{"eventName":"test"}'));
        if (event === 'end') cb();
      });

      await apiServer.handleRequest(mockReq, mockRes);
      expect(mockGamificationKit.track).toHaveBeenCalledWith('test', {});
    });

    it('should handle errors gracefully', async () => {
      mockGamificationKit.getHealth.mockImplementation(() => {
        throw new Error('Internal error');
      });
      await apiServer.handleRequest(mockReq, mockRes);
      expect(mockRes.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Internal Server Error' }));
    });
  });

  describe('route handling', () => {
    it('should find correct route with params', () => {
      const route = apiServer.findRoute('GET', '/users/123');
      expect(route).toBeDefined();
      expect(route.path).toBe('/users/:userId');
    });

    it('should extract params correctly', () => {
      const params = apiServer.extractParams('/users/:userId/badges', '/users/123/badges');
      expect(params).toEqual({ userId: '123' });
    });

    it('should extract multiple params', () => {
      const params = apiServer.extractParams('/leaderboards/:type/user/:userId', '/leaderboards/points/user/456');
      expect(params).toEqual({ type: 'points', userId: '456' });
    });
  });

  describe('API endpoints', () => {
    let context;

    beforeEach(() => {
      context = {
        req: {},
        res: {
          writeHead: jest.fn(),
          end: jest.fn()
        },
        params: {},
        query: {},
        body: null
      };
    });

    describe('metrics endpoint', () => {
      it('should return metrics when enabled', async () => {
        await apiServer.handleMetrics(context);
        expect(mockGamificationKit.getMetrics).toHaveBeenCalled();
        expect(context.res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({ events: 100 }));
      });

      it('should return message when metrics not enabled', async () => {
        mockGamificationKit.getMetrics.mockReturnValue(null);
        await apiServer.handleMetrics(context);
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({ message: 'Metrics not enabled' }));
      });
    });

    describe('user endpoints', () => {
      beforeEach(() => {
        context.params.userId = 'user123';
      });

      it('should get user stats', async () => {
        await apiServer.handleGetUser(context);
        expect(mockGamificationKit.getUserStats).toHaveBeenCalledWith('user123');
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({ points: 100, badges: ['badge1'] }));
      });

      it('should handle user stats error', async () => {
        mockGamificationKit.getUserStats.mockRejectedValue(new Error('User not found'));
        await apiServer.handleGetUser(context);
        expect(context.res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'User not found' }));
      });

      it('should get user points when module exists', async () => {
        const mockPointsModule = {
          getPoints: jest.fn().mockResolvedValue(150)
        };
        mockGamificationKit.modules.set('points', mockPointsModule);

        await apiServer.handleGetUserPoints(context);
        expect(mockPointsModule.getPoints).toHaveBeenCalledWith('user123');
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({ userId: 'user123', points: 150 }));
      });

      it('should return 404 when points module not found', async () => {
        await apiServer.handleGetUserPoints(context);
        expect(context.res.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'application/json' });
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Points module not found' }));
      });

      it('should get user history with limit', async () => {
        const mockHistory = Array.from({ length: 200 }, (_, i) => ({ event: `event${i}` }));
        mockGamificationKit.storage.get.mockResolvedValue(mockHistory);
        context.query.limit = '50';

        await apiServer.handleGetUserHistory(context);
        expect(mockGamificationKit.storage.get).toHaveBeenCalledWith('history:user123');
        const response = JSON.parse(context.res.end.mock.calls[0][0]);
        expect(response.history).toHaveLength(50);
        expect(response.history[0]).toEqual({ event: 'event150' });
      });
    });

    describe('leaderboard endpoints', () => {
      it('should get leaderboard with pagination', async () => {
        const mockLeaderboardModule = {
          getLeaderboard: jest.fn().mockResolvedValue({ entries: [], page: 2, total: 100 })
        };
        mockGamificationKit.modules.set('leaderboards', mockLeaderboardModule);

        context.params.type = 'points';
        context.query = { page: '2', limit: '50' };

        await apiServer.handleGetLeaderboard(context);
        expect(mockLeaderboardModule.getLeaderboard).toHaveBeenCalledWith('points', {
          page: 2,
          limit: 50
        });
      });

      it('should get user position in leaderboard', async () => {
        const mockLeaderboardModule = {
          getUserPosition: jest.fn().mockResolvedValue(5)
        };
        mockGamificationKit.modules.set('leaderboards', mockLeaderboardModule);

        context.params = { type: 'points', userId: 'user123' };

        await apiServer.handleGetUserPosition(context);
        expect(mockLeaderboardModule.getUserPosition).toHaveBeenCalledWith('points', 'user123');
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({
          userId: 'user123',
          type: 'points',
          position: 5
        }));
      });
    });

    describe('track event endpoint', () => {
      it('should track event successfully', async () => {
        context.body = { eventName: 'user.login', userId: 'user123' };
        await apiServer.handleTrackEvent(context);
        expect(mockGamificationKit.track).toHaveBeenCalledWith('user.login', { userId: 'user123' });
      });

      it('should require eventName', async () => {
        context.body = { userId: 'user123' };
        await apiServer.handleTrackEvent(context);
        expect(context.res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'eventName is required' }));
      });

      it('should handle invalid body', async () => {
        context.body = null;
        await apiServer.handleTrackEvent(context);
        expect(context.res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Invalid request body' }));
      });
    });

    describe('admin endpoints', () => {
      it('should reset user', async () => {
        context.params.userId = 'user123';
        await apiServer.handleResetUser(context);
        expect(mockGamificationKit.resetUser).toHaveBeenCalledWith('user123');
      });

      it('should handle manual award for points', async () => {
        const mockPointsModule = {
          award: jest.fn().mockResolvedValue({ points: 250 })
        };
        mockGamificationKit.modules.set('points', mockPointsModule);

        context.body = {
          userId: 'user123',
          type: 'points',
          value: 100,
          reason: 'Manual bonus'
        };

        await apiServer.handleManualAward(context);
        expect(mockPointsModule.award).toHaveBeenCalledWith('user123', 100, 'Manual bonus');
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({
          success: true,
          result: { points: 250 }
        }));
      });

      it('should handle manual award for badges', async () => {
        const mockBadgeModule = {
          award: jest.fn().mockResolvedValue({ badgeId: 'special-badge' })
        };
        mockGamificationKit.modules.set('badges', mockBadgeModule);

        context.body = {
          userId: 'user123',
          type: 'badge',
          value: 'special-badge'
        };

        await apiServer.handleManualAward(context);
        expect(mockBadgeModule.award).toHaveBeenCalledWith('user123', 'special-badge');
      });

      it('should handle manual award for xp', async () => {
        const mockLevelModule = {
          addXP: jest.fn().mockResolvedValue({ level: 5, xp: 500 })
        };
        mockGamificationKit.modules.set('levels', mockLevelModule);

        context.body = {
          userId: 'user123',
          type: 'xp',
          value: 50,
          reason: 'Quest completion'
        };

        await apiServer.handleManualAward(context);
        expect(mockLevelModule.addXP).toHaveBeenCalledWith('user123', 50, 'Quest completion');
      });

      it('should reject unknown award type', async () => {
        context.body = {
          userId: 'user123',
          type: 'unknown',
          value: 100
        };

        await apiServer.handleManualAward(context);
        expect(context.res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Unknown award type: unknown' }));
      });

      it('should require all fields for manual award', async () => {
        context.body = {
          userId: 'user123',
          type: 'points'
        };

        await apiServer.handleManualAward(context);
        expect(context.res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
        expect(context.res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'userId, type, and value are required' }));
      });
    });
  });

  describe('WebSocket handling', () => {
    it('should reject WebSocket upgrade for wrong path', () => {
      const mockRequest = {
        url: '/wrong/path',
        headers: { host: 'localhost:3001' }
      };
      
      apiServer.handleWebSocketUpgrade(mockRequest, mockSocket, null);
      expect(mockSocket.end).toHaveBeenCalledWith('HTTP/1.1 404 Not Found\r\n\r\n');
    });

    it('should accept WebSocket upgrade for correct path', () => {
      const mockRequest = {
        url: '/gamification/ws',
        headers: {
          host: 'localhost:3001',
          'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ=='
        }
      };
      
      apiServer.handleWebSocketUpgrade(mockRequest, mockSocket, null);
      expect(mockSocket.write).toHaveBeenCalledWith(expect.stringContaining('HTTP/1.1 101 Switching Protocols'));
      expect(apiServer.websocketClients.size).toBe(1);
    });

    it('should generate correct WebSocket accept key', () => {
      const testKey = 'dGhlIHNhbXBsZSBub25jZQ==';
      const acceptKey = apiServer.generateAcceptKey(testKey);
      expect(acceptKey).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
    });

    it('should broadcast events to WebSocket clients', () => {
      const mockWs = {
        send: jest.fn(),
        close: jest.fn()
      };
      apiServer.websocketClients.add(mockWs);

      apiServer.broadcastToWebSockets({ event: 'test', data: 'value' });
      expect(mockWs.send).toHaveBeenCalledWith({ event: 'test', data: 'value' });
    });

    it('should handle WebSocket send errors', () => {
      const mockWs = {
        send: jest.fn().mockImplementation(() => {
          throw new Error('Connection closed');
        })
      };
      apiServer.websocketClients.add(mockWs);

      expect(() => apiServer.broadcastToWebSockets({ event: 'test' })).not.toThrow();
    });

    it('should send WebSocket message with correct framing', () => {
      const testData = { test: 'message' };
      apiServer.sendWebSocketMessage(mockSocket, testData);
      
      expect(mockSocket.write).toHaveBeenCalledTimes(2);
      const frameCall = mockSocket.write.mock.calls[0][0];
      expect(frameCall[0]).toBe(0x81);
    });

    it('should handle different WebSocket message sizes', () => {
      const smallMessage = { a: 'b' };
      apiServer.sendWebSocketMessage(mockSocket, smallMessage);
      
      const largeMessage = { data: 'x'.repeat(200) };
      apiServer.sendWebSocketMessage(mockSocket, largeMessage);
      
      const veryLargeMessage = { data: 'x'.repeat(70000) };
      apiServer.sendWebSocketMessage(mockSocket, veryLargeMessage);
      
      expect(mockSocket.write).toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    it('should track requests per IP', () => {
      const req = { socket: { remoteAddress: '192.168.1.1' } };
      
      expect(apiServer.checkRateLimit(req)).toBe(true);
      expect(apiServer.rateLimiter.has('192.168.1.1')).toBe(true);
    });

    it('should enforce rate limit window', () => {
      const req = { socket: { remoteAddress: '192.168.1.2' } };
      apiServer.rateLimitOptions = { windowMs: 100, max: 2 };
      
      expect(apiServer.checkRateLimit(req)).toBe(true);
      expect(apiServer.checkRateLimit(req)).toBe(true);
      expect(apiServer.checkRateLimit(req)).toBe(false);
    });

    it('should reset rate limit after window', async () => {
      const req = { socket: { remoteAddress: '192.168.1.3' } };
      apiServer.rateLimitOptions = { windowMs: 50, max: 1 };
      
      expect(apiServer.checkRateLimit(req)).toBe(true);
      expect(apiServer.checkRateLimit(req)).toBe(false);
      
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(apiServer.checkRateLimit(req)).toBe(true);
    });
  });

  describe('CORS handling', () => {
    it('should set CORS headers when enabled', () => {
      const mockRes = {
        setHeader: jest.fn()
      };
      
      apiServer.setCorsHeaders(mockRes);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Max-Age', '86400');
    });

    it('should not set CORS headers when disabled', async () => {
      apiServer.corsEnabled = false;
      const mockReq = {
        method: 'GET',
        url: '/gamification/health',
        headers: {
          host: 'localhost:3001',
          'x-api-key': 'test-api-key'
        },
        socket: mockSocket
      };
      const mockRes = {
        writeHead: jest.fn(),
        end: jest.fn(),
        setHeader: jest.fn()
      };

      await apiServer.handleRequest(mockReq, mockRes);
      expect(mockRes.setHeader).not.toHaveBeenCalled();
    });
  });

  describe('body parsing', () => {
    it('should parse valid JSON body', async () => {
      const mockReq = new EventEmitter();
      const bodyPromise = apiServer.parseBody(mockReq);
      
      mockReq.emit('data', Buffer.from('{"test":'));
      mockReq.emit('data', Buffer.from('"value"}'));
      mockReq.emit('end');
      
      const body = await bodyPromise;
      expect(body).toEqual({ test: 'value' });
    });

    it('should return null for invalid JSON', async () => {
      const mockReq = new EventEmitter();
      const bodyPromise = apiServer.parseBody(mockReq);
      
      mockReq.emit('data', Buffer.from('invalid json'));
      mockReq.emit('end');
      
      const body = await bodyPromise;
      expect(body).toBeNull();
    });

    it('should handle request errors', async () => {
      const mockReq = new EventEmitter();
      const bodyPromise = apiServer.parseBody(mockReq);
      
      mockReq.emit('error', new Error('Connection error'));
      
      await expect(bodyPromise).rejects.toThrow('Connection error');
    });
  });
});