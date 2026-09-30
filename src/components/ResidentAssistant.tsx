"use client";

import { useState } from "react";
import type { Assessment } from "@/lib/agent";
import type {
  Answers,
  RequestType,
  WorkflowConfig,
} from "@/lib/workflow-config";

export default function ResidentAssistant({
  config,
  answers,
  communityId,
  type,
  requestId,
  disabled,
  onApply,
}: {
  config: WorkflowConfig;
  answers: Answers;
  communityId: string;
  type: RequestType;
  requestId?: string;
  disabled: boolean;
  onApply: (answers: Answers) => void;
}) {
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function suggest() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          answers,
          communityId,
          type,
          requestId,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          [data.error, ...Object.values(data.errors ?? {})].join(" "),
        );
      setResult(data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Assistance unavailable. Please fill in the form manually.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel space-y-3" aria-labelledby="assistant-title">
      <h2 id="assistant-title" className="text-lg font-semibold">
        Optional AI assistance
      </h2>
      <label htmlFor="move-description" className="block text-sm">
        Describe your move in your own words
      </label>
      <textarea
        id="move-description"
        className="input"
        rows={3}
        maxLength={4000}
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
          setResult(null);
        }}
        placeholder="I am a tenant moving to unit B-1204 with two occupants and one vehicle..."
        disabled={busy || disabled}
      />
      <p className="text-xs text-gray-500">
        Your description and current answers are sent to OpenAI. Nothing changes
        in the form until you apply the suggestions.
      </p>
      <button
        type="button"
        className="button-secondary"
        disabled={busy || disabled || !description.trim()}
        onClick={() => void suggest()}
      >
        {busy ? "Finding suggestions..." : "Suggest field values"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {result && (
        <div
          aria-live="polite"
          className="space-y-3 rounded-lg bg-gray-50 p-4 text-sm"
        >
          <p>{result.notice}</p>
          {result.intent !== "OFF_TOPIC" && result.proposals.length > 0 && (
            <>
              <p className="font-medium">
                Suggested values (these replace what&apos;s in the form):
              </p>
              <dl className="space-y-2">
                {result.proposals.map((proposal) => (
                  <div key={proposal.key}>
                    <dt className="font-medium">
                      {
                        config.fields.find(
                          (field) => field.key === proposal.key,
                        )?.label
                      }
                    </dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {config.fields.find((field) => field.key === proposal.key)
                        ?.type === "select"
                        ? String(proposal.value).replaceAll("_", " ")
                        : String(proposal.value)}{" "}
                      <span className="text-gray-500">
                        (from: {proposal.evidence})
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                className="button-secondary"
                disabled={disabled}
                onClick={() => {
                  onApply(
                    Object.fromEntries(
                      result.proposals.map((proposal) => [
                        proposal.key,
                        proposal.value,
                      ]),
                    ),
                  );
                  setResult(null);
                }}
              >
                Apply suggestions
              </button>
            </>
          )}
          {result.intent !== "OFF_TOPIC" &&
            [...result.missing, ...result.ambiguities].length > 0 && (
              <>
                <p className="font-medium">Please clarify or complete:</p>
                <ul className="list-disc space-y-1 pl-5">
                  {[...result.missing, ...result.ambiguities].map(
                    (message, index) => (
                      <li key={index}>{message}</li>
                    ),
                  )}
                </ul>
              </>
            )}
        </div>
      )}
    </section>
  );
}
