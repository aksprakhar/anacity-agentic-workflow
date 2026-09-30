"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminReviewPanel({
  requestId,
  updatedAt,
  canApprove,
}: {
  requestId: string;
  updatedAt: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  async function review(status: string) {
    setConfirmingReject(false);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/requests/${requestId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, message, updatedAt }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          [data.error, ...Object.values(data.errors ?? {})].join(" "),
        );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save decision.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel space-y-4">
      <h2 className="text-xl font-semibold">Admin decision</h2>
      <p className="text-sm text-gray-600">
        The AI only makes suggestions. The decision is yours.
      </p>
      <label htmlFor="admin-message" className="block text-sm font-medium">
        Feedback to resident (required for rejection or more information)
      </label>
      <textarea
        id="admin-message"
        className="input"
        rows={3}
        maxLength={2000}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Be specific about what the resident needs to clarify or change."
        disabled={busy}
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {!canApprove && (
        <p className="text-sm text-amber-800">
          Resolve validation errors before approval. Ask the resident to correct
          their request.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="button"
          disabled={busy || !canApprove}
          onClick={() => void review("APPROVED")}
        >
          Approve
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={busy || message.trim().length < 5}
          onClick={() => void review("MORE_INFO_REQUIRED")}
        >
          Request more information
        </button>
        {!confirmingReject && (
          <button
            type="button"
            className="button-secondary text-red-700"
            disabled={busy || message.trim().length < 5}
            onClick={() => setConfirmingReject(true)}
          >
            Reject
          </button>
        )}
      </div>
      {confirmingReject && (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <p>
            Rejection is final. The resident will need to start a new request.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="button bg-red-700 hover:bg-red-800"
              disabled={busy || message.trim().length < 5}
              onClick={() => void review("REJECTED")}
            >
              Confirm rejection
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy}
              onClick={() => setConfirmingReject(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {busy && (
        <p role="status" className="text-sm">
          Saving decision...
        </p>
      )}
    </section>
  );
}
