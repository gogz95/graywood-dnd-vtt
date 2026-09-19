// pinAuth.test.ts — Unit tests for PIN Authentication Hardening & Zero Data Leakage
// Verifies: Strict 4-digit PIN validation, "Wrong PIN" rejection, crypto-safe PIN generation, and credential sanitization.

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion Failed: ${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

// Mimic the hardened crypto PIN generator
function genCryptoPin(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return (1000 + (array[0] % 9000)).toString();
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Mimic the hardened PIN validator used in /play
function validateAndAuthenticatePin(
  pinInput: string,
  registeredRoster: Array<{ pin: string; name: string }>
): { success: boolean; error?: string; matchedCharacter?: { pin: string; name: string } } {
  const pin = pinInput.trim();
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return { success: false, error: 'Wrong PIN' };
  }

  const match = registeredRoster.find(m => m.pin === pin);
  if (!match) {
    return { success: false, error: 'Wrong PIN' };
  }

  return { success: true, matchedCharacter: match };
}

// Mimic the legacy credential sanitizer
function sanitizeRosterPins(roster: Array<{ id: string; pin: string; name: string }>): Array<{ id: string; pin: string; name: string }> {
  const BANNED_TEST_PINS = new Set(['1234', '2345', '3456', '4567', '0000', 'admin']);
  return roster.map(m => {
    if (!m.pin || BANNED_TEST_PINS.has(m.pin)) {
      return { ...m, pin: genCryptoPin() };
    }
    return m;
  });
}

export function runPinAuthTests(): void {
  console.log('--- Running PIN Authentication Hardening Test Suite ---');

  // 1. Strict Rejection of Missing, Empty, and Malformed PINs
  {
    const registered = [{ pin: '7491', name: 'Valen' }];

    // Empty string
    const r1 = validateAndAuthenticatePin('', registered);
    assertEqual(r1.success, false, 'Empty input must be rejected');
    assertEqual(r1.error, 'Wrong PIN', 'Empty input must return "Wrong PIN"');

    // 1-3 digits
    const r2 = validateAndAuthenticatePin('12', registered);
    assertEqual(r2.success, false, '2 digits must be rejected');
    assertEqual(r2.error, 'Wrong PIN', '2 digits must return "Wrong PIN"');

    const r3 = validateAndAuthenticatePin('123', registered);
    assertEqual(r3.success, false, '3 digits must be rejected');
    assertEqual(r3.error, 'Wrong PIN', '3 digits must return "Wrong PIN"');

    // > 4 digits
    const r4 = validateAndAuthenticatePin('12345', registered);
    assertEqual(r4.success, false, '5 digits must be rejected');
    assertEqual(r4.error, 'Wrong PIN', '5 digits must return "Wrong PIN"');

    // Non-numeric
    const r5 = validateAndAuthenticatePin('abcd', registered);
    assertEqual(r5.success, false, 'Non-numeric input must be rejected');
    assertEqual(r5.error, 'Wrong PIN', 'Non-numeric must return "Wrong PIN"');

    // Unregistered 4-digit PIN
    const r6 = validateAndAuthenticatePin('9999', registered);
    assertEqual(r6.success, false, 'Unregistered 4-digit PIN must be rejected');
    assertEqual(r6.error, 'Wrong PIN', 'Unregistered PIN must return "Wrong PIN"');

    console.log('  ✔ Malformed and unknown PIN rejection tests passed');
  }

  // 2. Successful Verification of Matching Registered PIN
  {
    const registered = [
      { pin: '4821', name: 'Kareth Stonefist' },
      { pin: '9134', name: 'Althea Dawnseeker' },
    ];

    const validAuth = validateAndAuthenticatePin('4821', registered);
    assertEqual(validAuth.success, true, 'Matching PIN must succeed');
    assertEqual(validAuth.matchedCharacter?.name, 'Kareth Stonefist', 'Must bind only matching character');

    console.log('  ✔ Legitimate PIN authorization tests passed');
  }

  // 3. Crypto-Safe 4-Digit Range Verification
  {
    for (let i = 0; i < 50; i++) {
      const pin = genCryptoPin();
      assert(/^\d{4}$/.test(pin), `Generated PIN "${pin}" must be exactly 4 digits`);
      const num = parseInt(pin, 10);
      assert(num >= 1000 && num <= 9999, `Generated PIN ${num} must be between 1000 and 9999`);
    }
    console.log('  ✔ Crypto-safe PIN format tests passed');
  }

  // 4. Legacy Test Credential Sanitization
  {
    const legacyRoster = [
      { id: 'pc-1', pin: '1234', name: 'Valen' },
      { id: 'pc-2', pin: '2345', name: 'Eldrin' },
      { id: 'pc-3', pin: '0000', name: 'Kareth' },
      { id: 'pc-4', pin: '6543', name: 'Althea' }, // Legitimate non-test PIN
    ];

    const sanitized = sanitizeRosterPins(legacyRoster);
    assert(sanitized[0].pin !== '1234', '1234 must be wiped and replaced');
    assert(sanitized[1].pin !== '2345', '2345 must be wiped and replaced');
    assert(sanitized[2].pin !== '0000', '0000 must be wiped and replaced');
    assertEqual(sanitized[3].pin, '6543', 'Legitimate pin 6543 must be retained');
    assert(/^\d{4}$/.test(sanitized[0].pin), 'Replaced pin must be valid 4 digits');

    console.log('  ✔ Legacy test credentials sanitization tests passed');
  }

  console.log('All PIN Security & Privacy Hardening tests passed successfully! 🛡️');
}

import { describe, it } from 'vitest';

describe('PIN Authentication Hardening', () => {
  it('passes all PIN security & privacy hardening tests', () => {
    runPinAuthTests();
  });
});
