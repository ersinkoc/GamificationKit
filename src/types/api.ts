/**
 * API and HTTP types for GamificationKit
 */

import type { UserId, Metadata, ErrorResponse, SuccessResponse } from './common.js';
import type { UserStats } from './modules.js';

// HTTP Methods
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

// HTTP Status Codes
export type HTTPStatusCode =
  | 200 | 201 | 202 | 204
  | 400 | 401 | 403 | 404 | 405 | 409 | 422 | 429
  | 500 | 501 | 502 | 503 | 504;

// Request types
export interface APIRequest<T = any> {
  method: HTTPMethod;
  path: string;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
  body?: T;
  headers?: Record<string, string>;
  user?: UserInfo;
  metadata?: Metadata;
}

export interface UserInfo {
  userId: UserId;
  roles?: string[];
  permissions?: string[];
  metadata?: Metadata;
}

// Response types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode: HTTPStatusCode;
  timestamp: string;
  metadata?: Metadata;
}

export interface PaginatedAPIResponse<T = any> extends APIResponse<T[]> {
  pagination: {
    total: number;
    limit: number;
    offset: number;
    page: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// API route handler
export type RouteHandler<TReq = any, TRes = any> = (
  req: APIRequest<TReq>,
  res: APIResponseWriter<TRes>
) => void | Promise<void>;

// API response writer
export interface APIResponseWriter<T = any> {
  status(code: HTTPStatusCode): APIResponseWriter<T>;
  json(data: T): void;
  send(data: T): void;
  error(error: string | Error, code?: HTTPStatusCode): void;
  success(data?: T, message?: string): void;
  setHeader(name: string, value: string): APIResponseWriter<T>;
  end(): void;
}

// Middleware
export type Middleware = (
  req: APIRequest,
  res: APIResponseWriter,
  next: () => void | Promise<void>
) => void | Promise<void>;

// API endpoint definitions
export interface APIEndpoint {
  method: HTTPMethod;
  path: string;
  handler: RouteHandler;
  middleware?: Middleware[];
  auth?: boolean;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  validation?: ValidationSchema;
  description?: string;
  deprecated?: boolean;
}

// Validation schema
export interface ValidationSchema {
  params?: Record<string, FieldValidation>;
  query?: Record<string, FieldValidation>;
  body?: Record<string, FieldValidation>;
}

export interface FieldValidation {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp | string;
  enum?: any[];
  custom?: (value: any) => boolean | string;
  default?: any;
}

// WebSocket types
export interface WebSocketMessage<T = any> {
  type: string;
  data: T;
  id?: string;
  timestamp: string;
}

export interface WebSocketClient {
  id: string;
  userId?: UserId;
  connected: boolean;
  connectedAt: string;
  lastActivity: string;
  metadata?: Metadata;
  send(message: WebSocketMessage): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketMessageHandler = (
  message: WebSocketMessage,
  client: WebSocketClient
) => void | Promise<void>;

export interface WebSocketServer {
  broadcast(message: WebSocketMessage, filter?: (client: WebSocketClient) => boolean): void;
  send(userId: UserId, message: WebSocketMessage): void;
  getClient(userId: UserId): WebSocketClient | undefined;
  getClients(): WebSocketClient[];
  on(event: string, handler: WebSocketMessageHandler): void;
  off(event: string, handler: WebSocketMessageHandler): void;
}

// Webhook types
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  secret?: string;
  headers?: Record<string, string>;
  retryPolicy?: {
    maxRetries: number;
    retryDelay: number;
    backoff: 'linear' | 'exponential';
  };
  metadata?: Metadata;
  createdAt: string;
  updatedAt?: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: any;
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  attempts: number;
  response?: {
    statusCode: number;
    body?: any;
    headers?: Record<string, string>;
  };
  error?: string;
  sentAt?: string;
  createdAt: string;
}

// API documentation types
export interface APIDocumentation {
  version: string;
  title: string;
  description?: string;
  baseUrl: string;
  endpoints: APIEndpointDoc[];
}

export interface APIEndpointDoc {
  method: HTTPMethod;
  path: string;
  summary?: string;
  description?: string;
  parameters?: ParameterDoc[];
  requestBody?: RequestBodyDoc;
  responses: ResponseDoc[];
  tags?: string[];
  deprecated?: boolean;
}

export interface ParameterDoc {
  name: string;
  in: 'path' | 'query' | 'header';
  description?: string;
  required?: boolean;
  type: string;
  example?: any;
}

export interface RequestBodyDoc {
  description?: string;
  required?: boolean;
  content: {
    [mediaType: string]: {
      schema: any;
      example?: any;
    };
  };
}

export interface ResponseDoc {
  statusCode: HTTPStatusCode;
  description: string;
  content?: {
    [mediaType: string]: {
      schema: any;
      example?: any;
    };
  };
}

// Rate limiting types
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface RateLimitStore {
  increment(key: string): Promise<RateLimitInfo>;
  reset(key: string): Promise<void>;
  get(key: string): Promise<RateLimitInfo | null>;
}

// CORS types
export interface CORSConfig {
  origin: string | string[] | ((origin: string) => boolean);
  methods?: HTTPMethod[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

// API server types
export interface APIServerConfig {
  port: number;
  host?: string;
  prefix?: string;
  cors?: CORSConfig | boolean;
  compression?: boolean;
  bodyParser?: boolean;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  helmet?: boolean;
  morgan?: boolean | string;
  trustProxy?: boolean;
}

export interface APIServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getAddress(): { host: string; port: number } | null;
  addRoute(endpoint: APIEndpoint): void;
  removeRoute(method: HTTPMethod, path: string): void;
  use(middleware: Middleware): void;
}

// Health check types
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version?: string;
  uptime: number;
  timestamp: string;
  checks: {
    [name: string]: {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      details?: any;
    };
  };
}

// Metrics types
export interface MetricsResponse {
  timestamp: string;
  uptime: number;
  metrics: {
    [key: string]: number | string | boolean | any;
  };
}

// Specific API request/response types for GamificationKit endpoints

// Points endpoints
export interface AwardPointsRequest {
  userId: UserId;
  points: number;
  reason?: string;
  metadata?: Metadata;
}

export interface DeductPointsRequest {
  userId: UserId;
  points: number;
  reason?: string;
  metadata?: Metadata;
}

export interface PointsResponse {
  userId: UserId;
  total: number;
  daily: number;
  weekly: number;
  monthly: number;
  lastUpdated: string;
}

// Badge endpoints
export interface AwardBadgeRequest {
  userId: UserId;
  badgeId: string;
  metadata?: Metadata;
}

export interface BadgeListResponse {
  badges: any[];
  total: number;
}

// Level endpoints
export interface AddXPRequest {
  userId: UserId;
  xp: number;
  reason?: string;
  metadata?: Metadata;
}

export interface LevelResponse {
  userId: UserId;
  level: number;
  totalXP: number;
  progress: {
    current: number;
    required: number;
    percentage: number;
  };
}

// Quest endpoints
export interface AssignQuestRequest {
  userId: UserId;
  questId: string;
  metadata?: Metadata;
}

export interface UpdateQuestProgressRequest {
  userId: UserId;
  questId: string;
  objectiveId: string;
  progress: number;
}

// Leaderboard endpoints
export interface LeaderboardRequest {
  type: string;
  period?: 'daily' | 'weekly' | 'monthly' | 'all-time';
  limit?: number;
  offset?: number;
}

// User stats endpoints
export interface UserStatsResponse {
  userId: UserId;
  stats: UserStats;
  timestamp: string;
}
