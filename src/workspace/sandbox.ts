import { readdir } from "node:fs/promises";
import path from "node:path";
import { dir, localDir, localFile } from "@openai/agents/sandbox";

/** Never staged: git rewrites packs and refs in the background, and the materializer aborts if a file changes mid-copy. */
export const EXCLUDED = new Set([".git"]);

/**
 * Stage the checkout one top-level entry at a time rather than as a single `localDir`,
 * so `.git` can be left out. The agent gets the working tree; history and the diff are
 * supplied through the prompt instead. Symlinks are skipped because `local_dir` rejects them.
 */
export async function stageRepository(workspace: string): Promise<ReturnType<typeof dir>> {
  const root = path.resolve(workspace);
  const children: Record<string, ReturnType<typeof localDir> | ReturnType<typeof localFile>> = {};
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (EXCLUDED.has(item.name)) continue;
    const src = path.join(root, item.name);
    if (item.isDirectory()) children[item.name] = localDir({ src });
    else if (item.isFile()) children[item.name] = localFile({ src });
  }
  return dir({ children });
}
