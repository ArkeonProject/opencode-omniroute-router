import { classify } from "./classifier.mjs"

export const DEFAULT_TIERS = ["free", "fast", "standard", "strong", "expert"]

export const DEFAULT_WORKERS = {
  free: "free-worker",
  fast: "smart-fast",
  standard: "smart-standard",
  strong: "smart-strong",
  expert: "expert",
}

export const DEFAULT_MODELS = {
  "free-worker": "omniroute/auto/fast",
  "smart-fast": "omniroute/auto/fast",
  "smart-standard": "omniroute/auto/coding",
  "smart-strong": "omniroute/auto/smart",
  "expert": "omniroute/auto/coding:pro",
}

/**
 * Builds a deterministic tier -> worker -> model router. All three layers
 * are overridable so the plugin works with any OmniRoute setup, any combo
 * names and any agent naming convention.
 */
export function createTaskRouter({
  tiers,
  workers = DEFAULT_WORKERS,
  models = DEFAULT_MODELS,
} = {}) {
  const tierList = tiers ?? Object.keys(workers)
  for (const tier of tierList) {
    if (!workers[tier]) {
      throw new TypeError(`no worker configured for tier: ${tier}`)
    }
  }

  const workerSet = new Set(Object.values(workers))
  const workerByTier = new Map(tierList.map((tier) => [tier, workers[tier]]))

  return {
    tiers: tierList,
    workers,
    models,
    workerByTier,

    isWorkerTaskArgs(args) {
      return typeof args === "object"
        && args !== null
        && workerSet.has(args.subagent_type)
    },

    routeTaskArgs(args, request = args?.prompt) {
      if (!this.isWorkerTaskArgs(args)) {
        throw new TypeError("args must select a managed worker")
      }

      if (typeof request !== "string") {
        throw new TypeError("request must be a string")
      }

      const { tier } = classify(request)
      const worker = workerByTier.get(tier)

      if (!worker) {
        throw new TypeError(`no worker mapped for tier: ${tier}`)
      }

      return {
        ...args,
        subagent_type: worker,
      }
    },
  }
}

export const defaultRouter = createTaskRouter()
