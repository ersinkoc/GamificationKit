import { GamificationKit, PointsModule, setupGracefulShutdown, setupProcessMonitoring } from '@oxog/gamification-kit';

/**
 * Example: Graceful Shutdown with Process Monitoring
 *
 * This example demonstrates how to set up graceful shutdown
 * and process monitoring for production deployments.
 */

async function main() {
  // Initialize GamificationKit
  const gamification = new GamificationKit({
    storage: {
      type: process.env.STORAGE_TYPE || 'memory'
    },
    api: {
      enabled: true,
      port: process.env.API_PORT || 3001
    }
  });

  // Add modules
  gamification.use(new PointsModule({
    dailyLimit: 1000
  }));

  // Initialize
  await gamification.initialize();

  // Setup graceful shutdown handlers
  const shutdownHandlers = setupGracefulShutdown(gamification, {
    timeout: 30000, // 30 seconds
    exitOnUncaughtException: true,
    exitOnUnhandledRejection: true
  });

  // Setup process monitoring
  const processMonitor = setupProcessMonitoring({
    interval: 60000 // Log stats every minute
  });

  console.log('GamificationKit started successfully');
  console.log(`API Server running on port ${process.env.API_PORT || 3001}`);
  console.log('Press Ctrl+C to shutdown gracefully');

  // Example: Manual shutdown after 5 minutes (for testing)
  if (process.env.AUTO_SHUTDOWN === 'true') {
    setTimeout(() => {
      console.log('Auto-shutdown triggered...');
      shutdownHandlers.shutdown();
    }, 300000); // 5 minutes
  }
}

// Run
main().catch(error => {
  console.error('Failed to start GamificationKit:', error);
  process.exit(1);
});
