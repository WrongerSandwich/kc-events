/**
 * Pages read several at once (#252). A stage hands its pages to inOrder, which works through them at
 * most `limit` at a time and gives back each one's result at its index, so the stage applies them in
 * its own order and its output does not depend on which page finished first.
 */

/** Makes an item's call once every earlier item has made its own or finished, and gives back what the call does. */
export type Turn = <C>(call: () => Promise<C>) => Promise<C>;

/**
 * Runs `work` over the items, at most `limit` at once, started in item order; the results come back by
 * index. Each item's work gets `turn`, which makes the call handed to it once every earlier item has made
 * the call it handed its turn or finished, so those calls start in item order however the work before
 * them came back: a scripted model gets its replies for them in the same order at any limit, and the
 * spend cap is checked call by call in that order. A call made outside the turn has no place in that
 * order. At a limit of 1 each item finishes before the next starts. An item that throws passes its turn;
 * once all have settled, the earliest item's error is thrown.
 */
export async function inOrder<T, R>(items: readonly T[], limit: number, work: (item: T, turn: Turn, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  /** Each item's turn, resolved once it is passed. */
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
      const previous = i > 0 ? passes[i - 1]!.passed : Promise.resolve();
      const turn: Turn = async (call) => {
        await previous;
        // The call is made before the turn passes, so the next item's call cannot go ahead of it.
        const called = call();
        passes[i]!.pass();
        return called;
      };
      try {
        results[i] = await work(items[i]!, turn, i);
      } catch (error) {
        errors.push({ index: i, error });
      } finally {
        // An item that never took its turn passes it once the items before it have.
        void previous.then(() => passes[i]!.pass());
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  if (errors.length > 0) throw errors.sort((a, b) => a.index - b.index)[0]!.error;
  return results;
}
