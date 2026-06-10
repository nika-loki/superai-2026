# Phase 0: Initialisation Agent + PDF Extraction

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Depends on:** Phase 1 (schema must exist first — the onboarding flow writes to DB)

**Goal:** When a user onboards with company name, domain, country, and uploaded PDFs, extract text from PDFs, then run an initialisation agent that generates an Organisation.md (Soul.md) — the backbone ICP profile for every future research run.

**Architecture:** Onboarding form → S3 upload → PDF text extraction via pdfjs-dist → create org record (status: "onboarding") → trigger initialisation Ash agent session → agent analyses PDF text + domain + Exa search → generates Organisation.md → updates org to "active".

---

### Task 0.1: Install pdfjs-dist

**Step 1: Install**

```bash
pnpm add pdfjs-dist
```

**Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(deps): add pdfjs-dist for PDF text extraction"
```

---

### Task 0.2: Create PDF extraction utility

**Files:**
- Create: `agent/lib/pdf.ts`

**Step 1: Write PDF extractor**

```ts
// agent/lib/pdf.ts
// Extracts text from PDF buffers using Mozilla's PDF.js
// No native dependencies — works in Vercel serverless

import { getDocument, type TextItem } from "pdfjs-dist/legacy/build/pdf.js";

export async function extractTextFromBuffer(buffer: Buffer): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => item.str)
      .join(" ");
    pages.push(pageText);
  }

  return pages.join("\n\n");
}

/**
 * Extract text from an S3 object by key.
 * Downloads the file from S3, then extracts text.
 */
export async function extractTextFromS3(
  s3Key: string,
  bucketName: string = process.env.S3_BUCKET_NAME!,
): Promise<string> {
  // S3 client is in lib/s3.ts — use GetObjectCommand
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { s3Client } = await import("../lib/s3.js");

  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: bucketName, Key: s3Key }),
  );

  if (!response.Body) throw new Error(`Empty S3 response for key: ${s3Key}`);

  const bytes = await response.Body.transformToByteArray();
  return extractTextFromBuffer(Buffer.from(bytes));
}
```

**Step 2: Commit**

```bash
git add agent/lib/pdf.ts
git commit -m "feat(lib): add PDF text extraction with pdfjs-dist"
```

---

### Task 0.3: Create onboarding server action

**Files:**
- Create: `app/actions/onboarding.ts`

**Step 1: Write onboarding action**

This handles:
1. Validate form input (company name, domain, country, files)
2. Upload files to S3
3. Extract text from each PDF
4. Create org record with `status: "onboarding"` and `icpSourceFiles` populated
5. Trigger initialisation agent session

```ts
"use server";

import { db } from "@/agent/lib/db.js";
import { organisations } from "@/agent/lib/db/schema.js";
import { extractTextFromBuffer } from "@/agent/lib/pdf.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3.js";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";

interface OnboardingInput {
  companyName: string;
  domain: string;
  country: string;
  workspaceId: string;
  files: Array<{ name: string; buffer: ArrayBuffer; type: string }>;
}

