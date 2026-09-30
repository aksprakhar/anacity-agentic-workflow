import { prisma } from "@/lib/prisma";
import { apiError, readBody } from "@/lib/http";
import { createRequest, residentEmail } from "@/lib/request-service";

export async function GET() {
  try {
    return Response.json(
      await prisma.moveRequest.findMany({
        where: { user: { email: residentEmail } },
        include: { community: true },
        orderBy: { createdAt: "desc" },
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    return Response.json(await createRequest(await readBody(request)), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
