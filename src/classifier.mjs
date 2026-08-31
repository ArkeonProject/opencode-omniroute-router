/**
 * Pure, deterministic routing policy.
 *
 * Tiers (cold start, doc sections 11 and 23):
 * - free: purely informational auxiliary work with no code change
 * - fast: behavior-preserving mechanical work
 * - standard: observable behavior changes with known cause
 * - strong: unknown cause, cross-system, or elevated risk
 * - expert: critical concurrency/memory/security/architecture or repeated failure
 *
 * It intentionally performs no I/O and has no OpenCode dependency. Integrating
 * its result into OpenCode requires a supported dispatch hook that can select a
 * subagent before the LLM issues its Task call.
 */
export function classify(request) {
  const text = normalize(request)
  const has = (pattern) => pattern.test(text)

  const expertMarkers = has(/memory leak|fuga de memoria|deadlock|seguridad critic|critical security|arquitectura critic|critical architecture|fallo repetid|repeated failure|dos soluciones consecutivas|sigue fallando tras/)
  const unknownCause = has(/intermitent|a veces|sin causa|no sabemos|no .*reproduc|no existe un test.*reprodu/)
  const crossSystem = has(/(?:dos|varios|multiples|muchos) modul|cross.system|estado compartid|distribuid|migraci|arquitectura|multiple.*tenant|autenticacion.*tenant/)
  const highRisk = has(/race condition|concurren|estado compartid|distribuid|migraci|arquitectura|seguridad|autenticacion|rendimiento|performance/)

  // EXPERT claims only the most critical markers; validated Phase 1 routes
  // such as race conditions remain strong.
  if (expertMarkers) {
    const isCriticalBug = has(/memory leak|fuga de memoria|deadlock|fallo repetid|repeated failure|sigue fallando tras/)
    return result(
      "expert",
      isCriticalBug ? "bugfix" : "analysis",
      crossSystem ? "cross-system" : "bounded",
      "high",
      "high",
      "difficult",
    )
  }

  // STRONG rules intentionally precede all localized and mechanical rules.
  if (unknownCause || crossSystem || highRisk) {
    const isUnclearBug = unknownCause || has(/fallo|bug|login|incidente/)
    return result(
      "strong",
      isUnclearBug ? "bugfix" : "analysis",
      crossSystem ? "cross-system" : "bounded",
      highRisk ? "high" : "medium",
      unknownCause || highRisk ? "high" : "low",
      unknownCause || highRisk ? "difficult" : "deterministic",
      unknownCause,
    )
  }

  // STANDARD captures observable changes before FAST can claim a terse request.
  if (has(/prueba unitaria|test unitario/)) return result("standard", "test", "bounded", "low", "low", "deterministic")
  if (has(/endpoint|crud|nuevo campo|anade .*campo|añade .*campo|feature|funcionalidad/)) {
    const risk = has(/endpoint|crud/) ? "medium" : "low"
    return result("standard", "feature", "bounded", risk, "low", "deterministic")
  }
  if (has(/bug|campo .*incorrect|mapead|mapper|dto/) && !has(/renombr.*sin cambiar comportamiento|puramente mecanic/)) {
    return result("standard", "bugfix", "bounded", "medium", "low", "deterministic")
  }

  // FREE only serves purely informational auxiliary work; any change cue
  // (including a README typo or a proposed test) disqualifies it. It precedes
  // FAST because pure documentation *reading* must not be claimed as an edit.
  const informational = has(/explica|que es|como funciona|busca|documenta|resum|diferencia entre/)
  const changeCue = has(/corrige|arregla|cambia|implementa|anad|edita|modifica|refactoriza|renombr|typo|bug|fallo|endpoint|test|prueba|migrac|dto|crud|mapper|analiza|race|escribe|crea/)
  if (informational && !changeCue) {
    return result("free", "auxiliary", "bounded", "low", "low", "deterministic")
  }

  // FAST is deliberately exclusive to behavior-preserving mechanical work.
  if (has(/readme|documentacion|documentaci|typo|formato|comentario/) || has(/renombr/) && has(/sin cambiar comportamiento|puramente mecanic|preserva/)) {
    return result("fast", "mechanical", "bounded", "low", "low", "deterministic")
  }

  return result("standard", "feature", "bounded", "medium", "low", "deterministic")
}

function result(tier, taskType, scope, risk, ambiguity, verification, explore = false) {
  const outcome = { tier, reason: { taskType, scope, risk, ambiguity, verification } }
  if (explore) outcome.explore = true
  return outcome
}

function normalize(value) {
  if (typeof value !== "string") throw new TypeError("request must be a string")
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}
