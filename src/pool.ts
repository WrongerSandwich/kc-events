/**
 * Pages read several at once (#252). A stage hands its pages to inOrder, which works through them at
 * most `limit` at a time and gives back each one's result at its index, so the stage applies them in
 * its own order and its output does not depend on which page finished first.
 */

/**
 * Runs `work` over the items, at most `limit` at once, started in item order; the results come back by
 * index. Each item's work gets `turn`, which resolves once every earlier item has taken its turn or
 * finished, so the model calls a stage makes after its turn go out in item order however its fetches
 * came back: a scripted model gets its replies in the same order at any limit, and the spend cap is
 * checked call by call in that order. At a limit of 1 each item finishes before the next starts. An
 * item that throws passes its turn; once all have settled, the earliest item's error is thrown.
 */
export async function inOrder<T, R>(items: readonly T[], limit: number, work: (item: T, turn: () => Promise<void>, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  /** Resolvers and promises for each item's turn being passed. */
  const passes = items.map(() => {
    let pass!: () => void;
    const passed = new Promise<void>((resolve) => (pass = resolve));
    return { pass, passed };
  });
  const errors: { index: number; error: unknown }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      const turn = async () => {
        if (i > 0) await passes[i - 1]!.passed;
        passes[i]!.pass();
      };
      try {
        results[i] = await work(items[i]!, turn, i);
      } catch (error) {
        errors.push({ index: i, error });
      } finally {
        // An item that never took its turn passes it once the items before it have.
        void turn();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  if (errors.length > 0) throw errors.sort((a, b) => a.index - b.index)[0]!.error;
  return results;
}
