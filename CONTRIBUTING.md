# Contributing to Gamification Kit

Thank you for your interest in contributing to Gamification Kit! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please read it before contributing.

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node.js version, OS, etc.)
   - Relevant code snippets or error messages

### Suggesting Features

1. Check existing feature requests
2. Use the feature request template
3. Explain the use case and benefits
4. Provide examples if possible

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Update documentation as needed
7. Commit your changes (`git commit -m 'Add amazing feature'`)
8. Push to your fork (`git push origin feature/amazing-feature`)
9. Open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/yourusername/gamification-kit.git
cd gamification-kit

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Project Structure

```
gamification-kit/
├── src/
│   ├── core/           # Core system components
│   ├── modules/        # Gamification modules
│   ├── storage/        # Storage adapters
│   ├── middleware/     # Framework middleware
│   └── utils/          # Utilities
├── client/             # Frontend components
├── examples/           # Example applications
├── tests/              # Test files
└── docs/               # Documentation
```

## Coding Standards

### JavaScript Style

- Use ES6+ features
- Follow ESLint configuration
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

### Module Guidelines

When creating a new module:

1. Extend `BaseModule` class
2. Implement required methods:
   - `onInitialize()`
   - `getUserStats(userId)`
   - `resetUser(userId)`
3. Use the provided storage interface
4. Emit appropriate events
5. Add comprehensive tests

Example module structure:

```javascript
import { BaseModule } from './BaseModule.js';

export class CustomModule extends BaseModule {
  constructor(options = {}) {
    super('custom', options);
    // Initialize module-specific properties
  }

  async onInitialize() {
    // Setup logic
  }

  setupEventListeners() {
    // Register event handlers
  }

  async getUserStats(userId) {
    // Return user statistics
  }

  async resetUser(userId) {
    // Clean up user data
    await super.resetUser(userId);
  }
}
```

### Storage Adapter Guidelines

When creating a storage adapter:

1. Extend `StorageInterface` class
2. Implement all required methods
3. Handle connection/disconnection properly
4. Support transactions if possible
5. Add integration tests

### Testing

- Write unit tests for all new functionality
- Aim for >80% code coverage
- Test edge cases and error conditions
- Use descriptive test names
- Mock external dependencies

Test structure:

```javascript
describe('ModuleName', () => {
  let module;

  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('methodName', () => {
    it('should do something specific', () => {
      // Test implementation
    });
  });
});
```

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new public APIs
- Include code examples
- Update TypeScript definitions if applicable

## Commit Messages

Follow conventional commits format:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test additions or modifications
- `chore:` Maintenance tasks

Examples:
```
feat: add PostgreSQL storage adapter
fix: resolve memory leak in event manager
docs: update badge module examples
```

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create release PR
4. After merge, tag release
5. Publish to npm

## Getting Help

- Join our Discord community
- Check existing issues and discussions
- Read the documentation
- Ask questions in discussions

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.