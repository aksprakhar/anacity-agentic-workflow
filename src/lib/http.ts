import { ZodError } from "zod";

export class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
    public errors?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 32000) throw new RequestError("Request is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError("Send a valid JSON object.");
  }
}

export function apiError(error: unknown): Response {
  if (error instanceof RequestError)
    return Response.json(
      { error: error.message, errors: error.errors },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return Response.json(
      {
        error: "Invalid request.",
        details: error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        ),
      },
      { status: 400 },
    );
  console.error(
    "Request failed:",
    error instanceof Error ? error.name : "Unknown error",
  );
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
