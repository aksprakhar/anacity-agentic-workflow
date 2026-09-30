import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  todayInCommunity,
  workflowSchema,
  type RequestType,
} from "@/lib/workflow-config";
import CommunityForm from "./CommunityForm";

export default async function NewRequest({ type }: { type: RequestType }) {
  await connection();
  const workflows = await prisma.communityWorkflow.findMany({
    where: { type },
    include: { community: true },
    orderBy: { community: { name: "asc" } },
  });
  // A broken configuration hides that one community instead of the whole page.
  const communities = workflows.flatMap((workflow) => {
    const parsed = workflowSchema.safeParse(workflow.config);
    if (parsed.success)
      return [
        {
          id: workflow.communityId,
          name: workflow.community.name,
          config: parsed.data,
        },
      ];
    console.error(
      `Skipping invalid ${type} configuration for community ${workflow.communityId}:`,
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
    return [];
  });
  return (
    <main className="page max-w-2xl">
      <Link href="/resident" className="text-sm underline">
        Back to resident dashboard
      </Link>
      <h1 className="mt-4 mb-6 text-3xl font-semibold">
        {type === "MOVE_IN" ? "Move-in" : "Move-out"} request
      </h1>
      {communities.length ? (
        <CommunityForm
          communities={communities}
          type={type}
          today={todayInCommunity()}
        />
      ) : (
        <p className="panel">
          {type === "MOVE_IN" ? "Move-in" : "Move-out"} requests are not
          available for any community yet. Please check back later.
        </p>
      )}
    </main>
  );
}
