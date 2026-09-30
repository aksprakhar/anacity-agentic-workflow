import { z } from "zod";
import { prisma } from "./prisma";
import { assistMove, type Resubmission } from "./agent";
import { RequestError } from "./http";
import {
  diffAnswers,
  parseWorkflow,
  requestTypeSchema,
  validateAnswers,
  type Answers,
  type WorkflowConfig,
} from "./workflow-config";
import {
  canTransition,
  replyError,
  reviewMessageError,
} from "./request-status";
import type { MoveRequest } from "@/generated/prisma/client";

export const residentEmail = "resident@demo.com";
const unavailable = "This service is temporarily unavailable. Please try again later.";
const saveSchema = z
  .object({
    communityId: z.string().min(1),
    type: requestTypeSchema,
    answers: z.unknown(),
    action: z.enum(["save", "submit"]),
  })
  .strict();
const editSchema = z
  .object({
    answers: z.unknown(),
    action: z.enum(["save", "submit"]),
    updatedAt: z.iso.datetime(),
    reply: z.string().trim().max(2000).optional(),
  })
  .strict();
const reviewSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED", "MORE_INFO_REQUIRED"]),
    message: z.string().trim().max(2000),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export async function demoUser(role: "RESIDENT" | "ADMIN") {
  const user = await prisma.user.findUnique({
    where: { email: role === "RESIDENT" ? residentEmail : "admin@demo.com" },
  });
  if (!user || user.role !== role) {
    console.error(`Demo ${role} user is missing. Run npm run db:seed.`);
    throw new RequestError(unavailable, 503);
  }
  return user;
}

export async function communityConfig(
  communityId: string,
  type: "MOVE_IN" | "MOVE_OUT",
): Promise<WorkflowConfig> {
  const workflow = await prisma.communityWorkflow.findUnique({
    where: { communityId_type: { communityId, type } },
  });
  if (!workflow) throw new RequestError("Community workflow not found.", 404);
  try {
    return parseWorkflow(workflow.config);
  } catch {
    console.error(
      `Invalid ${type} configuration for community ${communityId}. Fix it and run npm run db:seed.`,
    );
    throw new RequestError(unavailable, 503);
  }
}

export async function configForRequest(request: MoveRequest) {
  return request.workflowSnapshot
    ? parseWorkflow(request.workflowSnapshot)
    : communityConfig(request.communityId, request.type);
}

export function answersForRequest(request: MoveRequest) {
  const data = request.data;
  if (
    request.workflowSnapshot ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  )
    return data;
  // The original form stored unused fields from the other journey as null.
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== null),
  );
}

export function storedAnswers(config: WorkflowConfig, data: unknown): Answers {
  const raw =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    config.fields
      .filter(
        (field) =>
          typeof raw[field.key] === "string" ||
          typeof raw[field.key] === "number",
      )
      .map((field) => [field.key, raw[field.key] as string | number]),
  );
}

export async function latestAdminQuestion(requestId: string): Promise<string> {
  const question = await prisma.requestEvent.findFirst({
    where: { requestId, eventType: "MORE_INFO_REQUIRED" },
    orderBy: { createdAt: "desc" },
  });
  const metadata = question?.metadata;
  const message =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata.message
      : undefined;
  return typeof message === "string" ? message : "";
}

async function resubmissionContext(
  request: MoveRequest,
  config: WorkflowConfig,
  answers: Answers,
  reply: string,
): Promise<Resubmission> {
  const previousAnswers = storedAnswers(config, answersForRequest(request));
  return {
    adminQuestion: await latestAdminQuestion(request.id),
    residentReply: reply,
    previousAnswers,
    changes: diffAnswers(config, previousAnswers, answers),
  };
}

function checkedAnswers(
  config: WorkflowConfig,
  input: unknown,
  submit: boolean,
) {
  const result = validateAnswers(config, input, submit);
  if (Object.keys(result.errors).length)
    throw new RequestError(
      "Please correct the highlighted fields.",
      400,
      result.errors,
    );
  return result.answers;
}

