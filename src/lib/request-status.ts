export type Actor = "RESIDENT" | "ADMIN";

export function canTransition(from: string, to: string, actor: Actor): boolean {
  if (actor === "RESIDENT")
    return (
      (from === "DRAFT" && ["DRAFT", "SUBMITTED"].includes(to)) ||
      (from === "MORE_INFO_REQUIRED" && to === "SUBMITTED")
    );
  return (
    from === "SUBMITTED" &&
    ["MORE_INFO_REQUIRED", "APPROVED", "REJECTED"].includes(to)
  );
}

export const decisionStatuses = [
  "MORE_INFO_REQUIRED",
  "APPROVED",
  "REJECTED",
] as const;

export function replyError(reply: string): string | null {
  if (reply.length > 2000) return "Keep your reply under 2,000 characters.";
  if (reply.trim().length < 5)
    return "Reply to the admin in at least 5 characters.";
  return null;
}

export function reviewMessageError(
  status: string,
  message: string,
): string | null {
  if (message.length > 2000) return "Keep feedback under 2,000 characters.";
  if (
    ["REJECTED", "MORE_INFO_REQUIRED"].includes(status) &&
    message.trim().length < 5
  )
    return "Provide a specific message of at least 5 characters.";
  return null;
}
