// Mock fetch for webhook tests
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({})
  })
);

// Mock WebSocket
global.WebSocket = jest.fn(() => ({
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  readyState: 1,
  OPEN: 1,
  CLOSED: 3
}));

// Silence console during tests
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  if (global.fetch && global.fetch.mockClear) {
    global.fetch.mockClear();
  }
});

// Clean up after each test
afterEach(() => {
  jest.clearAllTimers();
});

// Global test utilities
global.wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Add custom matchers
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  toContainObject(received, argument) {
    const pass = this.equals(received, 
      expect.arrayContaining([
        expect.objectContaining(argument)
      ])
    );
    if (pass) {
      return {
        message: () => `expected ${received} not to contain object ${argument}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to contain object ${argument}`,
        pass: false
      };
    }
  }
});