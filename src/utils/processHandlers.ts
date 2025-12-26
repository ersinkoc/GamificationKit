import { Logger } from './logger.js';

export interface GracefulShutdownOptions {
  timeout?: number;
  exitOnUncaughtException?: boolean;
  exitOnUnhandledRejection?: boolean;
}

export interface GracefulShutdownHandlers {
  shutdown: () => Promise<void>;
  cleanup: () => void;
}

export interface ProcessStats {
  startTime: number;
  restarts: number;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  pid: number;
  platform: string;
  nodeVersion: string;
}

export interface ProcessMonitoringOptions {
  interval?: number;
}

export interface ProcessMonitoring {
  getStats: () => ProcessStats;
  stop: () => void;
}

export interface MemoryLeakDetectionOptions {
  interval?: number;
  threshold?: number;
  onLeakDetected?: (info: MemoryLeakInfo) => void;
}

export interface MemoryLeakInfo {
  growth: number;
  consecutiveGrowth: number;
  currentHeap: number;
  lastHeap: number;
}

export interface MemoryLeakDetection {
  stop: () => void;
}

// Type for GamificationKit with shutdown method
interface GamificationKitInstance {
  shutdown(timeout?: number): Promise<void>;
}

/**
 * Setup graceful shutdown handlers for process signals
 */
export function setupGracefulShutdown(
  gamificationKit: GamificationKitInstance,
  options: GracefulShutdownOptions = {}
): GracefulShutdownHandlers {
  const logger = new Logger({ prefix: 'ProcessHandler' });
  const shutdownTimeout = options.timeout || 30000;
  let shutdownInitiated = false;

  const handleShutdown = async (signal: string): Promise<void> => {
    if (shutdownInitiated) {
      logger.warn(`${signal} received again, forcing exit`);
      process.exit(1);
    }

    shutdownInitiated = true;
    logger.info(`${signal} received, initiating graceful shutdown...`);

    try {
      await gamificationKit.shutdown(shutdownTimeout);
      logger.info('Graceful shutdown completed, exiting');
      process.exit(0);
    } catch (error) {
      logger.error('Graceful shutdown failed', { error: error instanceof Error ? error.message : String(error) });
      process.exit(1);
    }
  };

  // Handle SIGTERM (Docker, Kubernetes, systemd)
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  // Handle SIGQUIT
  process.on('SIGQUIT', () => handleShutdown('SIGQUIT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack
    });

    if (options.exitOnUncaughtException !== false) {
      handleShutdown('uncaughtException');
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, _promise: Promise<any>) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined
    });

    if (options.exitOnUnhandledRejection) {
      handleShutdown('unhandledRejection');
    }
  });

  // Handle process warnings
  process.on('warning', (warning: Error) => {
    logger.warn('Process warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack
    });
  });

  logger.info('Graceful shutdown handlers registered');

  return {
    /**
     * Manually trigger shutdown
     */
    shutdown: () => handleShutdown('manual'),

    /**
     * Remove all handlers
     */
    cleanup: () => {
      process.removeAllListeners('SIGTERM');
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGQUIT');
      process.removeAllListeners('uncaughtException');
      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('warning');
      logger.info('Shutdown handlers removed');
    }
  };
}

/**
 * Setup process monitoring for health checks
 */
export function setupProcessMonitoring(options: ProcessMonitoringOptions = {}): ProcessMonitoring {
  const logger = new Logger({ prefix: 'ProcessMonitor' });
  const interval = options.interval || 60000; // 1 minute

  const stats = {
    startTime: Date.now(),
    restarts: 0
  };

  const timer = setInterval(() => {
    const mem = process.memoryUsage();
    const uptime = process.uptime();

    logger.debug('Process stats', {
      uptime: Math.floor(uptime),
      memory: {
        rss: Math.floor(mem.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.floor(mem.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.floor(mem.heapTotal / 1024 / 1024) + ' MB',
        external: Math.floor(mem.external / 1024 / 1024) + ' MB'
      },
      cpu: process.cpuUsage()
    });

    // Warn if memory usage is high
    const heapUsedPercent = (mem.heapUsed / mem.heapTotal) * 100;
    if (heapUsedPercent > 90) {
      logger.warn(`High memory usage: ${heapUsedPercent.toFixed(2)}%`);
    }

    // Warn if RSS is getting large
    const rssMb = mem.rss / 1024 / 1024;
    if (rssMb > 1024) { // 1GB
      logger.warn(`High RSS memory: ${rssMb.toFixed(0)} MB`);
    }
  }, interval);

  return {
    getStats: (): ProcessStats => ({
      ...stats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version
    }),

    stop: () => {
      clearInterval(timer);
      logger.info('Process monitoring stopped');
    }
  };
}

/**
 * Setup memory leak detection
 */
export function setupMemoryLeakDetection(options: MemoryLeakDetectionOptions = {}): MemoryLeakDetection {
  const logger = new Logger({ prefix: 'MemoryLeakDetector' });
  const interval = options.interval || 300000; // 5 minutes
  const threshold = options.threshold || 50; // MB growth per interval

  let lastHeapUsed = process.memoryUsage().heapUsed;
  let consecutiveGrowth = 0;
  const maxConsecutiveGrowth = 5;

  const timer = setInterval(() => {
    const currentHeapUsed = process.memoryUsage().heapUsed;
    const growth = (currentHeapUsed - lastHeapUsed) / 1024 / 1024; // MB

    if (growth > threshold) {
      consecutiveGrowth++;
      logger.warn(`Memory growth detected: ${growth.toFixed(2)} MB`, {
        consecutiveGrowth,
        currentHeapMB: (currentHeapUsed / 1024 / 1024).toFixed(2),
        lastHeapMB: (lastHeapUsed / 1024 / 1024).toFixed(2)
      });

      if (consecutiveGrowth >= maxConsecutiveGrowth) {
        logger.error(`Potential memory leak detected! ${consecutiveGrowth} consecutive growth periods`);

        if (options.onLeakDetected) {
          options.onLeakDetected({
            growth,
            consecutiveGrowth,
            currentHeap: currentHeapUsed,
            lastHeap: lastHeapUsed
          });
        }

        consecutiveGrowth = 0; // Reset to avoid spam
      }
    } else {
      consecutiveGrowth = 0;
    }

    lastHeapUsed = currentHeapUsed;
  }, interval);

  return {
    stop: () => {
      clearInterval(timer);
      logger.info('Memory leak detection stopped');
    }
  };
}
