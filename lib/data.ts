/**
 * RevenueOS — Mock Data Module
 *
 * Typed mock data that mirrors the DB schema exactly.
 * Swap this module for real DB queries when Aurora RDS is reachable.
 */

// ── Types (match DB schema) ───────────────────────────────────────────

export type Org = {
  id: string;
  name: string;
  domain: string;
  hqCountry: string;
  icpDescription: string;
  opportunityScore: number | null;
  status: "onboarding" | "active" | "paused" | "churned";
  lastResearchedAt: string | null;
  nextRunAt: string | null;
  refreshIntervalDays: number | null;
  properties: Array<{ key: string; value: string; type: string }>;
  hasActiveRun: boolean;
};

export type Signal = {
  id: string;
  type: string;
  title: string;
  quotes: Array<{ text: string; speaker?: string; source?: string }>;
  icpRelevance: string;
  sources: Array<{ url: string; title: string; publishedDate?: string }>;
  impact: number | null;
  createdAt: string;
};

export type Task = {
  id: string;
  type: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "failed";
  description: string;
  rationale: string | null;
  priority: number;
  contactName?: string;
  createdAt: string;
};

export type TraceToolCall = {
  callId: string;
  toolName: string;
  status: "completed" | "failed" | "running";
  input?: string;
  output?: string;
  startedAt?: string;
  completedAt?: string;
};

export type AgentRun = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  toolsInvoked: number;
  traceData: TraceToolCall[];
  chainOfThought: string | null;
  durationMs: number | null;
  summary: string | null;
  icpFitScore: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type Contact = {
  id: string;
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  email: string | null;
  seniority: string;
  relevanceNote: string | null;
};

export type Deal = {
  id: string;
  title: string;
  description: string | null;
  stage: "discovery" | "qualified" | "proposal" | "negotiation" | "closed_won" | "closed_lost";
  valueUsd: number | null;
  expectedCloseDate: string | null;
  probability: number;
  primaryContactName: string | null;
  createdAt: string;
};

// ── Org IDs (stable for routing) ──────────────────────────────────────

const ORG_IDS = {
  grab: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  canva: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  seaGroup: "c3d4e5f6-a7b8-9012-cdef-123456789012",
  tokopedia: "d4e5f6a7-b8c9-0123-defa-234567890123",
  gojek: "e5f6a7b8-c9d0-1234-efab-345678901234",
} as const;

// ── Orgs ───────────────────────────────────────────────────────────────

