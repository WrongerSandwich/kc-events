/**
 * The in-loop spend cap: a model port wrapped so every call's reported cost is summed and, once
 * the sum reaches the cap, no further call goes out. The second layer, a monthly limit on the
 * OpenRouter key itself, lives outside the code.
 */
import { ModelReplyUnusable, type Clock, type CompletionResult, type ModelPort, type ModelStage, type ServedBy } from "./ports.js";

/** Thrown in place of a model call once the run's spend has reached the cap; no call was made. */
export class SpendCapReached extends Error {
  constructor(capUsd: number) {
    super(`spend cap of ${capUsd} USD reached`);
    this.name = "SpendCapReached";
  }
}

/**
 * One model call that went out, as the run report's JSON twin records it, so a month can be
 * reconciled against OpenRouter's activity page. A call that threw carries the error, and who
 * served it and its cost when its reply came back unusable; one that threw before any reply (a
 * timeout) may still have been billed, which is the gap a reconciliation looks for. Each carries
 * the stage it was made for and how long it took (#257), so spend and time can be split by stage.
 */
export type ModelCall =
  | { model: string; stage: ModelStage; ms: number; servedBy?: ServedBy; costUsd: number }
  | { model: string; stage: ModelStage; ms: number; servedBy?: ServedBy; costUsd?: number; error: string };

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
 * A reply that came back unusable still counts at its cost. A call's duration is the clock read
 * before and after it.
 */
export function capSpend(model: ModelPort, capUsd: number, clock: Clock): CappedModel {
  let totalUsd = 0;
  const calls: ModelCall[] = [];
  const exhausted = () => totalUsd >= capUsd;
  return {
    async complete(request) {
      if (exhausted()) throw new SpendCapReached(capUsd);
      const startedAt = clock.now().getTime();
      const made = () => ({ model: request.model, stage: request.stage, ms: clock.now().getTime() - startedAt });
      let result: CompletionResult;
      try {
        result = await model.complete(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof ModelReplyUnusable) {
          totalUsd += error.costUsd ?? 0;
          calls.push({ ...made(), servedBy: error.servedBy, ...(error.costUsd !== undefined ? { costUsd: error.costUsd } : {}), error: message });
        } else {
          calls.push({ ...made(), error: message });
        }
        throw error;
      }
      totalUsd += result.costUsd;
      calls.push({ ...made(), ...(result.servedBy ? { servedBy: result.servedBy } : {}), costUsd: result.costUsd });
      return result;
    },
    exhausted,
    totalUsd: () => totalUsd,
    calls: () => [...calls],
  };
}
