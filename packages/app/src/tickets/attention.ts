import { createSignal } from "solid-js"

/**
 * How many tickets are waiting on a person, read from the read-only board the
 * same origin serves at `/tickets/`. The app owns no ticket state: this is one
 * shared poll so the Tickets entry can show the same attention dot a tab does.
 * It stays at zero whenever the board is absent (a desktop build, or a sidecar
 * with no tickets yet), so the entry never claims attention it cannot prove.
 */
const POLL_MS = 60_000

const [attention, setAttention] = createSignal(0)

let started = false
let timer: ReturnType<typeof setInterval> | undefined

/** Read `counts.needsYou` from the board payload; anything unreadable counts as zero. */
function needsYou(input: unknown): number {
  if (typeof input !== "object" || input === null) return 0
  const counts = (input as Record<string, unknown>).counts
  if (typeof counts !== "object" || counts === null) return 0
  const value = (counts as Record<string, unknown>).needsYou
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
}

/** The one call this module makes; a narrow type keeps the test fetcher honest. */
type BoardFetch = (input: string, init?: RequestInit) => Promise<Response>

async function refresh(fetcher: BoardFetch = fetch) {
  try {
    const response = await fetcher("/tickets/api/board", { cache: "no-store" })
    setAttention(response.ok ? needsYou(await response.json()) : 0)
  } catch {
    // A missing board is not an error worth surfacing; the entry still opens.
    setAttention(0)
  }
}

/** Start the single shared poll on first use; a second caller joins the first. */
function start(fetcher: BoardFetch = fetch) {
  if (started || typeof window === "undefined") return
  started = true
  void refresh(fetcher)
  timer = setInterval(() => void refresh(fetcher), POLL_MS)
}

/** The board's waiting count. Reading this subscribes the caller to it. */
export function ticketsAttention() {
  start()
  return attention()
}

/** Exposed for the unit test: stop the shared poll between cases. */
export function stopTicketsAttention() {
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
  started = false
  setAttention(0)
}

export const ticketsAttentionInternals = { needsYou, refresh, start, stop: stopTicketsAttention }
