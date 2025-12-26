import type { StorageInterface } from '../types/storage.js';
import type { EventManager } from '../core/EventManager.js';
import type { RuleEngine } from '../core/RuleEngine.js';
import type { Logger } from '../utils/logger.js';
import type { MetricsCollector } from '../core/MetricsCollector.js';

export interface ModuleContext {
  storage: StorageInterface;
  eventManager: EventManager;
  ruleEngine: RuleEngine;
  logger: Logger;
  config?: any;
}

export interface ModuleOptions {
  [key: string]: any;
}

export class BaseModule {
  name: string;
  options: ModuleOptions;
  storage: StorageInterface | null;
  eventManager: EventManager | null;
  ruleEngine: RuleEngine | null;
  logger: Logger | null;
  config: any;
  initialized: boolean;
  metricsCollector?: MetricsCollector | null;

  constructor(name: string, options: ModuleOptions = {}) {
    this.name = name;
    this.options = options;
    this.storage = null;
    this.eventManager = null;
    this.ruleEngine = null;
    this.logger = null;
    this.config = {};
    this.initialized = false;
  }

  setContext(context: ModuleContext): void {
    this.storage = context.storage;
    this.eventManager = context.eventManager;
    this.ruleEngine = context.ruleEngine;
    this.logger = context.logger;
    this.config = { ...this.options, ...context.config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger?.info(`Initializing module: ${this.name}`);

    await this.onInitialize();
    this.setupEventListeners();

    this.initialized = true;
    this.logger?.info(`Module initialized: ${this.name}`);
  }

  async onInitialize(): Promise<void> {
    // Override in subclasses
  }

  setupEventListeners(): void {
    // Override in subclasses
  }

  async getUserStats(_userId: string): Promise<any> {
    // Override in subclasses
    return {};
  }

  async resetUser(userId: string): Promise<void> {
    // Override in subclasses
    this.logger?.info(`Resetting user ${userId} in module ${this.name}`);
  }

  async shutdown(): Promise<void> {
    this.logger?.info(`Shutting down module: ${this.name}`);
    this.initialized = false;
  }

  getStorageKey(suffix: string): string {
    return `${this.name}:${suffix}`;
  }

  async emitEvent(eventName: string, data: any): Promise<any> {
    return this.eventManager?.emitAsync(`${this.name}.${eventName}`, {
      module: this.name,
      ...data
    });
  }

  async recordMetric(metric: string, value: number): Promise<void> {
    if (this.metricsCollector) {
      this.metricsCollector.recordModuleMetric(this.name, metric, value);
    }
  }
}
