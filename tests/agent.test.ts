import { test } from "node:test";
import assert from "node:assert/strict";
import { assistMove, validateAgentOutput } from "../src/lib/agent";
import { demoCommunities } from "../prisma/workflows";

const config = demoCommunities[0].workflows.MOVE_IN;
const context = {
  mode: "extract" as const,
  config,
  answers: {},
  description: "Two occupants moving to B-1204",
  today: "2030-04-01",
};
const output = {
  proposals: [{ key: "occupants", value: 2, evidence: "Two occupants" }],
  missing: [],
  ambiguities: [],
  summary: "Two occupants plan to move.",
  recommendation: "READY_FOR_REVIEW",
  reasons: ["Resident supplied the occupant count."],
  feedbackAddressed: "NOT_APPLICABLE",
  feedbackNotes: "",
};
const valid = {
  unitNumber: "B-1204",
  moveDate: "2030-04-15",
  residentType: "TENANT",
  occupants: 2,
  vehicleCount: 1,
};
const resubmission = {
  adminQuestion: "Please add both vehicle registration numbers.",
  residentReply: "Added them to Additional details.",
  previousAnswers: valid,
  changes: [
    { key: "notes", label: "Additional details", before: null, after: "KA01 1234" },
  ],
};

test("valid extraction retains evidence and deterministic missing information", () => {
  const result = validateAgentOutput(output, context);
  assert.equal(result.proposals[0].value, 2);
  assert.equal(result.recommendation, "NEEDS_INFORMATION");
  assert.ok(result.missing.some((message) => message.includes("date")));
});
test("bad proposals are dropped while valid ones are kept", () => {
  for (const bad of [
    { key: "status", value: "APPROVED", evidence: "Two occupants" },
    { key: "unitNumber", value: "B-9999", evidence: "made up text" },
    { key: "occupants", value: 5, evidence: "Two occupants" },
  ]) {
    const result = validateAgentOutput(
      { ...output, proposals: [output.proposals[0], bad] },
      context,
    );
    assert.deepEqual(
      result.proposals.map((proposal) => proposal.key),
      ["occupants"],
    );
    assert.equal(result.proposals[0].value, 2);
  }
});
test("an invalid proposed value becomes a clarification instead of failing", () => {
  const result = validateAgentOutput(
    {
      ...output,
      proposals: [
        output.proposals[0],
        { key: "moveDate", value: "2025-03-15", evidence: "15 March 2025" },
      ],
    },
    { ...context, description: "Two occupants, moving on 15 March 2025" },
  );
  assert.deepEqual(
    result.proposals.map((proposal) => proposal.key),
    ["occupants"],
  );
  assert.ok(
    result.ambiguities.some(
      (text) => text.includes("2025-03-15") && text.includes("after today"),
    ),
  );
  assert.equal(result.recommendation, "NEEDS_INFORMATION");
});
test("evidence matching tolerates case, spacing and punctuation", () => {
  const result = validateAgentOutput(
    {
      ...output,
      proposals: [
        { key: "occupants", value: "2", evidence: "two  OCCUPANTS." },
        { key: "unitNumber", value: "B-1204", evidence: "b 1204" },
      ],
    },
    context,
  );
  assert.equal(result.proposals.length, 2);
  assert.equal(result.proposals[0].value, 2);
});
test("rejects malformed or action-like outputs and extraction during assessment", () => {
  assert.throws(() =>
    validateAgentOutput({ ...output, recommendation: "APPROVED" }, context),
  );
  assert.throws(() =>
    validateAgentOutput({ ...output, approve: true }, context),
  );
  assert.throws(() =>
    validateAgentOutput(output, { ...context, mode: "assess" }),
  );
});
test("valid summary is accepted but ambiguity prevents a ready recommendation", () => {
  const result = validateAgentOutput(
    { ...output, proposals: [], ambiguities: ["Confirm the move date."] },
    { ...context, mode: "assess" },
  );
  assert.equal(result.recommendation, "NEEDS_INFORMATION");
});
test("missing reasons and summary are filled in rather than rejected", () => {
  const result = validateAgentOutput(
    { ...output, reasons: [" "], summary: "" },
    context,
  );
  assert.equal(result.reasons.length, 1);
  assert.ok(result.summary);
});
test("feedback verdict only applies to resubmission assessments", () => {
  const assess = { ...context, mode: "assess" as const, answers: valid };
  const verdict = {
    ...output,
    proposals: [],
    feedbackAddressed: "ADDRESSED",
    feedbackNotes: "Both registrations were added.",
  };
  const withoutResubmission = validateAgentOutput(verdict, assess);
  assert.equal(withoutResubmission.feedbackAddressed, "NOT_APPLICABLE");
  assert.equal(withoutResubmission.feedbackNotes, "");
  const addressed = validateAgentOutput(verdict, { ...assess, resubmission });
  assert.equal(addressed.feedbackAddressed, "ADDRESSED");
  assert.equal(addressed.recommendation, "READY_FOR_REVIEW");
  for (const feedbackAddressed of ["NOT_ADDRESSED", "PARTIALLY_ADDRESSED"]) {
    const result = validateAgentOutput(
      { ...verdict, feedbackAddressed },
      { ...assess, resubmission },
    );
    assert.equal(result.recommendation, "NEEDS_INFORMATION");
  }
});
test("resubmission context reaches the model", async () => {
  let seen: unknown;
  await assistMove(
    { mode: "assess", config, answers: valid, description: "", resubmission },
    {
      apiKey: "test",
      invoke: async (full) => {
        seen = full.resubmission;
        return { ...output, proposals: [] };
      },
    },
  );
  assert.deepEqual(seen, resubmission);
});
test("the admin's question reaches the model during extraction", async () => {
  let seen: unknown;
  await assistMove(
    { ...context, adminQuestion: resubmission.adminQuestion },
    {
      apiKey: "test",
      invoke: async (full) => {
        seen = full.adminQuestion;
        return output;
      },
    },
  );
  assert.equal(seen, resubmission.adminQuestion);
});
test("missing key uses a labelled deterministic fallback without invoking OpenAI", async () => {
  const result = await assistMove(context, {
    apiKey: "",
    invoke: async () => {
      assert.fail("Should not call AI");
    },
  });
  assert.equal(result.source, "RULES");
  assert.deepEqual(result.proposals, []);
  assert.equal(result.feedbackAddressed, "NOT_APPLICABLE");
  assert.match(result.notice, /not configured/);
});
test("API errors, refusals and invalid structured output fall back safely", async () => {
  for (const invoke of [
    async () => {
      throw new Error("timeout");
    },
    async () => null,
    async () => ({ ...output, recommendation: "APPROVED" }),
  ]) {
    const result = await assistMove(context, { apiKey: "test", invoke });
    assert.equal(result.source, "RULES");
    assert.deepEqual(result.proposals, []);
    assert.match(result.notice, /unavailable/);
  }
});
test("successful model output is validated before it reaches the resident", async () => {
  const result = await assistMove(context, {
    apiKey: "test",
    invoke: async () => output,
  });
  assert.equal(result.source, "AI");
  assert.equal(result.proposals[0].key, "occupants");
});
