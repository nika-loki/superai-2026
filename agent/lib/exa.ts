/**
 * RevenueOS — Exa API Client
 *
 * Provides search, answer, contents, and Agent API endpoints.
 * Uses native fetch for core API calls. Re-exports the exa-js SDK
 * for the Agent API which has complex streaming/polling behaviour.
 */

import Exa from "exa-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExaSearchResult {
    id: string;
    url: string;
    title: string;
    publishedDate?: string;
    author?: string;
    score?: number;
    text?: string;
    highlights?: string[];
}

export interface ExaSearchResponse {
    results: ExaSearchResult[];
}

export interface ExaAnswerCitation {
    url: string;
    title: string;
    publishedDate?: string;
    text: string;
}

export interface ExaAnswerResponse {
    answer: string;
    citations: ExaAnswerCitation[];
}

export interface ExaContentsResult {
    id: string;
    url: string;
    title: string;
    text: string;
}

export interface ExaContentsResponse {
    results: ExaContentsResult[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EXA_BASE_URL = "https://api.exa.ai";

function getApiKey(): string {
    const key = process.env.EXA_API_KEY;
    if (!key) {
        throw new Error(
            "[exa] EXA_API_KEY environment variable is required. " +
                "Set it in .env.local or your deployment environment.",
        );
    }
    return key;
}

// ---------------------------------------------------------------------------
// Rate Limiter — respects Exa QPS limits per endpoint
//   /search    10 QPS
//   /contents  100 QPS
//   /answer    10 QPS
// Uses a per-endpoint sliding window with a wait queue so parallel tool calls
// are automatically throttled without dropping requests.
// ---------------------------------------------------------------------------

const EXA_RATE_LIMITS: Record<string, number> = {
    "/search": 10,
    "/contents": 100,
    "/answer": 10,
};

const DEFAULT_QPS = 10;

interface PendingRequest {
    resolve: () => void;
}

const endpointQueues = new Map<string, { timestamps: number[]; pending: PendingRequest[] }>();

function getQueue(endpoint: string) {
    let queue = endpointQueues.get(endpoint);
    if (!queue) {
        queue = { timestamps: [], pending: [] };
        endpointQueues.set(endpoint, queue);
    }
    return queue;
}

/**
 * Acquires a rate-limit slot for the given endpoint.
 * Returns immediately if under the QPS limit; otherwise waits until a slot opens.
 */
function acquireSlot(endpoint: string): Promise<void> {
    const qps = EXA_RATE_LIMITS[endpoint] ?? DEFAULT_QPS;
    const queue = getQueue(endpoint);
    const now = Date.now();
    const windowMs = 1000;

    // Prune timestamps older than 1 second
    queue.timestamps = queue.timestamps.filter((t) => now - t < windowMs);

    if (queue.timestamps.length < qps) {
        queue.timestamps.push(now);
        return Promise.resolve();
    }

    // Over limit — calculate wait time until the oldest timestamp exits the window
    const oldestInWindow = queue.timestamps[0]!;
    const waitMs = oldestInWindow + windowMs - now + 1; // +1ms safety margin

    return new Promise<void>((resolve) => {
        queue.pending.push({ resolve });
        setTimeout(() => {
            // Re-check and acquire after wait
            const now2 = Date.now();
            queue.timestamps = queue.timestamps.filter((t) => now2 - t < windowMs);
            queue.timestamps.push(now2);
            resolve();
        }, waitMs);
    });
}

// ---------------------------------------------------------------------------
// Core low-level request helper (rate-limited)
// ---------------------------------------------------------------------------

async function exaRequest(
    endpoint: string,
    body: Record<string, unknown>,
): Promise<unknown> {
    await acquireSlot(endpoint);

    const url = `${EXA_BASE_URL}${endpoint}`;
    const apiKey = getApiKey();

    console.log(`[exa] POST ${endpoint}`);

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
    });

