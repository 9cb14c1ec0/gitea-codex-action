const secret = /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:sk|gitea)_[A-Za-z0-9_-]{16,}|Authorization:\s*Bearer\s+\S+)/gi;
export function redactSecrets(value: string): string { return value.replace(secret, "[REDACTED]"); }
export function truncate(value: string, maxLength: number): string { return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n[truncated]`; }
export function untrusted(label: string, value: string, maxLength = 12_000): string { return `<untrusted-${label}>\n${truncate(redactSecrets(value), maxLength)}\n</untrusted-${label}>`; }
