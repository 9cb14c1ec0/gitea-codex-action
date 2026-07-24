export function isAllowedBranch(branch: string, prefix: string, currentPrBranch?: string): boolean {
  return branch === currentPrBranch || (branch.startsWith(prefix) && !branch.includes("..") && !branch.startsWith("-") && !/[\s~^:?*\\[\\]/.test(branch));
}

export function isProtectedBranch(branch: string, baseBranch: string): boolean { return branch === baseBranch || branch === "main" || branch === "master"; }
