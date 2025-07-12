import { createServer } from 'http';

export class WebSocketServer {
  constructor(options = {}) {
    this.port = options.port || 3002;
    this.path = options.path || '/gamification/ws';
    this.server = null;
    this.wss = null;
    this.clients = new Map();
    this.eventManager = null;
    this.logger = null;
    this.authHandler = options.authHandler || (() => true);
  }

  setContext(context) {
    this.eventManager = context.eventManager;
    this.logger = context.logger;
  }

  async start() {
    try {
      // Dynamically import ws module
      const { WebSocketServer: WSServer } = await import('ws');
      
      this.server = createServer();
      this.wss = new WSServer({ 
        server: this.server,
        path: this.path 
      });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      // Subscribe to all gamification events
      this.eventManager.on('*', (data) => {
        this.broadcastToRelevantClients(data);
      });

      return new Promise((resolve) => {
        this.server.listen(this.port, () => {
          this.logger.info(`WebSocket server listening on port ${this.port}`);
          resolve();
        });
      });
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        this.logger.warn('WebSocket module (ws) not installed. Install with: npm install ws');
        throw new Error('WebSocket support requires the "ws" package to be installed');
      }
      throw error;
    }
  }

  async handleConnection(ws, req) {
    const userId = this.extractUserId(req);
    
    if (!userId || !await this.authHandler(userId, req)) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    this.logger.info(`WebSocket client connected: ${userId}`);
    
    // Store client connection
    this.clients.set(userId, ws);

    // Send initial connection success
    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      userId
    }));

    // Handle messages from client
    ws.on('message', (message) => {
      this.handleMessage(userId, message);
    });

    // Handle client disconnect
    ws.on('close', () => {
      this.logger.info(`WebSocket client disconnected: ${userId}`);
      this.clients.delete(userId);
    });

    ws.on('error', (error) => {
      this.logger.error(`WebSocket error for ${userId}:`, error);
    });

    // Send ping every 30 seconds
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
  }

  extractUserId(req) {
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

  handleMessage(userId, message) {
    try {
      const data = JSON.parse(message);
      this.logger.debug(`Received message from ${userId}:`, data);

      switch (data.type) {
        case 'subscribe':
          // Client can subscribe to specific event types
          this.handleSubscribe(userId, data.events);
          break;
        case 'ping':
          // Respond to ping
          const ws = this.clients.get(userId);
          if (ws) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          break;
        default:
          this.logger.warn(`Unknown message type from ${userId}: ${data.type}`);
      }
    } catch (error) {
      this.logger.error(`Error handling message from ${userId}:`, error);
    }
  }

  handleSubscribe(userId, events) {
    const ws = this.clients.get(userId);
    if (ws) {
      ws.subscribedEvents = events || ['*'];
      ws.send(JSON.stringify({
        type: 'subscribed',
        events: ws.subscribedEvents
      }));
    }
  }

  broadcastToRelevantClients(eventData) {
    const { userId, module, type } = eventData;
    
    // Send to specific user if event has userId
    if (userId) {
      const ws = this.clients.get(userId);
      if (ws && ws.readyState === ws.OPEN) {
        // Check if client subscribed to this event type
        if (!ws.subscribedEvents || 
            ws.subscribedEvents.includes('*') || 
            ws.subscribedEvents.includes(module) ||
            ws.subscribedEvents.includes(`${module}.${type}`)) {
          ws.send(JSON.stringify({
            type: 'event',
            data: eventData,
            timestamp: Date.now()
          }));
        }
      }
    }

    // Also broadcast to admin clients (those subscribed to '*')
    this.clients.forEach((ws, clientId) => {
      if (clientId !== userId && ws.readyState === ws.OPEN) {
        if (ws.subscribedEvents && ws.subscribedEvents.includes('*')) {
          ws.send(JSON.stringify({
            type: 'event',
            data: eventData,
            timestamp: Date.now()
          }));
        }
      }
    });
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  async stop() {
    this.clients.forEach((ws) => {
      ws.close();
    });
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
    }

    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
  }
}