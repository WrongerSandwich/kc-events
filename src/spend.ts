/**
 * The in-loop spend cap: a model port wrapped so every call's reported cost is summed and, once
 * the sum reaches the cap, no further call goes out. The second layer, a monthly limit on the
 * OpenRouter key itself, lives outside the code.
 */
import type { ModelPort } from "./ports.js";

/** Thrown in place of a model call once the run's spend has reached the cap; no call was made. */
export class SpendCapReached extends Error {
  constructor(capUsd: number) {
    super(`spend cap of ${capUsd} USD reached`);
    this.name = "SpendCapReached";
  }
}

export interface CappedModel extends ModelPort {
  /** True once spend has reached the cap: the next call would be refused. */
  exhausted(): boolean;
  totalUsd(): number;
}

/**
 * Wraps a model port under a cap. A call is only refused before it starts, since its cost is
 * known only after; so the call that crosses the cap completes and the total can end above it.
 */
export function capSpend(model: ModelPort, capUsd: number): CappedModel {
  let totalUsd = 0;
  const exhausted = () => totalUsd >= capUsd;
  return {
    async complete(request) {
      if (exhausted()) throw new SpendCapReached(capUsd);
      const result = await model.complete(request);
      totalUsd += result.costUsd;
      return result;
    },
    exhausted,
    totalUsd: () => totalUsd,
  };
}
