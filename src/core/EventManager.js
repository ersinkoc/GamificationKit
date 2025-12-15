import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { validators } from '../utils/validators.js';

export class EventManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = new Logger({ prefix: 'EventManager', ...options.logger });
    this.eventHistory = new Map();
    this.wildcardHandlers = new Map();
    this.maxListeners = options.maxListeners || 100;
    this.enableHistory = options.enableHistory !== false;
    this.historyLimit = options.historyLimit || 1000;
    this.maxEventTypes = options.maxEventTypes || 500; // Fix HIGH-002: Limit unique event types

    this.setMaxListeners(this.maxListeners);
  }

  async emitAsync(eventName, data = {}) {
    validators.isEventName(eventName);
    
    const eventData = {
      eventName,
      data,
      timestamp: Date.now(),
      id: this.generateEventId()
    };

    this.logger.debug(`Emitting event: ${eventName}`, eventData);

    if (this.enableHistory) {
      this.addToHistory(eventName, eventData);
    }

    const listeners = this.listeners(eventName);
    const wildcardListeners = this.getWildcardListeners(eventName);
    const allListeners = [...listeners, ...wildcardListeners];

    const results = await Promise.allSettled(
      allListeners.map(listener =>
        Promise.resolve().then(() => listener(eventData))
      )
    );

    const errors = results
      .filter(r => r.status === 'rejected')
      .map(r => r.reason);

    if (errors.length > 0) {
      this.logger.error(`Event ${eventName} had ${errors.length} handler errors`, { errors });
    }

    return {
      eventId: eventData.id,
      listenersCount: allListeners.length,
      errors
    };
  }

  onWildcard(pattern, handler) {
    validators.isFunction(handler, 'handler');
    
    const regex = this.patternToRegex(pattern);
    if (!this.wildcardHandlers.has(pattern)) {
      this.wildcardHandlers.set(pattern, []);
    }
    
    this.wildcardHandlers.get(pattern).push({
      regex,
      handler,
      pattern
    });

    this.logger.debug(`Registered wildcard handler for pattern: ${pattern}`);
    
    return () => this.removeWildcardHandler(pattern, handler);
  }

  removeWildcardHandler(pattern, handler) {
    const handlers = this.wildcardHandlers.get(pattern);
    if (!handlers) return;

    const index = handlers.findIndex(h => h.handler === handler);
    if (index !== -1) {
      handlers.splice(index, 1);
      if (handlers.length === 0) {
        this.wildcardHandlers.delete(pattern);
      }
    }
  }

  getWildcardListeners(eventName) {
    const listeners = [];
    
    for (const handlers of this.wildcardHandlers.values()) {
      for (const { regex, handler } of handlers) {
        if (regex.test(eventName)) {
          listeners.push(handler);
        }
      }
    }
    
    return listeners;
  }

  patternToRegex(pattern) {
    // Fix HIGH-003: Validate pattern to prevent ReDoS attacks
    const MAX_PATTERN_LENGTH = 100;
    const MAX_WILDCARDS = 10;

    if (typeof pattern !== 'string') {
      throw new Error('Pattern must be a string');
    }

    if (pattern.length > MAX_PATTERN_LENGTH) {
      throw new Error(`Pattern too long (max ${MAX_PATTERN_LENGTH} characters)`);
    }

    // Count wildcards to prevent exponential backtracking
    const wildcardCount = (pattern.match(/\*/g) || []).length + (pattern.match(/\?/g) || []).length;
    if (wildcardCount > MAX_WILDCARDS) {
      throw new Error(`Too many wildcards in pattern (max ${MAX_WILDCARDS})`);
    }

    // Collapse consecutive wildcards to prevent catastrophic backtracking
    const normalizedPattern = pattern.replace(/\*+/g, '*');

    const escaped = normalizedPattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }

  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  addToHistory(eventName, eventData) {
    if (!this.eventHistory.has(eventName)) {
      // Fix HIGH-002: Enforce max event types to prevent unbounded memory growth
      if (this.eventHistory.size >= this.maxEventTypes) {
        // Remove the oldest event type (first in Map iteration order)
        const oldestKey = this.eventHistory.keys().next().value;
        this.eventHistory.delete(oldestKey);
        this.logger.debug(`Evicted oldest event type from history: ${oldestKey}`);
      }
      this.eventHistory.set(eventName, []);
    }

    const history = this.eventHistory.get(eventName);
    history.push(eventData);

    if (history.length > this.historyLimit) {
      history.shift();
    }
  }

  getEventHistory(eventName, limit = 100) {
    const history = this.eventHistory.get(eventName) || [];
    return history.slice(-limit);
  }

  getAllEventHistory(limit = 100) {
    const allEvents = [];
    
    for (const events of this.eventHistory.values()) {
      allEvents.push(...events);
    }
    
    return allEvents
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);
  }

  clearHistory(eventName) {
    if (eventName) {
      this.eventHistory.delete(eventName);
    } else {
      this.eventHistory.clear();
    }
  }

  getEventStats() {
    const stats = {};
    
    for (const [eventName, history] of this.eventHistory.entries()) {
      stats[eventName] = {
        count: history.length,
        lastEmitted: history[history.length - 1]?.timestamp,
        listeners: this.listenerCount(eventName)
      };
    }
    
    return stats;
  }

  destroy() {
    this.removeAllListeners();
    this.wildcardHandlers.clear();
    this.eventHistory.clear();
    this.logger.info('EventManager destroyed');
  }
}