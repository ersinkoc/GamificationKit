# Quick TypeScript Conversion Guide

**For:** Continuing the TypeScript migration of GamificationKit
**Status:** 4/8 core files complete, 55 files remaining

---

## Quick Start

### 1. Current State
```bash
# Check what's already done
ls src/core/*.ts        # 4 files converted
ls src/core/*.js        # 4 files remaining

# Check conversion templates
cat CONVERSION_TEMPLATES.md
```

### 2. Choose Next File
**Recommended Order:**
1. HealthChecker.js (template ready)
2. WebSocketServer.js (template ready)
3. APIServer.js (critical, large)
4. GamificationKit.js (critical, depends on all)

### 3. Convert One File

#### Step-by-Step Process

**A. Prepare**
```bash
# Read the JavaScript file
code src/core/HealthChecker.js

# Check the template
code CONVERSION_TEMPLATES.md
# (Find the HealthChecker template section)
```

**B. Convert**
```bash
# Copy template to new .ts file
# The template in CONVERSION_TEMPLATES.md is complete and ready

# Or create from scratch:
code src/core/HealthChecker.ts
```

**C. Add Types**
```typescript
// 1. Import types at top
import type { LoggerConfig } from '../types/config.js';
import type { GamificationKit } from './GamificationKit.js';

// 2. Define interfaces
export interface HealthCheckerOptions {
  logger?: LoggerConfig;
  gamificationKit: GamificationKit;
  // ...
}

// 3. Add types to class
export class HealthChecker {
  private logger: Logger;
  private gamificationKit: GamificationKit;
  private checkInterval: number;

  constructor(options: HealthCheckerOptions) {
    // ...
  }

  async initialize(): Promise<void> {
    // ...
  }
}
```

**D. Verify**
```bash
# Delete old .js file
rm src/core/HealthChecker.js

# Type check
npx tsc --noEmit

# Fix any errors
code src/core/HealthChecker.ts

# Test
npm test -- HealthChecker
```

**E. Commit**
```bash
git add src/core/HealthChecker.ts
git commit -m "refactor: Convert HealthChecker to TypeScript"
```

---

## Copy-Paste Templates

### HealthChecker.ts
**Status:** Complete template in `CONVERSION_TEMPLATES.md`
**Action:** Copy entire template from lines 14-700 in CONVERSION_TEMPLATES.md

### WebSocketServer.ts
**Status:** Complete template in `CONVERSION_TEMPLATES.md`
**Action:** Copy entire template from lines 702-950 in CONVERSION_TEMPLATES.md

### BaseModule.ts
**Status:** Complete template in `CONVERSION_TEMPLATES.md`
**Action:** Copy entire template from lines 952-1050 in CONVERSION_TEMPLATES.md

---

## Type Import Cheatsheet

```typescript
// Common types
import type { UserId, Metadata } from '../types/common.js';

// Config types
import type { LoggerConfig, GamificationKitConfig } from '../types/config.js';

// Module types
import type { IBaseModule, ModuleContext, PointsData } from '../types/modules.js';

// Storage types
import type { IStorageAdapter } from '../types/storage.js';

// Event types
import type { EventHandler, GameEvent } from '../types/events.js';

// Core imports (use direct imports, not types)
import { Logger } from '../utils/logger.js';
import { validators } from '../utils/validators.js';
import { EventManager } from '../core/EventManager.js';
```

---

## Common Patterns

### Constructor
```typescript
export class MyClass {
  private logger: Logger;
  private config: MyConfig;

  constructor(options: MyOptions = {}) {
    this.logger = new Logger({ prefix: 'MyClass', ...options.logger });
    this.config = options.config || defaultConfig;
  }
}
```

### Async Methods
```typescript
async initialize(): Promise<void> {
  await this.storage.connect();
}

async getData(userId: UserId): Promise<UserData> {
  const data = await this.storage.get(`user:${userId}`);
  return data as UserData;
}
```

### Event Handlers
```typescript
private setupEventHandlers(): void {
  this.eventManager.on('user.created', this.handleUserCreated.bind(this));
}

private async handleUserCreated(event: GameEvent): Promise<void> {
  const { userId } = event.data;
  await this.initializeUser(userId);
}
```

