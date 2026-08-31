import test from "node:test"
import assert from "node:assert/strict"

import { createTaskRouter, defaultRouter, DEFAULT_WORKERS } from "../src/task-router.mjs"

const taskArgs = (prompt, subagentType = "smart-fast") => ({
  subagent_type: subagentType,
  description: "Delegated task",
  prompt,
  metadata: { source: "test" },
})

test("routes requests by tier with default configuration", () => {
  assert.equal(defaultRouter.routeTaskArgs(taskArgs("Propón una prueba unitaria para validar un endpoint.")).subagent_type, "smart-standard")
  assert.equal(defaultRouter.routeTaskArgs(taskArgs("Renombra user_name a username en 42 archivos sin cambiar comportamiento.", "smart-strong")).subagent_type, "smart-fast")
  assert.equal(defaultRouter.routeTaskArgs(taskArgs("A veces falla el login y no tengo un error reproducible.", "smart-standard")).subagent_type, "smart-strong")
  assert.equal(defaultRouter.routeTaskArgs(taskArgs("Explica qué es un closure en JavaScript.", "smart-strong")).subagent_type, "free-worker")
  assert.equal(defaultRouter.routeTaskArgs(taskArgs("Tenemos una fuga de memoria en el worker de notificaciones.", "smart-fast")).subagent_type, "expert")
})

test("recognizes only managed worker Task arguments", () => {
  assert.equal(defaultRouter.isWorkerTaskArgs(taskArgs("Corrige un typo en el README.")), true)
  assert.equal(defaultRouter.isWorkerTaskArgs(taskArgs("Corrige un typo en el README.", "general")), false)
  assert.equal(defaultRouter.isWorkerTaskArgs(null), false)
})

test("rejects managed worker Task arguments without a prompt", () => {
  assert.throws(
    () => defaultRouter.routeTaskArgs({ subagent_type: "smart-fast", description: "Missing prompt" }),
    /request must be a string/,
  )
})

test("throws when routing args that are not managed workers", () => {
  assert.throws(() => defaultRouter.routeTaskArgs(taskArgs("anything", "general")), /args must select a managed worker/)
})

test("supports custom workers, models and tiers", () => {
  const router = createTaskRouter({
    workers: { free: "barato", strong: "fuerte" },
    models: { barato: "m1", fuerte: "m2" },
  })

  assert.equal(router.routeTaskArgs(taskArgs("Explica qué es un closure.", "fuerte")).subagent_type, "barato")
  assert.equal(router.routeTaskArgs(taskArgs("Analiza una race condition entre dos módulos que comparten estado.", "barato")).subagent_type, "fuerte")
  assert.equal(router.models.barato, "m1")
  assert.deepEqual(router.tiers, ["free", "strong"])
})

test("throws when an explicit tier has no worker", () => {
  assert.throws(
    () => createTaskRouter({ workers: { free: "x" }, tiers: ["free", "fast"] }),
    /no worker configured for tier: fast/,
  )
})

test("default workers cover all five tiers", () => {
  assert.equal(Object.keys(DEFAULT_WORKERS).length, 5)
})
