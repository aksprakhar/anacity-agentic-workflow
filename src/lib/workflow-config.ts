import { z } from "zod";

const fieldSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-zA-Z0-9]*$/)
      .refine((key) => !["constructor", "prototype"].includes(key)),
    label: z.string().trim().min(1).max(100),
    type: z.enum(["text", "number", "date", "select", "textarea"]),
    required: z.boolean(),
    options: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(20)
      .optional(),
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
    future: z.boolean().optional(),
    help: z.string().max(300).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.type === "select" && !field.options)
      ctx.addIssue({ code: "custom", message: "Select fields need options." });
    if (
      field.options &&
      (field.type !== "select" ||
        new Set(field.options).size !== field.options.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Options must be unique and belong to a select field.",
      });
    if (
      (field.min !== undefined || field.max !== undefined) &&
      field.type !== "number"
    )
      ctx.addIssue({
        code: "custom",
        message: "Numeric limits belong to number fields.",
      });
    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    )
      ctx.addIssue({ code: "custom", message: "Minimum exceeds maximum." });
    if (field.future !== undefined && field.type !== "date")
      ctx.addIssue({
        code: "custom",
        message: "Future rule belongs to date fields.",
      });
  });

export const workflowSchema = z
  .object({
    version: z.number().int().positive(),
    description: z.string().min(1).max(500),
    fields: z.array(fieldSchema).min(1).max(20),
    // Shown to the resident once the request is approved.
    nextSteps: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (
      new Set(config.fields.map((field) => field.key)).size !==
      config.fields.length
    )
      ctx.addIssue({ code: "custom", message: "Field keys must be unique." });
    if (
      !config.fields.some(
        (field) =>
          field.key === "moveDate" &&
          field.type === "date" &&
          field.required &&
          field.future,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "A required future moveDate is necessary.",
      });
  });

export const requestTypeSchema = z.enum(["MOVE_IN", "MOVE_OUT"]);
export type WorkflowConfig = z.infer<typeof workflowSchema>;
export type RequestType = z.infer<typeof requestTypeSchema>;
export type Answers = Record<string, string | number>;
export type AnswerChange = {
  key: string;
  label: string;
  before: string | number | null;
  after: string | number | null;
};

export function parseWorkflow(value: unknown): WorkflowConfig {
  return workflowSchema.parse(value);
}

export function todayInCommunity(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function moveDateOf(data: unknown): string | null {
  const value =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>).moveDate
      : undefined;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

export function diffAnswers(
  config: WorkflowConfig,
  before: Answers,
  after: Answers,
): AnswerChange[] {
  return config.fields
    .filter((field) => (before[field.key] ?? null) !== (after[field.key] ?? null))
    .map((field) => ({
      key: field.key,
      label: field.label,
      before: before[field.key] ?? null,
      after: after[field.key] ?? null,
    }));
}

export function validateAnswers(
  config: WorkflowConfig,
  input: unknown,
  complete = true,
  today = todayInCommunity(),
) {
  const answers: Answers = {};
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { answers, errors: { form: "Answers must be an object." } };
  const raw = input as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      (key) => !config.fields.some((field) => field.key === key),
    )
  )
    errors.form = "Answers contain unknown fields.";
  for (const field of config.fields) {
    const value = raw[field.key];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim())
    ) {
      if (complete && field.required)
        errors[field.key] = `${field.label} is required.`;
      continue;
    }
    if (field.type === "number") {
      if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < (field.min ?? 0) ||
        value > (field.max ?? 10000)
      )
        errors[field.key] =
          `${field.label} must be a whole number from ${field.min ?? 0} to ${field.max ?? 10000}.`;
      else answers[field.key] = value;
      continue;
    }
    if (typeof value !== "string" || value.length > 2000) {
      errors[field.key] =
        `${field.label} must be text of at most 2,000 characters.`;
      continue;
    }
    const text = value.trim();
    if (field.type === "select" && !field.options?.includes(text))
      errors[field.key] = `Choose a valid ${field.label.toLowerCase()}.`;
    else if (
      field.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
        !Number.isFinite(Date.parse(text)) ||
        new Date(text).toISOString().slice(0, 10) !== text)
    )
      errors[field.key] = `${field.label} must be a valid date.`;
    else if (field.type === "date" && field.future && text <= today)
      errors[field.key] =
        `${field.label} must be after today (${today}, India time).`;
    else answers[field.key] = text;
  }
  return { answers, errors };
}
