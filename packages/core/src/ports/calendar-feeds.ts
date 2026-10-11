/** Fetches the text of an iCalendar feed. Implementations: a server-side fetch with SSRF guards, an HTTP proxy for browsers. */
export interface CalendarFeedFetcher {
  fetchIcs(url: string): Promise<string>;
}
