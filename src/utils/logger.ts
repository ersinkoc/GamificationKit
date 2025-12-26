import type { LogLevel, Metadata } from '../types/common.js';

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  enabled?: boolean;
}

export interface LogData {
  timestamp: string;
  level: LogLevel;
  prefix: string;
  message: string;
  [key: string]: any;
}

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private enabled: boolean;
  private readonly levels: Record<LogLevel, number>;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level || 'info';
    this.prefix = options.prefix || 'GamificationKit';
    this.enabled = options.enabled !== false;
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
  }

  log(level: LogLevel, message: string, meta: Metadata = {}): LogData | undefined {
    if (!this.enabled || this.levels[level] > this.levels[this.level]) {
      return undefined;
    }

    const timestamp = new Date().toISOString();
    const logData: LogData = {
      timestamp,
      level,
      prefix: this.prefix,
      message,
      ...meta
    };

    const output = `[${timestamp}] [${this.prefix}] ${level.toUpperCase()}: ${message}`;

    switch (level) {
      case 'error':
        console.error(output, meta);
        break;
      case 'warn':
        console.warn(output, meta);
        break;
      case 'debug':
        console.debug(output, meta);
        break;
      default:
        console.log(output, meta);
    }

    return logData;
  }

  error(message: string, meta?: Metadata): LogData | undefined {
    return this.log('error', message, meta);
  }

  warn(message: string, meta?: Metadata): LogData | undefined {
    return this.log('warn', message, meta);
  }

  info(message: string, meta?: Metadata): LogData | undefined {
    return this.log('info', message, meta);
  }

  debug(message: string, meta?: Metadata): LogData | undefined {
    return this.log('debug', message, meta);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setContext(context: string): void {
    this.prefix = context;
  }

  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      enabled: this.enabled,
      prefix: `${this.prefix}:${prefix}`
    });
  }
}
