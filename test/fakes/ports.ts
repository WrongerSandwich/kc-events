import type { Ports } from "../../src/ports.js";

/** Fake ports that record every call; none of them reach the network. */
export function fakePorts(now: Date) {
  const calls: string[] = [];
  const ports: Ports = {
    model: {
      async complete(request) {
        calls.push(`model:${request.model}`);
        throw new Error("fake model has no scripted response");
      },
    },
    search: {
      async search(query) {
        calls.push(`search:${query}`);
        return [];
      },
    },
    fetcher: {
      async fetch(url) {
        calls.push(`fetch:${url}`);
        throw new Error("fake fetcher has no canned page");
      },
    },
    clock: { now: () => now },
  };
  return { ports, calls };
}
