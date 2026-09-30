import { apiError, readBody } from "@/lib/http";
import { reviewRequest } from "@/lib/request-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      await reviewRequest((await context.params).id, await readBody(request)),
    );
  } catch (error) {
    return apiError(error);
  }
}
