# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

@oxog/gamification-kit is a comprehensive, production-ready gamification system for Node.js applications. It provides a modular, event-driven architecture with multiple storage options and framework integrations.

## Development Commands

```bash
# Install dependencies
npm install

# Run tests
npm test                    # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage report
npm run test:ci           # Run tests in CI mode

# Run a single test file
NODE_OPTIONS='--experimental-vm-modules' jest tests/unit/modules/PointsModule.test.js

# Linting
npm run lint              # Run ESLint on src/**/*.js

# Development
npm run dev               # Start with nodemon (auto-reload)
npm start                 # Start normally

# Build widget
npm run build:widget      # Build client widget with webpack
```

## Architecture

### Core Components

1. **GamificationKit** (`src/core/GamificationKit.js`): Main entry point and orchestrator
2. **EventManager** (`src/core/EventManager.js`): Central event bus for all modules
3. **RuleEngine** (`src/core/RuleEngine.js`): Complex condition evaluation for automated rewards
4. **APIServer** (`src/core/APIServer.js`): Built-in REST API with WebSocket support
5. **WebhookManager** (`src/core/WebhookManager.js`): External notifications with retry logic
6. **MetricsCollector** (`src/core/MetricsCollector.js`): System monitoring and health checks

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

The system uses a storage adapter pattern (`src/storage/StorageInterface.js`) with implementations for:
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

- Tests use Jest with ES6 modules (`NODE_OPTIONS='--experimental-vm-modules'`)
- Custom test setup mocks fetch, WebSocket, and console (`tests/setup.js`)
- Unit tests in `tests/unit/` test individual modules
- Integration tests in `tests/integration/` test module interactions
- Storage tests verify adapter implementations
- Use MemoryStorage for testing to avoid external dependencies

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

1. API routes are dynamically generated in `src/core/APIServer.js`
2. Module-specific routes are added via `module.getRoutes()`
3. Follow RESTful conventions for new endpoints
4. Add authentication/authorization as needed

### Working with Rules

Rules follow this structure:
```javascript
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
- The widget build uses webpack configuration in `webpack.widget.config.js`
- API server runs on a separate port from the main application
- All timestamps use ISO 8601 format
- User IDs are strings and should be validated