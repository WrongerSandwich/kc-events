import { expect } from "vitest";

/** `value`, once it is held to be there: a lookup that finds nothing fails with `what`, not a bare TypeError (#191). */
export function found<T>(value: T | undefined, what: string): T {
  expect(value, what).toBeDefined();
  return value!;
}
