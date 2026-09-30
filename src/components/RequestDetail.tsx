import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import { z } from "zod";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  answersForRequest,
  configForRequest,
  residentEmail,
  storedAnswers,
} from "@/lib/request-service";
import { decisionStatuses } from "@/lib/request-status";
import {
  todayInCommunity,
  validateAnswers,
  type AnswerChange,
  type WorkflowConfig,
} from "@/lib/workflow-config";
import { agentOutputSchema } from "@/lib/agent";
import RequestForm from "./RequestForm";
import AdminReviewPanel from "./AdminReviewPanel";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function changesFrom(value: unknown): AnswerChange[] {
  return Array.isArray(value)
    ? value.filter(
        (change): change is AnswerChange =>
          typeof record(change).key === "string" &&
          typeof record(change).label === "string",
      )
    : [];
}

function display(
  config: WorkflowConfig,
  key: string,
  value: unknown,
): string {
  if (value === undefined || value === null || value === "")
    return "Not provided";
  const field = config.fields.find((field) => field.key === key);
  return field?.type === "select"
    ? String(value).replaceAll("_", " ")
    : String(value);
}

const feedbackTitles: Record<string, string> = {
  MORE_INFO_REQUIRED: "The admin needs more information",
  REJECTED: "Reason for rejection",
  APPROVED: "Note from the admin",
};

const verdicts: Record<string, { label: string; className: string }> = {
  ADDRESSED: { label: "Addressed", className: "bg-green-100 text-green-800" },
  PARTIALLY_ADDRESSED: {
    label: "Partially addressed",
    className: "bg-amber-100 text-amber-800",
  },
  NOT_ADDRESSED: {
    label: "Not addressed",
    className: "bg-red-100 text-red-700",
  },
};

