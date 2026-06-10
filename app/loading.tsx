export default function DashboardLoading() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <div className="h-8 w-36 bg-notion-bg-secondary rounded" />
            <div className="h-4 w-44 bg-notion-bg-secondary rounded mt-1.5" />
          </div>
        </div>
      </div>

      {/* Table skeleton */}
      <div className="border border-notion-border rounded-md overflow-hidden">
        <table className="notion-table">
          <thead>
            <tr>
              <th className="w-[40%]">Name</th>
              <th className="w-[140px]">Domain</th>
              <th className="w-[120px]">Country</th>
              <th className="w-[80px]">ICP Score</th>
              <th className="w-[100px]">Status</th>
              <th className="w-[120px]">Last Run</th>
              <th className="w-[80px]">Signals</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded bg-notion-bg-secondary" />
                    <div className="h-4 w-28 bg-notion-bg-secondary rounded" />
                  </div>
                </td>
                <td>
                  <div className="h-3.5 w-24 bg-notion-bg-secondary rounded" />
                </td>
                <td>
                  <div className="h-3.5 w-20 bg-notion-bg-secondary rounded" />
                </td>
                <td>
                  <div className="w-7 h-7 rounded-full bg-notion-bg-secondary" />
                </td>
                <td>
                  <div className="h-5 w-16 rounded-full bg-notion-bg-secondary" />
                </td>
                <td>
                  <div className="h-3.5 w-14 bg-notion-bg-secondary rounded" />
                </td>
                <td>
                  <div className="h-3.5 w-6 bg-notion-bg-secondary rounded" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
