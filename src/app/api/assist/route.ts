import { z } from "zod";
import { apiError, readBody, RequestError } from "@/lib/http";
import { assistMove } from "@/lib/agent";
import {
  communityConfig,
  configForRequest,
  demoUser,
  latestAdminQuestion,
} from "@/lib/request-service";
import { prisma } from "@/lib/prisma";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { requestTypeSchema, validateAnswers } from "@/lib/workflow-config";

const schema = z
  .object({
    communityId: z.string().min(1),
    type: requestTypeSchema,
    requestId: z.string().optional(),
    answers: z.unknown(),
    description: z.string().trim().min(1).max(4000),
  })
  .strict();

// 10 suggestion requests per client per minute.
const limit = createRateLimiter(10, 60_000);

export async function POST(request: Request) {
  const { allowed, retryAfter } = limit(clientKey(request));
  if (!allowed)
    return Response.json(
      {
        error: `Too many suggestion requests. Try again in ${retryAfter} seconds.`,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  try {
    const body = schema.parse(await readBody(request));
    const resident = await demoUser("RESIDENT");
    const existing = body.requestId
      ? await prisma.moveRequest.findFirst({
          where: { id: body.requestId, userId: resident.id },
        })
      : null;
    if (
      body.requestId &&
      (!existing || !["DRAFT", "MORE_INFO_REQUIRED"].includes(existing.status))
    )
      throw new RequestError("Request is unavailable for editing.", 409);
    const config = existing
      ? await configForRequest(existing)
      : await communityConfig(body.communityId, body.type);
    const { answers, errors } = validateAnswers(config, body.answers, false);
    if (Object.keys(errors).length)
      throw new RequestError(
        "Correct invalid values before using assistance.",
        400,
        errors,
      );
    const adminQuestion =
      existing?.status === "MORE_INFO_REQUIRED"
        ? await latestAdminQuestion(existing.id)
        : "";
    return Response.json(
      await assistMove({
        mode: "extract",
        config,
        answers,
        description: body.description,
        ...(adminQuestion ? { adminQuestion } : {}),
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
