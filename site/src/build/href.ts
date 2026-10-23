/**
 * Build-time only: a URL as an href the browser will follow: only http or https, with no control character. The job's
 * schemas already refuse anything else in the dataset; this holds the line in the site, for the dataset if that ever
 * loosens and for the run reports the changes page reads, whose links the job's report schema takes as plain strings.
 */
export function href(url: string, owner: string): string {
  if (!/^https?:[^\u0000-\u001f\u007f]*$/i.test(url)) throw new Error(`${owner} has a link that is not a plain http or https URL: ${JSON.stringify(url)}`);
  return url;
}
