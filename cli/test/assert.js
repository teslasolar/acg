/**
 * ACG Test - Assertion helpers
 * Exported for use in individual test files.
 */

export function assert(condition, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

export function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeepEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg || `Deep equality failed:\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
  }
}

export function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(msg || 'Expected function to throw');
}

export async function assertAsyncThrows(fn, msg) {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  if (!threw) throw new Error(msg || 'Expected async function to throw');
}

export function assertType(value, type, msg) {
  if (typeof value !== type) {
    throw new Error(msg || `Expected type ${type}, got ${typeof value}`);
  }
}

export function assertArray(value, msg) {
  if (!Array.isArray(value)) {
    throw new Error(msg || `Expected array, got ${typeof value}`);
  }
}

export function assertMatch(value, regex, msg) {
  if (!regex.test(value)) {
    throw new Error(msg || `Expected "${value}" to match ${regex}`);
  }
}