### Module Pattern
```typescript
export class MyModule extends BaseModule {
  constructor() {
    super('mymodule', '1.0.0');
  }

  protected async onInitialize(): Promise<void> {
    this.setupEventHandlers();
  }

  async getUserStats(userId: UserId): Promise<MyStats> {
    // Implementation
  }

  protected async onResetUser(userId: UserId): Promise<void> {
    await this.storage.delete(`mymodule:${userId}`);
  }
}
```

---

## Conversion Checklist

For each file, verify:

- [ ] File renamed from .js to .ts
- [ ] All imports have .js extension
- [ ] Types imported from src/types/
- [ ] Constructor has typed parameters
- [ ] All method parameters are typed
- [ ] All method return types specified
- [ ] All class properties are typed (private/public/protected)
- [ ] Interfaces defined for options objects
- [ ] No `any` types (except where truly necessary)
- [ ] Original .js file deleted
- [ ] `npx tsc --noEmit` passes
- [ ] Tests still pass
- [ ] Committed to git

---

## Troubleshooting

### Error: Cannot find module
```
Fix: Add .js extension to import
Before: import { Logger } from '../utils/logger';
After:  import { Logger } from '../utils/logger.js';
```

### Error: Type 'X' is not assignable to type 'Y'
```
Fix: Check type definitions in src/types/
      Add explicit type casting if needed: data as MyType
```

### Error: Property 'X' does not exist on type 'Y'
```
Fix: Add property to interface in src/types/
      Or add to class definition
```

### Error: Cannot use namespace as a type
```
Fix: Use 'type' import
Before: import { Logger } from '../utils/logger.js';
After:  import type { Logger } from '../utils/logger.js';
        import { Logger as LoggerClass } from '../utils/logger.js';
```

---

## File Size Reference

Files in order of size (lines):

1. APIServer.js (776 lines) - LARGE, complex
2. GamificationKit.js (625 lines) - LARGE, critical
3. HealthChecker.js (507 lines) - Medium
4. RuleEngine.js (329 lines) ✅ DONE
5. MetricsCollector.js (322 lines) ✅ DONE
6. WebhookManager.js (268 lines) ✅ DONE
7. WebSocketServer.js (223 lines) - Small
8. EventManager.js (204 lines) ✅ DONE

**Strategy:** Start with small/medium files, tackle large ones last

---

## Daily Goals

**Day 1:** ✅ EventManager, RuleEngine, WebhookManager, MetricsCollector
**Day 2:** HealthChecker, WebSocketServer, start APIServer
**Day 3:** Complete APIServer, start GamificationKit
**Day 4:** Complete GamificationKit, BaseModule, start other modules
**Day 5:** Complete all modules
**Day 6:** Middleware and entry point
**Day 7:** Test files
**Day 8:** Client files, final validation

---

## Commands to Run Frequently

```bash
# Type check (run after each file)
npx tsc --noEmit

# Run specific test
npm test -- path/to/test.ts

# Check for remaining .js files
find src -name "*.js" | wc -l

# View conversion progress
git log --oneline | grep "Convert"
```

---

## Next File: HealthChecker

### Ready to Convert
```bash
# 1. Copy template from CONVERSION_TEMPLATES.md
#    (Lines 14-700 contain complete HealthChecker implementation)

# 2. Create the file
code src/core/HealthChecker.ts
# Paste the template

# 3. Delete old file
rm src/core/HealthChecker.js

# 4. Type check
npx tsc --noEmit

# 5. Test
npm test -- HealthChecker

# 6. Commit
git add src/core/HealthChecker.ts
git commit -m "refactor: Convert HealthChecker to TypeScript"
```

**The template is complete and ready to use!**

---

## Support Files

- `CONVERSION_TEMPLATES.md` - Complete code templates
- `TYPESCRIPT_CONVERSION_PLAN.md` - Detailed strategy
- `TYPESCRIPT_MIGRATION_STATUS.md` - Progress tracking
- `src/types/*.ts` - All type definitions

---

## Remember

1. **Always use .js in imports** (TypeScript convention for ES modules)
2. **Import types with 'type'** keyword when possible
3. **Run tsc --noEmit** after each conversion
4. **Test immediately** after conversion
5. **Commit each file separately** for clean history
6. **Use templates** - don't start from scratch
7. **Check src/types/** for existing types before creating new ones

---

**You're 15% done! Keep going!** 🚀
