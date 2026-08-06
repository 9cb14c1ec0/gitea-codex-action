import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
export const DEFAULT_DEPTH = 20;

/** Refs come from the forge API, so reject anything that could be read as a git option or traversal. */
export const isSafeRef = (ref: string) => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) && !ref.includes("..");

// gc.auto=0: a background repack rewrites pack files, which breaks the sandbox materializer's stability check.
const git = async (workspace: string, args: string[]): Promise<void> => { await run("git", ["-c", "gc.auto=0", ...args], { cwd: workspace }); };

/**
 * Put the pull request revision in the working tree. `issue_comment` events check out the
 * default branch at depth 1, so without this the agent reviews the wrong code. `refs/pull/N/head`
 * is tried first because it also resolves fork pull requests, whose head branch is not on origin.
 */
export async function checkoutPullRequest(workspace: string, number: number, headRef: string, depth = DEFAULT_DEPTH): Promise<string | undefined> {
  const candidates = [`refs/pull/${number}/head`, ...(headRef && isSafeRef(headRef) ? [headRef] : [])];
  for (const ref of candidates) {
    try {
      await git(workspace, ["fetch", "--depth", String(depth), "origin", ref]);
      await git(workspace, ["checkout", "--detach", "FETCH_HEAD"]);
      return ref;
    } catch { continue; }
  }
  return undefined;
}
