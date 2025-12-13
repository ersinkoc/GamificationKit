/**
 * Bug Fix #42: WebhookManager.verifySignature handles buffer length mismatch
 *
 * Issue: crypto.timingSafeEqual throws an error if buffer lengths don't match.
 * If the signature had a different length than expected, this would throw
 * instead of returning false.
 *
 * Fix: Check buffer lengths before calling timingSafeEqual and return false
 * if they don't match.
 */

import { WebhookManager } from '../../src/core/WebhookManager.js';

describe('Bug Fix #42: WebhookManager signature verification', () => {
  let webhookManager;

  beforeEach(() => {
    webhookManager = new WebhookManager({
      signingSecret: 'test-secret-key-12345'
    });
  });

  test('should return false for signature with different length (not throw)', () => {
    const payload = { test: 'data' };
    const wrongLengthSignature = 'short'; // Much shorter than expected HMAC

    // Should return false, not throw
    expect(() => {
      const result = webhookManager.verifySignature(payload, wrongLengthSignature);
      expect(result).toBe(false);
    }).not.toThrow();
  });

  test('should return false for empty signature', () => {
    const payload = { test: 'data' };
    const emptySignature = '';

    const result = webhookManager.verifySignature(payload, emptySignature);
    expect(result).toBe(false);
  });

  test('should return true for correct signature', () => {
    const payload = { test: 'data' };
    const correctSignature = webhookManager.generateSignature(payload);

    const result = webhookManager.verifySignature(payload, correctSignature);
    expect(result).toBe(true);
  });

  test('should return false for wrong signature with correct length', () => {
    const payload = { test: 'data' };
    const correctSignature = webhookManager.generateSignature(payload);
    // Change one character
    const wrongSignature = 'a' + correctSignature.slice(1);

    const result = webhookManager.verifySignature(payload, wrongSignature);
    expect(result).toBe(false);
  });

  test('should return false for signature longer than expected', () => {
    const payload = { test: 'data' };
    const correctSignature = webhookManager.generateSignature(payload);
    const tooLongSignature = correctSignature + 'extra';

    expect(() => {
      const result = webhookManager.verifySignature(payload, tooLongSignature);
      expect(result).toBe(false);
    }).not.toThrow();
  });
});
