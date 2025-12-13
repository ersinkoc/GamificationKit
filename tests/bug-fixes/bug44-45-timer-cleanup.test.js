/**
 * Bug Fix #44 & #45: StreakModule and QuestModule store initial setTimeout references
 *
 * Issue: The initial setTimeout for periodic checks was not stored, so if shutdown
 * was called before the timeout fired, it wouldn't be cleared, causing potential
 * memory leaks.
 *
 * Fix: Store the initial timeout reference and clear it in shutdown().
 */

import { StreakModule } from '../../src/modules/StreakModule.js';
import { QuestModule } from '../../src/modules/QuestModule.js';
import { MemoryStorage } from '../../src/storage/MemoryStorage.js';
import { EventManager } from '../../src/core/EventManager.js';
import { Logger } from '../../src/utils/logger.js';

describe('Bug Fix #44: StreakModule timer cleanup', () => {
  let streakModule;
  let storage;
  let eventManager;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.connect();
    eventManager = new EventManager();

    streakModule = new StreakModule();
    streakModule.setContext({
      storage,
      eventManager,
      logger: new Logger({ prefix: 'StreakModule' })
    });
  });

  afterEach(async () => {
    await streakModule.shutdown();
    await storage.disconnect();
  });

  test('should store initialCheckTimeout reference', async () => {
    await streakModule.initialize();

    // initialCheckTimeout should be set
    expect(streakModule.initialCheckTimeout).toBeDefined();
    expect(streakModule.initialCheckTimeout).not.toBeNull();
  });

  test('should clear initialCheckTimeout on shutdown', async () => {
    await streakModule.initialize();

    // Verify timeout is set
    expect(streakModule.initialCheckTimeout).not.toBeNull();

    // Shutdown should clear it
    await streakModule.shutdown();

    expect(streakModule.initialCheckTimeout).toBeNull();
    expect(streakModule.checkInterval).toBeNull();
  });

  test('should not throw when shutdown called before timeout fires', async () => {
    await streakModule.initialize();

    // Immediately call shutdown (before 60 second timeout fires)
    await expect(streakModule.shutdown()).resolves.not.toThrow();
  });
});

describe('Bug Fix #45: QuestModule timer cleanup', () => {
  let questModule;
  let storage;
  let eventManager;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.connect();
    eventManager = new EventManager();

    questModule = new QuestModule({
      autoAssignDaily: true
    });
    questModule.setContext({
      storage,
      eventManager,
      logger: new Logger({ prefix: 'QuestModule' })
    });
  });

  afterEach(async () => {
    await questModule.shutdown();
    await storage.disconnect();
  });

  test('should store initialRotationTimeout reference', async () => {
    await questModule.initialize();

    // initialRotationTimeout should be set when autoAssignDaily is true
    expect(questModule.initialRotationTimeout).toBeDefined();
    expect(questModule.initialRotationTimeout).not.toBeNull();
  });

  test('should clear initialRotationTimeout on shutdown', async () => {
    await questModule.initialize();

    // Verify timeout is set
    expect(questModule.initialRotationTimeout).not.toBeNull();

    // Shutdown should clear it
    await questModule.shutdown();

    expect(questModule.initialRotationTimeout).toBeNull();
    expect(questModule.rotationInterval).toBeNull();
  });

  test('should not throw when shutdown called before rotation fires', async () => {
    await questModule.initialize();

    // Immediately call shutdown (before daily rotation timeout fires)
    await expect(questModule.shutdown()).resolves.not.toThrow();
  });
});
