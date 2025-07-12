# @oxog/gamification-kit Package Structure

This document explains the package structure and organization of @oxog/gamification-kit for npm distribution.

## Directory Structure

```
@oxog/gamification-kit/
├── src/                        # Source code (included in npm package)
│   ├── core/                   # Core system components
│   │   ├── GamificationKit.js
│   │   ├── EventManager.js
│   │   ├── RuleEngine.js
│   │   ├── APIServer.js
│   │   ├── WebhookManager.js
│   │   ├── WebSocketServer.js
│   │   └── MetricsCollector.js
│   ├── modules/                # Gamification modules
│   │   ├── BaseModule.js
│   │   ├── PointsModule.js
│   │   ├── BadgeModule.js
│   │   ├── LevelModule.js
│   │   ├── LeaderboardModule.js
│   │   ├── StreakModule.js
│   │   ├── QuestModule.js
│   │   └── AchievementModule.js
│   ├── storage/                # Storage adapters
│   │   ├── StorageInterface.js
│   │   ├── MemoryStorage.js
│   │   ├── RedisStorage.js
│   │   ├── MongoStorage.js
│   │   └── PostgresStorage.js
│   ├── middleware/             # Framework integrations
│   │   ├── express.js
│   │   ├── fastify.js
│   │   ├── koa.js
│   │   └── routes.js
│   └── utils/                  # Utilities
│       ├── logger.js
│       └── validators.js
├── client/                     # Client-side code (included)
│   ├── react/                  # React components
│   │   └── GamificationComponents.jsx
│   └── widget/                 # Vanilla JS widget
│       ├── widget.js
│       └── widget.css
├── dist/                       # Built files (excluded from git)
├── tests/                      # Test files (excluded from npm)
├── examples/                   # Example applications (excluded from npm)
├── coverage/                   # Test coverage (excluded)
├── index.js                    # Main entry point
├── index.d.ts                  # TypeScript definitions
├── package.json                # Package configuration
├── README.md                   # Documentation
├── LICENSE                     # MIT License
├── CHANGELOG.md               # Version history
└── CONTRIBUTING.md            # Contribution guidelines
```

## Files Included in NPM Package

When published to npm, the package includes only:
- `index.js` - Main entry point
- `index.d.ts` - TypeScript definitions
- `src/` - All source code
- `client/` - Client-side components
- `README.md` - Documentation
- `LICENSE` - License file
- `CHANGELOG.md` - Version history

## Files Excluded from NPM Package

The `.npmignore` file excludes:
- Test files and coverage reports
- Example applications
- Development configuration files
- Build tools and scripts
- Editor and OS-specific files

## Import Paths

Users can import the package in multiple ways:

```javascript
// Main package
import { GamificationKit, PointsModule } from '@oxog/gamification-kit';

// React components
import { GamificationProvider } from '@oxog/gamification-kit/client/react';

// Widget
import GamificationWidget from '@oxog/gamification-kit/client/widget';
```

## TypeScript Support

Full TypeScript definitions are provided in `index.d.ts`, enabling:
- IntelliSense in VS Code
- Type checking
- Better developer experience

## Module Exports

The package uses ES modules with the following exports:
- Named exports for all classes and functions
- Subpath exports for client components
- Full type definitions for TypeScript users