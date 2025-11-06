import { BaseModule } from './BaseModule.js';
import { validators } from '../utils/validators.js';

export class QuestModule extends BaseModule {
  constructor(options = {}) {
    super('quests', options);
    
    this.defaultConfig = {
      maxActiveQuests: 5,
      dailyQuestLimit: 3,
      enableQuestChains: true,
      autoAssignDaily: true,
      questRotationHour: 0, // UTC hour for daily quest rotation
      categories: ['daily', 'weekly', 'special', 'achievement']
    };
    
    this.quests = new Map();
    this.questChains = new Map();
    this.rotationInterval = null;
  }

  async onInitialize() {
    this.config = { ...this.defaultConfig, ...this.config };
    
    // Start daily quest rotation
    if (this.config.autoAssignDaily) {
      this.startDailyRotation();
    }
  }

  setupEventListeners() {
    // Listen for quest progress events
    this.eventManager.onWildcard('*', async (event) => {
      await this.checkQuestProgress(event);
    });
    
    this.eventManager.on('quest.assign', async (event) => {
      const { userId, questId } = event.data;
      await this.assignQuest(userId, questId);
    });
    
    this.eventManager.on('quest.complete', async (event) => {
      const { userId, questId } = event.data;
      await this.completeQuest(userId, questId);
    });
  }

  addQuest(quest) {
    validators.hasProperties(quest, ['id', 'name', 'objectives'], 'quest');
    
    const processedQuest = {
      id: quest.id,
      name: quest.name,
      description: quest.description || '',
      category: quest.category || 'general',
      objectives: this.processObjectives(quest.objectives),
      rewards: quest.rewards || {},
      requirements: quest.requirements || {},
      timeLimit: quest.timeLimit || null,
      repeatable: quest.repeatable || false,
      maxCompletions: quest.maxCompletions || 1,
      chainId: quest.chainId || null,
      chainOrder: quest.chainOrder || 0,
      metadata: quest.metadata || {},
      enabled: quest.enabled !== false,
      priority: quest.priority || 0,
      createdAt: Date.now()
    };
    
    this.quests.set(quest.id, processedQuest);
    
    // Add to chain if applicable
    if (processedQuest.chainId) {
      this.addToChain(processedQuest);
    }
    
    if (this.logger) {
      this.logger.debug(`Quest added: ${quest.id}`);
    }
    
    return processedQuest;
  }

  processObjectives(objectives) {
    return objectives.map(obj => ({
      id: obj.id,
      description: obj.description,
      type: obj.type || 'event',
      target: obj.target || 1,
      event: obj.event || null,
      conditions: obj.conditions || {},
      progress: 0,
      completed: false
    }));
  }

  addToChain(quest) {
    if (!this.questChains.has(quest.chainId)) {
      this.questChains.set(quest.chainId, {
        id: quest.chainId,
        quests: []
      });
    }
    
    const chain = this.questChains.get(quest.chainId);
    chain.quests.push(quest);
    chain.quests.sort((a, b) => a.chainOrder - b.chainOrder);
  }

