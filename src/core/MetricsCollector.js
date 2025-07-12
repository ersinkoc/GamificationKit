import { Logger } from '../utils/logger.js';

export class MetricsCollector {
  constructor(options = {}) {
    this.logger = new Logger({ prefix: 'MetricsCollector', ...options.logger });
    this.eventManager = options.eventManager;
    this.storage = options.storage;
    this.collectInterval = options.collectInterval || 60000;
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

  start() {
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

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info('MetricsCollector stopped');
    }
  }

  setupEventListeners() {
    if (!this.eventManager) return;

    this.eventManager.onWildcard('*', (event) => {
      this.recordEvent(event.eventName, event.data);
    });
  }

  recordEvent(eventName, data = {}) {
    if (!this.metrics.events.has(eventName)) {
      this.metrics.events.set(eventName, {
        count: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalProcessingTime: 0,
        errors: 0
      });
    }

    const eventMetrics = this.metrics.events.get(eventName);
    eventMetrics.count++;
    eventMetrics.lastSeen = Date.now();

    if (data.processingTime) {
      eventMetrics.totalProcessingTime += data.processingTime;
    }

    if (data.error) {
      eventMetrics.errors++;
    }
  }

  recordModuleMetric(moduleName, metric, value) {
    if (!this.metrics.modules.has(moduleName)) {
      this.metrics.modules.set(moduleName, {});
    }

    const moduleMetrics = this.metrics.modules.get(moduleName);
    
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

  registerCollector(name, collector) {
    if (typeof collector !== 'function') {
      throw new Error('Collector must be a function');
    }
    
    this.collectors.set(name, collector);
    this.logger.debug(`Registered collector: ${name}`);
  }

  async collect() {
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
    } catch (error) {
      this.logger.error('Failed to collect metrics', { error });
    }
  }

  collectSystemMetrics() {
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

  async collectCustomMetrics() {
    const customMetrics = {};
    
    for (const [name, collector] of this.collectors) {
      try {
        const metrics = await collector();
        customMetrics[name] = metrics;
      } catch (error) {
        this.logger.error(`Collector failed: ${name}`, { error });
      }
    }
    
    return customMetrics;
  }

  getMetrics(options = {}) {
    const { 
      includeEvents = true,
      includeModules = true,
      includeSystem = true,
      eventLimit = 100
    } = options;

    const metrics = {
      timestamp: Date.now(),
      uptime: Date.now() - this.metrics.system.startTime
    };

    if (includeSystem) {
      metrics.system = this.metrics.system;
    }

    if (includeEvents) {
      const events = {};
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
      const modules = {};
      
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

  getEventMetrics(eventName) {
    return this.metrics.events.get(eventName) || null;
  }

  getModuleMetrics(moduleName) {
    return this.metrics.modules.get(moduleName) || null;
  }

  reset() {
    this.metrics.events.clear();
    this.metrics.modules.clear();
    this.metrics.system = {
      startTime: Date.now(),
      lastCollect: Date.now()
    };
    this.logger.info('Metrics reset');
  }

  async exportMetrics(format = 'json') {
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

  formatPrometheus(metrics) {
    const lines = [];
    const timestamp = Date.now();

    lines.push('# HELP gamification_uptime_seconds Uptime in seconds');
    lines.push('# TYPE gamification_uptime_seconds gauge');
    lines.push(`gamification_uptime_seconds ${metrics.uptime / 1000} ${timestamp}`);

    if (metrics.system) {
      lines.push('# HELP gamification_memory_bytes Memory usage in bytes');
      lines.push('# TYPE gamification_memory_bytes gauge');
      lines.push(`gamification_memory_bytes{type="rss"} ${metrics.system.memory.rss} ${timestamp}`);
      lines.push(`gamification_memory_bytes{type="heap_used"} ${metrics.system.memory.heapUsed} ${timestamp}`);
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

  formatCSV(metrics) {
    const rows = [['metric', 'value', 'timestamp']];
    const timestamp = new Date().toISOString();

    rows.push(['uptime_seconds', metrics.uptime / 1000, timestamp]);

    if (metrics.system) {
      rows.push(['memory_rss_bytes', metrics.system.memory.rss, timestamp]);
      rows.push(['memory_heap_used_bytes', metrics.system.memory.heapUsed, timestamp]);
    }

    if (metrics.events) {
      for (const [eventName, data] of Object.entries(metrics.events)) {
        rows.push([`event_${eventName}_count`, data.count, timestamp]);
      }
    }

    return rows.map(row => row.join(',')).join('\n');
  }
}