import { daysUntil } from "@/lib/workflow-config";

const format = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default function MoveDate({
  date,
  today,
  showUrgency = false,
}: {
  date: string | null;
  today: string;
  showUrgency?: boolean;
}) {
  if (!date) return <span className="text-gray-500">Not set</span>;
  const days = daysUntil(date, today);
  const urgency =
    days <= 0
      ? "Date has passed"
      : days === 1
        ? "Tomorrow"
        : `In ${days} days`;
  return (
    <span>
      {format.format(new Date(`${date}T00:00:00Z`))}
      {showUrgency && (
        <span
          className={`block text-xs ${days <= 3 ? "font-medium text-red-700" : "text-gray-500"}`}
        >
          {urgency}
        </span>
      )}
    </span>
  );
}
