export class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.prefix = options.prefix || 'GamificationKit';
    this.enabled = options.enabled !== false;
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
  }

  log(level, message, meta = {}) {
    if (!this.enabled || this.levels[level] > this.levels[this.level]) return;

    const timestamp = new Date().toISOString();
    const logData = {
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

  error(message, meta) {
    return this.log('error', message, meta);
  }

  warn(message, meta) {
    return this.log('warn', message, meta);
  }

  info(message, meta) {
    return this.log('info', message, meta);
  }

  debug(message, meta) {
    return this.log('debug', message, meta);
  }

  child(prefix) {
    return new Logger({
      ...this,
      prefix: `${this.prefix}:${prefix}`
    });
  }
}