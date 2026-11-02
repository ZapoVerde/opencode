import { expect, test } from "bun:test"
import { ticketsAttention, ticketsAttentionInternals } from "./attention"

const fetcherOf = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status })

test("counts only the tickets the board says need a person", () => {
  const { needsYou } = ticketsAttentionInternals
  expect(needsYou({ counts: { needsYou: 3, working: 4, closed: 5, total: 12 } })).toBe(3)
  expect(needsYou({ counts: { needsYou: 0 } })).toBe(0)
  // Unreadable or absent boards are "nothing waiting", never a guess.
  expect(needsYou(null)).toBe(0)
  expect(needsYou({ counts: null })).toBe(0)
  expect(needsYou({ counts: { needsYou: "2" } })).toBe(0)
  expect(needsYou({ counts: { needsYou: -1 } })).toBe(0)
  expect(needsYou({ counts: { needsYou: Number.NaN } })).toBe(0)
})

test("the entry lights up while a board reports waiting work and clears when it stops", async () => {
  const { start, stop, refresh } = ticketsAttentionInternals
  try {
    start(fetcherOf(200, { counts: { needsYou: 2 } }))
    await Bun.sleep(0)
    expect(ticketsAttention()).toBe(2)

    await refresh(fetcherOf(200, { counts: { needsYou: 0 } }))
    expect(ticketsAttention()).toBe(0)

    // An unreachable board must not leave a stale dot behind.
    await refresh(fetcherOf(200, { counts: { needsYou: 1 } }))
    expect(ticketsAttention()).toBe(1)
    await refresh(async () => new Response("down", { status: 503 }))
    expect(ticketsAttention()).toBe(0)
  } finally {
    stop()
  }
})
