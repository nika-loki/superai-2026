/**
 * Database query timing utilities for performance auditing.
 * Wraps Drizzle queries with high-resolution timers and exposes
 * results via Server-Timing headers and structured logging.
 */

export interface QueryTiming {
  label: string;
  durationMs: number;
  timestamp: ISOString;
}

export interface PageTiming {
  page: string;
  queries: QueryTiming[];
  totalDbMs: number;
  ttfbMs?: number;
}

type ISOString = string;

/**
 * Timing collector — one per request/page render.
 * Accumulates query timings and serialises to Server-Timing header value.
 */
export class RequestTimer {
  private queries: QueryTiming[] = [];
  private startHr: [number, number];

  constructor(private page: string) {
    this.startHr = process.hrtime();
  }

  /**
   * Wrap an async DB query call with timing measurement.
   */
  async timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = process.hrtime();
    try {
      return await fn();
    } finally {
      const diff = process.hrtime(start);
      const durationMs = diff[0] * 1000 + diff[1] / 1e6;
      this.queries.push({
        label,
        durationMs: Math.round(durationMs * 100) / 100,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get all recorded query timings.
   */
  getQueries(): QueryTiming[] {
    return this.queries;
  }

  /**
   * Total DB time across all queries.
   */
  getTotalDbMs(): number {
    return Math.round(
      this.queries.reduce((sum, q) => sum + q.durationMs, 0) * 100,
    ) / 100;
  }

  /**
   * Total wall time since this timer was created (≈ TTFB for server components).
   */
  getWallMs(): number {
    const diff = process.hrtime(this.startHr);
    return Math.round((diff[0] * 1000 + diff[1] / 1e6) * 100) / 100;
  }

  /**
   * Build a Server-Timing header value from recorded queries.
   * Format: "db-count;desc=3 queries;dur=45.2, db-1;desc=fetch org;dur=12.3, ..."
   */
  toServerTimingHeader(): string {
    const parts: string[] = [
      `db-total;desc="${this.queries.length} queries";dur=${this.getTotalDbMs()}`,
    ];
    for (const q of this.queries) {
      parts.push(
        `${q.label};desc="${q.label}";dur=${q.durationMs}`,
      );
    }
    return parts.join(", ");
  }

  /**
   * Build a full PageTiming report object.
   */
  toReport(): PageTiming {
    return {
      page: this.page,
      queries: this.queries,
      totalDbMs: this.getTotalDbMs(),
      ttfbMs: this.getWallMs(),
    };
  }
}
