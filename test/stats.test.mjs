import test from "node:test"
import assert from "node:assert/strict"

import { computeStats } from "../src/stats.mjs"

const dispatch = (sessionId, model, taskType) => ({
  type: "dispatch",
  sessionId,
  selectedWorker: "smart-standard",
  model,
  reason: { taskType, scope: "bounded", risk: "low", ambiguity: "low", verification: "deterministic" },
})

const outcome = (sessionId, verificationEvidence) => ({
  type: "outcome",
  sessionId,
  selectedWorker: "smart-standard",
  verificationEvidence,
  outputChars: 100,
})

test("pairs dispatch and outcome by session and classifies statuses", () => {
  const stats = computeStats([
    dispatch("s1", "model-a", "test"),
    outcome("s1", true),
    dispatch("s2", "model-a", "bugfix"),
    outcome("s2", false),
    dispatch("s3", "model-b", "test"),
  ])

  assert.deepEqual(stats.overall, { total: 3, success: 1, uncertain: 1, unresolved: 1 })
  assert.deepEqual(stats.byModel["model-a"], { total: 2, success: 1, uncertain: 1, unresolved: 0, successRate: 0.5 })
  assert.deepEqual(stats.byModel["model-b"], { total: 1, success: 0, uncertain: 0, unresolved: 1, successRate: 0 })
  assert.deepEqual(stats.byTaskType["test"], { total: 2, success: 1, uncertain: 0, unresolved: 1, successRate: 0.5 })
  assert.deepEqual(stats.byTaskType["bugfix"], { total: 1, success: 0, uncertain: 1, unresolved: 0, successRate: 0 })
})

test("outcomes for unknown sessions are ignored", () => {
  const stats = computeStats([outcome("ghost", true)])
  assert.equal(stats.overall.total, 0)
})

test("matrix crosses task type with model", () => {
  const stats = computeStats([
    dispatch("s1", "model-a", "test"),
    outcome("s1", true),
    dispatch("s2", "model-a", "test"),
    outcome("s2", true),
    dispatch("s3", "model-b", "test"),
    outcome("s3", false),
    dispatch("s4", "model-b", "bugfix"),
    outcome("s4", true),
  ])

  assert.deepEqual(stats.matrix["test"]["model-a"], { total: 2, success: 2, uncertain: 0, unresolved: 0, successRate: 1 })
  assert.deepEqual(stats.matrix["test"]["model-b"], { total: 1, success: 0, uncertain: 1, unresolved: 0, successRate: 0 })
  assert.deepEqual(stats.matrix["bugfix"]["model-b"], { total: 1, success: 1, uncertain: 0, unresolved: 0, successRate: 1 })
})

test("missing reason falls back to unknown task type", () => {
  const stats = computeStats([
    { type: "dispatch", sessionId: "s1", selectedWorker: "smart-fast", model: "model-a" },
    outcome("s1", true),
  ])
  assert.equal(stats.byTaskType["unknown"].total, 1)
  assert.equal(stats.matrix["unknown"]["model-a"].success, 1)
})
