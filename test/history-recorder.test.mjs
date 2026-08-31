import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createHistoryRecorder } from "../src/history-recorder.mjs"

test("appends JSONL entries with timestamps to history.jsonl", async () => {
  const dir = await mkdtemp(join(tmpdir(), "smart-history-"))
  const recorder = createHistoryRecorder({ dir, now: () => "2026-08-31T00:00:00.000Z" })

  await recorder.record({ type: "dispatch", selectedWorker: "smart-fast" })
  await recorder.record({ type: "outcome", selectedWorker: "smart-fast", outputChars: 42 })

  const content = await readFile(recorder.file, "utf8")
  const lines = content.trim().split("\n")

  assert.equal(lines.length, 2)
  assert.deepEqual(JSON.parse(lines[0]), { timestamp: "2026-08-31T00:00:00.000Z", type: "dispatch", selectedWorker: "smart-fast" })
  assert.deepEqual(JSON.parse(lines[1]), { timestamp: "2026-08-31T00:00:00.000Z", type: "outcome", selectedWorker: "smart-fast", outputChars: 42 })
})

test("defaults to the ~/.smart-opencode directory", () => {
  const recorder = createHistoryRecorder()
  assert.ok(recorder.file.endsWith(join(".smart-opencode", "history.jsonl")))
})