export default async function RequestDetail({
  id,
  admin = false,
}: {
  id: string;
  admin?: boolean;
}) {
  await connection();
  const request = await prisma.moveRequest.findFirst({
    where: { id, ...(admin ? {} : { user: { email: residentEmail } }) },
    include: {
      user: true,
      community: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!request) notFound();
  const config = await configForRequest(request);
  const raw = record(answersForRequest(request));
  const answers = storedAnswers(config, raw);
  const errors = Object.values(validateAnswers(config, raw).errors);
  const assessment = record(request.aiAssessment);
  const { source, ...output } = assessment;
  // Non-strict copy of the schema ignores stored extras such as the notice.
  // Assessments stored before the feedback check existed lack its fields.
  const parsedAssessment = z.object(agentOutputSchema.shape).safeParse({
    feedbackAddressed: "NOT_APPLICABLE",
    feedbackNotes: "",
    ...output,
  });
  const editable =
    !admin && ["DRAFT", "MORE_INFO_REQUIRED"].includes(request.status);

  const events = [...request.events].reverse();
  // Feedback is only current while the status it produced still stands.
  const decision = events.find((event) =>
    (decisionStatuses as readonly string[]).includes(event.eventType),
  );
  const feedbackMessage = record(decision?.metadata).message;
  const feedback =
    decision?.eventType === request.status &&
    typeof feedbackMessage === "string" &&
    feedbackMessage.trim()
      ? feedbackMessage
      : null;

  const latestSubmission = events.find((event) =>
    ["REQUEST_SUBMITTED", "REQUEST_RESUBMITTED"].includes(event.eventType),
  );
  const resubmission =
    admin && latestSubmission?.eventType === "REQUEST_RESUBMITTED"
      ? record(latestSubmission.metadata)
      : null;
  const changes = changesFrom(resubmission?.changes);
  const verdict =
    source === "AI" && parsedAssessment.success
      ? verdicts[parsedAssessment.data.feedbackAddressed]
      : undefined;

  const nextSteps =
    request.status === "APPROVED" ? (config.nextSteps ?? []) : [];
  const sidebar = admin || !!feedback || editable || nextSteps.length > 0;

  return (
    <main className="page max-w-6xl space-y-6">
      <header className="space-y-5">
        <Link
          href={admin ? "/admin" : "/resident"}
          className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-900"
        >
          <span aria-hidden="true">&larr;</span>
          Back to {admin ? "admin" : "resident"} dashboard
        </Link>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <h1 className="min-w-0 text-3xl font-semibold">
              {request.type === "MOVE_IN" ? "Move-in" : "Move-out"} request
            </h1>
            <StatusBadge status={request.status} />
          </div>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-gray-600">
            <span className="min-w-0 break-words">
              {request.community.name}
            </span>
            <span aria-hidden="true">&middot;</span>
            <span className="font-medium">{request.reference}</span>
          </p>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-gray-500">
            <span className="min-w-0 break-words">{request.user.name}</span>
            <span aria-hidden="true">&middot;</span>
            <span className="min-w-0 break-words">{request.user.email}</span>
          </p>
        </div>
      </header>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 lg:gap-8">
        <div
          className={
            sidebar ? "min-w-0 space-y-6" : "min-w-0 space-y-6 lg:col-span-2"
          }
        >
          <section className="panel">
            <h2 className="mb-4 text-xl font-semibold">
              {request.status === "DRAFT"
                ? "Saved answers"
                : "Submitted answers"}
            </h2>
            <dl className="space-y-3">
              {config.fields.map((field) => (
                <div key={field.key}>
                  <dt className="text-sm font-medium text-gray-600">
                    {field.label}
                  </dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {display(config, field.key, answers[field.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {admin && (
            <section className="panel space-y-3">
              <h2 className="text-xl font-semibold">Application checks</h2>
              <p className="text-sm text-gray-600">
                Re-checked each time this page loads (dates in India time).
              </p>
              {errors.length ? (
                <ul className="list-disc pl-5 text-red-700">
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-green-800">
                  All required fields and value checks pass.
                </p>
              )}
            </section>
          )}
        </div>
        {sidebar && (
          <div className="min-w-0 space-y-6 break-words">
            {resubmission && (
              <section className="panel space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">Resubmission</h2>
                  {verdict && (
                    <span className={`badge ${verdict.className}`}>
                      {verdict.label}{" "}
                      <span className="font-normal">(AI check)</span>
                    </span>
                  )}
                </div>
                {typeof resubmission.question === "string" &&
                  resubmission.question && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-600">
                        You asked
                      </h3>
                      <p className="whitespace-pre-wrap">
                        {resubmission.question}
                      </p>
                    </div>
                  )}
                {typeof resubmission.message === "string" && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-600">
                      Resident replied
                    </h3>
                    <p className="whitespace-pre-wrap">
                      {resubmission.message}
                    </p>
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-medium text-gray-600">
                    Changed answers
                  </h3>
                  {changes.length ? (
                    <ul className="mt-1 space-y-2 text-sm">
                      {changes.map((change) => (
                        <li key={change.key}>
                          <span className="font-medium">{change.label}:</span>{" "}
                          <span className="text-gray-500 line-through">
                            {display(config, change.key, change.before)}
                          </span>{" "}
                          &rarr; {display(config, change.key, change.after)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm">No answers were changed.</p>
                  )}
                </div>
                {verdict && parsedAssessment.success ? (
                  parsedAssessment.data.feedbackNotes && (
                    <p className="text-sm text-gray-700">
                      {parsedAssessment.data.feedbackNotes}
                    </p>
                  )
                ) : (
                  <p className="text-sm text-gray-500">
                    AI could not check whether your question was answered.
                    Compare the reply and changes above.
                  </p>
                )}
              </section>
            )}
            {admin && (
              <section className="panel space-y-3">
                <h2 className="text-xl font-semibold">AI assessment</h2>
                {source === "AI" && parsedAssessment.success ? (
                  <>
                    <p className="text-sm text-gray-600">
                      Based on the latest submission.
                    </p>
                    <p className="whitespace-pre-wrap">
                      {request.aiSummary || parsedAssessment.data.summary}
                    </p>
                    <p className="font-medium">
                      {parsedAssessment.data.recommendation.replaceAll(
                        "_",
                        " ",
                      )}{" "}
                      <span className="font-normal text-gray-500">
                        (AI suggestion)
                      </span>
                    </p>
                    <ul className="list-disc pl-5">
                      {[
                        ...parsedAssessment.data.reasons,
                        ...parsedAssessment.data.missing,
                        ...parsedAssessment.data.ambiguities,
                      ].map((reason, index) => (
                        <li key={index}>{reason}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>
                    No AI assessment for this submission. Use the answers and
                    application checks.
                  </p>
                )}
              </section>
            )}
            {feedback && (
              <section className="panel border-amber-200 bg-amber-50">
                <h2 className="font-semibold">
                  {feedbackTitles[request.status]}
                </h2>
                <p className="mt-2 whitespace-pre-wrap break-words">
                  {feedback}
                </p>
              </section>
            )}
            {nextSteps.length > 0 && (
              <section className="panel border-green-200 bg-green-50">
                <h2 className="font-semibold">
                  {admin ? "Next steps shown to the resident" : "Next steps"}
                </h2>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  {nextSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
            )}

            {admin && request.status === "SUBMITTED" && (
              <AdminReviewPanel
                requestId={id}
                updatedAt={request.updatedAt.toISOString()}
                canApprove={!errors.length}
              />
            )}

            {editable && (
              <section className="space-y-4">
                <h2 className="text-xl font-semibold">
                  {request.status === "DRAFT"
                    ? "Complete your request"
                    : "Update and resubmit"}
                </h2>
                {request.status === "MORE_INFO_REQUIRED" && (
                  <p className="text-sm text-gray-600">
                    Correct any fields the admin asked about, then reply below
                    the form.
                  </p>
                )}
                <RequestForm
                  key={request.updatedAt.toISOString()}
                  requestId={id}
                  communityId={request.communityId}
                  type={request.type}
                  config={config}
                  updatedAt={request.updatedAt.toISOString()}
                  initialAnswers={answers}
                  resubmitting={request.status === "MORE_INFO_REQUIRED"}
                  today={todayInCommunity()}
                />
              </section>
            )}
          </div>
        )}
      </div>
      <section className="panel">
        <h2 className="mb-4 text-xl font-semibold">Request history</h2>
        <ol className="space-y-4">
          {request.events.map((event) => {
            const metadata = record(event.metadata);
            return (
              <li key={event.id} className="border-l-2 border-gray-200 pl-4">
                <p className="font-medium">
                  {event.eventType.replaceAll("_", " ")}
                </p>
                <p className="text-xs text-gray-500">
                  {event.actor} ·{" "}
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(event.createdAt)}{" "}
                  IST
                </p>
                {typeof metadata.message === "string" && metadata.message && (
                  <p className="mt-1 whitespace-pre-wrap break-words">
                    {event.eventType === "REQUEST_RESUBMITTED" && (
                      <span className="font-medium">Reply to admin: </span>
                    )}
                    {metadata.message}
                  </p>
                )}
                {metadata.answers && typeof metadata.answers === "object" ? (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer">
                      Answers at this event
                    </summary>
                    <dl className="mt-2 space-y-1">
                      {Object.entries(record(metadata.answers)).map(
                        ([key, value]) => (
                          <div key={key}>
                            <dt className="font-medium">
                              {config.fields.find((field) => field.key === key)
                                ?.label ?? key}
                            </dt>
                            <dd className="whitespace-pre-wrap break-words">
                              {String(value)}
                            </dd>
                          </div>
                        ),
                      )}
                    </dl>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
