import { apiError, readBody } from "@/lib/http";
import { editRequest } from "@/lib/request-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      await editRequest((await context.params).id, await readBody(request)),
    );
  } catch (error) {
    return apiError(error);
  }
}
