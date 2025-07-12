import { QuestModule } from '../../../src/modules/QuestModule.js';
import { EventManager } from '../../../src/core/EventManager.js';
import { MemoryStorage } from '../../../src/storage/MemoryStorage.js';
import { Logger } from '../../../src/utils/logger.js';
import { jest } from '@jest/globals';

describe('QuestModule', () => {
  let questModule;
  let eventManager;
  let storage;
  let logger;

  beforeEach(async () => {
    eventManager = new EventManager();
    storage = new MemoryStorage();
    logger = new Logger({ prefix: 'QuestModule' });
    
    questModule = new QuestModule({
      maxActiveQuests: 3,
      dailyQuestLimit: 2,
      autoAssignDaily: false // Disable auto rotation for tests
    });
    
    questModule.setContext({
      storage,
      eventManager,
      logger,
      config: {
        maxActiveQuests: 3,
        dailyQuestLimit: 2,
        autoAssignDaily: false
      }
    });
    
    await questModule.initialize();
  });

  afterEach(async () => {
    await questModule.shutdown();
  });

  describe('constructor and initialization', () => {
    it('should initialize with default config', () => {
      const module = new QuestModule();
      expect(module.name).toBe('quests');
      expect(module.defaultConfig.maxActiveQuests).toBe(5);
      expect(module.defaultConfig.enableQuestChains).toBe(true);
    });

    it('should merge config properly', () => {
      expect(questModule.config.maxActiveQuests).toBe(3);
      expect(questModule.config.dailyQuestLimit).toBe(2);
      expect(questModule.config.autoAssignDaily).toBe(false);
    });

    it('should setup event listeners', () => {
      const wildcardSpy = jest.spyOn(eventManager, 'onWildcard');
      const onSpy = jest.spyOn(eventManager, 'on');
      questModule.setupEventListeners();
      
      expect(wildcardSpy).toHaveBeenCalledWith('*', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('quest.assign', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('quest.complete', expect.any(Function));
    });

    it('should start daily rotation if enabled', async () => {
      jest.useFakeTimers();
      
      const module = new QuestModule({
        autoAssignDaily: true
      });
      
      module.setContext({
        storage,
        eventManager,
        logger,
        config: { autoAssignDaily: true }
      });
      
      const spy = jest.spyOn(module, 'startDailyRotation');
      await module.initialize();
      
      expect(spy).toHaveBeenCalled();
      
      jest.clearAllTimers();
      jest.useRealTimers();
      await module.shutdown();
    });
  });

  describe('addQuest', () => {
    it('should add quest with all properties', () => {
      const quest = {
        id: 'explore_dungeon',
        name: 'Explore the Dungeon',
        description: 'Complete all objectives in the dungeon',
        category: 'adventure',
        objectives: [
          {
            id: 'defeat_enemies',
            description: 'Defeat 10 enemies',
            type: 'event',
            target: 10,
            event: 'enemy.defeated'
          },
          {
            id: 'find_treasure',
            description: 'Find the hidden treasure',
            type: 'event',
            target: 1,
            event: 'treasure.found'
          }
        ],
        rewards: {
          points: 100,
          xp: 50,
          badges: ['dungeon_explorer']
        },
        requirements: {
          level: 5
        },
        timeLimit: 3600,
        repeatable: true,
        maxCompletions: 3
      };

      const result = questModule.addQuest(quest);
      
      expect(result.id).toBe('explore_dungeon');
      expect(result.objectives).toHaveLength(2);
      expect(result.objectives[0].progress).toBe(0);
      expect(result.objectives[0].completed).toBe(false);
      expect(result.enabled).toBe(true);
      expect(questModule.quests.has('explore_dungeon')).toBe(true);
    });

    it('should validate required properties', () => {
      expect(() => {
        questModule.addQuest({ id: 'test' });
      }).toThrow();

      expect(() => {
        questModule.addQuest({ id: 'test', name: 'Test' });
      }).toThrow();
    });

    it('should add quest to chain', () => {
      const quest1 = {
        id: 'chain_quest_1',
        name: 'Chain Quest 1',
        objectives: [{ id: 'obj1', description: 'Do something' }],
        chainId: 'main_story',
        chainOrder: 1
      };

      const quest2 = {
        id: 'chain_quest_2',
        name: 'Chain Quest 2',
        objectives: [{ id: 'obj1', description: 'Do something else' }],
        chainId: 'main_story',
        chainOrder: 2
      };

      questModule.addQuest(quest1);
      questModule.addQuest(quest2);

      expect(questModule.questChains.has('main_story')).toBe(true);
      const chain = questModule.questChains.get('main_story');
      expect(chain.quests).toHaveLength(2);
      expect(chain.quests[0].chainOrder).toBe(1);
      expect(chain.quests[1].chainOrder).toBe(2);
    });
  });

  describe('assignQuest', () => {
    let testQuest;

    beforeEach(() => {
      testQuest = {
        id: 'test_quest',
        name: 'Test Quest',
        objectives: [
          {
            id: 'obj1',
            description: 'Complete objective',
            type: 'event',
            target: 1,
            event: 'test.event'
          }
        ],
        rewards: { points: 50 }
      };
      questModule.addQuest(testQuest);
    });

    it('should assign quest successfully', async () => {
      const result = await questModule.assignQuest('user123', 'test_quest');
      
      expect(result.success).toBe(true);
      expect(result.assignment).toBeDefined();
      expect(result.assignment.userId).toBe('user123');
      expect(result.assignment.questId).toBe('test_quest');
      expect(result.assignment.objectives).toHaveLength(1);
      expect(result.assignment.completed).toBe(false);
    });

    it('should prevent duplicate active assignments', async () => {
      await questModule.assignQuest('user123', 'test_quest');
      const result = await questModule.assignQuest('user123', 'test_quest');
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('already_assigned');
    });

    it('should enforce max active quests limit', async () => {
      // Add more quests up to the limit (3 based on config)
      for (let i = 1; i <= 3; i++) {
        questModule.addQuest({
          id: `quest${i}`,
          name: `Quest ${i}`,
          objectives: [{ id: 'obj', description: 'Do something' }]
        });
        await questModule.assignQuest('user123', `quest${i}`);
      }

      // Add a new quest to test the limit
      questModule.addQuest({
        id: 'overflow_quest',
        name: 'Overflow Quest',
        objectives: [{ id: 'obj', description: 'Should fail due to limit' }]
      });
      
      // Now try to assign one more quest (should fail)
      const result = await questModule.assignQuest('user123', 'overflow_quest');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('max_active_quests');
      expect(result.limit).toBe(3);
    });

    it('should check requirements', async () => {
      questModule.addQuest({
        id: 'locked_quest',
        name: 'Locked Quest',
        objectives: [{ id: 'obj', description: 'Do something' }],
        requirements: {
          level: 10,
          badges: ['prerequisite_badge']
        }
      });

      eventManager.emitAsync = jest.fn()
        .mockResolvedValueOnce({ level: 5 }) // Level check fails
        .mockResolvedValueOnce(false); // Badge check fails

      const result = await questModule.assignQuest('user123', 'locked_quest');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('requirements_not_met');
      expect(result.requirements).toHaveLength(2);
    });

    it('should handle quest completion limits', async () => {
      // Update the quest to have completion limits
      const questWithLimits = {
        ...testQuest,
        maxCompletions: 2
      };
      questModule.quests.set('test_quest', questWithLimits);

      // Complete quest twice
      for (let i = 0; i < 2; i++) {
        await questModule.assignQuest('user123', 'test_quest');
        await questModule.completeQuest('user123', 'test_quest');
      }

      const result = await questModule.assignQuest('user123', 'test_quest');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('max_completions_reached');
      // The actual implementation returns different properties
      expect(result.completions).toBe(2);
    });

    it('should handle disabled quests', async () => {
      testQuest.enabled = false;
      questModule.quests.set('test_quest', testQuest);

      const result = await questModule.assignQuest('user123', 'test_quest');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('quest_disabled');
    });

    it('should emit assignment event', async () => {
      const emitSpy = jest.spyOn(questModule, 'emitEvent');
      await questModule.assignQuest('user123', 'test_quest');
      
      expect(emitSpy).toHaveBeenCalledWith('assigned', expect.objectContaining({
        userId: 'user123',
        questId: 'test_quest'
      }));
    });

    it('should set expiration time for time-limited quests', async () => {
      questModule.addQuest({
        id: 'timed_quest',
        name: 'Timed Quest',
        objectives: [{ id: 'obj', description: 'Do quickly' }],
        timeLimit: 3600 // 1 hour
      });

      const result = await questModule.assignQuest('user123', 'timed_quest');
      expect(result.assignment.expiresAt).toBeDefined();
      expect(result.assignment.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('updateObjectiveProgress', () => {
    beforeEach(async () => {
      questModule.addQuest({
        id: 'progress_quest',
        name: 'Progress Quest',
        objectives: [
          {
            id: 'collect_items',
            description: 'Collect 10 items',
            type: 'event',
            target: 10,
            event: 'item.collected'
          },
          {
            id: 'defeat_boss',
            description: 'Defeat the boss',
            type: 'event',
            target: 1,
            event: 'boss.defeated'
          }
        ]
      });
      await questModule.assignQuest('user123', 'progress_quest');
    });

    it('should update objective progress', async () => {
      const result = await questModule.updateObjectiveProgress(
        'user123',
        'progress_quest',
        'collect_items',
        3
      );

      expect(result.progress).toBe(3);
      expect(result.target).toBe(10);
      expect(result.completed).toBe(false);
      expect(result.questCompleted).toBe(false);
    });

    it('should complete objective when target reached', async () => {
      const result = await questModule.updateObjectiveProgress(
        'user123',
        'progress_quest',
        'collect_items',
        10
      );

      expect(result.progress).toBe(10);
      expect(result.completed).toBe(true);
    });

    it('should not exceed target', async () => {
      const result = await questModule.updateObjectiveProgress(
        'user123',
        'progress_quest',
        'collect_items',
        15
      );

      expect(result.progress).toBe(10);
    });

    it('should complete quest when all objectives done', async () => {
      const completeSpy = jest.spyOn(questModule, 'completeQuest');
      
      await questModule.updateObjectiveProgress('user123', 'progress_quest', 'collect_items', 10);
      await questModule.updateObjectiveProgress('user123', 'progress_quest', 'defeat_boss', 1);

      expect(completeSpy).toHaveBeenCalledWith('user123', 'progress_quest');
    });

    it('should handle expired quests', async () => {
      const assignment = await questModule.getQuestAssignment('user123', 'progress_quest');
      assignment.expiresAt = Date.now() - 1000;
      await storage.hset(
        questModule.getStorageKey('assignments:user123'),
        'progress_quest',
        assignment
      );

      const expireSpy = jest.spyOn(questModule, 'expireQuest');
      const result = await questModule.updateObjectiveProgress(
        'user123',
        'progress_quest',
        'collect_items',
        1
      );

      expect(result).toBeNull();
      expect(expireSpy).toHaveBeenCalledWith('user123', 'progress_quest');
    });

    it('should emit progress event', async () => {
      const emitSpy = jest.spyOn(questModule, 'emitEvent');
      await questModule.updateObjectiveProgress(
        'user123',
        'progress_quest',
        'collect_items',
        5
      );

      expect(emitSpy).toHaveBeenCalledWith('progress.updated', expect.objectContaining({
        userId: 'user123',
        questId: 'progress_quest',
        objectiveId: 'collect_items',
        progress: 5
      }));
    });
  });

  describe('completeQuest', () => {
    beforeEach(async () => {
      questModule.addQuest({
        id: 'complete_test',
        name: 'Complete Test',
        objectives: [{ id: 'obj', description: 'Do it' }],
        rewards: {
          points: 100,
          xp: 50,
          badges: ['quest_badge']
        }
      });
      await questModule.assignQuest('user123', 'complete_test');
    });

    it('should complete quest successfully', async () => {
      const result = await questModule.completeQuest('user123', 'complete_test');
      
      expect(result.success).toBe(true);
      expect(result.rewards).toEqual({
        points: 100,
        xp: 50,
        badges: ['quest_badge']
      });
      expect(result.completions).toBe(1);
    });

    it('should prevent duplicate completion', async () => {
      await questModule.completeQuest('user123', 'complete_test');
      const result = await questModule.completeQuest('user123', 'complete_test');
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('already_completed');
    });

    it('should process rewards', async () => {
      const eventSpy = jest.spyOn(eventManager, 'emitAsync');
      await questModule.completeQuest('user123', 'complete_test');

      expect(eventSpy).toHaveBeenCalledWith('points.award', {
        userId: 'user123',
        points: 100,
        reason: 'quest_reward'
      });

      expect(eventSpy).toHaveBeenCalledWith('levels.addXP', {
        userId: 'user123',
        xp: 50,
        reason: 'quest_reward'
      });

      expect(eventSpy).toHaveBeenCalledWith('badges.award', {
        userId: 'user123',
        badgeId: 'quest_badge',
        metadata: { source: 'quest_reward' }
      });
    });

    it('should update statistics', async () => {
      await questModule.completeQuest('user123', 'complete_test');
      
      const userStats = await storage.hget(
        questModule.getStorageKey('stats'),
        'user123:completed'
      );
      expect(userStats).toBe(1);

      const questStats = await storage.hget(
        questModule.getStorageKey('stats'),
        'quest:complete_test:completions'
      );
      expect(questStats).toBe(1);
    });

    it('should emit completion event', async () => {
      const emitSpy = jest.spyOn(questModule, 'emitEvent');
      await questModule.completeQuest('user123', 'complete_test');

      expect(emitSpy).toHaveBeenCalledWith('completed', expect.objectContaining({
        userId: 'user123',
        questId: 'complete_test'
      }));
    });

    it('should handle quest chains', async () => {
      // Create chain quests
      questModule.addQuest({
        id: 'chain1',
        name: 'Chain 1',
        objectives: [{ id: 'obj', description: 'First quest' }],
        chainId: 'story',
        chainOrder: 1
      });

      questModule.addQuest({
        id: 'chain2',
        name: 'Chain 2',
        objectives: [{ id: 'obj', description: 'Second quest' }],
        chainId: 'story',
        chainOrder: 2
      });

      await questModule.assignQuest('user123', 'chain1');
      const progressSpy = jest.spyOn(questModule, 'progressChain');
      
      await questModule.completeQuest('user123', 'chain1');
      
      expect(progressSpy).toHaveBeenCalledWith('user123', 'story', 1);
      
      // Check if next quest was assigned
      const assignments = await questModule.getUserQuests('user123');
      expect(assignments.some(a => a.questId === 'chain2')).toBe(true);
    });
  });

  describe('checkQuestProgress', () => {
    beforeEach(async () => {
      questModule.addQuest({
        id: 'event_quest',
        name: 'Event Quest',
        objectives: [
          {
            id: 'login',
            description: 'Login 5 times',
            type: 'event',
            target: 5,
            event: 'user.login'
          },
          {
            id: 'purchase',
            description: 'Make a purchase',
            type: 'event',
            target: 1,
            event: 'purchase.*',
            conditions: {
              amount: { min: 10 }
            }
          }
        ]
      });
      await questModule.assignQuest('user123', 'event_quest');
    });

    it('should track matching events', async () => {
      const updateSpy = jest.spyOn(questModule, 'updateObjectiveProgress');
      
      await questModule.checkQuestProgress({
        eventName: 'user.login',
        data: { userId: 'user123' }
      });

      expect(updateSpy).toHaveBeenCalledWith('user123', 'event_quest', 'login', 1);
    });

    it('should match wildcard events', async () => {
      const updateSpy = jest.spyOn(questModule, 'updateObjectiveProgress');
      
      await questModule.checkQuestProgress({
        eventName: 'purchase.item',
        data: { userId: 'user123', amount: 15 }
      });

      expect(updateSpy).toHaveBeenCalledWith('user123', 'event_quest', 'purchase', 1);
    });

    it('should check conditions', async () => {
      const updateSpy = jest.spyOn(questModule, 'updateObjectiveProgress');
      
      // Amount too low
      await questModule.checkQuestProgress({
        eventName: 'purchase.item',
        data: { userId: 'user123', amount: 5 }
      });

      expect(updateSpy).not.toHaveBeenCalled();

      // Amount sufficient
      await questModule.checkQuestProgress({
        eventName: 'purchase.item',
        data: { userId: 'user123', amount: 15 }
      });

      expect(updateSpy).toHaveBeenCalled();
    });

    it('should ignore events without userId', async () => {
      const updateSpy = jest.spyOn(questModule, 'updateObjectiveProgress');
      
      await questModule.checkQuestProgress({
        eventName: 'user.login',
        data: { someOtherData: 'value' }
      });

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('evaluateCondition', () => {
    it('should evaluate equals condition', () => {
      expect(questModule.evaluateCondition('test', { equals: 'test' })).toBe(true);
      expect(questModule.evaluateCondition('test', { equals: 'other' })).toBe(false);
    });

    it('should evaluate min/max conditions', () => {
      expect(questModule.evaluateCondition(5, { min: 3 })).toBe(true);
      expect(questModule.evaluateCondition(5, { min: 10 })).toBe(false);
      expect(questModule.evaluateCondition(5, { max: 10 })).toBe(true);
      expect(questModule.evaluateCondition(5, { max: 3 })).toBe(false);
      expect(questModule.evaluateCondition(5, { min: 3, max: 10 })).toBe(true);
    });

    it('should evaluate in condition', () => {
      expect(questModule.evaluateCondition('a', { in: ['a', 'b', 'c'] })).toBe(true);
      expect(questModule.evaluateCondition('d', { in: ['a', 'b', 'c'] })).toBe(false);
    });

    it('should evaluate simple equality', () => {
      expect(questModule.evaluateCondition('test', 'test')).toBe(true);
      expect(questModule.evaluateCondition(5, 5)).toBe(true);
      expect(questModule.evaluateCondition(5, 10)).toBe(false);
    });
  });

  describe('getUserQuests', () => {
    beforeEach(async () => {
      questModule.addQuest({
        id: 'quest1',
        name: 'Quest 1',
        objectives: [{ id: 'obj', description: 'Do something' }]
      });
      
      questModule.addQuest({
        id: 'quest2',
        name: 'Quest 2',
        objectives: [{ id: 'obj', description: 'Do something else' }]
      });

      await questModule.assignQuest('user123', 'quest1');
      await questModule.assignQuest('user123', 'quest2');
      await questModule.completeQuest('user123', 'quest1');
    });

    it('should get all user quests', async () => {
      const quests = await questModule.getUserQuests('user123');
      expect(quests).toHaveLength(2);
    });

    it('should filter out completed quests', async () => {
      const quests = await questModule.getUserQuests('user123', false);
      expect(quests).toHaveLength(1);
      expect(quests[0].questId).toBe('quest2');
    });

    it('should get active quests', async () => {
      const quests = await questModule.getActiveQuests('user123');
      expect(quests).toHaveLength(1);
      expect(quests[0].completed).toBe(false);
    });

    it('should get completed quests', async () => {
      const quests = await questModule.getCompletedQuests('user123');
      expect(quests).toHaveLength(1);
      expect(quests[0].completed).toBe(true);
    });
  });

  describe('assignDailyQuests', () => {
    beforeEach(() => {
      // Add daily quests
      for (let i = 1; i <= 4; i++) {
        questModule.addQuest({
          id: `daily${i}`,
          name: `Daily Quest ${i}`,
          category: 'daily',
          objectives: [{ id: 'obj', description: 'Daily task' }],
          priority: i
        });
      }
    });

    it('should assign daily quests up to limit', async () => {
      const assigned = await questModule.assignDailyQuests('user123');
      expect(assigned).toHaveLength(2);
      expect(assigned).toContain('daily4'); // Highest priority
      expect(assigned).toContain('daily3');
    });

    it('should not exceed daily limit', async () => {
      await questModule.assignDailyQuests('user123');
      const secondAttempt = await questModule.assignDailyQuests('user123');
      expect(secondAttempt).toHaveLength(0);
    });

    it('should track daily assignments', async () => {
      await questModule.assignDailyQuests('user123');
      
      const today = new Date().toISOString().split('T')[0];
      const todayAssignments = await storage.get(
        questModule.getStorageKey(`daily:user123:${today}`)
      );
      
      expect(todayAssignments).toHaveLength(2);
    });

    it('should respect user requirements', async () => {
      questModule.addQuest({
        id: 'daily_locked',
        name: 'Locked Daily',
        category: 'daily',
        objectives: [{ id: 'obj', description: 'Do something' }],
        requirements: { level: 10 },
        priority: 10
      });

      eventManager.emitAsync = jest.fn().mockResolvedValue({ level: 5 });
      
      const assigned = await questModule.assignDailyQuests('user123');
      expect(assigned).not.toContain('daily_locked');
    });
  });

  describe('expireQuest', () => {
    beforeEach(async () => {
      questModule.addQuest({
        id: 'expiring_quest',
        name: 'Expiring Quest',
        objectives: [{ id: 'obj', description: 'Do quickly' }],
        timeLimit: 1 // 1 second
      });
      await questModule.assignQuest('user123', 'expiring_quest');
    });

    it('should expire quest', async () => {
      const emitSpy = jest.spyOn(questModule, 'emitEvent');
      await questModule.expireQuest('user123', 'expiring_quest');

      expect(emitSpy).toHaveBeenCalledWith('expired', expect.objectContaining({
        userId: 'user123',
        questId: 'expiring_quest'
      }));

      const assignment = await questModule.getQuestAssignment('user123', 'expiring_quest');
      expect(assignment).toBeNull();
    });

    it('should not expire completed quests', async () => {
      await questModule.completeQuest('user123', 'expiring_quest');
      const emitSpy = jest.spyOn(questModule, 'emitEvent');
      
      await questModule.expireQuest('user123', 'expiring_quest');
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('getUserStats', () => {
    beforeEach(async () => {
      // Add various quests
      questModule.addQuest({
        id: 'adventure1',
        name: 'Adventure 1',
        category: 'adventure',
        objectives: [
          { id: 'obj1', description: 'Task 1' },
          { id: 'obj2', description: 'Task 2' }
        ]
      });

      questModule.addQuest({
        id: 'daily1',
        name: 'Daily 1',
        category: 'daily',
        objectives: [{ id: 'obj', description: 'Daily task' }]
      });

      // Assign and partially complete adventure quest
      await questModule.assignQuest('user123', 'adventure1');
      await questModule.updateObjectiveProgress('user123', 'adventure1', 'obj1', 1);

      // Complete daily quest
      await questModule.assignQuest('user123', 'daily1');
      await questModule.completeQuest('user123', 'daily1');
    });

    it('should return comprehensive stats', async () => {
      const stats = await questModule.getUserStats('user123');

      expect(stats.active).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.byCategory).toEqual({ daily: 1 });
      expect(stats.inProgress.adventure1).toBeDefined();
      expect(stats.inProgress.adventure1.progress).toBe(50);
      expect(stats.inProgress.adventure1.objectives).toBe('1/2');
    });

    it('should include daily limit info', async () => {
      await questModule.assignDailyQuests('user123');
      const stats = await questModule.getUserStats('user123');

      expect(stats.dailyLimit.used).toBe(2);
      expect(stats.dailyLimit.limit).toBe(2);
    });
  });

  describe('resetUser', () => {
    beforeEach(async () => {
      questModule.addQuest({
        id: 'test',
        name: 'Test',
        objectives: [{ id: 'obj', description: 'Do something' }]
      });

      await questModule.assignQuest('user123', 'test');
      await questModule.completeQuest('user123', 'test');
      await questModule.assignDailyQuests('user123');
    });

    it('should reset all user quest data', async () => {
      // Verify data exists
      let quests = await questModule.getUserQuests('user123');
      expect(quests).toHaveLength(1);

      const stats = await storage.hget(
        questModule.getStorageKey('stats'),
        'user123:completed'
      );
      expect(stats).toBe(1);

      // Reset user
      await questModule.resetUser('user123');

      // Verify data is cleared
      quests = await questModule.getUserQuests('user123');
      expect(quests).toEqual([]);

      const resetStats = await storage.hget(
        questModule.getStorageKey('stats'),
        'user123:completed'
      );
      expect(resetStats).toBeNull();

      const today = new Date().toISOString().split('T')[0];
      const dailyAssignments = await storage.get(
        questModule.getStorageKey(`daily:user123:${today}`)
      );
      expect(dailyAssignments).toBeNull();
    });

    it('should emit reset event', async () => {
      const emitSpy = jest.spyOn(questModule, 'emitEvent');
      await questModule.resetUser('user123');

      expect(emitSpy).toHaveBeenCalledWith('user.reset', { userId: 'user123' });
    });
  });

  describe('daily rotation', () => {
    it('should schedule daily rotation', () => {
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      
      questModule.startDailyRotation();
      
      expect(setTimeoutSpy).toHaveBeenCalled();
      const delay = setTimeoutSpy.mock.calls[0][1];
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
      
      jest.useRealTimers();
    });

    it('should rotate daily quests for all users', async () => {
      // Setup users with quests
      await questModule.assignQuest('user1', 'test');
      await questModule.assignQuest('user2', 'test');

      const assignSpy = jest.spyOn(questModule, 'assignDailyQuests');
      await questModule.rotateDailyQuests();

      expect(assignSpy).toHaveBeenCalledWith('user1');
      expect(assignSpy).toHaveBeenCalledWith('user2');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle missing quest gracefully', async () => {
      await expect(questModule.assignQuest('user123', 'nonexistent'))
        .rejects.toThrow('Quest not found');
    });

    it('should handle storage errors', async () => {
      const errorStorage = {
        hget: jest.fn().mockRejectedValue(new Error('Storage error')),
        hset: jest.fn().mockRejectedValue(new Error('Storage error')),
        hgetall: jest.fn().mockRejectedValue(new Error('Storage error'))
      };

      const module = new QuestModule();
      module.setContext({
        storage: errorStorage,
        eventManager,
        logger,
        config: {}
      });
      
      await module.initialize();

      await expect(module.getUserQuests('user123'))
        .rejects.toThrow('Storage error');
    });

    it('should handle concurrent quest completions', async () => {
      questModule.addQuest({
        id: 'concurrent',
        name: 'Concurrent',
        objectives: [{ id: 'obj', description: 'Do it' }]
      });

      await questModule.assignQuest('user123', 'concurrent');

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(questModule.completeQuest('user123', 'concurrent'));
      }

      const results = await Promise.all(promises);
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      expect(successful).toBe(1);
      expect(failed).toBe(4);
    });
  });
});