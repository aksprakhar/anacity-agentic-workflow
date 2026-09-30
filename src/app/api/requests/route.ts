import { apiError, readBody } from "@/lib/http";
import { createRequest } from "@/lib/request-service";

export async function POST(request: Request) {
  try {
    return Response.json(await createRequest(await readBody(request)), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
