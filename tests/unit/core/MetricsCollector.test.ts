import type { GamificationKit } from '../src/core/GamificationKit.js';
import { jest } from '@jest/globals';
import { MetricsCollector } from '../../../src/core/MetricsCollector.js';

describe('MetricsCollector', (): void => {
  let metricsCollector;

  beforeEach(() => {
    metricsCollector = new MetricsCollector();
    jest.clearAllMocks();
  });

  describe('constructor', (): void => {
    it('should initialize with default options', () => {
      expect(metricsCollector.metrics).toEqual({});
      expect(metricsCollector.enabled).toBe(true);
      expect(metricsCollector.flushInterval).toBe(60000);
      expect(metricsCollector.maxMetrics).toBe(10000);
    });

    it('should accept custom options', () => {
      const customCollector = new MetricsCollector({
        enabled: false,
        flushInterval: 30000,
        maxMetrics: 5000
      });

      expect(customCollector.enabled).toBe(false);
      expect(customCollector.flushInterval).toBe(30000);
      expect(customCollector.maxMetrics).toBe(5000);
    });

    it('should start flush interval when enabled', () => {
      jest.useFakeTimers();
      const flushSpy = jest.spyOn(MetricsCollector.prototype, 'flush');
      
      new MetricsCollector({ flushInterval: 1000 });
      
      jest.advanceTimersByTime(1000);
      expect(flushSpy).toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });

  describe('increment', (): void => {
    it('should increment counter metric', () => {
      metricsCollector.increment('api.requests');
      metricsCollector.increment('api.requests');
      metricsCollector.increment('api.requests', 3);

      const metrics = metricsCollector.getMetrics();
      expect(metrics['api.requests']).toEqual({
        type: 'counter',
        value: 5,
        lastUpdated: expect.any(Date)
      });
    });

    it('should create new metric if not exists', () => {
      metricsCollector.increment('new.metric');

      const metrics = metricsCollector.getMetrics();
      expect(metrics['new.metric']).toEqual({
        type: 'counter',
        value: 1,
        lastUpdated: expect.any(Date)
      });
    });

    it('should handle tags', () => {
      metricsCollector.increment('api.requests', 1, { endpoint: '/users', method: 'GET' });
      metricsCollector.increment('api.requests', 1, { endpoint: '/users', method: 'POST' });
      metricsCollector.increment('api.requests', 1, { endpoint: '/posts', method: 'GET' });

      const metrics = metricsCollector.getMetrics();
      const taggedMetric = metrics['api.requests:endpoint=/users,method=GET'];
      
      expect(taggedMetric).toBeDefined();
      expect(taggedMetric.value).toBe(1);
    });

    it('should not track when disabled', () => {
      metricsCollector.enabled = false;
      metricsCollector.increment('test.metric');

      const metrics = metricsCollector.getMetrics();
      expect(metrics['test.metric']).toBeUndefined();
    });
  });

  describe('gauge', (): void => {
    it('should set gauge metric', () => {
      metricsCollector.gauge('memory.usage', 75.5);
      metricsCollector.gauge('memory.usage', 80.2);

      const metrics = metricsCollector.getMetrics();
      expect(metrics['memory.usage']).toEqual({
        type: 'gauge',
        value: 80.2,
        lastUpdated: expect.any(Date)
      });
    });

    it('should handle tags', () => {
      metricsCollector.gauge('cpu.usage', 45.5, { core: '0' });
      metricsCollector.gauge('cpu.usage', 55.5, { core: '1' });

      const metrics = metricsCollector.getMetrics();
      expect(metrics['cpu.usage:core=0'].value).toBe(45.5);
      expect(metrics['cpu.usage:core=1'].value).toBe(55.5);
    });
  });

  describe('histogram', (): void => {
    it('should record histogram values', () => {
      metricsCollector.histogram('response.time', 100);
      metricsCollector.histogram('response.time', 200);
      metricsCollector.histogram('response.time', 150);
      metricsCollector.histogram('response.time', 300);
      metricsCollector.histogram('response.time', 250);

      const metrics = metricsCollector.getMetrics();
      const histogram = metrics['response.time'];

      expect(histogram.type).toBe('histogram');
      expect(histogram.count).toBe(5);
      expect(histogram.sum).toBe(1000);
      expect(histogram.min).toBe(100);
      expect(histogram.max).toBe(300);
      expect(histogram.mean).toBe(200);
      expect(histogram.values).toEqual([100, 200, 150, 300, 250]);
    });

    it('should calculate percentiles', () => {
      // Add 100 values from 1 to 100
      for (let i = 1; i <= 100; i++) {
        metricsCollector.histogram('test.metric', i);
      }

      const metrics = metricsCollector.getMetrics();
      const histogram = metrics['test.metric'];

      expect(histogram.p50).toBe(50.5); // Median
      expect(histogram.p95).toBe(95.5); // 95th percentile
      expect(histogram.p99).toBe(99.5); // 99th percentile
    });

    it('should limit stored values', () => {
      metricsCollector.maxHistogramValues = 10;

      for (let i = 0; i < 20; i++) {
        metricsCollector.histogram('test.metric', i);
      }

      const metrics = metricsCollector.getMetrics();
      expect(metrics['test.metric'].values).toHaveLength(10);
      expect(metrics['test.metric'].count).toBe(20);
    });
  });

  describe('timing', (): void => {
    it('should measure timing', async (): Promise<void> => {
      const endTiming = metricsCollector.timing('operation.duration');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      endTiming();

      const metrics = metricsCollector.getMetrics();
      const timing = metrics['operation.duration'];

      expect(timing.type).toBe('histogram');
      expect(timing.count).toBe(1);
      expect(timing.values[0]).toBeGreaterThanOrEqual(90);
      expect(timing.values[0]).toBeLessThan(150);
    });

    it('should handle async operations', async (): Promise<void> => {
      const result = await metricsCollector.timeAsync('async.operation', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'result';
      });

      expect(result).toBe('result');

      const metrics = metricsCollector.getMetrics();
      const timing = metrics['async.operation'];

      expect(timing.type).toBe('histogram');
      expect(timing.values[0]).toBeGreaterThanOrEqual(40);
    });

    it('should handle errors in timed operations', async (): Promise<void> => {
      await expect(
        metricsCollector.timeAsync('failed.operation', async () => {
          throw new Error('Operation failed');
        })
      ).rejects.toThrow('Operation failed');

      const metrics = metricsCollector.getMetrics();
      const timing = metrics['failed.operation'];

      expect(timing).toBeDefined();
      expect(timing.type).toBe('histogram');
    });
  });

  describe('set', (): void => {
    it('should track unique values', () => {
      metricsCollector.set('unique.users', 'user1');
      metricsCollector.set('unique.users', 'user2');
      metricsCollector.set('unique.users', 'user1'); // Duplicate
      metricsCollector.set('unique.users', 'user3');

      const metrics = metricsCollector.getMetrics();
      expect(metrics['unique.users']).toEqual({
        type: 'set',
        value: 3,
        values: new Set(['user1', 'user2', 'user3']),
        lastUpdated: expect.any(Date)
      });
    });

    it('should limit set size', () => {
      metricsCollector.maxSetSize = 5;

      for (let i = 0; i < 10; i++) {
        metricsCollector.set('limited.set', `value${i}`);
      }

      const metrics = metricsCollector.getMetrics();
      expect(metrics['limited.set'].values.size).toBe(5);
    });
  });

  describe('event', (): void => {
    it('should track events', () => {
      metricsCollector.event('user.login', { userId: '123', ip: '192.168.1.1' });
      metricsCollector.event('user.login', { userId: '456', ip: '192.168.1.2' });

      const events = metricsCollector.getEvents('user.login');
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        name: 'user.login',
        data: { userId: '123', ip: '192.168.1.1' },
        timestamp: expect.any(Date)
      });
    });

    it('should limit event history', () => {
      metricsCollector.maxEvents = 5;

      for (let i = 0; i < 10; i++) {
        metricsCollector.event('test.event', { index: i });
      }

      const events = metricsCollector.getEvents('test.event');
      expect(events).toHaveLength(5);
      expect(events[0].data.index).toBe(5);
      expect(events[4].data.index).toBe(9);
    });
  });

  describe('getMetrics', (): void => {
    it('should return all metrics', () => {
      metricsCollector.increment('counter.metric');
      metricsCollector.gauge('gauge.metric', 42);
      metricsCollector.histogram('histogram.metric', 100);

      const metrics = metricsCollector.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(3);
      expect(metrics['counter.metric'].type).toBe('counter');
      expect(metrics['gauge.metric'].type).toBe('gauge');
      expect(metrics['histogram.metric'].type).toBe('histogram');
    });

    it('should filter by prefix', () => {
      metricsCollector.increment('api.requests');
      metricsCollector.increment('api.errors');
      metricsCollector.increment('db.queries');

      const apiMetrics = metricsCollector.getMetrics('api.');
      expect(Object.keys(apiMetrics)).toHaveLength(2);
      expect(apiMetrics['api.requests']).toBeDefined();
      expect(apiMetrics['api.errors']).toBeDefined();
      expect(apiMetrics['db.queries']).toBeUndefined();
    });
  });

  describe('reset', (): void => {
    it('should reset specific metric', () => {
      metricsCollector.increment('test.metric', 5);
      metricsCollector.reset('test.metric');

      const metrics = metricsCollector.getMetrics();
      expect(metrics['test.metric']).toBeUndefined();
    });

    it('should reset all metrics', () => {
      metricsCollector.increment('metric1');
      metricsCollector.gauge('metric2', 42);
      metricsCollector.histogram('metric3', 100);

      metricsCollector.reset();

      const metrics = metricsCollector.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(0);
    });
  });

  describe('flush', (): void => {
    it('should call flush handler', () => {
      const flushHandler = jest.fn();
      metricsCollector.onFlush(flushHandler);

      metricsCollector.increment('test.metric');
      metricsCollector.flush();

      expect(flushHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          'test.metric': expect.objectContaining({
            type: 'counter',
            value: 1
          })
        })
      );
    });

    it('should reset metrics after flush if configured', () => {
      metricsCollector.resetOnFlush = true;
      metricsCollector.increment('test.metric');
      
      metricsCollector.flush();

      const metrics = metricsCollector.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(0);
    });

    it('should handle flush errors', () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Flush failed');
      });
      const consoleSpy = jest.spyOn(console, 'error');

      metricsCollector.onFlush(errorHandler);
      metricsCollector.flush();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in metrics flush handler:',
        expect.any(Error)
      );
    });
  });

  describe('aggregate', (): void => {
    it('should aggregate metrics over time windows', () => {
      const now = Date.now();
      
      // Simulate metrics over time
      for (let i = 0; i < 60; i++) {
        metricsCollector.increment('requests.count');
        metricsCollector.histogram('response.time', 100 + Math.random() * 100);
      }

      const aggregated = metricsCollector.aggregate('1m');
      
      expect(aggregated['requests.count']).toBeDefined();
      expect(aggregated['response.time']).toBeDefined();
      expect(aggregated['response.time'].mean).toBeGreaterThan(100);
      expect(aggregated['response.time'].mean).toBeLessThan(200);
    });
  });

  describe('export', (): void => {
    it('should export metrics in Prometheus format', () => {
      metricsCollector.increment('http_requests_total', 1, { method: 'GET', status: '200' });
      metricsCollector.gauge('memory_usage_bytes', 1024000);
      metricsCollector.histogram('http_request_duration_seconds', 0.05);

      const prometheus = metricsCollector.exportPrometheus();
      
      expect(prometheus).toContain('# TYPE http_requests_total counter');
      expect(prometheus).toContain('http_requests_total{method="GET",status="200"} 1');
      expect(prometheus).toContain('# TYPE memory_usage_bytes gauge');
      expect(prometheus).toContain('memory_usage_bytes 1024000');
      expect(prometheus).toContain('# TYPE http_request_duration_seconds histogram');
    });

    it('should export metrics in JSON format', () => {
      metricsCollector.increment('test.counter', 5);
      metricsCollector.gauge('test.gauge', 42.5);

      const json = metricsCollector.exportJSON();
      const parsed = JSON.parse(json);

      expect(parsed.metrics['test.counter']).toEqual({
        type: 'counter',
        value: 5,
        lastUpdated: expect.any(String)
      });
      expect(parsed.metrics['test.gauge']).toEqual({
        type: 'gauge',
        value: 42.5,
        lastUpdated: expect.any(String)
      });
    });
  });

  describe('performance', (): void => {
    it('should handle high-frequency metrics efficiently', () => {
      const start = Date.now();
      
      for (let i = 0; i < 10000; i++) {
        metricsCollector.increment('high.frequency.metric');
      }
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should complete in less than 100ms

      const metrics = metricsCollector.getMetrics();
      expect(metrics['high.frequency.metric'].value).toBe(10000);
    });

    it('should enforce max metrics limit', () => {
      metricsCollector.maxMetrics = 10;

      for (let i = 0; i < 20; i++) {
        metricsCollector.increment(`metric.${i}`);
      }

      const metrics = metricsCollector.getMetrics();
      expect(Object.keys(metrics).length).toBeLessThanOrEqual(10);
    });
  });

  describe('custom metrics', (): void => {
    it('should support custom metric types', () => {
      metricsCollector.custom('custom.metric', {
        type: 'custom',
        processor: (current, value) => {
          if (!current) {
            return { sum: value, product: value };
          }
          return {
            sum: current.sum + value,
            product: current.product * value
          };
        }
      });

      metricsCollector.update('custom.metric', 2);
      metricsCollector.update('custom.metric', 3);
      metricsCollector.update('custom.metric', 4);

      const metrics = metricsCollector.getMetrics();
      expect(metrics['custom.metric'].value).toEqual({
        sum: 9,
        product: 24
      });
    });
  });

  describe('batch operations', (): void => {
    it('should support batch increment', () => {
      metricsCollector.batchIncrement([
        { name: 'metric1', value: 1 },
        { name: 'metric2', value: 2 },
        { name: 'metric1', value: 3 }
      ]);

      const metrics = metricsCollector.getMetrics();
      expect(metrics['metric1'].value).toBe(4);
      expect(metrics['metric2'].value).toBe(2);
    });

    it('should support batch operations with tags', () => {
      metricsCollector.batchIncrement([
        { name: 'api.calls', value: 1, tags: { endpoint: '/users' } },
        { name: 'api.calls', value: 1, tags: { endpoint: '/posts' } }
      ]);

      const metrics = metricsCollector.getMetrics();
      expect(metrics['api.calls:endpoint=/users'].value).toBe(1);
      expect(metrics['api.calls:endpoint=/posts'].value).toBe(1);
    });
  });
});