const orgs: Org[] = [
  {
    id: ORG_IDS.grab,
    name: "Grab",
    domain: "grab.com",
    hqCountry: "Singapore",
    icpDescription:
      "Southeast Asia's leading superapp. Ride-hailing, food delivery, digital payments, and financial services across 8 countries. Aggressive expansion into fintech and enterprise logistics.",
    opportunityScore: 87,
    status: "active",
    lastResearchedAt: "2026-06-09T06:30:00Z",
    nextRunAt: "2026-06-12T06:00:00Z",
    refreshIntervalDays: 3,
    hasActiveRun: false,
    properties: [
      { key: "Industry", value: "Superapp / Mobility & Fintech", type: "text" },
      { key: "Employee Count", value: "~12,000", type: "text" },
      { key: "Funding Stage", value: "Public (NASDAQ: GRAB)", type: "text" },
      { key: "Revenue", value: "$2.36B (FY2025)", type: "text" },
      { key: "Headquarters", value: "Singapore", type: "text" },
    ],
  },
  {
    id: ORG_IDS.canva,
    name: "Canva",
    domain: "canva.com",
    hqCountry: "Australia",
    icpDescription:
      "Global visual communication platform serving 190+ countries. Strong enterprise push with Canva Teams. Recently launched AI-powered design tools and enterprise governance features.",
    opportunityScore: 78,
    status: "active",
    lastResearchedAt: "2026-06-09T04:15:00Z",
    nextRunAt: "2026-06-12T04:00:00Z",
    refreshIntervalDays: 3,
    hasActiveRun: false,
    properties: [
      { key: "Industry", value: "SaaS / Design & Collaboration", type: "text" },
      { key: "Employee Count", value: "~4,500", type: "text" },
      { key: "Funding Stage", value: "Private (Valued at $40B)", type: "text" },
      { key: "Revenue", value: "$2.5B ARR (est.)", type: "text" },
      { key: "Headquarters", value: "Sydney, Australia", type: "text" },
    ],
  },
  {
    id: ORG_IDS.seaGroup,
    name: "Sea Group",
    domain: "seagroup.com",
    hqCountry: "Singapore",
    icpDescription:
      "Parent of Shopee (e-commerce), SeaMoney (fintech), and Garena (gaming). Dominant in Southeast Asian digital economy with 700M+ consumers served across the ecosystem.",
    opportunityScore: 82,
    status: "active",
    lastResearchedAt: "2026-06-08T22:00:00Z",
    nextRunAt: "2026-06-11T22:00:00Z",
    refreshIntervalDays: 3,
    hasActiveRun: false,
    properties: [
      { key: "Industry", value: "Conglomerate / E-commerce, Gaming, Fintech", type: "text" },
      { key: "Employee Count", value: "~35,000", type: "text" },
      { key: "Funding Stage", value: "Public (NYSE: SE)", type: "text" },
      { key: "Revenue", value: "$13.1B (FY2025)", type: "text" },
      { key: "Headquarters", value: "Singapore", type: "text" },
    ],
  },
  {
    id: ORG_IDS.tokopedia,
    name: "Tokopedia",
    domain: "tokopedia.com",
    hqCountry: "Indonesia",
    icpDescription:
      "Indonesia's largest independent e-commerce platform (now merged with GoTo). Focused on SMB empowerment, digital infrastructure, and logistics technology across the Indonesian archipelago.",
    opportunityScore: 71,
    status: "active",
    lastResearchedAt: null,
    nextRunAt: "2026-06-24T12:00:00Z",
    refreshIntervalDays: 14,
    hasActiveRun: false,
    properties: [
      { key: "Industry", value: "E-commerce / Marketplace", type: "text" },
      { key: "Employee Count", value: "~6,000", type: "text" },
      { key: "Funding Stage", value: "Merged into GoTo Group (IDX: GOTO)", type: "text" },
      { key: "Revenue", value: "~$1.8B (est., GoTo segment)", type: "text" },
      { key: "Headquarters", value: "Jakarta, Indonesia", type: "text" },
    ],
  },
  {
    id: ORG_IDS.gojek,
    name: "Gojek",
    domain: "gojek.com",
    hqCountry: "Indonesia",
    icpDescription:
      "Indonesia's original superapp. On-demand transport, food delivery, payments, and 20+ on-demand services. Part of GoTo Group. Expanding logistics-as-a-service for enterprise clients.",
    opportunityScore: 74,
    status: "active",
    lastResearchedAt: "2026-06-09T02:00:00Z",
    nextRunAt: "2026-06-12T02:00:00Z",
    refreshIntervalDays: 3,
    hasActiveRun: false,
    properties: [
      { key: "Industry", value: "Superapp / Mobility & On-demand Services", type: "text" },
      { key: "Employee Count", value: "~8,000", type: "text" },
      { key: "Funding Stage", value: "Merged into GoTo Group (IDX: GOTO)", type: "text" },
      { key: "Revenue", value: "~$2.1B (est., GoTo segment)", type: "text" },
      { key: "Headquarters", value: "Jakarta, Indonesia", type: "text" },
    ],
  },
];

// ── Signals ────────────────────────────────────────────────────────────

