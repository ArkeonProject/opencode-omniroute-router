import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

export const DEFAULT_HISTORY = join(homedir(), ".smart-opencode", "history.jsonl")

export async function loadEntries(file = DEFAULT_HISTORY) {
  let content
  try {
    content = await readFile(file, "utf8")
  } catch {
    return []
  }
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

/**
 * Pairs dispatch and outcome events by session and aggregates success
 * signals (doc sections 17 and 18):
 * - success: outcome with verification evidence (tests/build/lint markers)
 * - uncertain: outcome without automatic verification
 * - unresolved: dispatch without any outcome
 */
export function computeStats(entries) {
  const bySession = new Map()
  for (const entry of entries) {
    if (entry.type === "dispatch") {
      bySession.set(entry.sessionId, { dispatch: entry, outcome: null })
    } else if (entry.type === "outcome" && bySession.has(entry.sessionId)) {
      bySession.get(entry.sessionId).outcome = entry
    }
  }

  const tasks = [...bySession.values()]
  const empty = () => ({ total: 0, success: 0, uncertain: 0, unresolved: 0 })

  const overall = empty()
  const byModel = {}
  const byTaskType = {}
  const matrix = {}

  for (const { dispatch, outcome } of tasks) {
    const status = !outcome ? "unresolved" : outcome.verificationEvidence ? "success" : "uncertain"
    const model = dispatch.model ?? "unknown"
    const taskType = dispatch.reason?.taskType ?? "unknown"

    overall.total += 1
    overall[status] += 1

    for (const bucket of [byModel, byTaskType]) {
      const key = bucket === byModel ? model : taskType
      bucket[key] ??= empty()
      bucket[key].total += 1
      bucket[key][status] += 1
    }

    matrix[taskType] ??= {}
    matrix[taskType][model] ??= empty()
    matrix[taskType][model].total += 1
    matrix[taskType][model][status] += 1
  }

  const setRate = (bucket) => {
    bucket.successRate = bucket.total ? round(bucket.success / bucket.total) : 0
  }
  for (const bucket of [
    ...Object.values(byModel),
    ...Object.values(byTaskType),
    ...Object.values(matrix).flatMap(Object.values),
  ]) {
    setRate(bucket)
  }

  return { overall, byModel, byTaskType, matrix }
}

function round(value) {
  return Math.round(value * 1000) / 1000
}

const pct = (value) => `${(value * 100).toFixed(1)}%`

function printBucket(title, bucket) {
  console.log(`\n${title}`)
  console.log("model / task type".padEnd(40), "tasks".padStart(6), "success".padStart(8), "uncertain".padStart(10), "unres".padStart(6), "rate".padStart(8))
  for (const [key, s] of Object.entries(bucket).sort((a, b) => b[1].total - a[1].total)) {
    console.log(
      key.padEnd(40),
      String(s.total).padStart(6),
      String(s.success).padStart(8),
      String(s.uncertain).padStart(10),
      String(s.unresolved).padStart(6),
      pct(s.successRate).padStart(8),
    )
  }
}

export function printReport(stats) {
  const o = stats.overall
  console.log(`Overall: ${o.total} tasks | ${o.success} verified | ${o.uncertain} uncertain | ${o.unresolved} unresolved`)
  printBucket("By model:", stats.byModel)
  printBucket("By task type:", stats.byTaskType)
  console.log("\nMatrix (task type x model, successRate of totals):")
  for (const [taskType, models] of Object.entries(stats.matrix).sort()) {
    for (const [model, s] of Object.entries(models).sort()) {
      console.log(`  ${taskType.padEnd(14)} ${model.padEnd(40)} ${s.success}/${s.total} (${pct(s.successRate)})`)
    }
  }
}

export function printJson(stats) {
  console.log(JSON.stringify(stats, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const file = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : DEFAULT_HISTORY
  const stats = computeStats(await loadEntries(file))
  if (process.argv.includes("--json")) printJson(stats)
  else printReport(stats)
}
