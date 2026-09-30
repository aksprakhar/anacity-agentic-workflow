"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Answers,
  RequestType,
  WorkflowConfig,
} from "@/lib/workflow-config";
import { validateAnswers } from "@/lib/workflow-config";
import { replyError } from "@/lib/request-status";
import ResidentAssistant from "./ResidentAssistant";

type Props = {
  type: RequestType;
  communityId: string;
  config: WorkflowConfig;
  requestId?: string;
  updatedAt?: string;
  initialAnswers?: Answers;
  resubmitting?: boolean;
  today: string;
};

export default function RequestForm({
  type,
  communityId,
  config,
  requestId,
  updatedAt,
  initialAnswers = {},
  resubmitting = false,
  today,
}: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{
    id: string;
    reference?: string;
  } | null>(null);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => {
      router.push(`/resident/requests/${success.id}`);
      router.refresh();
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [router, success]);

  async function save(action: "save" | "submit") {
    if (inFlight.current) return;
    const input = { ...answers };
    for (const field of config.fields) {
      const control = formRef.current?.elements.namedItem(field.key);
      // Number inputs can report an empty value while holding malformed text.
      if (
        field.type === "number" &&
        control instanceof HTMLInputElement &&
        control.validity.badInput
      ) {
        input[field.key] = Number.NaN;
      }
    }
    const checked = validateAnswers(config, input, action === "submit", today);
    const replyProblem = resubmitting ? replyError(reply) : null;
    if (replyProblem) checked.errors.reply = replyProblem;
    setErrors(checked.errors);
    setError("");
    if (Object.keys(checked.errors).length) {
      setError("Please correct the highlighted fields.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch(
        requestId ? `/api/requests/${requestId}` : "/api/requests",
        {
          method: requestId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            requestId
              ? {
                  answers: checked.answers,
                  action,
                  updatedAt,
                  ...(resubmitting ? { reply } : {}),
                }
              : { answers: checked.answers, action, communityId, type },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setErrors(result.errors ?? {});
        throw new Error(result.error || "Unable to save request.");
      }
      if (action === "submit") {
        setSuccess({ id: result.id, reference: result.reference });
      } else {
        router.push(`/resident/requests/${result.id}`);
        router.refresh();
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save. Try again.",
      );
      inFlight.current = false;
      setBusy(false);
    }
  }

  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  return (
    <div className="space-y-6">
      <ResidentAssistant
        config={config}
        answers={answers}
        communityId={communityId}
        type={type}
        requestId={requestId}
        disabled={busy}
        onApply={(proposals) => {
          setAnswers((current) => ({ ...current, ...proposals }));
          setErrors({});
        }}
      />
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={
          success
            ? "fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-xl border border-green-200 bg-green-50 p-4 text-green-900 shadow-lg"
            : "sr-only"
        }
      >
        {success && (
          <>
            <p className="font-medium">
              {resubmitting
                ? "Request resubmitted successfully"
                : "Request submitted successfully"}
            </p>
            {success.reference && (
              <p className="mt-1 text-sm font-medium">{success.reference}</p>
            )}
            <p className="mt-1 text-sm">Opening request details...</p>
          </>
        )}
      </div>
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save("submit");
        }}
        className="panel space-y-5"
      >
        <p className="text-sm text-gray-600">
          {config.description} Required fields are marked *.
        </p>
        <fieldset disabled={busy} className="space-y-5">
          {config.fields.map((field) => {
            const id = `field-${field.key}`;
            const common = {
              id,
              name: field.key,
              required: field.required,
              value: answers[field.key] ?? "",
              "aria-invalid": !!errors[field.key],
              "aria-describedby": `${id}-help ${id}-error`,
              className: "input",
              onChange: (
                event: React.ChangeEvent<
                  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                >,
              ) => {
                const raw = event.target.value;
                setAnswers((current) => ({
                  ...current,
                  [field.key]:
                    field.type === "number" && raw !== "" ? Number(raw) : raw,
                }));
              },
            };
            return (
              <div key={field.key}>
                <label htmlFor={id} className="mb-1 block text-sm font-medium">
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
                {field.type === "select" ? (
                  <select {...common}>
                    <option value="">Choose an option</option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea {...common} rows={3} maxLength={2000} />
                ) : (
                  <input
                    {...common}
                    type={field.type}
                    maxLength={2000}
                    min={
                      field.type === "date" && field.future
                        ? tomorrow.toISOString().slice(0, 10)
                        : field.type === "number"
                          ? (field.min ?? 0)
                          : undefined
                    }
                    max={
                      field.type === "number" ? (field.max ?? 10000) : undefined
                    }
                    step={field.type === "number" ? 1 : undefined}
                  />
                )}
                <p id={`${id}-help`} className="mt-1 text-xs text-gray-500">
                  {field.help}
                </p>
                <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
                  {errors[field.key]}
                </p>
              </div>
            );
          })}
          {resubmitting && (
            <div className="border-t border-gray-200 pt-5">
              <label
                htmlFor="reply-to-admin"
                className="mb-1 block text-sm font-medium"
              >
                Reply to admin *
              </label>
              <textarea
                id="reply-to-admin"
                name="reply"
                required
                rows={3}
                maxLength={2000}
                className="input"
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                aria-invalid={!!errors.reply}
                aria-describedby="reply-to-admin-help reply-to-admin-error"
              />
              <p
                id="reply-to-admin-help"
                className="mt-1 text-xs text-gray-500"
              >
                Answer the admin&apos;s question and mention anything you
                changed above.
              </p>
              <p id="reply-to-admin-error" className="mt-1 text-sm text-red-700">
                {errors.reply}
              </p>
            </div>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error} {errors.form}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy} className="button">
            {success
              ? "Opening request details..."
              : busy
                ? "Saving and preparing review..."
                : resubmitting
                  ? "Resubmit request"
                  : "Submit request"}
          </button>
          {!resubmitting && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save("save")}
              className="button-secondary"
            >
              Save draft
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Submitting can take up to 20 seconds.
        </p>
      </form>
    </div>
  );
}
