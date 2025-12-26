# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-12-26

### Changed
- **BREAKING**: Complete TypeScript migration - entire codebase converted from JavaScript to TypeScript
- Package now ships TypeScript source code with compiled JavaScript in `dist/` directory
- Main entry point changed from `index.js` to `dist/index.js`
- All imports now require building the project first (`npm run build`)
- Type definitions now auto-generated from source instead of manually maintained

### Added
- Full TypeScript support with strict mode enabled
- Comprehensive type definitions in `src/types/` directory
- Auto-generated `.d.ts` declaration files
- TypeScript build system with multiple configurations (build, test, watch)
- IntelliSense and type checking support for all APIs
- Source maps for debugging compiled code
- `npm run typecheck` command for type validation without building
- `npm run build:watch` for development with auto-rebuild

### Improved
- Better IDE integration with full type information
- Compile-time error detection
- Enhanced code documentation through types
- Improved refactoring support

### Migration
- All 70+ files converted from `.js`/`.jsx` to `.ts`/`.tsx`
- Zero JavaScript files remaining in source code
- Tests converted to TypeScript with ts-jest
- Build output relocated to `dist/` directory
- Documentation updated for TypeScript usage

### Technical Details
- TypeScript 5.9.3
- Target: ES2022
- Module: ES2022 (ESM)
- Strict mode: enabled
- Output: dist/

## [1.0.0] - 2025-07-08

### Added
- Initial release of Gamification Kit
- Core modules:
  - Points system with multipliers, limits, and decay
  - Badge/Achievement system with progress tracking
  - Multi-tier achievement system
  - Leaderboard system with multiple time periods
  - Level/XP system with prestige functionality
  - Streak system with freeze protection
  - Quest/Challenge system with dependencies
- Storage adapters:
  - In-memory storage
  - Redis adapter
  - MongoDB adapter
  - PostgreSQL adapter
- Framework middleware:
  - Express.js middleware and routes
  - Fastify plugin
  - Koa middleware
- Frontend components:
  - Vanilla JavaScript widget
  - React component library
- Infrastructure:
  - Event-driven architecture
  - Rule engine for complex conditions
  - Webhook system with retry logic
  - RESTful API with WebSocket support
  - Metrics collection system
- Examples:
  - Express.js basic integration
  - React dashboard application
- Documentation:
  - Comprehensive README
  - API documentation
  - Contributing guidelines
- Testing:
  - Unit tests for core functionality
  - Integration tests
  - Jest configuration

### Security
- API key authentication
- Request signing for webhooks
- Rate limiting support
- Input validation

### Performance
- Efficient caching strategies
- Batch update operations
- Connection pooling
- Lazy loading of modules