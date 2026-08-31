import { createTaskRouter, DEFAULT_WORKERS, DEFAULT_MODELS } from "./task-router.mjs"
import { classify } from "./classifier.mjs"
import { createHistoryRecorder } from "./history-recorder.mjs"

const VERIFICATION_EVIDENCE = /\b\d+ (?:pass|tests)\b|\bfail 0\b|✓|all tests passed/i

/**
 * OpenCode plugin factory. Loaded from opencode.json:
 *
 *   "plugin": [["opencode-omniroute-router", { "historyDir": "...", "workers": {...}, "models": {...} }]]
 *
 * Guarantees, per user turn (guards reset on every chat.message):
 *   - at most one exploration Task (subagent_type "explore"), never after dispatch
 *   - at most one managed worker Task, routed deterministically by the classifier
 * Dispatch and outcome events are appended to the history log; recording
 * failures never break routing.
 */
export function createSmartRouterPlugin(options = {}) {
  const router = options.router ?? createTaskRouter(options)
  const exploreAgent = options.exploreAgent ?? "explore"

  return async ({ client, historyDir } = {}) => {
    const routedSessions = new Set()
    const exploreSessions = new Set()
    const userRequests = new Map()
    const routedCalls = new Map()
    const recorder = createHistoryRecorder(historyDir ? { dir: historyDir } : {})

    await client.app.log({
      body: {
        service: "opencode-omniroute-router",
        level: "info",
        message: "deterministic task routing plugin initialized",
        extra: { workers: Object.values(router.workers) },
      },
    })

    return {
      "chat.message": async (input, output) => {
        const request = output.parts
          .filter((part) => part.type === "text" && typeof part.text === "string" && !part.synthetic)
          .map((part) => part.text)
          .join("\n")
          .trim()

        // Dispatch guards are per user turn: a multi-turn session may route
        // once per message (exploration + worker), so reset them here.
        routedSessions.delete(input.sessionID)
        exploreSessions.delete(input.sessionID)

        if (request) userRequests.set(input.sessionID, request)
      },
      "tool.execute.before": async (input, output) => {
        if (input.tool !== "task") return

        if (output.args?.subagent_type === exploreAgent) {
          if (routedSessions.has(input.sessionID)) {
            throw new Error("exploration is not allowed after the worker Task has been dispatched")
          }
          if (exploreSessions.has(input.sessionID)) {
            throw new Error("only one exploration Task is allowed per session")
          }
          exploreSessions.add(input.sessionID)

          await client.app.log({
            body: {
              service: "opencode-omniroute-router",
              level: "info",
              message: "deterministic task routing exploration",
              extra: {
                sessionID: input.sessionID,
                selectedWorker: exploreAgent,
              },
            },
          })
          return
        }

        if (!router.isWorkerTaskArgs(output.args)) return

        if (routedSessions.has(input.sessionID)) {
          throw new Error("only one worker Task is allowed per user turn")
        }

        const request = userRequests.get(input.sessionID)
        if (!request) {
          throw new Error("cannot route Task without the original user request")
        }

        const requestedWorker = output.args.subagent_type
        const routed = router.routeTaskArgs(output.args, request)
        const { tier, reason, explore } = classify(request)
        output.args.subagent_type = routed.subagent_type
        routedSessions.add(input.sessionID)

        const model = router.models[routed.subagent_type]

        routedCalls.set(input.callID, {
          sessionId: input.sessionID,
          selectedWorker: routed.subagent_type,
          model,
        })

        await client.app.log({
          body: {
            service: "opencode-omniroute-router",
            level: "info",
            message: "deterministic task routing",
            extra: {
              sessionID: input.sessionID,
              requestedWorker,
              selectedWorker: routed.subagent_type,
            },
          },
        })

        await recorder
          .record({
            type: "dispatch",
            sessionId: input.sessionID,
            requestedWorker,
            selectedWorker: routed.subagent_type,
            tier,
            reason,
            exploreUsed: exploreSessions.has(input.sessionID) || undefined,
            model,
            request: request.slice(0, 2000),
          })
          .catch(() => {})
      },
      "tool.execute.after": async (input, output) => {
        const routedInfo = routedCalls.get(input.callID)
        if (!routedInfo) return
        routedCalls.delete(input.callID)

        const text =
          typeof output === "string"
            ? output
            : typeof output?.output === "string"
              ? output.output
              : typeof output?.result === "string"
                ? output.result
                : ""

        await recorder
          .record({
            type: "outcome",
            sessionId: routedInfo.sessionId,
            selectedWorker: routedInfo.selectedWorker,
            model: routedInfo.model,
            outputChars: text.length,
            verificationEvidence: VERIFICATION_EVIDENCE.test(text) || undefined,
            preview: text.slice(0, 500),
          })
          .catch(() => {})
      },
    }
  }
}

export { DEFAULT_WORKERS, DEFAULT_MODELS }