const signals: Record<string, Signal[]> = {
  [ORG_IDS.grab]: [
    {
      id: "s1-grab",
      type: "funding_round",
      title: "GrabVentures launches $500M fund for Southeast Asian fintech startups",
      quotes: [
        {
          text: "We are doubling down on financial inclusion. This fund will back the next generation of fintech infrastructure companies across Southeast Asia.",
          speaker: "Anthony Tan",
          source: "TechCrunch",
        },
        {
          text: "The fund will focus on companies building payments infrastructure, lending platforms, and insurtech solutions serving underserved populations.",
          source: "Bloomberg",
        },
      ],
      icpRelevance:
        "Directly aligns with our fintech solution targeting digital payment infrastructure in emerging markets. Grab's new fund signals aggressive investment in the exact sector we serve, creating partnership and procurement opportunities.",
      sources: [
        {
          url: "https://techcrunch.com/2026/06/07/grabventures-500m-fund",
          title: "GrabVentures Launches $500M Fintech Fund — TechCrunch",
          publishedDate: "2026-06-07",
        },
        {
          url: "https://bloomberg.com/news/articles/2026-06-07/grab-fintech-fund",
          title: "Grab Targets Financial Inclusion With New Fund — Bloomberg",
          publishedDate: "2026-06-07",
        },
      ],
      impact: 5,
      createdAt: "2026-06-09T05:12:00Z",
    },
    {
      id: "s2-grab",
      type: "leadership_change",
      title: "Grab appoints former Stripe APAC head as Chief Payments Officer",
      quotes: [
        {
          text: "I am thrilled to join Grab at this pivotal moment. The payments landscape in Southeast Asia is at an inflection point, and Grab is uniquely positioned to lead.",
          speaker: "New CPO (unnamed in source)",
          source: "Reuters",
        },
      ],
      icpRelevance:
        "A new C-suite hire with Stripe pedigree suggests Grab is serious about upgrading its payments stack. This creates an opening for enterprise sales conversations with a decision-maker who understands modern payment APIs.",
      sources: [
        {
          url: "https://reuters.com/technology/2026/06/08/grab-stripe-cpo",
          title: "Grab Hires Stripe Veteran as Chief Payments Officer — Reuters",
          publishedDate: "2026-06-08",
        },
      ],
      impact: 4,
      createdAt: "2026-06-08T18:30:00Z",
    },
    {
      id: "s3-grab",
      type: "expansion",
      title: "Grab expands GrabMaps enterprise offering to Philippines and Vietnam",
      quotes: [
        {
          text: "GrabMaps Enterprise is now available in 6 markets. We are seeing strong demand from logistics companies and food delivery platforms looking for hyperlocal mapping data.",
          speaker: "Grab Maps VP",
          source: "DealStreetAsia",
        },
      ],
      icpRelevance:
        "Enterprise product expansion signals growing B2B revenue focus. If we offer complementary data or analytics services, this is a clear entry point into Grab's enterprise sales organisation.",
      sources: [
        {
          url: "https://dealstreetasia.com/stories/grabmaps-enterprise-2026",
          title: "Grab Maps Enterprise Expands to PH and VN — DealStreetAsia",
          publishedDate: "2026-06-06",
        },
      ],
      impact: 3,
      createdAt: "2026-06-06T09:00:00Z",
    },
  ],
  [ORG_IDS.canva]: [
    {
      id: "s1-canva",
      type: "product_launch",
      title: "Canva launches Enterprise AI Governance Suite for large organisations",
      quotes: [
        {
          text: "Our enterprise customers told us they need AI governance built in, not bolted on. This suite gives IT admins full visibility and control over AI-generated content.",
          speaker: "Cameron Adams",
          source: "The Verge",
        },
      ],
      icpRelevance:
        "Enterprise governance features indicate Canva is moving upmarket into regulated industries. If we sell compliance or governance tooling, this signals a new buyer persona at Canva.",
      sources: [
        {
          url: "https://theverge.com/2026/6/8/canva-enterprise-ai-governance",
          title: "Canva Enterprise AI Governance Suite — The Verge",
          publishedDate: "2026-06-08",
        },
      ],
      impact: 4,
      createdAt: "2026-06-08T14:00:00Z",
    },
    {
      id: "s2-canva",
      type: "expansion",
      title: "Canva opens new engineering hub in Singapore, hiring 200 engineers",
      quotes: [
        {
          text: "APAC is our fastest-growing market. The Singapore hub will focus on localisation, mobile-first features, and AI research tailored to Asian languages.",
          speaker: "Canva APAC VP",
          source: "Straits Times",
        },
      ],
      icpRelevance:
        "Major APAC engineering investment signals long-term commitment to the region. Companies selling developer tools, recruiting platforms, or HR tech should target this expansion.",
      sources: [
        {
          url: "https://straitstimes.com/tech/canva-singapore-hub-2026",
          title: "Canva to Hire 200 Engineers in Singapore — Straits Times",
          publishedDate: "2026-06-07",
        },
      ],
      impact: 3,
      createdAt: "2026-06-07T08:00:00Z",
    },
  ],
  [ORG_IDS.seaGroup]: [
    {
      id: "s1-sea",
      type: "funding_round",
      title: "SeaMoney raises $800M to expand digital lending across Southeast Asia",
      quotes: [
        {
          text: "SeaMoney has originated over $5B in loans. This new capital allows us to serve 50 million underserved SMEs across the region with instant credit products.",
          speaker: "SeaMoney CEO",
          source: "CNBC Asia",
        },
      ],
      icpRelevance:
        "Massive capital injection into digital lending creates demand for credit scoring, KYC, and fraud prevention solutions. If we operate in any of these adjacencies, this is a high-priority signal.",
      sources: [
        {
          url: "https://cnbc.com/2026/06/07/seamoney-800m-digital-lending",
          title: "SeaMoney Raises $800M for SEA Lending Push — CNBC Asia",
          publishedDate: "2026-06-07",
        },
      ],
      impact: 5,
      createdAt: "2026-06-07T12:00:00Z",
    },
    {
      id: "s2-sea",
      type: "leadership_change",
      title: "Shopee appoints former Lazada CTO as Head of Platform Engineering",
      quotes: [
        {
          text: "I have spent my career building e-commerce platforms at scale. Shopee's technical infrastructure is already world-class, and I plan to take it to the next level with AI-first architecture.",
          speaker: "New Head of Platform Engineering",
          source: "Tech in Asia",
        },
      ],
      icpRelevance:
        "Hiring a senior engineering leader from a direct competitor suggests an upcoming platform rebuild or major technical initiative. Infrastructure and dev tool vendors should take note.",
      sources: [
        {
          url: "https://techinasia.com/shopee-lazada-cto-2026",
          title: "Shopee Poaches Lazada CTO — Tech in Asia",
          publishedDate: "2026-06-06",
        },
      ],
      impact: 3,
      createdAt: "2026-06-06T10:00:00Z",
    },
    {
      id: "s3-sea",
      type: "product_launch",
      title: "Garena announces AI-powered game development platform for studios",
      quotes: [
        {
          text: "We are opening up our internal AI tools to external game studios. This platform reduces game prototyping time by 60% using generative AI for asset creation.",
          speaker: "Garena CPO",
          source: "IGN Asia",
        },
      ],
      icpRelevance:
        "New B2B platform launch from Garena's gaming division. Companies selling creative AI tools, cloud rendering, or game dev infrastructure should explore partnership opportunities.",
      sources: [
        {
          url: "https://ign.com/asia/articles/garena-ai-game-platform-2026",
          title: "Garena AI Game Dev Platform — IGN Asia",
          publishedDate: "2026-06-05",
        },
      ],
      impact: 2,
      createdAt: "2026-06-05T16:00:00Z",
    },
  ],
  [ORG_IDS.tokopedia]: [
    {
      id: "s1-toko",
      type: "expansion",
      title: "Tokopedia launches same-day delivery network for Java and Sumatra",
      quotes: [
        {
          text: "Our new logistics network covers 85% of Indonesia's population with same-day delivery. This is a first for Indonesian e-commerce at this scale.",
          speaker: "Tokopedia Logistics VP",
          source: "Jakarta Post",
        },
      ],
      icpRelevance:
        "Major logistics buildout creates demand for warehouse management, fleet tracking, and last-mile delivery technology. Relevant for supply chain tech vendors.",
      sources: [
        {
          url: "https://jakpost.net/tech/tokopedia-same-day-2026",
          title: "Tokopedia Same-Day Delivery — Jakarta Post",
          publishedDate: "2026-06-08",
        },
      ],
      impact: 3,
      createdAt: "2026-06-08T10:00:00Z",
    },
    {
      id: "s2-toko",
      type: "regulatory",
      title: "Indonesian government designates Tokopedia as critical digital infrastructure",
      quotes: [
        {
          text: "As a designated critical infrastructure provider, Tokopedia will receive additional cybersecurity support and must comply with enhanced data residency requirements.",
          speaker: "Indonesian Ministry of Communication",
          source: "Kompas",
        },
      ],
      icpRelevance:
        "Critical infrastructure designation triggers mandatory compliance requirements. Companies selling cybersecurity, data governance, or compliance solutions have a clear procurement trigger.",
      sources: [
        {
          url: "https://kompas.com/tech/tokopedia-critical-infra-2026",
          title: "Tokopedia Named Critical Infrastructure — Kompas",
          publishedDate: "2026-06-06",
        },
      ],
      impact: 4,
      createdAt: "2026-06-06T07:00:00Z",
    },
  ],
  [ORG_IDS.gojek]: [
    {
      id: "s1-gojek",
      type: "product_launch",
      title: "Gojek launches GoBiz API for enterprise logistics-as-a-service",
      quotes: [
        {
          text: "We are opening our logistics network to third-party enterprises. Any company can now integrate Gojek's fleet for last-mile delivery via a simple API.",
          speaker: "Gojek CTO",
          source: "TechCrunch",
        },
      ],
      icpRelevance:
        "Enterprise API launch signals a shift to B2B revenue. API management, developer experience, and integration platform vendors should target this new product line.",
      sources: [
        {
          url: "https://techcrunch.com/2026/06/07/gojek-gobiz-api",
          title: "Gojek Launches Enterprise Logistics API — TechCrunch",
          publishedDate: "2026-06-07",
        },
      ],
      impact: 4,
      createdAt: "2026-06-07T11:00:00Z",
    },
    {
      id: "s2-gojek",
      type: "funding_round",
      title: "GoTo Group invests $200M in Gojek's electric vehicle fleet transition",
      quotes: [
        {
          text: "Our goal is 50% electric fleet by 2028. This investment covers vehicle subsidies, charging infrastructure, and driver incentive programs.",
          speaker: "GoTo Sustainability Lead",
          source: "Reuters",
        },
      ],
      icpRelevance:
        "EV fleet transition creates demand for fleet management software, charging infrastructure management, and sustainability reporting tools.",
      sources: [
        {
          url: "https://reuters.com/business/2026/06/05/goto-electric-fleet",
          title: "GoTo Invests $200M in Electric Fleet — Reuters",
          publishedDate: "2026-06-05",
        },
      ],
      impact: 3,
      createdAt: "2026-06-05T14:00:00Z",
    },
  ],
};

