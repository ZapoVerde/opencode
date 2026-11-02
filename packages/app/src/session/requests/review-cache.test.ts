import { expect, test } from "bun:test"
import { cachedReview, rememberReview, reviewInFlight, startReview } from "./review-cache"

test("starts one review per request and reuses its brief", async () => {
  let calls = 0
  const run = () => {
    calls += 1

    return Promise.resolve("Why: one.\nWhat: two.\nScope: three.")
  }

  const [first, second] = await Promise.all([startReview("req_shared", run), startReview("req_shared", run)])

  expect(calls).toBe(1)
  expect(first).toBe(second)
  expect(cachedReview("req_shared")).toBe("Why: one.\nWhat: two.\nScope: three.")
  expect(reviewInFlight("req_shared")).toBe(false)
})

test("does not cache an empty review and lets the next caller try again", async () => {
  await startReview("req_empty", () => Promise.resolve("   "))

  expect(cachedReview("req_empty")).toBeUndefined()
  expect(reviewInFlight("req_empty")).toBe(false)

  let calls = 0
  await startReview("req_empty", () => {
    calls += 1

    return Promise.resolve("Why: later.")
  })

  expect(calls).toBe(1)
  expect(cachedReview("req_empty")).toBe("Why: later.")
})

test("keeps the newest briefs when the cache fills", () => {
  for (let index = 0; index < 60; index++) rememberReview(`req_${index}`, `brief ${index}`)

  expect(cachedReview("req_0")).toBeUndefined()
  expect(cachedReview("req_59")).toBe("brief 59")
})
