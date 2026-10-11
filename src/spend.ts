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

/**
 * One model call that went out, as the run report's JSON twin records it, so a month can be
 * reconciled against OpenRouter's activity page. A call that threw carries the error instead of a
 * cost: it may still have been billed (a timeout the provider ran to the end), which is the gap a
 * reconciliation looks for.
 */
export type ModelCall =
  | { model: string; servedModel?: string; provider?: string; generationId?: string; costUsd: number }
  | { model: string; error: string };

export interface CappedModel extends ModelPort {
  /** True once spend has reached the cap: the next call would be refused. */
  exhausted(): boolean;
  totalUsd(): number;
  /** Every call that went out, in order; a call the cap refused never went out and is not here. */
  calls(): ModelCall[];
}

/**
 * Wraps a model port under a cap. A call is only refused before it starts, since its cost is
 * known only after; so the call that crosses the cap completes and the total can end above it.
 */
export function capSpend(model: ModelPort, capUsd: number): CappedModel {
  let totalUsd = 0;
  const calls: ModelCall[] = [];
  const exhausted = () => totalUsd >= capUsd;
  return {
    async complete(request) {
      if (exhausted()) throw new SpendCapReached(capUsd);
      let result: Awaited<ReturnType<ModelPort["complete"]>>;
      try {
        result = await model.complete(request);
      } catch (error) {
        calls.push({ model: request.model, error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
      totalUsd += result.costUsd;
      const { model: servedModel, provider, generationId } = result.servedBy ?? {};
      calls.push({
        model: request.model,
        ...(servedModel !== undefined ? { servedModel } : {}),
        ...(provider !== undefined ? { provider } : {}),
        ...(generationId !== undefined ? { generationId } : {}),
        costUsd: result.costUsd,
      });
      return result;
    },
    exhausted,
    totalUsd: () => totalUsd,
    calls: () => [...calls],
  };
}
