/** Runs `body` with the machine's clock in another zone (the visitor's), then puts the zone back. */
export async function inTimeZone(timeZone: string, body: () => void | Promise<void>): Promise<void> {
  const saved = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    await body();
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
}
