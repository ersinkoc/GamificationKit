# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

@oxog/gamification-kit is a comprehensive, production-ready gamification system for Node.js applications. It provides a modular, event-driven architecture with multiple storage options and framework integrations.

## Development Commands

```bash
# Install dependencies
npm install

# Build (TypeScript to JavaScript)
npm run build              # Build production code
npm run build:watch        # Build in watch mode
npm run build:widget       # Build client widget with webpack

# Type Checking
npm run typecheck          # Type check without building

# Run tests
npm test                   # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage report
npm run test:ci            # Run tests in CI mode

# Run a single test file
NODE_OPTIONS='--experimental-vm-modules --loader=ts-node/esm' jest tests/unit/modules/PointsModule.test.ts

# Linting
npm run lint               # Run ESLint on TypeScript files
npm run lint:fix           # Auto-fix linting issues

# Development
npm run dev                # Start with tsx in watch mode
npm start                  # Start from built dist/ files
```

## Architecture

### Core Components

1. **GamificationKit** ([src/core/GamificationKit.ts](src/core/GamificationKit.ts)): Main entry point and orchestrator
2. **EventManager** ([src/core/EventManager.ts](src/core/EventManager.ts)): Central event bus for all modules
3. **RuleEngine** ([src/core/RuleEngine.ts](src/core/RuleEngine.ts)): Complex condition evaluation for automated rewards
4. **APIServer** ([src/core/APIServer.ts](src/core/APIServer.ts)): Built-in REST API with WebSocket support
5. **WebhookManager** ([src/core/WebhookManager.ts](src/core/WebhookManager.ts)): External notifications with retry logic
6. **MetricsCollector** ([src/core/MetricsCollector.ts](src/core/MetricsCollector.ts)): System monitoring and health checks

### Module System

All gamification features are implemented as modules extending `BaseModule`:
- **PointsModule**: Points system with limits, decay, and multipliers
- **BadgeModule**: Achievement system with progress tracking
- **LevelModule**: XP and leveling with prestige support
- **LeaderboardModule**: Rankings with multiple time periods
- **StreakModule**: Consecutive action tracking with freeze protection
- **QuestModule**: Daily/weekly challenges with objectives

Modules communicate through the EventManager using standard events:
- `points.awarded`, `badge.awarded`, `level.up`, `streak.updated`, etc.

### Storage Architecture

The system uses a storage adapter pattern ([src/storage/StorageInterface.ts](src/storage/StorageInterface.ts)) with implementations for:
- **MemoryStorage**: In-memory storage for development/testing
- **RedisStorage**: Production-ready Redis adapter
- **MongoStorage**: MongoDB adapter
- **PostgresStorage**: PostgreSQL adapter

### Integration Points

1. **Framework Middleware** (`src/middleware/`):
   - Express: `gamification.express()`
   - Fastify: `gamification.fastify()`
   - Koa: `gamification.koa()`

2. **Frontend Components**:
   - Vanilla JS widget: `client/widget/`
   - React components: `client/react/`

## Key Patterns

1. **Event-Driven Architecture**: All modules communicate through events, enabling loose coupling
2. **Storage Abstraction**: All storage operations go through the adapter interface
3. **Module Independence**: Each module manages its own state and exposes specific APIs
4. **Condition System**: Complex conditions use a nested object structure with operators
5. **Async/Await**: All APIs are promise-based using modern async patterns

## Testing Approach

- Tests use Jest with TypeScript support (ts-jest)
- ES6 modules with experimental VM modules (`NODE_OPTIONS='--experimental-vm-modules --loader=ts-node/esm'`)
- Custom test setup mocks fetch, WebSocket, and console ([tests/setup.ts](tests/setup.ts))
- Unit tests in `tests/unit/` test individual modules (*.test.ts)
- Integration tests in `tests/integration/` test module interactions
- Storage tests verify adapter implementations
- Use MemoryStorage for testing to avoid external dependencies

## TypeScript

This project is written in **TypeScript** with strict mode enabled:
- Source files in `src/` are TypeScript (*.ts, *.tsx)
- Build output in `dist/` directory
- Type definitions auto-generated from source
- Use `.js` extensions in imports (ESM requirement):
  ```typescript
  import { Logger } from '../utils/logger.js'; // Correct
  ```

## Common Tasks

### Adding a New Module

1. Create module class extending `BaseModule` in `src/modules/`
2. Implement required methods: `onInitialize()`, `onEvent()`, etc.
3. Register standard events in `initialize()`
4. Add unit tests in `tests/unit/modules/`
5. Update integration tests if module interacts with others

### Adding Storage Support

1. Create adapter implementing `StorageInterface` in `src/storage/`
2. Implement all required methods (get, set, delete, etc.)
3. Add connection/disconnection logic
4. Create storage-specific tests in `tests/unit/storage/`

### Modifying API Endpoints

1. API routes are dynamically generated in [src/core/APIServer.ts](src/core/APIServer.ts)
2. Module-specific routes are added via `module.getRoutes()`
3. Follow RESTful conventions for new endpoints
4. Add authentication/authorization as needed

### Working with Rules

Rules follow this structure:
```typescript
{
  conditions: {
    all: [  // AND conditions
      { field: 'data.points', operator: '>=', value: 100 }
    ],
    any: [  // OR conditions
      { field: 'data.level', operator: '>', value: 10 }
    ]
  },
  actions: [
    { type: 'award_badge', badgeId: 'achievement-id' }
  ]
}
```

## Important Notes

- The project uses ES6 modules (`"type": "module"` in package.json)
- Node.js ≥16.0.0 is required
- WebSocket support requires the `ws` package
- Storage adapters have optional peer dependencies (redis, mongodb, pg)
- The widget build uses webpack configuration in [webpack.widget.config.ts](webpack.widget.config.ts)
- API server runs on a separate port from the main application
- All timestamps use ISO 8601 format
- User IDs are strings and should be validated