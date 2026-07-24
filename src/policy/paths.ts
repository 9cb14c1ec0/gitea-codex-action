import path from "node:path";

export function resolveWorkspacePath(workspace: string, candidate: string): string {
  if (!candidate || path.isAbsolute(candidate) || candidate.includes("\0")) throw new Error("invalid path");
  const root = path.resolve(workspace), resolved = path.resolve(root, candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("path escapes workspace");
  return resolved;
}
