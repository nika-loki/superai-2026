import { NextResponse } from "next/server";
import { getPerfData } from "@/agent/lib/db/perf-store";

export function GET(request: Request) {
  const url = new URL(request.url);
  const page = url.searchParams.get("page");

  if (page) {
    const data = getPerfData(page);
    if (!data) {
      return NextResponse.json({ error: "No data for page", page }, { status: 404 });
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(getPerfData(), {
    headers: { "Cache-Control": "no-store" },
  });
}
