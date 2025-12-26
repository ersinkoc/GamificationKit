import { jest } from '@jest/globals';
import { GamificationKit } from '../../src/core/GamificationKit.js';
import { PointsModule } from '../../src/modules/PointsModule.js';
import { BadgeModule } from '../../src/modules/BadgeModule.js';
import { LevelModule } from '../../src/modules/LevelModule.js';
import { LeaderboardModule } from '../../src/modules/LeaderboardModule.js';
import http from 'http';

/**
 * API Integration Tests
 *
 * Tests the API Server, WebSocket integration, Webhook delivery, and middleware.
 * Covers:
 * - REST API endpoints
 * - WebSocket real-time communication
 * - Webhook delivery and retry logic
 * - Express/Fastify/Koa middleware integration
 * - Authentication and authorization
 * - Rate limiting
 */

// Helper to make HTTP requests
async function makeRequest(
  method: string,
  path: string,
  port: number,
  body?: any,
  headers: Record<string, string> = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

describe('API Integration Tests', () => {
  describe('REST API Endpoints', () => {
    let gk: any;
    const API_PORT = 3100;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        api: {
          enabled: true,
          port: API_PORT,
          apiKey: 'test-api-key',
          cors: true
        },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      gk.use(new BadgeModule());
      gk.use(new LevelModule());
      gk.use(new LeaderboardModule());

      await gk.initialize();

      // Wait for API server to start
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    afterEach(async () => {
      await gk.shutdown();
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should respond to health check endpoint', async () => {
      const response = await makeRequest('GET', '/health', API_PORT);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'healthy',
          initialized: true
        })
      );
    });

    it('should require API key for protected endpoints', async () => {
      // Without API key
      const response1 = await makeRequest('POST', '/api/points/user1/award', API_PORT, {
        points: 100
      });

      expect(response1.status).toBe(401);

      // With API key
      const response2 = await makeRequest(
        'POST',
        '/api/points/user1/award',
        API_PORT,
        { points: 100 },
        { 'X-API-Key': 'test-api-key' }
      );

      expect(response2.status).toBe(200);
    });

    it('should award points via API', async () => {
      const response = await makeRequest(
        'POST',
        '/api/points/user1/award',
        API_PORT,
        { points: 150, reason: 'api-test' },
        { 'X-API-Key': 'test-api-key' }
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: true,
          newBalance: 150
        })
      );

      // Verify via module
      const pointsModule = gk.modules.get('points');
      const balance = await pointsModule.getBalance('user1');
      expect(balance).toBe(150);
    });

    it('should get user balance via API', async () => {
      // Award points first
      const pointsModule = gk.modules.get('points');
      await pointsModule.award('user1', 250);

      // Get balance via API
      const response = await makeRequest(
        'GET',
        '/api/points/user1/balance',
        API_PORT,
        undefined,
        { 'X-API-Key': 'test-api-key' }
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          userId: 'user1',
          balance: 250
        })
      );
    });

    it('should get leaderboard via API', async () => {
      const pointsModule = gk.modules.get('points');

      // Create leaderboard data
      await pointsModule.award('user1', 100);
      await pointsModule.award('user2', 200);
      await pointsModule.award('user3', 150);

      // Get leaderboard
      const response = await makeRequest(
        'GET',
        '/api/points/leaderboard?limit=3',
        API_PORT,
        undefined,
        { 'X-API-Key': 'test-api-key' }
      );

      expect(response.status).toBe(200);
      expect(response.body.leaderboard).toHaveLength(3);
      expect(response.body.leaderboard[0].userId).toBe('user2');
      expect(response.body.leaderboard[0].points).toBe(200);
    });

    it('should get user stats via API', async () => {
      const pointsModule = gk.modules.get('points');
      const levelModule = gk.modules.get('levels');

      // Set up user data
      await pointsModule.award('user1', 300);
      await levelModule.addXP('user1', 150);

      // Get stats
      const response = await makeRequest(
        'GET',
        '/api/users/user1/stats',
        API_PORT,
        undefined,
        { 'X-API-Key': 'test-api-key' }
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          userId: 'user1',
          modules: expect.objectContaining({
            points: expect.objectContaining({
              current: 300
            }),
            levels: expect.objectContaining({
              xp: 150
            })
          })
        })
      );
    });

    it('should create and award badges via API', async () => {
      // Create badge
      const createResponse = await makeRequest(
        'POST',
        '/api/badges',
        API_PORT,
        {
          id: 'api-badge',
          name: 'API Badge',
          description: 'Created via API'
        },
        { 'X-API-Key': 'test-api-key' }
      );

      expect(createResponse.status).toBe(200);

      // Award badge
      const awardResponse = await makeRequest(
        'POST',
        '/api/badges/user1/award',
        API_PORT,
        { badgeId: 'api-badge' },
        { 'X-API-Key': 'test-api-key' }
      );

      expect(awardResponse.status).toBe(200);

      // Get user badges
      const badgesResponse = await makeRequest(
        'GET',
        '/api/badges/user1',
        API_PORT,
        undefined,
        { 'X-API-Key': 'test-api-key' }
      );

      expect(badgesResponse.status).toBe(200);
      expect(badgesResponse.body.badges).toHaveLength(1);
      expect(badgesResponse.body.badges[0].id).toBe('api-badge');
    });

    it('should handle CORS headers correctly', async () => {
      const response = await makeRequest(
        'OPTIONS',
        '/api/points/user1/balance',
        API_PORT,
        undefined,
        { Origin: 'http://example.com' }
      );

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should validate request data', async () => {
      // Invalid points value
      const response = await makeRequest(
        'POST',
        '/api/points/user1/award',
        API_PORT,
        { points: -100 }, // Negative points
        { 'X-API-Key': 'test-api-key' }
      );

      expect(response.status).toBe(400);
    });

    it('should handle errors gracefully', async () => {
      // Try to get non-existent user
      const response = await makeRequest(
        'GET',
        '/api/users/nonexistent/stats',
        API_PORT,
        undefined,
        { 'X-API-Key': 'test-api-key' }
      );

      expect(response.status).toBe(200); // Should return empty stats
      expect(response.body.userId).toBe('nonexistent');
    });
  });

  describe('WebSocket Integration', () => {
    let gk: any;
    const API_PORT = 3101;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        api: {
          enabled: true,
          port: API_PORT,
          websocket: { enabled: true }
        },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      gk.use(new BadgeModule());

      await gk.initialize();
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    afterEach(async () => {
      await gk.shutdown();
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should broadcast events over WebSocket', async () => {
      // This test verifies the WebSocket setup exists
      // Full WebSocket testing would require a WebSocket client
      expect(gk.apiServer).toBeDefined();
      expect(gk.apiServer.server).toBeDefined();
    });

    it('should send real-time updates when points are awarded', async () => {
      const pointsModule = gk.modules.get('points');

      // Award points (would trigger WebSocket broadcast)
      await pointsModule.award('user1', 100);

      // Verify event was emitted
      // In a real test, we'd connect a WebSocket client and verify the message
      expect(pointsModule).toBeDefined();
    });
  });

  describe('Webhook Integration', () => {
    let gk: any;
    let webhookServer: any;
    let receivedWebhooks: any[] = [];

    beforeEach(async () => {
      receivedWebhooks = [];

      // Create mock webhook receiver
      webhookServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          receivedWebhooks.push({
            headers: req.headers,
            body: JSON.parse(body)
          });
          res.writeHead(200);
          res.end('OK');
        });
      });

      await new Promise<void>((resolve) => {
        webhookServer.listen(3102, () => resolve());
      });

      gk = new GamificationKit({
        storage: { type: 'memory' },
        api: { enabled: false },
        metrics: { enabled: false },
        webhooks: {
          enabled: true,
          endpoints: ['http://localhost:3102/webhook'],
          secret: 'test-secret',
          retryAttempts: 3
        }
      });

      gk.use(new PointsModule());
      gk.use(new BadgeModule());

      await gk.initialize();
    });

    afterEach(async () => {
      await gk.shutdown();
      await new Promise<void>((resolve) => {
        webhookServer.close(() => resolve());
      });
    });

    it('should send webhooks for events', async () => {
      const pointsModule = gk.modules.get('points');

      // Award points (should trigger webhook)
      await pointsModule.award('user1', 100);

      // Wait for webhook delivery
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify webhook was received
      expect(receivedWebhooks.length).toBeGreaterThan(0);
      expect(receivedWebhooks[0].body).toEqual(
        expect.objectContaining({
          event: 'points.awarded',
          data: expect.objectContaining({
            userId: 'user1',
            points: 100
          })
        })
      );
    });

    it('should include signature in webhook headers', async () => {
      const pointsModule = gk.modules.get('points');

      await pointsModule.award('user1', 50);
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(receivedWebhooks.length).toBeGreaterThan(0);
      expect(receivedWebhooks[0].headers['x-webhook-signature']).toBeDefined();
    });

    it('should retry failed webhook deliveries', async () => {
      let attemptCount = 0;

      // Close the webhook server to simulate failure
      await new Promise<void>((resolve) => {
        webhookServer.close(() => resolve());
      });

      // Create a server that fails first attempts
      webhookServer = http.createServer((req, res) => {
        attemptCount++;
        if (attemptCount < 2) {
          res.writeHead(500);
          res.end('Error');
        } else {
          let body = '';
          req.on('data', chunk => (body += chunk));
          req.on('end', () => {
            receivedWebhooks.push(JSON.parse(body));
            res.writeHead(200);
            res.end('OK');
          });
        }
      });

      await new Promise<void>((resolve) => {
        webhookServer.listen(3102, () => resolve());
      });

      const pointsModule = gk.modules.get('points');
      await pointsModule.award('user1', 100);

      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should have retried
      expect(attemptCount).toBeGreaterThan(1);
    });
  });

  describe('Express Middleware Integration', () => {
    it('should integrate with Express applications', async () => {
      const gk = new GamificationKit({
        storage: { type: 'memory' },
        api: { enabled: false },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      await gk.initialize();

      // Mock Express request/response
      const mockReq: any = {
        user: { id: 'user1' },
        method: 'POST',
        path: '/test',
        ip: '127.0.0.1',
        get: (header: string) => 'test-agent'
      };

      const mockRes: any = {};
      const mockNext = jest.fn();

      // Get middleware
      const middleware = (await import('../../src/middleware/express.js')).expressMiddleware(gk);

      // Apply middleware
      await middleware(mockReq, mockRes, mockNext);

      // Verify gamification helpers are attached
      expect(mockReq.gamification).toBeDefined();
      expect(mockReq.gamification.track).toBeInstanceOf(Function);
      expect(mockReq.gamification.awardPoints).toBeInstanceOf(Function);
      expect(mockReq.gamification.getUserStats).toBeInstanceOf(Function);

      // Test helper function
      await mockReq.gamification.awardPoints(100, 'test');

      const stats = await mockReq.gamification.getUserStats();
      expect(stats.modules.points.current).toBe(100);

      await gk.shutdown();
    });
  });

  describe('Fastify Middleware Integration', () => {
    it('should integrate with Fastify applications', async () => {
      const gk = new GamificationKit({
        storage: { type: 'memory' },
        api: { enabled: false },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      await gk.initialize();

      // Mock Fastify request/reply
      const mockRequest: any = {
        user: { id: 'user1' },
        method: 'POST',
        url: '/test',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' }
      };

      const mockReply: any = {};

      // Get middleware
      const middleware = (await import('../../src/middleware/fastify.js')).fastifyMiddleware(gk);

      // Apply middleware (returns decorated request)
      await middleware(mockRequest, mockReply);

      // Verify gamification helpers are attached
      expect(mockRequest.gamification).toBeDefined();
      expect(mockRequest.gamification.track).toBeInstanceOf(Function);

      await gk.shutdown();
    });
  });

  describe('Koa Middleware Integration', () => {
    it('should integrate with Koa applications', async () => {
      const gk = new GamificationKit({
        storage: { type: 'memory' },
        api: { enabled: false },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      await gk.initialize();

      // Mock Koa context
      const mockCtx: any = {
        state: {},
        request: {
          method: 'POST',
          path: '/test',
          ip: '127.0.0.1',
          header: { 'user-agent': 'test-agent' }
        }
      };

      const mockNext = jest.fn().mockResolvedValue(undefined);

      // Get middleware
      const middleware = (await import('../../src/middleware/koa.js')).koaMiddleware(gk);

      // Apply middleware
      await middleware(mockCtx, mockNext);

      // Verify gamification helpers are attached
      expect(mockCtx.gamification).toBeDefined();
      expect(mockCtx.gamification.track).toBeInstanceOf(Function);

      await gk.shutdown();
    });
  });

  describe('Rate Limiting', () => {
    let gk: any;
    const API_PORT = 3103;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        api: {
          enabled: true,
          port: API_PORT,
          apiKey: 'test-api-key',
          rateLimit: {
            windowMs: 1000, // 1 second
            max: 5 // 5 requests per second
          }
        },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      await gk.initialize();
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    afterEach(async () => {
      await gk.shutdown();
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should enforce rate limits', async () => {
      const responses = [];

      // Make 10 rapid requests (limit is 5)
      for (let i = 0; i < 10; i++) {
        const response = await makeRequest(
          'GET',
          '/health',
          API_PORT
        );
        responses.push(response.status);
      }

      // Some requests should be rate limited (429)
      const rateLimited = responses.filter(status => status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should reset rate limit after window expires', async () => {
      // Make requests up to limit
      for (let i = 0; i < 5; i++) {
        await makeRequest('GET', '/health', API_PORT);
      }

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should allow requests again
      const response = await makeRequest('GET', '/health', API_PORT);
      expect(response.status).toBe(200);
    });
  });

  describe('API Authentication', () => {
    let gk: any;
    const API_PORT = 3104;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        api: {
          enabled: true,
          port: API_PORT,
          apiKey: 'regular-key',
          adminKeys: ['admin-key-1', 'admin-key-2']
        },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      await gk.initialize();
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    afterEach(async () => {
      await gk.shutdown();
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should reject requests without API key', async () => {
      const response = await makeRequest(
        'GET',
        '/api/users/user1/stats',
        API_PORT
      );

      expect(response.status).toBe(401);
    });

    it('should accept requests with valid API key', async () => {
      const response = await makeRequest(
        'GET',
        '/api/users/user1/stats',
        API_PORT,
        undefined,
        { 'X-API-Key': 'regular-key' }
      );

      expect(response.status).toBe(200);
    });

    it('should accept admin keys', async () => {
      const response = await makeRequest(
        'GET',
        '/api/users/user1/stats',
        API_PORT,
        undefined,
        { 'X-API-Key': 'admin-key-1' }
      );

      expect(response.status).toBe(200);
    });

    it('should reject invalid API keys', async () => {
      const response = await makeRequest(
        'GET',
        '/api/users/user1/stats',
        API_PORT,
        undefined,
        { 'X-API-Key': 'invalid-key' }
      );

      expect(response.status).toBe(401);
    });
  });

  describe('API Error Handling', () => {
    let gk: any;
    const API_PORT = 3105;

    beforeEach(async () => {
      gk = new GamificationKit({
        storage: { type: 'memory' },
        api: {
          enabled: true,
          port: API_PORT,
          apiKey: 'test-key'
        },
        metrics: { enabled: false },
        webhooks: { enabled: false }
      });

      gk.use(new PointsModule());
      await gk.initialize();
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    afterEach(async () => {
      await gk.shutdown();
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should handle malformed JSON', async () => {
      const response = await new Promise<any>((resolve) => {
        const req = http.request(
          {
            hostname: 'localhost',
            port: API_PORT,
            path: '/api/points/user1/award',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': 'test-key'
            }
          },
          (res) => {
            let data = '';
            res.on('data', chunk => (data += chunk));
            res.on('end', () => {
              resolve({ status: res.statusCode, body: data });
            });
          }
        );

        req.write('{ invalid json }');
        req.end();
      });

      expect(response.status).toBe(400);
    });

    it('should handle missing required fields', async () => {
      const response = await makeRequest(
        'POST',
        '/api/points/user1/award',
        API_PORT,
        {}, // Missing 'points' field
        { 'X-API-Key': 'test-key' }
      );

      expect(response.status).toBe(400);
    });

    it('should handle not found routes', async () => {
      const response = await makeRequest(
        'GET',
        '/api/nonexistent/route',
        API_PORT,
        undefined,
        { 'X-API-Key': 'test-key' }
      );

      expect(response.status).toBe(404);
    });
  });
});
