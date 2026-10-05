type Deps = {
  createObjectURL: (b: Blob) => string;
  revokeObjectURL: (u: string) => void;
  createAnchor: () => HTMLAnchorElement;
  makeBlob: (parts: string[], type: string) => Blob;
  schedule: (fn: () => void, ms: number) => void;
};

const browser = (): Deps => ({
  createObjectURL: (b) => URL.createObjectURL(b),
  revokeObjectURL: (u) => URL.revokeObjectURL(u),
  createAnchor: () => document.createElement("a"),
  makeBlob: (parts, type) => new Blob(parts, { type }),
  schedule: (fn, ms) => void setTimeout(fn, ms),
});

/** Hands the visitor a file through a Blob URL and a click on an anchor; iOS Safari opens .ics in a viewer instead, which is the platform's call. */
export function downloadText(filename: string, text: string, mime: string, deps: Deps = browser()): void {
  const url = deps.createObjectURL(deps.makeBlob([text], mime));
  const a = deps.createAnchor();
  a.href = url;
  a.download = filename;
  a.click();
  // Firefox and Safari can cancel a download whose URL is revoked in the same tick as the click.
  deps.schedule(() => deps.revokeObjectURL(url), 1000);
}
