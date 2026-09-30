import StatusBadge from "@/components/StatusBadge";
import MoveDate from "@/components/MoveDate";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { residentEmail } from "@/lib/request-service";
import { moveDateOf, todayInCommunity } from "@/lib/workflow-config";

export default async function ResidentPage() {
  await connection();
  const requests = await prisma.moveRequest.findMany({
    where: { user: { email: residentEmail } },
    include: { community: true },
    orderBy: { updatedAt: "desc" },
  });
  const today = todayInCommunity();
  return (
    <main className="page max-w-4xl">
      <h1 className="text-3xl font-semibold">Resident Services</h1>
      <p className="mt-2 text-gray-600">
        Create and follow your move requests as Demo Resident.
      </p>
      <div className="my-8 grid gap-5 md:grid-cols-2">
        {[
          {
            href: "move-in",
            title: "Move In",
            description:
              "Join a community. Choose your community and complete its requirements.",
          },
          {
            href: "move-out",
            title: "Move Out",
            description:
              "Leave a community. Share your move details for admin review.",
          },
        ].map((item) => (
          <Link
            href={`/resident/${item.href}`}
            key={item.href}
            className="panel transition hover:border-gray-500"
          >
            <h2 className="text-xl font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm text-gray-600">{item.description}</p>
            <p className="mt-5 font-medium underline">Start request</p>
          </Link>
        ))}
      </div>
      <h2 className="mb-4 text-xl font-semibold">Your requests</h2>
      {!requests.length ? (
        <p className="panel">
          No requests yet. Start a move-in or move-out above.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Link
              key={request.id}
              href={`/resident/requests/${request.id}`}
              className="panel flex flex-wrap items-center justify-between gap-3 hover:border-gray-500"
            >
              <div>
                <p className="text-sm font-semibold">{request.reference}</p>
                <p className="font-medium">
                  {request.type.replaceAll("_", " ")}
                </p>
                <p className="text-sm text-gray-600">
                  {request.community.name}
                </p>
                <p className="text-sm text-gray-600">
                  Move date:{" "}
                  <MoveDate date={moveDateOf(request.data)} today={today} />
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Open details, feedback and history
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={request.status} />
                {request.status === "MORE_INFO_REQUIRED" && (
                  <span className="text-sm font-medium text-amber-800">
                    Action needed: reply to the admin
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
