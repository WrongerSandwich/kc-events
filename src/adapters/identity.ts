/** How the job identifies itself to the sites it fetches and the services it calls (ADR 0011). */
export const PRODUCT = "kc-this-week";
/** The about page's "For venues" section says what the job is and how to keep it off a site. */
export const ABOUT_URL = "https://www.kcthisweek.com/about";
export const REPO_URL = "https://github.com/WrongerSandwich/kc-events";
/**
 * Crawler-convention user agent, the form search engines' bots use: the `Mozilla/5.0 (compatible; …)` wrapper
 * gets past sites that refuse anything not shaped like it, and the product token and URL still name the job
 * plainly, so a source owner can reach the maintainer or opt out. Never a browser's own identity.
 */
export const USER_AGENT = `Mozilla/5.0 (compatible; ${PRODUCT}/0.1; +${ABOUT_URL})`;