    // On 429, back off and retry once
    if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After")) || 2;
        console.warn(`[exa] 429 rate limited on ${endpoint}, retrying after ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return exaRequest(endpoint, body);
    }

    if (!res.ok) {
        const text = await res.text().catch(() => "<no body>");
        throw new Error(
            `[exa] ${res.status} ${res.statusText} from ${endpoint}: ${text}`,
        );
    }

    return res.json() as Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Core API — search
// ---------------------------------------------------------------------------

export interface ExaSearchOptions {
    numResults?: number;
    category?: string;
    startPublishedDate?: string;
    endPublishedDate?: string;
    includeDomains?: string[];
    excludeDomains?: string[];
    type?: "auto" | "neural" | "keyword";
    contents?: { text: boolean; highlights: { query: string }[] };
}

export async function exaSearch(
    query: string,
    opts?: ExaSearchOptions,
): Promise<ExaSearchResponse> {
    const body: Record<string, unknown> = {
        query,
        ...(opts?.numResults != null && { numResults: opts.numResults }),
        ...(opts?.category && { category: opts.category }),
        ...(opts?.startPublishedDate && {
            startPublishedDate: opts.startPublishedDate,
        }),
        ...(opts?.endPublishedDate && {
            endPublishedDate: opts.endPublishedDate,
        }),
        ...(opts?.includeDomains && { includeDomains: opts.includeDomains }),
        ...(opts?.excludeDomains && { excludeDomains: opts.excludeDomains }),
        ...(opts?.type && { type: opts.type }),
        ...(opts?.contents && { contents: opts.contents }),
    };

    const raw = (await exaRequest("/search", body)) as Record<string, unknown>;
    const results = ((raw.results ?? []) as Record<string, unknown>[]).map(
        (r) => ({
            id: String(r.id ?? ""),
            url: String(r.url ?? ""),
            title: String(r.title ?? ""),
            publishedDate:
                r.publishedDate != null ? String(r.publishedDate) : undefined,
            author: r.author != null ? String(r.author) : undefined,
            score: r.score != null ? Number(r.score) : undefined,
            text: r.text != null ? String(r.text) : undefined,
            highlights: Array.isArray(r.highlights)
                ? (r.highlights as string[])
                : undefined,
        }),
    );

    console.log(`[exa] search returned ${results.length} results`);
    return { results };
}

// ---------------------------------------------------------------------------
// Core API — answer
// ---------------------------------------------------------------------------

export interface ExaAnswerOptions {
    includeDomains?: string[];
    searchDepth?: "basic" | "advanced";
}

export async function exaAnswer(
    query: string,
    opts?: ExaAnswerOptions,
): Promise<ExaAnswerResponse> {
    const body: Record<string, unknown> = {
        query,
        ...(opts?.includeDomains && { includeDomains: opts.includeDomains }),
        ...(opts?.searchDepth && { searchDepth: opts.searchDepth }),
    };

    const raw = (await exaRequest("/answer", body)) as Record<string, unknown>;

    const answer = String(raw.answer ?? "");
    const citations = ((raw.citations ?? []) as Record<string, unknown>[]).map(
        (c) => ({
            url: String(c.url ?? ""),
            title: String(c.title ?? ""),
            publishedDate:
                c.publishedDate != null ? String(c.publishedDate) : undefined,
            text: String(c.text ?? ""),
        }),
    );

    console.log(
        `[exa] answer returned (${answer.length} chars, ${citations.length} citations)`,
    );
    return { answer, citations };
}

// ---------------------------------------------------------------------------
// Core API — contents
// ---------------------------------------------------------------------------

export async function exaContents(
    ids: string[],
    opts?: { text?: boolean; highlights?: { query: string }[] },
): Promise<ExaContentsResponse> {
    const body: Record<string, unknown> = {
        ids,
        ...(opts?.text != null && { text: opts.text }),
        ...(opts?.highlights && { highlights: opts.highlights }),
    };

    const raw = (await exaRequest("/contents", body)) as Record<
        string,
        unknown
    >;
    const results = ((raw.results ?? []) as Record<string, unknown>[]).map(
        (r) => ({
            id: String(r.id ?? ""),
            url: String(r.url ?? ""),
            title: String(r.title ?? ""),
            text: String(r.text ?? ""),
        }),
    );

    console.log(`[exa] contents returned ${results.length} documents`);
    return { results };
}

// ---------------------------------------------------------------------------
// Higher-level helpers
// ---------------------------------------------------------------------------

const DEFAULT_COMPANY_ANGLES = [
    "funding & investment",
    "leadership changes",
    "expansion & growth",
    "product & strategy",
    "financial reports",
    "regulatory & compliance",
    "ICP-specific signals",
    "competitive landscape",
] as const;

const DEFAULT_PERSON_ANGLES = [
    "speeches & talks",
    "podcast appearances",
    "conference attendance",
    "LinkedIn activity",
    "social interests",
    "recent news",
] as const;

/**
 * Find people at a target company via LinkedIn profiles and news.
 */
export async function exaFindPeople(input: {
    companyName: string;
    titles?: string[];
    country?: string;
    numResults?: number;
    startPublishedDate?: string;
}): Promise<ExaSearchResponse> {
    const titleClause =
        input.titles && input.titles.length > 0
            ? ` (${input.titles.join(" OR ")})`
            : "";
    const countryClause = input.country ? ` in ${input.country}` : "";

    const query =
        `${input.companyName}${titleClause} employees site:linkedin.com/in${countryClause}`.trim();

    return exaSearch(query, {
        numResults: input.numResults ?? 10,
        category: "linkedin profile",
        type: "neural",
        ...(input.startPublishedDate && {
            startPublishedDate: input.startPublishedDate,
        }),
        contents: { text: true, highlights: { query: input.companyName } },
    });
}

/**
 * Multi-angle company deep dive — runs N parallel searches.
 */
export async function exaCompanyDeepDive(input: {
    companyName: string;
    domain?: string;
    angles?: string[];
    startPublishedDate?: string;
}): Promise<ExaSearchResponse[]> {
    const angles = input.angles ?? [...DEFAULT_COMPANY_ANGLES];
    const domainFilter = input.domain ? [input.domain] : undefined;

    console.log(
        `[exa] companyDeepDive "${input.companyName}" — ${angles.length} angles`,
    );

    const searches = angles.map((angle) =>
        exaSearch(`${input.companyName} ${angle}`, {
            numResults: 5,
            type: "auto",
            includeDomains: domainFilter,
            ...(input.startPublishedDate && {
                startPublishedDate: input.startPublishedDate,
            }),
            contents: { text: true, highlights: { query: angle } },
        }),
    );

    return Promise.all(searches);
}

/**
 * Multi-angle person deep dive — runs N parallel searches.
 */
export async function exaPersonDeepDive(input: {
    personName: string;
    company?: string;
    linkedinUrl?: string;
    startPublishedDate?: string;
}): Promise<ExaSearchResponse[]> {
    const context = input.company ? ` at ${input.company}` : "";
    const angles = [...DEFAULT_PERSON_ANGLES];

    console.log(
        `[exa] personDeepDive "${input.personName}"${context} — ${angles.length} angles`,
    );

    const searches = angles.map((angle) =>
        exaSearch(`${input.personName}${context} ${angle}`, {
            numResults: 5,
            type: "auto",
            ...(input.linkedinUrl && { includeDomains: ["linkedin.com"] }),
            ...(input.startPublishedDate && {
                startPublishedDate: input.startPublishedDate,
            }),
            contents: { text: true, highlights: { query: angle } },
        }),
    );

    return Promise.all(searches);
}

// ---------------------------------------------------------------------------
// SDK singleton — exposes Agent API, Research, Websets, etc.
// ---------------------------------------------------------------------------

let _exaSdk: Exa | null = null;

/**
 * Get the exa-js SDK singleton.
 *
 * The SDK provides access to:
 *   - `exa.beta.agent.runs` — Agent API (complex search agents)
 *   - `exa.research`        — Research API (deep research)
 *   - `exa.websets`         — Websets API (entity search)
 *   - `exa.monitors`        — Search Monitors API
 *
 * For simple search/answer/contents calls prefer the native-fetch helpers
 * above — they are lighter and easier to debug.
 */
export function getExaSdk(): Exa {
    if (!_exaSdk) {
        _exaSdk = new Exa(getApiKey());
        console.log("[exa] SDK client initialised");
    }
    return _exaSdk;
}
