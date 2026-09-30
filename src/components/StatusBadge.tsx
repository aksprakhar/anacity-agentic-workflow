const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  MORE_INFO_REQUIRED: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`badge shrink-0 ${statusColors[status] ?? statusColors.DRAFT}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
