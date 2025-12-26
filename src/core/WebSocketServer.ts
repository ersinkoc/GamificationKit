import { createServer, Server as HTTPServer, IncomingMessage } from 'http';
import type { Server as WSServer, WebSocket } from 'ws';
import type { EventManager } from './EventManager.js';
import type { Logger } from '../utils/logger.js';

/**
 * Extended WebSocket with custom properties
 */
interface ExtendedWebSocket extends WebSocket {
  subscribedEvents?: string[];
  pingInterval?: NodeJS.Timeout | null;
  OPEN: number;
}

/**
 * Authentication handler function
 */
export type AuthHandler = (userId: string, req: IncomingMessage) => boolean | Promise<boolean>;

/**
 * WebSocket server options
 */
export interface WebSocketServerOptions {
  port?: number;
  path?: string;
  authHandler?: AuthHandler;
}

/**
 * WebSocket message types
 */
interface WebSocketMessage {
  type: string;
  events?: string[];
  [key: string]: any;
}

/**
 * WebSocket event data
 */
interface WebSocketEventData {
  userId?: string;
  module?: string;
  type: string;
  [key: string]: any;
}

/**
 * WebSocket server context
 */
export interface WebSocketContext {
  eventManager: EventManager;
  logger: Logger;
}

/**
 * WebSocket server for real-time communication
 */
export class WebSocketServer {
  private port: number;
  private path: string;
  private server: HTTPServer | null;
  private wss: WSServer | null;
  private clients: Map<string, ExtendedWebSocket>;
  private eventManager: EventManager | null;
  private logger: Logger | null;
  private authHandler: AuthHandler;

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
    if (!this.eventManager || !this.logger) {
      throw new Error('Context not set. Call setContext() before start()');
    }

    try {
      // Dynamically import ws module
      const { WebSocketServer: WSServer } = await import('ws');

      this.server = createServer();
      this.wss = new WSServer({
        server: this.server,
        path: this.path
      });

      this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        this.handleConnection(ws as ExtendedWebSocket, req);
      });

      // Fix BUG-008: Subscribe to all gamification events using onWildcard instead of on
      // The on('*') only listens for literal '*' events, not all events
      this.eventManager.onWildcard('*', (data: WebSocketEventData) => {
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

  private async handleConnection(ws: ExtendedWebSocket, req: IncomingMessage): Promise<void> {
    const userId = this.extractUserId(req);

    if (!userId || !await this.authHandler(userId, req)) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    this.logger!.info(`WebSocket client connected: ${userId}`);

    // Store client connection
    this.clients.set(userId, ws);

    // Send initial connection success
    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      userId
    }));

    // Handle messages from client
    ws.on('message', (message: Buffer | string) => {
      this.handleMessage(userId, message.toString());
    });

    // Handle client disconnect
    // Fix BUG-010: Clear ping interval immediately on close to prevent memory leak
    ws.on('close', () => {
      this.logger!.info(`WebSocket client disconnected: ${userId}`);
      this.clients.delete(userId);
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval);
        ws.pingInterval = null;
      }
    });

    ws.on('error', (error: Error) => {
      this.logger!.error(`WebSocket error for ${userId}:`, error);
    });

    // Send ping every 30 seconds
    // Fix BUG-010: Store interval reference for cleanup
    ws.pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      } else {
        if (ws.pingInterval) {
          clearInterval(ws.pingInterval);
          ws.pingInterval = null;
        }
      }
    }, 30000);
  }

  private extractUserId(req: IncomingMessage): string | null {
    // Extract from query params
    const url = new URL(req.url || '', `http://localhost:${this.port}`);
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

  private handleMessage(userId: string, message: string): void {
    try {
      const data: WebSocketMessage = JSON.parse(message);
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
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          break;
        default:
          this.logger!.warn(`Unknown message type from ${userId}: ${data.type}`);
      }
    } catch (error: any) {
      this.logger!.error(`Error handling message from ${userId}:`, error);
    }
  }

  private handleSubscribe(userId: string, events?: string[]): void {
    const ws = this.clients.get(userId);
    if (ws) {
      ws.subscribedEvents = events || ['*'];
      ws.send(JSON.stringify({
        type: 'subscribed',
        events: ws.subscribedEvents
      }));
    }
  }

  private broadcastToRelevantClients(eventData: WebSocketEventData): void {
    const { userId, module, type } = eventData;

    // Send to specific user if event has userId
    if (userId) {
      const ws = this.clients.get(userId);
      if (ws && ws.readyState === ws.OPEN) {
        // Check if client subscribed to this event type
        if (!ws.subscribedEvents ||
            ws.subscribedEvents.includes('*') ||
            ws.subscribedEvents.includes(module || '') ||
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

  broadcast(message: any): void {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  async stop(): Promise<void> {
    this.clients.forEach((ws) => {
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval);
        ws.pingInterval = null;
      }
      ws.close();
    });
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
    }

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => resolve());
      });
    }
  }
}