  async assignQuest(userId, questId) {
    validators.isUserId(userId);
    
    const quest = this.quests.get(questId);
    if (!quest) {
      throw new Error(`Quest not found: ${questId}`);
    }
    
    if (!quest.enabled) {
      return {
        success: false,
        reason: 'quest_disabled'
      };
    }
    
    // Check if already assigned
    const userQuests = await this.getUserQuests(userId);
    const existing = userQuests.find(q => q.questId === questId);
    
    if (existing && !existing.completed) {
      return {
        success: false,
        reason: 'already_assigned'
      };
    }
    
    // Check max completions - count all completions including from completed assignments
    const completionCount = await this.getQuestCompletions(userId, questId);
    if (completionCount >= quest.maxCompletions) {
      return {
        success: false,
        reason: 'max_completions_reached',
        completions: completionCount
      };
    }
    
    // Check active quest limit - get fresh count from storage
    const activeQuests = await this.getActiveQuests(userId);
    if (activeQuests.length >= this.config.maxActiveQuests) {
      return {
        success: false,
        reason: 'max_active_quests',
        limit: this.config.maxActiveQuests
      };
    }
    
    // Check requirements
    const meetsRequirements = await this.checkRequirements(userId, quest.requirements);
    if (!meetsRequirements.success) {
      return {
        success: false,
        reason: 'requirements_not_met',
        requirements: meetsRequirements.failed
      };
    }
    
    // Create quest assignment
    const assignment = {
      id: `assign_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      userId,
      questId,
      questData: {
        name: quest.name,
        description: quest.description,
        category: quest.category
      },
      objectives: quest.objectives.map(obj => ({
        ...obj,
        progress: 0,
        completed: false
      })),
      assignedAt: Date.now(),
      expiresAt: quest.timeLimit ? Date.now() + quest.timeLimit * 1000 : null,
      completed: false,
      completedAt: null
    };
    
    // Store assignment
    await this.storage.hset(
      this.getStorageKey(`assignments:${userId}`),
      questId,
      assignment
    );
    
    await this.emitEvent('assigned', {
      userId,
      questId,
      assignment
    });
    
    this.logger.info(`Quest ${questId} assigned to user ${userId}`);
    
    return {
      success: true,
      assignment
    };
  }

  async checkRequirements(userId, requirements) {
    const failed = [];
    
    if (requirements.level) {
      const levelData = await this.eventManager.emitAsync('levels.get', { userId });
      if (!levelData || levelData.level < requirements.level) {
        failed.push({ type: 'level', required: requirements.level });
      }
    }
    
    if (requirements.badges) {
      for (const badgeId of requirements.badges) {
        const hasBadge = await this.eventManager.emitAsync('badges.has', { userId, badgeId });
        if (!hasBadge) {
          failed.push({ type: 'badge', required: badgeId });
        }
      }
    }
    
    if (requirements.quests) {
      const completedQuests = await this.getCompletedQuests(userId);
      for (const questId of requirements.quests) {
        if (!completedQuests.some(q => q.questId === questId)) {
          failed.push({ type: 'quest', required: questId });
        }
      }
    }
    
    if (requirements.custom) {
      const customCheck = await this.eventManager.emitAsync('quest.requirement.custom', {
        userId,
        requirements: requirements.custom
      });
      
      if (!customCheck || !customCheck.success) {
        failed.push({ type: 'custom', details: customCheck?.failed });
      }
    }
    
    return {
      success: failed.length === 0,
      failed
    };
  }

  async updateObjectiveProgress(userId, questId, objectiveId, increment = 1) {
    validators.isUserId(userId);
    
    const assignment = await this.getQuestAssignment(userId, questId);
    if (!assignment || assignment.completed) {
      return null;
    }
    
    // Check if quest expired
    if (assignment.expiresAt && assignment.expiresAt < Date.now()) {
      await this.expireQuest(userId, questId);
      return null;
    }
    
    const objective = assignment.objectives.find(o => o.id === objectiveId);
    if (!objective || objective.completed) {
      return null;
    }
    
    objective.progress = Math.min(objective.progress + increment, objective.target);
    
    if (objective.progress >= objective.target) {
      objective.completed = true;
      objective.completedAt = Date.now();
    }
    
    // Update assignment
    await this.storage.hset(
      this.getStorageKey(`assignments:${userId}`),
      questId,
      assignment
    );
    
    // Check if all objectives completed
    const allCompleted = assignment.objectives.every(o => o.completed);
    
    if (allCompleted) {
      await this.completeQuest(userId, questId);
    } else {
      await this.emitEvent('progress.updated', {
        userId,
        questId,
        objectiveId,
        progress: objective.progress,
        target: objective.target,
        completed: objective.completed
      });
    }
    
    return {
      objectiveId,
      progress: objective.progress,
      target: objective.target,
      completed: objective.completed,
      questCompleted: allCompleted
    };
  }

  async completeQuest(userId, questId) {
    validators.isUserId(userId);
    
    // Use a simple lock mechanism to prevent concurrent completions
    const lockKey = `${userId}:${questId}`;
    if (this.completionLocks?.has(lockKey)) {
      return {
        success: false,
        reason: 'already_completing'
      };
    }
    
    if (!this.completionLocks) {
      this.completionLocks = new Set();
    }
    this.completionLocks.add(lockKey);
    
    try {
      const assignment = await this.getQuestAssignment(userId, questId);
      if (!assignment || assignment.completed) {
        return {
          success: false,
          reason: assignment ? 'already_completed' : 'not_assigned'
        };
      }
    
      const quest = this.quests.get(questId);
      if (!quest) {
        return {
          success: false,
          reason: 'quest_not_found'
        };
      }
      
      // Mark as completed
      assignment.completed = true;
      assignment.completedAt = Date.now();
      
      await this.storage.hset(
        this.getStorageKey(`assignments:${userId}`),
        questId,
        assignment
      );
      
      // Track completions in a separate hash
      await this.storage.hincrby(
        this.getStorageKey('completions'),
        `${userId}:${questId}`,
        1
      );
      
      // Add to completed history
      await this.storage.lpush(
        this.getStorageKey(`completed:${userId}`),
        JSON.stringify({
          questId,
          completedAt: assignment.completedAt,
          duration: assignment.completedAt - assignment.assignedAt
        })
      );
      
      // Process rewards
      await this.processRewards(userId, quest.rewards);
      
      // Update stats
      await this.storage.hincrby(
        this.getStorageKey('stats'),
        `${userId}:completed`,
        1
      );
      
      await this.storage.hincrby(
        this.getStorageKey('stats'),
        `quest:${questId}:completions`,
        1
      );
      
      // Check for chain progression
      if (quest.chainId && this.config.enableQuestChains) {
        await this.progressChain(userId, quest.chainId, quest.chainOrder);
      }
      
      await this.emitEvent('completed', {
        userId,
        questId,
        quest,
        assignment,
        rewards: quest.rewards
      });
      
      this.logger.info(`Quest ${questId} completed by user ${userId}`);
      
      // Get the total completions count
      const totalCompletions = await this.getQuestCompletions(userId, questId);
      
      return {
        success: true,
        rewards: quest.rewards,
        completions: totalCompletions
      };
    } finally {
      this.completionLocks.delete(lockKey);
    }
  }

  async progressChain(userId, chainId, completedOrder) {
    const chain = this.questChains.get(chainId);
    if (!chain) return;
    
    // Find next quest in chain
    const nextQuest = chain.quests.find(q => q.chainOrder === completedOrder + 1);
    
    if (nextQuest) {
      // Auto-assign next quest
      await this.assignQuest(userId, nextQuest.id);
      
      await this.emitEvent('chain.progressed', {
        userId,
        chainId,
        completedOrder,
        nextQuestId: nextQuest.id
      });
    } else {
      // Chain completed
      await this.emitEvent('chain.completed', {
        userId,
        chainId,
        questsCompleted: chain.quests.length
      });
    }
  }

  async processRewards(userId, rewards) {
    if (rewards.points) {
      await this.eventManager.emitAsync('points.award', {
        userId,
        points: rewards.points,
        reason: 'quest_reward'
      });
    }
    
    if (rewards.xp) {
      await this.eventManager.emitAsync('levels.addXP', {
        userId,
        xp: rewards.xp,
        reason: 'quest_reward'
      });
    }
    
    if (rewards.badges) {
      for (const badgeId of rewards.badges) {
        await this.eventManager.emitAsync('badges.award', {
          userId,
          badgeId,
          metadata: { source: 'quest_reward' }
        });
      }
    }
    
    if (rewards.items) {
      await this.eventManager.emitAsync('inventory.add', {
        userId,
        items: rewards.items
      });
    }
    
    if (rewards.custom) {
      await this.eventManager.emitAsync('quest.reward.custom', {
        userId,
        rewards: rewards.custom
      });
    }
  }

  async checkQuestProgress(event) {
    const { userId } = event.data;
    if (!userId) return;
    
    // Get user's active quests
    const assignments = await this.storage.hgetall(
      this.getStorageKey(`assignments:${userId}`)
    );
    
    for (const assignment of Object.values(assignments)) {
      if (assignment.completed) continue;
      
      const quest = this.quests.get(assignment.questId);
      if (!quest) continue;
      
      // Check each objective
      for (const objective of assignment.objectives) {
        if (objective.completed) continue;
        
        if (this.matchesObjective(event, objective)) {
          await this.updateObjectiveProgress(
            userId,
            assignment.questId,
            objective.id,
            1
          );
        }
      }
    }
  }

  matchesObjective(event, objective) {
    if (objective.type !== 'event') return false;
    
    // Check event name
    if (objective.event) {
      const regex = new RegExp(
        '^' + objective.event.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      
      if (!regex.test(event.eventName)) {
        return false;
      }
    }
    
    // Check conditions
    if (objective.conditions) {
      for (const [field, condition] of Object.entries(objective.conditions)) {
        const value = this.getNestedValue(event.data, field);
        
        if (!this.evaluateCondition(value, condition)) {
          return false;
        }
      }
    }
    
    return true;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  evaluateCondition(value, condition) {
    if (typeof condition === 'object') {
      if (condition.equals !== undefined) return value === condition.equals;
      if (condition.min !== undefined && value < condition.min) return false;
      if (condition.max !== undefined && value > condition.max) return false;
      if (condition.in !== undefined) return condition.in.includes(value);
    } else {
      return value === condition;
    }
    
    return true;
  }

  async getQuestAssignment(userId, questId) {
    return await this.storage.hget(
      this.getStorageKey(`assignments:${userId}`),
      questId
    );
  }

  async getQuestCompletions(userId, questId) {
    const completions = await this.storage.hget(
      this.getStorageKey('completions'),
      `${userId}:${questId}`
    );
    return parseInt(completions || 0);
  }

  async getUserQuests(userId, includeCompleted = true) {
    validators.isUserId(userId);
    
    const assignments = await this.storage.hgetall(
      this.getStorageKey(`assignments:${userId}`)
    );
    
    const quests = Object.values(assignments || {});
    
    if (!includeCompleted) {
      return quests.filter(q => !q.completed);
    }
    
    return quests;
  }

  async getActiveQuests(userId) {
    return this.getUserQuests(userId, false);
  }

  async getCompletedQuests(userId) {
    const quests = await this.getUserQuests(userId);
    return quests.filter(q => q.completed);
  }

  async getAllQuests(includeDisabled = false) {
    const quests = Array.from(this.quests.values());
    
    if (!includeDisabled) {
      return quests.filter(q => q.enabled);
    }
    
    return quests;
  }

  async expireQuest(userId, questId) {
    const assignment = await this.getQuestAssignment(userId, questId);
    if (!assignment || assignment.completed) return;
    
    // Remove assignment
    await this.storage.hdel(
      this.getStorageKey(`assignments:${userId}`),
      questId
    );
    
    await this.emitEvent('expired', {
      userId,
      questId,
      assignment
    });
    
    this.logger.info(`Quest ${questId} expired for user ${userId}`);
  }

  async assignDailyQuests(userId) {
    validators.isUserId(userId);
    
    // Get available daily quests
    const dailyQuests = Array.from(this.quests.values())
      .filter(q => q.enabled && q.category === 'daily')
      .sort((a, b) => b.priority - a.priority);
    
    if (dailyQuests.length === 0) return [];
    
    // Get user's quest history for today
    const today = new Date().toISOString().split('T')[0];
    const todayAssignments = await this.storage.get(
      this.getStorageKey(`daily:${userId}:${today}`)
    ) || [];
    
    // Filter out already assigned quests
    const available = dailyQuests.filter(
      q => !todayAssignments.includes(q.id)
    );
    
    // Calculate remaining slots, ensuring non-negative value
    const remainingSlots = Math.max(0, this.config.dailyQuestLimit - todayAssignments.length);
    const toAssign = available.slice(0, remainingSlots);
    const assigned = [];
    
    for (const quest of toAssign) {
      const result = await this.assignQuest(userId, quest.id);
      if (result.success) {
        assigned.push(quest.id);
        todayAssignments.push(quest.id);
      }
    }
    
    // Update daily assignments
    if (assigned.length > 0) {
      await this.storage.set(
        this.getStorageKey(`daily:${userId}:${today}`),
        todayAssignments,
        86400 // 24 hours
      );
    }
    
    return assigned;
  }

  startDailyRotation() {
    // Calculate time until next rotation
    const now = new Date();
    const nextRotation = new Date();
    nextRotation.setUTCHours(this.config.questRotationHour, 0, 0, 0);
    
    if (nextRotation <= now) {
      nextRotation.setDate(nextRotation.getDate() + 1);
    }
    
    const timeUntilRotation = nextRotation - now;
    
    // Schedule first rotation
    setTimeout(() => {
      this.rotateDailyQuests();
      
      // Schedule recurring rotations
      this.rotationInterval = setInterval(() => {
        this.rotateDailyQuests();
      }, 24 * 60 * 60 * 1000);
    }, timeUntilRotation);
  }

  async rotateDailyQuests() {
    this.logger.info('Rotating daily quests...');
    
    // Get all users with active quests
    const keys = await this.storage.keys(
      this.getStorageKey('assignments:*')
    );
    
    // Extract user IDs from keys properly
    const userIds = new Set();
    const prefix = this.getStorageKey('assignments:');
    for (const key of keys) {
      // Remove the prefix to get the user ID
      const userId = key.substring(prefix.length);
      if (userId && userId !== '*') {
        userIds.add(userId);
      }
    }
    
    // Assign daily quests to each user
    for (const userId of userIds) {
      await this.assignDailyQuests(userId);
    }
    
    await this.emitEvent('daily.rotation', {
      timestamp: Date.now()
    });
  }

  async getUserStats(userId) {
    const [
      activeQuests,
      completedQuests,
      totalCompleted
    ] = await Promise.all([
      this.getActiveQuests(userId),
      this.getCompletedQuests(userId),
      this.storage.hget(this.getStorageKey('stats'), `${userId}:completed`)
    ]);
    
    const byCategory = {};
    const inProgress = {};
    
    for (const quest of completedQuests) {
      const category = quest.questData.category;
      byCategory[category] = (byCategory[category] || 0) + 1;
    }
    
    for (const quest of activeQuests) {
      const totalObjectives = quest.objectives.length;
      const completedObjectives = quest.objectives.filter(o => o.completed).length;
      
      inProgress[quest.questId] = {
        name: quest.questData.name,
        progress: totalObjectives > 0 ? (completedObjectives / totalObjectives) * 100 : 0,
        objectives: `${completedObjectives}/${totalObjectives}`,
        expiresIn: quest.expiresAt ? quest.expiresAt - Date.now() : null
      };
    }
    
    return {
      active: activeQuests.length,
      completed: parseInt(totalCompleted || 0),
      byCategory,
      inProgress,
      dailyLimit: {
        used: await this.getDailyQuestCount(userId),
        limit: this.config.dailyQuestLimit
      }
    };
  }

  async getDailyQuestCount(userId) {
    const today = new Date().toISOString().split('T')[0];
    const assignments = await this.storage.get(
      this.getStorageKey(`daily:${userId}:${today}`)
    ) || [];
    
    return assignments.length;
  }

  async resetUser(userId) {
    await super.resetUser(userId);
    
    // Delete assignments
    await this.storage.delete(
      this.getStorageKey(`assignments:${userId}`)
    );
    
    // Delete completed history
    await this.storage.delete(
      this.getStorageKey(`completed:${userId}`)
    );
    
    // Delete daily assignments
    const dailyKeys = await this.storage.keys(
      this.getStorageKey(`daily:${userId}:*`)
    );
    
    for (const key of dailyKeys) {
      await this.storage.delete(key);
    }
    
    // Reset stats
    await this.storage.hdel(
      this.getStorageKey('stats'),
      `${userId}:completed`
    );
    
    // Reset completions for this user
    const completionsKey = this.getStorageKey('completions');
    const allCompletions = await this.storage.hgetall(completionsKey);
    
    if (allCompletions) {
      const keysToDelete = Object.keys(allCompletions).filter(key => key.startsWith(`${userId}:`));
      for (const key of keysToDelete) {
        await this.storage.hdel(completionsKey, key);
      }
    }
    
    await this.emitEvent('user.reset', { userId });
  }

  async shutdown() {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
    }
    
    await super.shutdown();
  }
}