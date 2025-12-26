import { Logger } from '../utils/logger.js';
import type { LoggerConfig } from '../types/config.js';
import type { EventManager, EventData } from './EventManager.js';
import type { IStorageAdapter } from '../types/storage.js';

export interface MetricsCollectorOptions {
  logger?: LoggerConfig;
  eventManager?: EventManager;
  storage?: IStorageAdapter;
  collectInterval?: number;
  maxEventTypes?: number;
  maxModules?: number;
}

export interface EventMetrics {
  count: number;
  firstSeen: number;
  lastSeen: number;
  totalProcessingTime: number;
  errors: number;
}

export interface ModuleMetric {
  value: number;
  count: number;
  min: number;
  max: number;
  sum: number;
  lastUpdate: number;
}

export interface SystemMetrics {
  startTime: number;
  lastCollect: number;
  collectDuration?: number;
  memory?: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpu?: {
    user: number;
    system: number;
  };
  uptime?: number;
  pid?: number;
  nodeVersion?: string;
}

export interface MetricsResult {
  timestamp: number;
  uptime: number;
  system?: SystemMetrics;
  events?: Record<string, EventMetrics & { avgProcessingTime: number; errorRate: number }>;
  totalEvents?: number;
  modules?: Record<string, Record<string, ModuleMetric & { avg: number }>>;
}

export class MetricsCollector {
  private logger: Logger;
  private eventManager?: EventManager;
  private storage?: IStorageAdapter;
  private collectInterval: number;
  private maxEventTypes: number;
  private maxModules: number;
  private metrics: {
    events: Map<string, EventMetrics>;
    modules: Map<string, Record<string, ModuleMetric>>;
    system: SystemMetrics;
  };
  private intervalId: NodeJS.Timeout | null;
  private collectors: Map<string, () => any | Promise<any>>;

  constructor(options: MetricsCollectorOptions = {}) {
    this.logger = new Logger({ prefix: 'MetricsCollector', ...options.logger });
    this.eventManager = options.eventManager;
    this.storage = options.storage;
    this.collectInterval = options.collectInterval || 60000;
    this.maxEventTypes = options.maxEventTypes || 500; // Fix HIGH-004: Limit tracked event types
    this.maxModules = options.maxModules || 100; // Fix HIGH-004: Limit tracked modules
    this.metrics = {
      events: new Map(),
      modules: new Map(),
      system: {
        startTime: Date.now(),
        lastCollect: Date.now()
      }
    };
    this.intervalId = null;
    this.collectors = new Map();
  }