export async function onboardOrganisation(input: OnboardingInput) {
  const orgId = uuid();
  const honchoPeerId = uuid();
  const uploadedFiles: Array<{
    url: string;
    filename: string;
    uploadedAt: string;
    extractedText?: string;
  }> = [];

  // 1. Upload each file to S3 and extract text
  for (const file of input.files) {
    const s3Key = `onboarding/${orgId}/${file.name}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: s3Key,
        Body: Buffer.from(file.buffer),
        ContentType: file.type,
      }),
    );

    let extractedText: string | undefined;
    if (file.type === "application/pdf") {
      try {
        extractedText = await extractTextFromBuffer(Buffer.from(file.buffer));
      } catch (err) {
        console.error(`Failed to extract text from ${file.name}:`, err);
      }
    }

    uploadedFiles.push({
      url: s3Key,
      filename: file.name,
      uploadedAt: new Date().toISOString(),
      extractedText,
    });
  }

  // 2. Create org record
  const [org] = await db.insert(organisations).values({
    id: orgId,
    workspaceId: input.workspaceId,
    name: input.companyName,
    domain: input.domain,
    hqCountry: input.country,
    icpDescription: `Auto-generated from onboarding. Company: ${input.companyName}, Domain: ${input.domain}, Country: ${input.country}`,
    honchoPeerId,
    status: "onboarding",
    icpSourceFiles: uploadedFiles,
  }).returning();

  // 3. TODO: Trigger initialisation agent session
  // This will be done via useAshAgent() or Ash session API
  // The agent receives: extracted PDF text + company name + domain + country
  // The agent produces: Organisation.md

  return { orgId, status: "onboarding" };
}
```

**Step 2: Commit**

```bash
git add app/actions/onboarding.ts
git commit -m "feat(onboarding): server action for org creation with PDF upload + extraction"
```

---

### Task 0.4: Create initialisation skill

**Files:**
- Create: `agent/skills/initialisation/SKILL.md`

**Step 1: Write initialisation skill**

```markdown
# Organisation Initialisation Skill

You are initialising a new account agent. Your job is to study the company's uploaded documents and web presence, then generate a comprehensive Organisation.md that will serve as the backbone for every future research run.

## Input You Receive

The system provides you with:
- Company name, domain, and country
- Extracted text from uploaded PDFs (pitch deck, product brochure, case study)
- The org's icpSourceFiles array from the database

## Your Task

### Step 1: Study the uploaded documents
Read the extracted PDF text carefully. Identify:
- What the company does (product/service)
- Who they sell to (target personas, industries, company sizes)
- Their value proposition and positioning
- Key competitors mentioned
- Pricing signals or business model clues

### Step 2: Search the web with exa_answer
Use `exa_answer` to research:
- "What does {companyName} do? What is their business model?"
- "Who are {companyName}'s main competitors?"
- "What is {companyName}'s latest funding and valuation?"

### Step 3: Generate Organisation.md

Write a comprehensive markdown document with these sections:

```markdown
# {CompanyName} — Account Profile

## Company Overview
- **Name:** ...
- **Domain:** ...
- **HQ:** ... (country)
- **Industry:** ...
- **Business Model:** ... (SaaS, marketplace, etc.)
- **Stage:** ... (startup, growth, enterprise)
- **Employee Count:** ... (if discoverable)

## Product & Value Proposition
- What they sell
- Key features/capabilities
- Pricing signals
- Target customer profile

## ICP (Ideal Customer Profile)
- Target personas (titles, seniority levels)
- Target industries
- Target company sizes
- Pain points they address
- Buying triggers to watch for

## Signal Categories to Monitor
Based on what this company sells, watch for these types of signals:
1. {signal_type_1}: ... (why this matters)
2. {signal_type_2}: ...
3. {signal_type_3}: ...
4. {signal_type_4}: ...
5. {signal_type_5}: ...

## Key Competitors
1. {competitor_1} — ...
2. {competitor_2} — ...
3. {competitor_3} — ...

## Search Strategy
- **People search terms:** ... (titles, departments to target)
- **Company signal queries:** ... (what to search for)
- **Event keywords:** ... (industry events to track)

## Initial Opportunity Score Estimate
- **Score:** ... / 100
- **Rationale:** ...
```

### Step 4: Persist results
1. Call `db_update_org` to write:
   - `organisationMd` = the generated markdown
   - `properties` = structured data (industry, stage, employee_count, etc.)
   - `status` = "active"
   - `opportunityScore` = initial estimate
   - `refreshIntervalDays` = 3 (new accounts get frequent checks)

2. Call `honcho_remember` to store the Organisation.md as the first memory entry for this account.

### Constraints
- Be specific, not generic. Every line should reflect what you learned about THIS company.
- If the uploaded documents are sparse, lean harder on Exa search to fill gaps.
- The Organisation.md must be actionable — the research agent will use it to decide WHAT to search for and HOW to score results.
- Keep the total markdown under 2000 words. Be concise but comprehensive.
```

**Step 2: Commit**

```bash
git add agent/skills/initialisation/SKILL.md
git commit -m "feat(skills): add initialisation skill for Organisation.md generation"
```

---

## Summary

| Task | Files | Purpose |
|---|---|---|
| 0.1 | package.json | Install pdfjs-dist |
| 0.2 | agent/lib/pdf.ts | PDF text extraction utility |
| 0.3 | app/actions/onboarding.ts | Server action: upload + extract + create org + trigger agent |
| 0.4 | agent/skills/initialisation/SKILL.md | Skill for generating Organisation.md |

**4 tasks. Can be built in parallel with Phase 1 (schema) and Phase 4 (frontend).**
