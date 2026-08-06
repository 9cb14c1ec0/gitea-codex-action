import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stageRepository } from "../../src/workspace/sandbox.js";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "codex-stage-"));
  await mkdir(path.join(root, ".git", "objects", "pack"), { recursive: true });
  await writeFile(path.join(root, ".git", "objects", "pack", "pack-1.pack"), "binary");
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "index.ts"), "export {};");
  await writeFile(path.join(root, "README.md"), "# repo");
});

afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("sandbox staging", () => {
  it("stages top-level files and directories", async () => {
    const staged = await stageRepository(root);
    expect(Object.keys(staged.children ?? {}).sort()).toEqual(["README.md", "src"]);
  });

  it("excludes .git so a background repack cannot break materialization", async () => {
    const staged = await stageRepository(root);
    expect(staged.children?.[".git"]).toBeUndefined();
  });

  it("uses the right entry type for each child", async () => {
    const staged = await stageRepository(root);
    expect(staged.children?.["src"]?.type).toBe("local_dir");
    expect(staged.children?.["README.md"]?.type).toBe("local_file");
  });
});