  start(): void {
    if (this.intervalId) {
      this.logger.warn('MetricsCollector already started');
      return;
    }

    this.intervalId = setInterval(() => {
      this.collect();
    }, this.collectInterval);

    this.setupEventListeners();
    this.logger.info('MetricsCollector started');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info('MetricsCollector stopped');
    }
  }

  setupEventListeners(): void {
    if (!this.eventManager) return;

    this.eventManager.onWildcard('*', (event: EventData) => {
      this.recordEvent(event.eventName, event.data);
    });
  }

  recordEvent(eventName: string, data: any = {}): void {
    if (!this.metrics.events.has(eventName)) {
      // Fix HIGH-004: Enforce max event types to prevent unbounded memory growth
      if (this.metrics.events.size >= this.maxEventTypes) {
        // Remove the oldest event type (first in Map iteration order)
        const oldestKey = this.metrics.events.keys().next().value;
        this.metrics.events.delete(oldestKey);
      }
      this.metrics.events.set(eventName, {
        count: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalProcessingTime: 0,
        errors: 0
      });
    }

    const eventMetrics = this.metrics.events.get(eventName)!;
    eventMetrics.count++;
    eventMetrics.lastSeen = Date.now();

    if (data.processingTime) {
      eventMetrics.totalProcessingTime += data.processingTime;
    }

    if (data.error) {
      eventMetrics.errors++;
    }
  }

  recordModuleMetric(moduleName: string, metric: string, value: number): void {
    if (!this.metrics.modules.has(moduleName)) {
      // Fix HIGH-004: Enforce max modules to prevent unbounded memory growth
      if (this.metrics.modules.size >= this.maxModules) {
        const oldestKey = this.metrics.modules.keys().next().value;
        this.metrics.modules.delete(oldestKey);
      }
      this.metrics.modules.set(moduleName, {});
    }

    const moduleMetrics = this.metrics.modules.get(moduleName)!;

    if (!moduleMetrics[metric]) {
      moduleMetrics[metric] = {
        value: 0,
        count: 0,
        min: value,
        max: value,
        sum: 0,
        lastUpdate: Date.now()
      };
    }

    const m = moduleMetrics[metric];
    m.count++;
    m.sum += value;
    m.value = value;
    m.min = Math.min(m.min, value);
    m.max = Math.max(m.max, value);
    m.lastUpdate = Date.now();
  }

  registerCollector(name: string, collector: () => any | Promise<any>): void {
    if (typeof collector !== 'function') {
      throw new Error('Collector must be a function');
    }

    this.collectors.set(name, collector);
    this.logger.debug(`Registered collector: ${name}`);
  }

  async collect(): Promise<void> {
    const startTime = Date.now();

    try {
      const systemMetrics = this.collectSystemMetrics();
      const customMetrics = await this.collectCustomMetrics();

      this.metrics.system = {
        ...this.metrics.system,
        ...systemMetrics,
        lastCollect: Date.now(),
        collectDuration: Date.now() - startTime
      };

      Object.assign(this.metrics, customMetrics);

      this.logger.debug('Metrics collected', {
        duration: Date.now() - startTime
      });
    } catch (error: any) {
      this.logger.error('Failed to collect metrics', { error });
    }
  }

  collectSystemMetrics(): Partial<SystemMetrics> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime(),
      pid: process.pid,
      nodeVersion: process.version
    };
  }

  async collectCustomMetrics(): Promise<Record<string, any>> {
    const customMetrics: Record<string, any> = {};

    for (const [name, collector] of this.collectors) {
      try {
        const metrics = await collector();
        customMetrics[name] = metrics;
      } catch (error: any) {
        this.logger.error(`Collector failed: ${name}`, { error });
      }
    }

    return customMetrics;
  }

  getMetrics(options: {
    includeEvents?: boolean;
    includeModules?: boolean;
    includeSystem?: boolean;
    eventLimit?: number;
  } = {}): MetricsResult {
    const {
      includeEvents = true,
      includeModules = true,
      includeSystem = true,
      eventLimit = 100
    } = options;

    const metrics: MetricsResult = {
      timestamp: Date.now(),
      uptime: Date.now() - this.metrics.system.startTime
    };

    if (includeSystem) {
      metrics.system = this.metrics.system;
    }

    if (includeEvents) {
      const events: Record<string, EventMetrics & { avgProcessingTime: number; errorRate: number }> = {};
      const sortedEvents = Array.from(this.metrics.events.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, eventLimit);

      for (const [eventName, eventMetrics] of sortedEvents) {
        events[eventName] = {
          ...eventMetrics,
          avgProcessingTime: eventMetrics.totalProcessingTime / eventMetrics.count || 0,
          errorRate: eventMetrics.errors / eventMetrics.count || 0
        };
      }

      metrics.events = events;
      metrics.totalEvents = Array.from(this.metrics.events.values())
        .reduce((sum, e) => sum + e.count, 0);
    }

    if (includeModules) {
      const modules: Record<string, Record<string, ModuleMetric & { avg: number }>> = {};

      for (const [moduleName, moduleMetrics] of this.metrics.modules) {
        modules[moduleName] = {};

        for (const [metric, data] of Object.entries(moduleMetrics)) {
          modules[moduleName][metric] = {
            ...data,
            avg: data.sum / data.count || 0
          };
        }
      }

      metrics.modules = modules;
    }

    return metrics;
  }

  getEventMetrics(eventName: string): (EventMetrics & { avgProcessingTime: number; errorRate: number }) | null {
    const metrics = this.metrics.events.get(eventName);
    if (!metrics) return null;

    return {
      ...metrics,
      avgProcessingTime: metrics.totalProcessingTime / metrics.count || 0,
      errorRate: metrics.errors / metrics.count || 0
    };
  }

  getModuleMetrics(moduleName: string): Record<string, ModuleMetric> | null {
    return this.metrics.modules.get(moduleName) || null;
  }

  reset(): void {
    this.metrics.events.clear();
    this.metrics.modules.clear();
    this.metrics.system = {
      startTime: Date.now(),
      lastCollect: Date.now()
    };
    this.logger.info('Metrics reset');
  }

  async exportMetrics(format: 'json' | 'prometheus' | 'csv' = 'json'): Promise<string> {
    const metrics = this.getMetrics();

    switch (format) {
      case 'json':
        return JSON.stringify(metrics, null, 2);

      case 'prometheus':
        return this.formatPrometheus(metrics);

      case 'csv':
        return this.formatCSV(metrics);

      default:
        throw new Error(`Unknown export format: ${format}`);
    }
  }

  formatPrometheus(metrics: MetricsResult): string {
    const lines: string[] = [];
    const timestamp = Date.now();

    lines.push('# HELP gamification_uptime_seconds Uptime in seconds');
    lines.push('# TYPE gamification_uptime_seconds gauge');
    lines.push(`gamification_uptime_seconds ${metrics.uptime / 1000} ${timestamp}`);

    if (metrics.system) {
      lines.push('# HELP gamification_memory_bytes Memory usage in bytes');
      lines.push('# TYPE gamification_memory_bytes gauge');
      lines.push(`gamification_memory_bytes{type="rss"} ${metrics.system.memory!.rss} ${timestamp}`);
      lines.push(`gamification_memory_bytes{type="heap_used"} ${metrics.system.memory!.heapUsed} ${timestamp}`);
    }

    if (metrics.events) {
      lines.push('# HELP gamification_events_total Total number of events');
      lines.push('# TYPE gamification_events_total counter');

      for (const [eventName, data] of Object.entries(metrics.events)) {
        lines.push(`gamification_events_total{event="${eventName}"} ${data.count} ${timestamp}`);
      }
    }

    return lines.join('\n');
  }

  formatCSV(metrics: MetricsResult): string {
    const rows: string[][] = [['metric', 'value', 'timestamp']];
    const timestamp = new Date().toISOString();

    rows.push(['uptime_seconds', String(metrics.uptime / 1000), timestamp]);

    if (metrics.system) {
      rows.push(['memory_rss_bytes', String(metrics.system.memory!.rss), timestamp]);
      rows.push(['memory_heap_used_bytes', String(metrics.system.memory!.heapUsed), timestamp]);
    }

    if (metrics.events) {
      for (const [eventName, data] of Object.entries(metrics.events)) {
        rows.push([`event_${eventName}_count`, String(data.count), timestamp]);
      }
    }

    return rows.map(row => row.join(',')).join('\n');
  }
}
