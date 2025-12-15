import { Logger } from '../utils/logger.js';
import { validators } from '../utils/validators.js';

export class RuleEngine {
  constructor(options = {}) {
    this.logger = new Logger({ prefix: 'RuleEngine', ...options.logger });
    this.rules = new Map();
    this.operators = this.initializeOperators();
    this.functions = this.initializeFunctions();
    this.cache = new Map();
    this.cacheEnabled = options.cacheEnabled !== false;
    this.cacheExpiry = options.cacheExpiry || 60000;
  }

  initializeOperators() {
    return {
      '==': (a, b) => a == b,
      '===': (a, b) => a === b,
      '!=': (a, b) => a != b,
      '!==': (a, b) => a !== b,
      '>': (a, b) => a > b,
      '>=': (a, b) => a >= b,
      '<': (a, b) => a < b,
      '<=': (a, b) => a <= b,
      'in': (a, b) => Array.isArray(b) ? b.includes(a) : a in b,
      'not_in': (a, b) => Array.isArray(b) ? !b.includes(a) : !(a in b),
      'contains': (a, b) => String(a).includes(b),
      'not_contains': (a, b) => !String(a).includes(b),
      'starts_with': (a, b) => String(a).startsWith(b),
      'ends_with': (a, b) => String(a).endsWith(b),
      'matches': (a, b) => {
        // Fix BUG-002: Protect against ReDoS by validating regex pattern
        // Limit pattern length and complexity to prevent catastrophic backtracking
        if (typeof b !== 'string' || b.length > 100) {
          return false;
        }
        // Check for dangerous patterns that can cause ReDoS
        const dangerousPatterns = /(\+\+|\*\*|\{\d+,\d*\}\+|\{\d+,\d*\}\*|(\.\*){3,}|\([^)]*\+\)[+*])/;
        if (dangerousPatterns.test(b)) {
          return false;
        }
        try {
          return new RegExp(b).test(String(a));
        } catch (e) {
          return false; // Invalid regex
        }
      },
      'between': (a, b) => Array.isArray(b) && b.length === 2 && a >= b[0] && a <= b[1]
    };
  }

  initializeFunctions() {
    return {
      now: () => Date.now(),
      date: (str) => new Date(str).getTime(),
      abs: Math.abs,
      min: Math.min,
      max: Math.max,
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
      length: (val) => val?.length || 0,
      lowercase: (str) => String(str).toLowerCase(),
      uppercase: (str) => String(str).toUpperCase(),
      trim: (str) => String(str).trim(),
      random: () => Math.random(),
      randomInt: (min, max) => {
        // Fix BUG-003: Validate min <= max
        if (min > max) {
          [min, max] = [max, min]; // Swap if min > max
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }
    };
  }

  addRule(name, rule) {
    validators.isNonEmptyString(name, 'rule name');
    validators.isObject(rule, 'rule');
    
    if (!rule.conditions) {
      throw new Error('Rule must have conditions');
    }

    const processedRule = {
      name,
      ...rule,
      enabled: rule.enabled !== false,
      priority: rule.priority || 0,
      createdAt: Date.now()
    };

    this.rules.set(name, processedRule);
    this.clearCache();
    
    this.logger.debug(`Added rule: ${name}`, processedRule);
    return processedRule;
  }

  removeRule(name) {
    const removed = this.rules.delete(name);
    if (removed) {
      this.clearCache();
      this.logger.debug(`Removed rule: ${name}`);
    }
    return removed;
  }

  async evaluate(context, ruleName = null) {
    validators.isObject(context, 'context');

    const cacheKey = ruleName ? 
      `${ruleName}:${JSON.stringify(context)}` : 
      `all:${JSON.stringify(context)}`;

    if (this.cacheEnabled) {
      const cached = this.getFromCache(cacheKey);
      if (cached !== null) return cached;
    }

    let results;
    if (ruleName) {
      results = await this.evaluateRule(ruleName, context);
    } else {
      results = await this.evaluateAllRules(context);
    }

    if (this.cacheEnabled) {
      this.setCache(cacheKey, results);
    }

    return results;
  }

  async evaluateRule(ruleName, context) {
    const rule = this.rules.get(ruleName);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleName}`);
    }

    if (!rule.enabled) {
      return { passed: false, reason: 'Rule disabled' };
    }

    try {
      const passed = await this.evaluateConditions(rule.conditions, context);
      const result = {
        ruleName,
        passed,
        timestamp: Date.now()
      };

      if (passed && rule.actions) {
        result.actions = rule.actions;
      }

      return result;
    } catch (error) {
      this.logger.error(`Error evaluating rule ${ruleName}`, { error });
      return {
        ruleName,
        passed: false,
        error: error.message
      };
    }
  }

  async evaluateAllRules(context) {
    const results = [];
    const sortedRules = Array.from(this.rules.values())
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      const result = await this.evaluateRule(rule.name, context);
      results.push(result);

      if (rule.stopOnMatch && result.passed) {
        break;
      }
    }

    return {
      results,
      passed: results.filter(r => r.passed),
      failed: results.filter(r => !r.passed),
      timestamp: Date.now()
    };
  }

  async evaluateConditions(conditions, context) {
    if (conditions.all) {
      const results = await Promise.all(
        conditions.all.map(cond => this.evaluateConditions(cond, context))
      );
      return results.every(r => r === true);
    }

    if (conditions.any) {
      const results = await Promise.all(
        conditions.any.map(cond => this.evaluateConditions(cond, context))
      );
      return results.some(r => r === true);
    }

    if (conditions.not) {
      const result = await this.evaluateConditions(conditions.not, context);
      return !result;
    }

    if (conditions.field && conditions.operator) {
      return this.evaluateCondition(conditions, context);
    }

    throw new Error('Invalid condition structure');
  }

  evaluateCondition(condition, context) {
    const { field, operator, value, function: fn } = condition;

    let fieldValue = this.getFieldValue(field, context);
    let compareValue = value;

    if (fn) {
      const func = this.functions[fn];
      if (!func) {
        throw new Error(`Unknown function: ${fn}`);
      }
      fieldValue = func(fieldValue);
    }

    if (typeof value === 'string' && value.startsWith('$')) {
      compareValue = this.getFieldValue(value.substring(1), context);
    }

    const op = this.operators[operator];
    if (!op) {
      throw new Error(`Unknown operator: ${operator}`);
    }

    return op(fieldValue, compareValue);
  }

  getFieldValue(field, context) {
    // Fix: Protect against prototype pollution attacks
    const DANGEROUS_PROPS = ['__proto__', 'constructor', 'prototype'];

    const parts = field.split('.');
    let value = context;

    for (const part of parts) {
      if (value == null) return undefined;

      // Block access to dangerous prototype properties
      if (DANGEROUS_PROPS.includes(part)) {
        this.logger.warn(`Blocked access to dangerous property: ${part}`);
        return undefined;
      }

      // Only access own properties to prevent prototype chain traversal
      if (typeof value === 'object' && !Object.prototype.hasOwnProperty.call(value, part)) {
        return undefined;
      }

      value = value[part];
    }

    return value;
  }

  addOperator(name, fn) {
    validators.isNonEmptyString(name, 'operator name');
    validators.isFunction(fn, 'operator function');
    
    this.operators[name] = fn;
    this.clearCache();
  }

  addFunction(name, fn) {
    validators.isNonEmptyString(name, 'function name');
    validators.isFunction(fn, 'function');
    
    this.functions[name] = fn;
    this.clearCache();
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }

  setCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  exportRules() {
    return Array.from(this.rules.values());
  }

  importRules(rules) {
    validators.isArray(rules, 'rules');
    
    for (const rule of rules) {
      this.addRule(rule.name, rule);
    }
  }

  getRuleStats() {
    return {
      totalRules: this.rules.size,
      enabledRules: Array.from(this.rules.values()).filter(r => r.enabled).length,
      cacheSize: this.cache.size
    };
  }
}