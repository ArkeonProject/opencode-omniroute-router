import { appendFile, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const DEFAULT_DIR = join(homedir(), ".smart-opencode")

/**
 * Append-only JSONL execution history (doc section 16). Phase 8 records
 * outcomes without modifying routing; phases 9+ will read these entries.
 */
export function createHistoryRecorder({ dir = DEFAULT_DIR, now = () => new Date().toISOString() } = {}) {
  const file = join(dir, "history.jsonl")

  return {
    file,
    async record(entry) {
      const line = JSON.stringify({ timestamp: now(), ...entry })
      await mkdir(dir, { recursive: true })
      await appendFile(file, `${line}\n`, "utf8")
    },
  }
}
