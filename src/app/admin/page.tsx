import StatusBadge from "@/components/StatusBadge";
import MoveDate from "@/components/MoveDate";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { moveDateOf, todayInCommunity } from "@/lib/workflow-config";

const views = {
  "needs-action": { label: "Needs action", statuses: ["SUBMITTED"] },
  "more-info": { label: "More info requested", statuses: ["MORE_INFO_REQUIRED"] },
  decided: { label: "Decided", statuses: ["APPROVED", "REJECTED"] },
  all: { label: "All", statuses: [] },
} as const;
type View = keyof typeof views;

const emptyMessages: Record<View, string> = {
  "needs-action": "Nothing is waiting for your decision.",
  "more-info": "No requests are waiting on residents.",
  decided: "No requests have been decided yet.",
  all: "No submitted requests yet.",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  await connection();
  const requested = (await searchParams).view;
  const view: View =
    typeof requested === "string" && requested in views
      ? (requested as View)
      : "needs-action";
  const today = todayInCommunity();
  const all = (
    await prisma.moveRequest.findMany({
      where: { status: { not: "DRAFT" } },
      include: { user: true, community: true },
      orderBy: { updatedAt: "desc" },
    })
  ).map((request) => ({ ...request, moveDate: moveDateOf(request.data) }));
  const inView = (key: View) =>
    key === "all"
      ? [...all]
      : all.filter((request) =>
          (views[key].statuses as readonly string[]).includes(request.status),
        );
  const requests = inView(view);
  // Pending decisions are worked nearest move date first; other views show
  // the most recently updated requests first.
  if (view === "needs-action")
    requests.sort(
      (a, b) =>
        (a.moveDate ?? "9999-12-31").localeCompare(b.moveDate ?? "9999-12-31") ||
        a.updatedAt.getTime() - b.updatedAt.getTime(),
    );
  const needsAction = inView("needs-action").length;

  return (
    <main className="page max-w-6xl">
      <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
      <p className="mt-2 mb-6 text-gray-600">
        {needsAction === 0
          ? "No requests need your decision right now."
          : `${needsAction} ${needsAction === 1 ? "request needs" : "requests need"} your decision.`}
      </p>
      <nav aria-label="Request filters" className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(views) as View[]).map((key) => (
          <Link
            key={key}
            href={`/admin?view=${key}`}
            aria-current={key === view ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              key === view
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 bg-white hover:border-gray-500"
            }`}
          >
            {views[key].label} ({inView(key).length})
          </Link>
        ))}
      </nav>
      {!requests.length ? (
        <p className="panel">{emptyMessages[view]}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              {views[view].label} move requests
            </caption>
            <thead className="bg-gray-100">
              <tr>
                {[
                  "Resident",
                  "Community",
                  "Request",
                  "Move date",
                  "Status",
                  "Review",
                ].map((title) => (
                  <th key={title} scope="col" className="px-4 py-3">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-t border-gray-100">
                  <td className="px-4 py-4">{request.user.name}</td>
                  <td className="px-4 py-4">{request.community.name}</td>
                  <td className="px-4 py-4">
                    <p className="font-medium">{request.reference}</p>
                    {request.type.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-4">
                    <MoveDate
                      date={request.moveDate}
                      today={today}
                      showUrgency={request.status === "SUBMITTED"}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={request.status} />
                  </td>
                  <td className="px-4 py-4">
                    <Link
                      className="font-medium underline"
                      href={`/admin/requests/${request.id}`}
                      aria-label={`Review ${request.reference}, ${request.type.replaceAll("_", " ")} for ${request.user.name} in ${request.community.name}`}
                    >
                      Open request
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