// ── Tasks ──────────────────────────────────────────────────────────────

const tasks: Record<string, Task[]> = {
  [ORG_IDS.grab]: [
    {
      id: "t1-grab",
      type: "send_email",
      status: "pending",
      description: "Send personalised email to Anthony Tan about GrabVentures $500M fund partnership opportunity",
      rationale:
        "The new $500M fund directly targets fintech infrastructure companies. Reaching out to Anthony Tan with a tailored partnership proposal has the highest chance of converting to a meeting.",
      priority: 85,
      contactName: "Anthony Tan",
      createdAt: "2026-06-09T06:45:00Z",
    },
    {
      id: "t2-grab",
      type: "linkedin_dm",
      status: "in_progress",
      description: "Send LinkedIn message to new CPO (ex-Stripe) introducing our payment analytics platform",
      rationale:
        "A new C-suite hire with Stripe background is evaluating the payments tech stack. A warm LinkedIn introduction referencing their Stripe experience could open a conversation.",
      priority: 72,
      contactName: "Chief Payments Officer",
      createdAt: "2026-06-09T06:46:00Z",
    },
  ],
  [ORG_IDS.canva]: [
    {
      id: "t1-canva",
      type: "send_email",
      status: "pending",
      description: "Email Canva APAC VP about partnership for Singapore engineering hub launch",
      rationale:
        "New 200-engineer hub in Singapore creates immediate demand for developer tooling and team productivity software. First-mover advantage on outreach is critical.",
      priority: 68,
      contactName: "Canva APAC VP",
      createdAt: "2026-06-09T04:30:00Z",
    },
    {
      id: "t2-canva",
      type: "research_deeper",
      status: "pending",
      description: "Research Canva Enterprise AI Governance Suite technical architecture and buyer personas",
      rationale:
        "Understanding the technical stack and buyer personas for the new governance product will inform whether we target CISO, VP Engineering, or IT Admin personas.",
      priority: 45,
      createdAt: "2026-06-09T04:31:00Z",
    },
  ],
  [ORG_IDS.seaGroup]: [
    {
      id: "t1-sea",
      type: "schedule_call",
      status: "pending",
      description: "Schedule introductory call with SeaMoney credit risk team about fraud detection solutions",
      rationale:
        "SeaMoney's $800M raise for digital lending creates immediate need for credit scoring and fraud prevention. Their credit risk team is the most likely buyer.",
      priority: 90,
      contactName: "SeaMoney Credit Risk Lead",
      createdAt: "2026-06-08T22:15:00Z",
    },
  ],
  [ORG_IDS.tokopedia]: [
    {
      id: "t1-toko",
      status: "pending",
      type: "send_email",
      description: "Email Tokopedia CISO about compliance solutions for critical infrastructure designation",
      rationale:
        "Critical infrastructure designation triggers mandatory cybersecurity and data residency requirements. The CISO is the most direct buyer for compliance tooling.",
      priority: 78,
      contactName: "Tokopedia CISO",
      createdAt: "2026-06-09T07:00:00Z",
    },
  ],
  [ORG_IDS.gojek]: [
    {
      id: "t1-gojek",
      type: "linkedin_dm",
      status: "pending",
      description: "LinkedIn DM to Gojek CTO about API management tools for GoBiz launch",
      rationale:
        "The GoBiz API launch requires robust API management. The CTO is the decision-maker for infrastructure tooling purchases.",
      priority: 75,
      contactName: "Gojek CTO",
      createdAt: "2026-06-09T02:30:00Z",
    },
    {
      id: "t2-gojek",
      type: "research_deeper",
      status: "completed",
      description: "Research GoTo Group EV fleet transition timeline and procurement process",
      rationale:
        "Understanding the EV transition timeline will help time our outreach for fleet management and sustainability reporting tools.",
      priority: 40,
      createdAt: "2026-06-09T02:31:00Z",
    },
  ],
};

