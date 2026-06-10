"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { OrgTableBody } from "@/components/org-table-body";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

type OrgRow = {
  id: string;
  name: string;
  domain: string;
  hqCountry: string;
  opportunityScore: number | null;
  status: string;
  lastResearchedAt: string | null;
  nextRunAt: string | null;
  refreshIntervalDays: number | null;
  signalCount: number;
};

function buildPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];

  if (current > 3) {
    pages.push("ellipsis");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("ellipsis");
  }

  pages.push(total);

  return pages;
}

export function DashboardTableClient({
  orgs,
  totalCount,
  currentPage,
  pageSize = 10,
}: {
  orgs: OrgRow[];
  totalCount: number;
  currentPage: number;
  pageSize?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const fromItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toItem = Math.min(currentPage * pageSize, totalCount);

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`?${params.toString()}`);
  }

  const pageNumbers = buildPageNumbers(currentPage, totalPages);

  return (
    <div>
      <div className="border border-notion-border rounded-md overflow-hidden">
        <table className="notion-table">
          <thead>
            <tr>
              <th className="w-[40%]">Name</th>
              <th className="w-[140px]">Domain</th>
              <th className="w-[120px]">Country</th>
              <th className="w-[80px]">
                <span className="inline-flex items-center gap-1">
                  ICP Score
                  <svg className="size-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </th>
              <th className="w-[100px]">Status</th>
              <th className="w-[120px]">Last Run</th>
              <th className="w-[120px]">Next Refresh</th>
              <th className="w-[80px]">Signals</th>
            </tr>
          </thead>
          <OrgTableBody orgs={orgs} />
        </table>
      </div>

      {totalCount > 0 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-notion-text-muted">
            Showing {fromItem}&ndash;{toItem} of {totalCount}
          </span>

          {totalPages > 1 && (
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => goToPage(currentPage - 1)}
                    className={
                      currentPage <= 1
                        ? "pointer-events-none opacity-40"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>

                {pageNumbers.map((page, idx) =>
                  page === "ellipsis" ? (
                    <PaginationItem key={`ellipsis-${idx}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={page}>
                      <PaginationLink
                        isActive={page === currentPage}
                        onClick={() => goToPage(page)}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}

                <PaginationItem>
                  <PaginationNext
                    onClick={() => goToPage(currentPage + 1)}
                    className={
                      currentPage >= totalPages
                        ? "pointer-events-none opacity-40"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}
    </div>
  );
}
