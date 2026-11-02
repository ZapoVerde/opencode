export * as PermissionSecret from "./secret.js"

// Candidate names for the read check on surfaces that touch many paths: shell words and search
// results. This only decides what is worth evaluating; the permission rules remain the authority on
// whether a path is allowed, asks, or is denied. Broad is fine here — an extra allowed evaluation
// costs nothing, while a missed one would bypass a secret rule.
const names = /(?:^|[./_-])(?:env|secrets?|credentials?|panel-password|pem|key|age)(?:[./_-]|$)/i

export function mightBeSecret(resource: string) {
  const value = resource.replaceAll("\\", "/")
  const name = value.slice(value.lastIndexOf("/") + 1)

  return name.startsWith(".") || names.test(value)
}
