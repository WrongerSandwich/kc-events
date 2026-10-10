import { describe, expect, it } from "vitest";
import { hostOf, onHost, registrableDomain, sameSite } from "../src/hosts.js";

describe("hosts", () => {
  it("hostOf drops www. and case; a URL that does not parse has none", () => {
    expect(hostOf("https://WWW.Knuckleheads.test/calendar")).toBe("knuckleheads.test");
    expect(hostOf("not a url")).toBeUndefined();
  });

  it("onHost matches a listed host and its subdomains, never a host that merely ends in it", () => {
    expect(onHost("https://www.eventbrite.com/e/1", ["eventbrite.com"])).toBe(true);
    expect(onHost("https://tickets.eventbrite.com/e/1", ["eventbrite.com"])).toBe(true);
    expect(onHost("https://noteventbrite.com/e/1", ["eventbrite.com"])).toBe(false);
  });
});

describe("the site a URL is on (its registrable domain)", () => {
  it.each([
    ["https://www.knuckleheadskc.com/calendar", "knuckleheadskc.com"],
    ["https://tickets.knuckleheadskc.com/e/1", "knuckleheadskc.com"],
    ["https://a.b.lied.ku.edu/x", "ku.edu"],
    ["https://venue.co.uk/", "venue.co.uk"],
    ["https://shop.venue.co.uk/", "venue.co.uk"],
    ["https://venue.com.au/", "venue.com.au"],
    ["https://localhost:3000/", "localhost"],
    ["http://127.0.0.1/", "127.0.0.1"],
  ])("%s is on %s", (url, site) => {
    expect(registrableDomain(url)).toBe(site);
  });

  it("is undefined for a URL that does not parse", () => {
    expect(registrableDomain("knuckleheads")).toBeUndefined();
  });

  it("sameSite: a venue's calendar and its ticket subdomain are one site; another venue, another tenant of a two-label suffix, or an unparseable URL are not", () => {
    expect(sameSite("https://www.knuckleheadskc.com/calendar", "https://tickets.knuckleheadskc.com/e/1")).toBe(true);
    expect(sameSite("https://knuckleheadskc.com/", "https://knuckleheads.com/")).toBe(false);
    expect(sameSite("https://a.co.uk/", "https://b.co.uk/")).toBe(false);
    expect(sameSite("nope", "nope")).toBe(false);
  });
});
