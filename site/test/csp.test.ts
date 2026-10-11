// @vitest-environment node
import { expect, it } from "vitest";
import { cspHash } from "../src/build/csp";

it("hashes the text as a CSP sha256 source", () => {
  // The example from the CSP spec's hash-source section.
  expect(cspHash("alert('Hello, world.');")).toBe("sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng=");
});
