/** How the job identifies itself to the sites it fetches and the services it calls. */
export const PRODUCT = "kc-events-research";
export const REPO_URL = "https://github.com/WrongerSandwich/kc-events";
/** Named user agent carrying the repo URL, so a source owner can reach the maintainer or opt out. */
export const USER_AGENT = `${PRODUCT}/0.1 (+${REPO_URL})`;