export async function createRequest(input: unknown) {
  const body = saveSchema.parse(input);
  const resident = await demoUser("RESIDENT");
  const config = await communityConfig(body.communityId, body.type);
  const submit = body.action === "submit";
  const answers = checkedAnswers(config, body.answers, submit);
  const assessment = submit
    ? await assistMove({ mode: "assess", config, answers, description: "" })
    : undefined;
  const [sequence] = await prisma.$queryRaw<{ number: bigint }[]>`
    SELECT nextval('"MoveRequest_reference_seq"') AS number
  `;
  const prefix = body.type === "MOVE_IN" ? "MI" : "MO";
  const reference = `REQ-${prefix}-${sequence.number.toString().padStart(4, "0")}`;
  return prisma.moveRequest.create({
    data: {
      reference,
      userId: resident.id,
      communityId: body.communityId,
      type: body.type,
      status: submit ? "SUBMITTED" : "DRAFT",
      data: answers,
      workflowSnapshot: config,
      aiSummary: assessment?.summary,
      aiAssessment: assessment,
      events: {
        create: {
          eventType: submit ? "REQUEST_SUBMITTED" : "DRAFT_SAVED",
          actor: resident.email,
          metadata: { answers, ...(assessment ? { assessment } : {}) },
        },
      },
    },
  });
}

export async function editRequest(id: string, input: unknown) {
  const body = editSchema.parse(input);
  const resident = await demoUser("RESIDENT");
  const request = await prisma.moveRequest.findFirst({
    where: { id, userId: resident.id },
  });
  if (!request) throw new RequestError("Request not found.", 404);
  const status = body.action === "submit" ? "SUBMITTED" : "DRAFT";
  if (!canTransition(request.status, status, "RESIDENT"))
    throw new RequestError(
      "This request cannot be edited in its current status.",
      409,
    );
  if (body.updatedAt !== request.updatedAt.toISOString())
    throw new RequestError("This request changed. Reload before saving.", 409);
  const resubmitting = request.status === "MORE_INFO_REQUIRED";
  const reply = body.reply ?? "";
  if (!resubmitting && reply)
    throw new RequestError("A reply can only be sent when resubmitting.");
  const replyProblem = resubmitting ? replyError(reply) : null;
  if (replyProblem)
    throw new RequestError(replyProblem, 400, { reply: replyProblem });
  const config = await configForRequest(request);
  const answers = checkedAnswers(config, body.answers, status === "SUBMITTED");
  const resubmission = resubmitting
    ? await resubmissionContext(request, config, answers, reply)
    : undefined;
  const assessment =
    status === "SUBMITTED"
      ? await assistMove({
          mode: "assess",
          config,
          answers,
          description: "",
          resubmission,
        })
      : undefined;
  return prisma.$transaction(async (tx) => {
    const changed = await tx.moveRequest.updateMany({
      where: {
        id,
        userId: resident.id,
        status: request.status,
        updatedAt: request.updatedAt,
      },
      data: {
        data: answers,
        status,
        workflowSnapshot: config,
        aiSummary: assessment?.summary,
        aiAssessment: assessment,
      },
    });
    if (!changed.count)
      throw new RequestError(
        "This request changed. Reload before saving.",
        409,
      );
    await tx.requestEvent.create({
      data: {
        requestId: id,
        actor: resident.email,
        eventType: resubmitting
          ? "REQUEST_RESUBMITTED"
          : status === "DRAFT"
            ? "DRAFT_SAVED"
            : "REQUEST_SUBMITTED",
        metadata: {
          answers,
          ...(assessment ? { assessment } : {}),
          ...(resubmission
            ? {
                message: reply,
                question: resubmission.adminQuestion,
                changes: resubmission.changes,
              }
            : {}),
        },
      },
    });
    return tx.moveRequest.findUniqueOrThrow({ where: { id } });
  });
}

export async function reviewRequest(id: string, input: unknown) {
  const body = reviewSchema.parse(input);
  const admin = await demoUser("ADMIN");
  const request = await prisma.moveRequest.findUnique({ where: { id } });
  if (!request) throw new RequestError("Request not found.", 404);
  if (!canTransition(request.status, body.status, "ADMIN"))
    throw new RequestError("Only submitted requests can be reviewed.", 409);
  if (body.updatedAt !== request.updatedAt.toISOString())
    throw new RequestError(
      "This request changed. Reload before reviewing.",
      409,
    );
  const messageError = reviewMessageError(body.status, body.message);
  if (messageError) throw new RequestError(messageError);
  const config = await configForRequest(request);
  if (body.status === "APPROVED")
    checkedAnswers(config, answersForRequest(request), true);
  return prisma.$transaction(async (tx) => {
    const changed = await tx.moveRequest.updateMany({
      where: { id, status: "SUBMITTED", updatedAt: request.updatedAt },
      data: { status: body.status },
    });
    if (!changed.count)
      throw new RequestError(
        "This request changed. Reload before reviewing.",
        409,
      );
    await tx.requestEvent.create({
      data: {
        requestId: id,
        eventType: body.status,
        actor: admin.email,
        // Only record feedback the admin actually wrote.
        metadata: body.message ? { message: body.message } : {},
      },
    });
    return tx.moveRequest.findUniqueOrThrow({ where: { id } });
  });
}
