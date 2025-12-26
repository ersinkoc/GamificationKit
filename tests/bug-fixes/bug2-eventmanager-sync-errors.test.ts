import type { GamificationKit } from '../src/core/GamificationKit.js';
import { jest } from '@jest/globals';
import { EventManager } from '../../src/core/EventManager.js';

describe('Bug Fix #2: EventManager handles synchronous errors', (): void => {
  let eventManager;

  beforeEach(() => {
    eventManager = new EventManager();
  });

  afterEach(() => {
    eventManager.removeAllListeners();
  });

  it('should catch synchronous errors in listeners without throwing', async (): Promise<void> => {
    const errorHandler = jest.fn(() => {
      throw new Error('Synchronous handler error');
    });
    const goodHandler = jest.fn(() => 'success');

    eventManager.on('test.event', errorHandler);
    eventManager.on('test.event', goodHandler);

    // This should NOT throw
    const result = await eventManager.emitAsync('test.event', { data: 'test' });

    // Verify both handlers were called
    expect(errorHandler).toHaveBeenCalled();
    expect(goodHandler).toHaveBeenCalled();

    // Verify result contains error information
    expect(result.listenersCount).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('Synchronous handler error');
  });

  it('should catch errors from multiple failing listeners', async (): Promise<void> => {
    const error1 = jest.fn(() => {
      throw new Error('Error 1');
    });
    const error2 = jest.fn(() => {
      throw new Error('Error 2');
    });
    const goodHandler = jest.fn(() => 'success');

    eventManager.on('test.event', error1);
    eventManager.on('test.event', goodHandler);
    eventManager.on('test.event', error2);

    const result = await eventManager.emitAsync('test.event');

    expect(result.listenersCount).toBe(3);
    expect(result.errors).toHaveLength(2);
    expect(goodHandler).toHaveBeenCalled();
  });

  it('should handle async errors correctly', async (): Promise<void> => {
    const asyncError = jest.fn(async () => {
      throw new Error('Async error');
    });
    const goodHandler = jest.fn(() => 'success');

    eventManager.on('test.event', asyncError);
    eventManager.on('test.event', goodHandler);

    const result = await eventManager.emitAsync('test.event');

    expect(result.listenersCount).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(goodHandler).toHaveBeenCalled();
  });
});
