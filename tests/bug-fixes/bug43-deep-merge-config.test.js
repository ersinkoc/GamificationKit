/**
 * Bug Fix #43: GamificationKit.validateAndMergeConfig deep merges nested config
 *
 * Issue: Only did shallow merge `{ ...defaultConfig, ...config }` which completely
 * replaced nested objects instead of merging them. For example, providing
 * `api: { port: 4000 }` would lose all other default api settings.
 *
 * Fix: Implemented deep merge to preserve nested default values while allowing
 * partial overrides.
 */

import { GamificationKit } from '../../src/core/GamificationKit.js';

describe('Bug Fix #43: GamificationKit deep config merge', () => {
  test('should preserve default api.rateLimit when only api.port is overridden', () => {
    const kit = new GamificationKit({
      api: {
        port: 4000
      }
    });

    // Should have custom port
    expect(kit.config.api.port).toBe(4000);

    // Should still have default rateLimit values
    expect(kit.config.api.rateLimit).toBeDefined();
    expect(kit.config.api.rateLimit.windowMs).toBe(60000);
    expect(kit.config.api.rateLimit.max).toBe(100);

    // Should still have other defaults
    expect(kit.config.api.cors).toBe(true);
    expect(kit.config.api.prefix).toBe('/gamification');
  });

  test('should preserve default webhooks settings when partially overridden', () => {
    const kit = new GamificationKit({
      webhooks: {
        enabled: true
      }
    });

    expect(kit.config.webhooks.enabled).toBe(true);
    expect(kit.config.webhooks.timeout).toBe(5000); // default
    expect(kit.config.webhooks.retries).toBe(3); // default
  });

  test('should preserve default logger settings when partially overridden', () => {
    const kit = new GamificationKit({
      logger: {
        level: 'debug'
      }
    });

    expect(kit.config.logger.level).toBe('debug');
    expect(kit.config.logger.enabled).toBe(true); // default
  });

  test('should allow deep override of nested values', () => {
    const kit = new GamificationKit({
      api: {
        rateLimit: {
          max: 200
        }
      }
    });

    expect(kit.config.api.rateLimit.max).toBe(200);
    expect(kit.config.api.rateLimit.windowMs).toBe(60000); // default preserved
    expect(kit.config.api.port).toBe(3001); // default preserved
  });

  test('should preserve all defaults when no config provided', () => {
    const kit = new GamificationKit();

    expect(kit.config.appName).toBe('gamification-app');
    expect(kit.config.storage.type).toBe('memory');
    expect(kit.config.api.enabled).toBe(true);
    expect(kit.config.api.port).toBe(3001);
    expect(kit.config.api.rateLimit.windowMs).toBe(60000);
    expect(kit.config.webhooks.enabled).toBe(false);
    expect(kit.config.metrics.enabled).toBe(true);
    expect(kit.config.security.apiKey).toBeNull();
  });
});
