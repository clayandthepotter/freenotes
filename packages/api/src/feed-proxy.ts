import { DomainError } from "@freenotes/core";
import type { CalendarFeedFetcher } from "@freenotes/core";

/**
 * Fetches iCalendar feeds on the server, where there is no CORS and where we can refuse anything
 * that is not a public https address. Browsers call this through /api/ics; the CLI uses it directly.
 */
export interface FeedProxyOptions {
  readonly fetch?: typeof fetch;
  /** Allow http:// and private hosts, for local development and tests. Never in production. */
  readonly allowPrivate?: boolean;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|\[fc.*\]|\[fd.*\]|\[fe80.*\])$/i;

export function assertPublicFeedUrl(raw: string, allowPrivate = false): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DomainError("invalid-url", "That is not a valid calendar address.");
  }
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) throw new DomainError("invalid-url", "Calendar feeds must use https://.");
  if (!allowPrivate && PRIVATE_HOST.test(url.hostname)) throw new DomainError("invalid-url", "Calendar feeds must be on a public host.");
  if (url.username || url.password) throw new DomainError("invalid-url", "Calendar feeds cannot carry credentials in the address.");
  return url;
}

export class FeedProxy implements CalendarFeedFetcher {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly options: FeedProxyOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async fetchIcs(raw: string): Promise<string> {
    const url = assertPublicFeedUrl(raw, this.options.allowPrivate);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);
    try {
      const res = await this.fetchImpl(url, { redirect: "follow", signal: controller.signal, headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "user-agent": "freenotes/1 (+https://github.com/clayandthepotter/freenotes)" } });
      if (!res.ok) throw new DomainError("feed-failed", `The calendar answered ${res.status}. Check the address is the private ICS link, not the calendar's web page.`);
      const max = this.options.maxBytes ?? 5_000_000;
      const text = await res.text();
      if (text.length > max) throw new DomainError("feed-too-large", "That calendar feed is too large to read.");
      if (!/BEGIN:VCALENDAR/i.test(text)) throw new DomainError("not-a-feed", "That address did not return a calendar. Use the private ICS/iCal link from your calendar's settings.");
      return text;
    } catch (e) {
      if (e instanceof DomainError) throw e;
      if ((e as Error).name === "AbortError") throw new DomainError("feed-timeout", "The calendar took too long to answer.");
      throw new DomainError("feed-failed", `Could not reach the calendar: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
