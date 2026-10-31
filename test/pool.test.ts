import { describe, expect, it } from "vitest";
import { inOrder } from "../src/pool.js";

/** A promise with its resolve outside, so a test decides when each piece of work finishes. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("inOrder", () => {
  it("gives each item's result at its own index, whatever order they finish in", async () => {
    const gates = [gate(), gate(), gate()];
    const results = inOrder([0, 1, 2], 3, async (i) => {
      await gates[i]!.opened;
      return `item ${i}`;
    });
    gates[2]!.open();
    gates[0]!.open();
    gates[1]!.open();
    expect(await results).toEqual(["item 0", "item 1", "item 2"]);
  });

  it("runs no more than the limit at once", async () => {
    let running = 0;
    let most = 0;
    await inOrder([...Array(10).keys()], 4, async () => {
      running++;
      most = Math.max(most, running);
      await settle();
      running--;
    });
    expect(most).toBe(4);
  });

  it("at a limit of 1, finishes each item before starting the next", async () => {
    const log: string[] = [];
    await inOrder(["a", "b"], 1, async (item) => {
      log.push(`start ${item}`);
      await settle();
      log.push(`end ${item}`);
    });
    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("passes the turns in item order, though a later item is ready first", async () => {
    const fetched = [gate(), gate()];
    const called: number[] = [];
    const results = inOrder([0, 1], 2, async (i, turn) => {
      await fetched[i]!.opened;
      await turn(async () => void called.push(i));
    });
    fetched[1]!.open();
    await settle();
    expect(called).toEqual([]);
    fetched[0]!.open();
    await results;
    expect(called).toEqual([0, 1]);
  });

  it("starts each call before the next item's, however much longer the earlier item's work after its turn takes", async () => {
    const started: number[] = [];
    await inOrder([0, 1], 2, async (i, turn) => {
      const call = turn(async () => {
        started.push(i);
        await settle();
      });
      // What the first item does after its turn is slower; its call has gone out all the same.
      if (i === 0) for (let n = 0; n < 5; n++) await settle();
      await call;
    });
    expect(started).toEqual([0, 1]);
  });

  it("passes an item's turn when it finishes without taking it, or throws", async () => {
    const called: number[] = [];
    const results = inOrder([0, 1, 2], 3, async (i, turn) => {
      if (i === 0) return;
      if (i === 1) throw new Error("no page");
      await turn(async () => void called.push(i));
    });
    await expect(results).rejects.toThrow("no page");
    await settle();
    expect(called).toEqual([2]);
  });
});
