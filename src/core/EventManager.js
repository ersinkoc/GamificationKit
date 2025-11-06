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
    const escaped = pattern
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