// ── Agent Runs ─────────────────────────────────────────────────────────

const runs: Record<string, AgentRun[]> = {
  [ORG_IDS.grab]: [
    {
      id: "r1-grab",
      status: "completed",
      toolsInvoked: 14,
      traceData: [
        { callId: "c1", toolName: "exa_company_signals", status: "completed", startedAt: "2026-06-09T06:00:00Z", completedAt: "2026-06-09T06:02:15Z" },
        { callId: "c2", toolName: "exa_people_search", status: "completed", startedAt: "2026-06-09T06:02:16Z", completedAt: "2026-06-09T06:04:30Z" },
        { callId: "c3", toolName: "exa_event_research", status: "completed", startedAt: "2026-06-09T06:04:31Z", completedAt: "2026-06-09T06:06:00Z" },
        { callId: "c4", toolName: "db_write_contacts", status: "completed", startedAt: "2026-06-09T06:06:01Z", completedAt: "2026-06-09T06:06:45Z" },
        { callId: "c5", toolName: "db_write_signals", status: "completed", startedAt: "2026-06-09T06:06:46Z", completedAt: "2026-06-09T06:07:30Z" },
        { callId: "c6", toolName: "exa_people_search", status: "completed", startedAt: "2026-06-09T06:07:31Z", completedAt: "2026-06-09T06:10:00Z" },
        { callId: "c7", toolName: "db_write_contacts", status: "completed", startedAt: "2026-06-09T06:10:01Z", completedAt: "2026-06-09T06:10:30Z" },
        { callId: "c8", toolName: "honcho_remember", status: "completed", startedAt: "2026-06-09T06:20:00Z", completedAt: "2026-06-09T06:20:20Z" },
        { callId: "c9", toolName: "db_update_org", status: "completed", startedAt: "2026-06-09T06:20:21Z", completedAt: "2026-06-09T06:20:40Z" },
        { callId: "c10", toolName: "db_write_research_log", status: "completed", startedAt: "2026-06-09T06:25:00Z", completedAt: "2026-06-09T06:30:00Z" },
      ],
      chainOfThought: "Starting research on Grab. First, I'll check for company-level signals — funding rounds, leadership changes, expansion news. Found 3 strong signals: GrabVentures $500M fund, new CPO hire from Stripe, and GrabMaps enterprise expansion. Now searching for key contacts at Grab who would be relevant decision-makers. Identified Anthony Tan (CEO) and the new CPO as primary contacts. Checking Honcho memory for any previous research context on this account. Generating ICP fit score based on signal alignment.",
      durationMs: 127_400,
      summary:
        "Researched Grab's recent GrabVentures $500M fund launch, new Chief Payments Officer hire (ex-Stripe APAC head), and GrabMaps Enterprise expansion to Philippines and Vietnam. Identified 3 high-relevance contacts including Anthony Tan (CEO) and the new CPO. Detected 3 actionable signals with strong ICP fit. Generated 2 recommended tasks: personalised email to Anthony Tan and LinkedIn introduction to the new CPO. Overall ICP fit is strong — Grab's fintech expansion directly aligns with our target vertical.",
      icpFitScore: 87,
      startedAt: "2026-06-09T06:00:00Z",
      completedAt: "2026-06-09T06:30:00Z",
      createdAt: "2026-06-09T05:58:00Z",
    },
  ],
  [ORG_IDS.canva]: [
    {
      id: "r1-canva",
      status: "completed",
      toolsInvoked: 11,
      traceData: [
        { callId: "c1", toolName: "exa_company_signals", status: "completed", startedAt: "2026-06-09T03:45:00Z", completedAt: "2026-06-09T03:47:00Z" },
        { callId: "c2", toolName: "exa_people_search", status: "completed", startedAt: "2026-06-09T03:47:01Z", completedAt: "2026-06-09T03:49:30Z" },
        { callId: "c3", toolName: "db_write_signals", status: "completed", startedAt: "2026-06-09T03:49:31Z", completedAt: "2026-06-09T03:50:00Z" },
        { callId: "c4", toolName: "db_write_contacts", status: "completed", startedAt: "2026-06-09T03:50:01Z", completedAt: "2026-06-09T03:50:30Z" },
        { callId: "c5", toolName: "db_write_research_log", status: "completed", startedAt: "2026-06-09T04:10:00Z", completedAt: "2026-06-09T04:15:00Z" },
      ],
      chainOfThought: "Researching Canva for APAC signals. The Enterprise AI Governance Suite launch is a strong indicator of upmarket movement — regulated enterprise customers need governance. Singapore engineering hub with 200 engineers confirms long-term APAC commitment. ICP alignment is moderate-high — enterprise governance features align well with compliance tooling.",
      durationMs: 89_200,
      summary:
        "Researched Canva's Enterprise AI Governance Suite launch and Singapore engineering hub expansion (200 engineers). Identified 2 signals: the governance product launch and APAC engineering investment. Found 2 relevant contacts. The governance suite launch suggests Canva is moving upmarket into regulated enterprise sales, creating opportunities for compliance and security tooling vendors.",
      icpFitScore: 78,
      startedAt: "2026-06-09T03:45:00Z",
      completedAt: "2026-06-09T04:15:00Z",
      createdAt: "2026-06-09T03:43:00Z",
    },
  ],
  [ORG_IDS.seaGroup]: [
    {
      id: "r1-sea",
      status: "completed",
      toolsInvoked: 13,
      traceData: [
        { callId: "c1", toolName: "exa_company_signals", status: "completed", startedAt: "2026-06-08T21:30:00Z", completedAt: "2026-06-08T21:32:30Z" },
        { callId: "c2", toolName: "exa_people_search", status: "completed", startedAt: "2026-06-08T21:32:31Z", completedAt: "2026-06-08T21:35:00Z" },
        { callId: "c3", toolName: "db_write_signals", status: "completed", startedAt: "2026-06-08T21:35:01Z", completedAt: "2026-06-08T21:36:00Z" },
        { callId: "c4", toolName: "db_write_contacts", status: "completed", startedAt: "2026-06-08T21:36:01Z", completedAt: "2026-06-08T21:36:30Z" },
        { callId: "c5", toolName: "db_write_research_log", status: "completed", startedAt: "2026-06-08T21:55:00Z", completedAt: "2026-06-08T22:00:00Z" },
      ],
      chainOfThought: "Researching Sea Group ecosystem — three major divisions: Shopee, SeaMoney, Garena. SeaMoney's $800M raise for digital lending is the strongest signal. Shopee hiring a former Lazada CTO suggests major platform rebuild. Garena's AI game dev platform is interesting but lower priority for our ICP. Focusing on SeaMoney credit risk team for immediate outreach.",
      durationMs: 105_600,
      summary:
        "Researched Sea Group ecosystem: SeaMoney's $800M digital lending raise, Shopee's hire of former Lazada CTO, and Garena's AI game development platform. Identified 3 signals across fintech, e-commerce infrastructure, and gaming. SeaMoney's massive capital injection for lending creates the strongest ICP fit. Recommended immediate outreach to SeaMoney's credit risk team.",
      icpFitScore: 82,
      startedAt: "2026-06-08T21:30:00Z",
      completedAt: "2026-06-08T22:00:00Z",
      createdAt: "2026-06-08T21:28:00Z",
    },
  ],
  [ORG_IDS.tokopedia]: [],
  [ORG_IDS.gojek]: [
    {
      id: "r1-gojek",
      status: "completed",
      toolsInvoked: 10,
      traceData: [
        { callId: "c1", toolName: "exa_company_signals", status: "completed", startedAt: "2026-06-09T01:30:00Z", completedAt: "2026-06-09T01:32:00Z" },
        { callId: "c2", toolName: "exa_people_search", status: "completed", startedAt: "2026-06-09T01:32:01Z", completedAt: "2026-06-09T01:34:30Z" },
        { callId: "c3", toolName: "db_write_signals", status: "completed", startedAt: "2026-06-09T01:34:31Z", completedAt: "2026-06-09T01:35:00Z" },
        { callId: "c4", toolName: "db_write_contacts", status: "completed", startedAt: "2026-06-09T01:35:01Z", completedAt: "2026-06-09T01:35:30Z" },
        { callId: "c5", toolName: "db_write_research_log", status: "completed", startedAt: "2026-06-09T01:55:00Z", completedAt: "2026-06-09T02:00:00Z" },
      ],
      chainOfThought: "Researching Gojek — part of GoTo Group. GoBiz API launch is the key signal: enterprise logistics-as-a-service marks a B2B revenue shift. The $200M EV fleet investment is secondary but relevant for sustainability/fleet management vendors. CTO is the primary decision-maker for infrastructure tooling.",
      durationMs: 78_300,
      summary:
        "Researched Gojek's GoBiz API enterprise logistics launch and GoTo Group's $200M electric vehicle fleet investment. Identified 2 signals: the B2B API product launch and the EV fleet transition. The GoBiz API launch is the strongest signal — it marks Gojek's shift to enterprise B2B revenue and creates demand for API management and developer experience tooling.",
      icpFitScore: 74,
      startedAt: "2026-06-09T01:30:00Z",
      completedAt: "2026-06-09T02:00:00Z",
      createdAt: "2026-06-09T01:28:00Z",
    },
  ],
};

