export class BaseModule {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.storage = null;
    this.eventManager = null;
    this.ruleEngine = null;
    this.logger = null;
    this.config = {};
    this.initialized = false;
  }

  setContext(context) {
    this.storage = context.storage;
    this.eventManager = context.eventManager;
    this.ruleEngine = context.ruleEngine;
    this.logger = context.logger;
    this.config = { ...this.options, ...context.config };
  }

  async initialize() {
    if (this.initialized) return;
    
    this.logger.info(`Initializing module: ${this.name}`);
    
    await this.onInitialize();
    this.setupEventListeners();
    
    this.initialized = true;
    this.logger.info(`Module initialized: ${this.name}`);
  }

  async onInitialize() {
    // Override in subclasses
  }

  setupEventListeners() {
    // Override in subclasses
  }

  async getUserStats(userId) {
    // Override in subclasses
    return {};
  }

  async resetUser(userId) {
    // Override in subclasses
    this.logger.info(`Resetting user ${userId} in module ${this.name}`);
  }

  async shutdown() {
    this.logger.info(`Shutting down module: ${this.name}`);
    this.initialized = false;
  }

  getStorageKey(suffix) {
    return `${this.name}:${suffix}`;
  }

  async emitEvent(eventName, data) {
    return this.eventManager.emitAsync(`${this.name}.${eventName}`, {
      module: this.name,
      ...data
    });
  }

  async recordMetric(metric, value) {
    if (this.metricsCollector) {
      this.metricsCollector.recordModuleMetric(this.name, metric, value);
    }
  }
}