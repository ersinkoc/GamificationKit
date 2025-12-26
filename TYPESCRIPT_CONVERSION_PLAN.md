# TypeScript Conversion Plan

## Status
**Phase:** Converting all remaining JavaScript files to TypeScript

## Completed Conversions
✅ **Core Files (4/8):**
- [x] EventManager.js → EventManager.ts
- [x] RuleEngine.js → RuleEngine.ts
- [x] WebhookManager.js → WebhookManager.ts
- [x] MetricsCollector.js → MetricsCollector.ts
- [ ] HealthChecker.js → HealthChecker.ts
- [ ] WebSocketServer.js → WebSocketServer.ts
- [ ] APIServer.js → APIServer.ts (776 lines)
- [ ] GamificationKit.js → GamificationKit.ts (625 lines)

✅ **Already TypeScript:**
- All type definitions in `src/types/`
- All utilities in `src/utils/`
- All storage adapters in `src/storage/`
- All config files in `src/config/`

## Remaining Conversions

### Core Files (4 remaining)
1. **HealthChecker.js** (507 lines)
   - Health check system with monitoring
   - Dependencies: Logger, GamificationKit instance
   - Interfaces needed: HealthCheckResult, HealthCheckOptions

2. **WebSocketServer.js** (223 lines)
   - WebSocket server for real-time events
   - Dependencies: ws module (dynamic import), EventManager
   - Interfaces needed: WebSocketServerOptions, WebSocketClient

3. **APIServer.js** (776 lines) - CRITICAL
   - Main HTTP server with all REST endpoints
   - Dependencies: http, Logger, GamificationKit
   - Complex routing and middleware
   - Interfaces needed: RouteContext, RateLimitState

4. **GamificationKit.js** (625 lines) - CRITICAL
   - Main orchestrator class
   - Initializes all modules and core components
   - Central dependency for entire system

### Module Files (8 files)
1. **BaseModule.js**
   - Abstract base class for all modules
   - Needs IBaseModule interface

2. **PointsModule.js**
   - Points tracking with limits and multipliers
   - Types: PointsData, PointsTransaction

3. **BadgeModule.js**
   - Badge/achievement system
   - Types: Badge, UserBadge, BadgeProgress

4. **LevelModule.js**
   - XP and leveling system
   - Types: LevelInfo, XPTransaction

5. **StreakModule.js**
   - Streak tracking with freeze protection
   - Types: StreakData, StreakTypeConfig

6. **QuestModule.js**
   - Quest/challenge system
   - Types: Quest, UserQuest, QuestObjective

7. **LeaderboardModule.js**
   - Ranking system with time periods
   - Types: LeaderboardEntry, LeaderboardResult

8. **AchievementModule.js**
   - Achievement system
   - Types: Achievement, UserAchievement

### Middleware Files (6 files)
1. **RateLimiter.js**
2. **ValidationMiddleware.js**
3. **routes.js**
4. **express.js**
5. **fastify.js**
6. **koa.js**

### Root Files (1 file)
1. **index.js** - Main entry point

### Test Files (30 files)
- tests/setup.js
- tests/unit/**/*.test.js (20+ files)
- tests/integration/**/*.test.js
- tests/bug-fixes/**/*.test.js

## Conversion Strategy

### 1. Core Files First (Priority: HIGH)
Complete the remaining 4 core files as they are foundational:
- HealthChecker
- WebSocketServer
- APIServer (complex, has many endpoints)
- GamificationKit (main orchestrator)

### 2. Module Files (Priority: HIGH)
Convert all 8 module files:
- BaseModule first (others extend it)
- Then all concrete modules

### 3. Middleware Files (Priority: MEDIUM)
Convert framework integrations and middleware

### 4. Root Entry Point (Priority: MEDIUM)
Convert index.js

### 5. Test Files (Priority: LOW)
- Convert tests/setup.js
- Convert all .test.js files to .test.ts
- Update test imports

## Key Conversion Patterns

### 1. Class Constructors
```typescript
// Before (JS)
constructor(options = {}) {
  this.logger = new Logger(options.logger);
}

// After (TS)
constructor(options: ModuleOptions = {}) {
  this.logger = new Logger(options.logger);
}
```

### 2. Async Methods
```typescript
// Before (JS)
async initialize() {
  await this.storage.connect();
}

// After (TS)
async initialize(): Promise<void> {
  await this.storage.connect();
}
```

### 3. Event Handlers
```typescript
// Before (JS)
onEvent(event) {
  this.handleEvent(event);
}

// After (TS)
onEvent(event: EventData): void {
  this.handleEvent(event);
}
```

### 4. Import Statements
```typescript
// Always use .js extension in imports (TypeScript convention)
import { Logger } from '../utils/logger.js';
import type { LoggerConfig } from '../types/config.js';
```

### 5. Class Properties
```typescript
export class Module {
  private storage: IStorageAdapter;
  private logger: Logger;
  private config: ModuleConfig;
  public initialized: boolean = false;

  constructor(options: ModuleOptions) {
    // ...
  }
}
```

## Testing After Conversion

### 1. Type Check
```bash
npx tsc --noEmit
```

### 2. Build
```bash
npm run build
```

### 3. Run Tests
```bash
npm test
```

### 4. Lint
```bash
npm run lint
```

## Common Issues & Solutions

### Issue: Module resolution
**Solution:** Ensure all imports use `.js` extension

### Issue: Type inference failures
**Solution:** Add explicit return types to functions

### Issue: EventEmitter types
**Solution:** Properly extend EventEmitter with typed events

### Issue: Dynamic imports (ws module)
**Solution:** Use `await import('ws')` with proper typing

### Issue: Test file conversions
**Solution:** Update jest config for TypeScript, add @types/jest

## Files to Update After Conversion

1. **package.json**
   - Update main field to point to built files
   - Add build scripts
   - Update test scripts

2. **tsconfig.json**
   - Verify all paths are correct
   - Ensure strict mode is enabled

3. **.gitignore**
   - Ignore built files
   - Keep source TypeScript files

4. **README.md**
   - Update usage examples with TypeScript
   - Update build instructions

## Validation Checklist

- [ ] All .js files converted to .ts/.tsx
- [ ] All .js files deleted
- [ ] All imports use .js extension
- [ ] All types imported from src/types/
- [ ] Type checking passes (tsc --noEmit)
- [ ] Build succeeds
- [ ] All tests pass
- [ ] No linting errors
- [ ] Documentation updated

## Next Steps

1. Convert remaining 4 core files
2. Convert all 8 module files
3. Convert middleware and framework integrations
4. Convert main index.js
5. Convert all test files
6. Run full validation checklist
7. Update documentation