// ── Contacts ───────────────────────────────────────────────────────────

const contacts: Record<string, Contact[]> = {
  [ORG_IDS.grab]: [
    {
      id: "c1-grab",
      name: "Anthony Tan",
      title: "Group CEO & Co-Founder",
      linkedinUrl: "https://linkedin.com/in/anthonytan",
      email: null,
      seniority: "C-Suite",
      relevanceNote:
        "Primary decision-maker for strategic partnerships. Directly quoted in GrabVentures fund announcement.",
    },
    {
      id: "c2-grab",
      name: "Chief Payments Officer",
      title: "Chief Payments Officer (ex-Stripe APAC)",
      linkedinUrl: "https://linkedin.com/in/",
      email: null,
      seniority: "C-Suite",
      relevanceNote:
        "Newly appointed, former Stripe APAC head. Likely evaluating payments tech stack and open to modern solutions.",
    },
    {
      id: "c3-grab",
      name: "Grab Maps VP",
      title: "VP of GrabMaps Enterprise",
      linkedinUrl: "https://linkedin.com/in/",
      email: null,
      seniority: "VP",
      relevanceNote:
        "Leads enterprise mapping product. Relevant for any data/analytics partnership discussions.",
    },
  ],
  [ORG_IDS.canva]: [
    {
      id: "c1-canva",
      name: "Cameron Adams",
      title: "Co-Founder & Chief Product Officer",
      linkedinUrl: "https://linkedin.com/in/cameronadams",
      email: null,
      seniority: "C-Suite",
      relevanceNote:
        "Quoted in Enterprise AI Governance Suite announcement. Key stakeholder for enterprise product partnerships.",
    },
    {
      id: "c2-canva",
      name: "Canva APAC VP",
      title: "VP APAC Operations",
      linkedinUrl: "https://linkedin.com/in/",
      email: null,
      seniority: "VP",
      relevanceNote:
        "Oversees Singapore engineering hub expansion. Key contact for developer tooling and team productivity sales.",
    },
  ],
  [ORG_IDS.seaGroup]: [
    {
      id: "c1-sea",
      name: "SeaMoney CEO",
      title: "CEO, SeaMoney",
      linkedinUrl: "https://linkedin.com/in/",
      email: null,
      seniority: "C-Suite",
      relevanceNote:
        "Directly quoted in $800M raise announcement. Decision-maker for fintech infrastructure procurement.",
    },
    {
      id: "c2-sea",
      name: "SeaMoney Credit Risk Lead",
      title: "Head of Credit Risk, SeaMoney",
      linkedinUrl: "https://linkedin.com/in/",
      email: null,
      seniority: "Director",
      relevanceNote:
        "Most relevant buyer for credit scoring and fraud prevention solutions. Likely evaluating vendors post-fundraise.",
    },
  ],
  [ORG_IDS.tokopedia]: [
    {
      id: "c1-toko",
      name: "Tokopedia CISO",
      title: "Chief Information Security Officer",
      linkedinUrl: "https://linkedin.com/in/",
      email: null,
      seniority: "C-Suite",
      relevanceNote:
        "Responsible for cybersecurity and data compliance following critical infrastructure designation.",
    },
  ],
  [ORG_IDS.gojek]: [
    {
      id: "c1-gojek",
      name: "Gojek CTO",
      title: "Chief Technology Officer",
      linkedinUrl: "https://linkedin.com/in/",
      email: null,
      seniority: "C-Suite",
      relevanceNote:
        "Quoted in GoBiz API launch. Decision-maker for infrastructure and API management tooling.",
    },
    {
      id: "c2-gojek",
      name: "GoTo Sustainability Lead",
      title: "Head of Sustainability, GoTo Group",
      linkedinUrl: "https://linkedin.com/in/",
      email: null,
      seniority: "Director",
      relevanceNote:
        "Oversees EV fleet transition. Relevant for sustainability reporting and fleet management tooling.",
    },
  ],
};

// ── Query Functions ────────────────────────────────────────────────────

export function getOrgs(): Org[] {
  return orgs;
}

export function getOrg(id: string): Org | null {
  return orgs.find((o) => o.id === id) ?? null;
}

export function getSignals(orgId: string): Signal[] {
  return signals[orgId] ?? [];
}

export function getTasks(orgId: string): Task[] {
  return tasks[orgId] ?? [];
}

export function getRuns(orgId: string): AgentRun[] {
  return runs[orgId] ?? [];
}

export function getContacts(orgId: string): Contact[] {
  return contacts[orgId] ?? [];
}
