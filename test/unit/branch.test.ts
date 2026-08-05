import { describe, expect, it } from "vitest";
import { isSafeRef } from "../../src/workspace/branch.js";

describe("ref validation", () => {
  it("accepts ordinary branch names", () => expect(isSafeRef("feature/fix-printers")).toBe(true));
  it("accepts refs with dots and dashes", () => expect(isSafeRef("release-2026.410")).toBe(true));
  it("rejects a ref that would parse as a git option", () => expect(isSafeRef("--upload-pack=evil")).toBe(false));
  it("rejects traversal", () => expect(isSafeRef("feature/..%2Fmaster")).toBe(false));
  it("rejects shell metacharacters", () => expect(isSafeRef("main; rm -rf /")).toBe(false));
  it("rejects an empty ref", () => expect(isSafeRef("")).toBe(false));
});
