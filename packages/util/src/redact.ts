// Command text, prompts, and logs can carry credentials. Replace the credential-shaped parts before the value is
// stored or shown, so a saved command never keeps a live secret.
export function redactSecrets(value: string) {
  return value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(
      /((?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s"']+)/gi,
      "$1[redacted]",
    )
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[redacted]@")
    .replace(/(--(?:password|token|api-key|secret)\s+)\S+/gi, "$1[redacted]")
}
