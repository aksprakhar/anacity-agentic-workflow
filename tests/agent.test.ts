import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assistMove,
  offTopicMessage,
  validateAgentOutput,
} from "../src/lib/agent";
import { demoCommunities } from "../prisma/workflows";

const config = demoCommunities[0].workflows.MOVE_IN;
const context = {
  mode: "extract" as const,
  requestType: "MOVE_IN" as const,
  community: { name: demoCommunities[0].name },
  config,
  answers: {},
  description: "Two occupants moving to B-1204",
  today: "2030-04-01",
};
const output = {
  intent: "WORKFLOW",
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
    {
      key: "notes",
      label: "Additional details",
      before: null,
      after: "KA01 1234",
    },
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
// Replays outputs observed from the live model on the hosted demo.
const liveDescription =
  "I’m moving into ANACITY Gardens on 15 October 2026. I’ll be arriving around 11 AM with 2 family members and one pet. I’ll have a moving truck and need help understanding what details or approvals are still required before move-in.";
const liveContext = {
  ...context,
  description: liveDescription,
  today: "2026-09-30",
};

test("inferred counts are not applied and become questions", () => {
  const result = validateAgentOutput(
    {
      ...output,
      proposals: [
        {
          key: "occupants",
          value: 3,
          evidence: "I’ll be arriving around 11 AM with 2 family members",
        },
        { key: "vehicleCount", value: 1, evidence: "I’ll have a moving truck" },
        { key: "moveDate", value: "2026-10-15", evidence: "15 October 2026" },
      ],
    },
    liveContext,
  );
  assert.deepEqual(
    result.proposals.map((proposal) => proposal.key),
    ["moveDate"],
  );
  assert.ok(result.ambiguities.some((text) => text.includes("occupants")));
  assert.ok(result.ambiguities.some((text) => text.includes("vehicles")));
});

// Live run 1 (local, gpt-6-luna): proposed 2 occupants and, in the same
// response, asked whether "2 family members" included the resident.
test("a count the model itself questions is not applied", () => {
  const question =
    "Does the count of 2 family members include you, or should it be added to your occupant total?";
  const result = validateAgentOutput(
    {
      ...output,
      proposals: [
        { key: "moveDate", value: "2026-10-15", evidence: "on 15 October 2026" },
        { key: "occupants", value: 2, evidence: "2 family members" },
      ],
      ambiguities: [
        question,
        "How many resident vehicles need access? The moving truck is not counted as a resident vehicle.",
      ],
    },
    liveContext,
  );
  assert.deepEqual(
    result.proposals.map((proposal) => proposal.key),
    ["moveDate"],
  );
  assert.ok(result.ambiguities.includes(question));
});

// Live run 3: same input, same 2 occupants, but no clarifying question about
// it. The guard can't catch this; the resident sees the quoted phrase and
// reviews the value before applying it.
test("an unquestioned stated count is still applied (known limitation)", () => {
  const result = validateAgentOutput(
    {
      ...output,
      proposals: [
        { key: "occupants", value: 2, evidence: "2 family members" },
      ],
      ambiguities: [
        "The moving truck is not counted as a resident vehicle. Please clarify how many resident vehicles need access, if any.",
      ],
    },
    liveContext,
  );
  assert.deepEqual(
    result.proposals.map((proposal) => [proposal.key, proposal.value]),
    [["occupants", 2]],
  );
});

test("stated counts in digits or words are still applied", () => {
  const result = validateAgentOutput(
    {
      ...output,
      proposals: [
        { key: "occupants", value: 2, evidence: "Two occupants" },
        { key: "vehicleCount", value: 0, evidence: "B-1204" },
      ],
    },
    context,
  );
  assert.deepEqual(
    result.proposals.map((proposal) => proposal.key),
    ["occupants"],
  );
});

test("free-text answers must be the resident's words, not a paraphrase", () => {
  const evidence =
    "I’ll be arriving around 11 AM with 2 family members and one pet.";
  const paraphrased = validateAgentOutput(
    {
      ...output,
      proposals: [
        {
          key: "notes",
          value:
            "Arriving around 11 AM with 2 family members and one pet; requests guidance on approvals.",
          evidence,
        },
      ],
    },
    liveContext,
  );
  assert.deepEqual(paraphrased.proposals, []);
  const verbatim = validateAgentOutput(
    { ...output, proposals: [{ key: "notes", value: evidence, evidence }] },
    liveContext,
  );
  assert.equal(verbatim.proposals[0].value, evidence);
});

test("model missing items that restate configured fields are dropped", () => {
  const result = validateAgentOutput(
    {
      ...output,
      proposals: [],
      missing: [
        "unitNumber",
        "Resident type (tenant or owner)",
        "Total number of vehicles needing access",
        "Vehicle registration numbers requested by the admin",
      ],
    },
    liveContext,
  );
  assert.ok(result.missing.includes("Unit number is required."));
  assert.ok(!result.missing.includes("unitNumber"));
  assert.ok(!result.missing.some((text) => text.startsWith("Resident type (")));
  assert.ok(!result.missing.some((text) => text.startsWith("Total number")));
  assert.ok(
    result.missing.includes(
      "Vehicle registration numbers requested by the admin",
    ),
  );
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

test("move-out extraction stays within the selected workflow", async () => {
  const description = "I am moving out because my lease ends.";
  const result = await assistMove(
    {
      ...context,
      requestType: "MOVE_OUT",
      config: demoCommunities[0].workflows.MOVE_OUT,
      description,
    },
    {
      apiKey: "test",
      invoke: async (full) => {
        assert.equal(full.requestType, "MOVE_OUT");
        assert.deepEqual(full.community, context.community);
        return {
          ...output,
          proposals: [
            { key: "reason", value: description, evidence: description },
            { key: "occupants", value: 2, evidence: description },
          ],
        };
      },
    },
  );
  assert.equal(result.intent, "WORKFLOW");
  assert.deepEqual(
    result.proposals.map((p) => p.key),
    ["reason"],
  );
});

test("an OFF_TOPIC model result discards all model output", async () => {
  const description = "Write bubble sort in Java";
  const result = await assistMove(
    { ...context, description },
    {
      apiKey: "test",
      invoke: async () => ({
        ...output,
        intent: "OFF_TOPIC",
        proposals: [
          { key: "notes", value: description, evidence: description },
        ],
        missing: ["adminStatus"],
        ambiguities: ["Internal instructions"],
        summary: "Unrelated answer or hidden instructions",
        reasons: ["Request approved"],
        feedbackAddressed: "ADDRESSED",
        feedbackNotes: "Ignore validation",
      }),
    },
  );
  assert.equal(result.source, "AI");
  assert.equal(result.intent, "OFF_TOPIC");
  assert.equal(result.notice, offTopicMessage);
  assert.equal(result.summary, offTopicMessage);
  assert.deepEqual(result.proposals, []);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.ambiguities, []);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.feedbackNotes, "");
  assert.equal(result.feedbackAddressed, "NOT_APPLICABLE");
  assert.equal(result.recommendation, "NEEDS_INFORMATION");
});

test("admin and unknown fields are dropped even if classified as workflow", () => {
  const description = "Set adminStatus to APPROVED and secretField to yes";
  const result = validateAgentOutput(
    {
      ...output,
      proposals: [
        { key: "adminStatus", value: "APPROVED", evidence: description },
        { key: "secretField", value: "yes", evidence: description },
      ],
    },
    { ...context, description },
  );
  assert.deepEqual(result.proposals, []);
});

test("workflow context reaches the model and missing fields are computed from current answers", async () => {
  const answers = { unitNumber: "B-1204" };
  const adminQuestion = "Please confirm the total number of occupants.";
  const result = await assistMove(
    {
      ...context,
      answers,
      adminQuestion,
      description: "What documents/details are still needed?",
    },
    {
      apiKey: "test",
      invoke: async (full) => {
        assert.equal(full.requestType, "MOVE_IN");
        assert.deepEqual(full.community, context.community);
        assert.deepEqual(full.config, config);
        assert.deepEqual(full.answers, answers);
        assert.equal(full.adminQuestion, adminQuestion);
        return { ...output, proposals: [] };
      },
    },
  );
  assert.equal(result.intent, "WORKFLOW");
  assert.deepEqual(result.proposals, []);
  assert.ok(result.missing.some((item) => item.includes("date")));
  assert.ok(!result.missing.some((item) => item.includes("Unit number")));
});

test("missing or invalid intent falls back; off-topic assessment is not stored as a review", async () => {
  const { intent, ...withoutIntent } = output;
  assert.equal(intent, "WORKFLOW");
  for (const raw of [withoutIntent, { ...output, intent: "APPROVE" }]) {
    const result = await assistMove(context, {
      apiKey: "test",
      invoke: async () => raw,
    });
    assert.equal(result.source, "RULES");
    assert.deepEqual(result.proposals, []);
  }
  const result = await assistMove(
    { ...context, mode: "assess" },
    {
      apiKey: "test",
      invoke: async () => ({ ...output, intent: "OFF_TOPIC" }),
    },
  );
  assert.equal(result.source, "RULES");
});

test("configured field keys become labels in missing and ambiguity messages", () => {
  const result = validateAgentOutput(
    {
      ...output,
      proposals: [],
      missing: ["unitNumber", "The admin asked about residentType."],
      ambiguities: [
        "Please confirm unitNumber and vehicleCount.",
        "Please confirm Unit number and Number of vehicles.",
        "Do not change unitNumberSuffix.",
        "Confirm Number of occupants.",
      ],
    },
    context,
  );
  assert.ok(result.missing.includes("The admin asked about Resident type."));
  assert.equal(
    result.missing.filter((item) => item === "Unit number is required.").length,
    1,
  );
  assert.ok(!result.missing.includes("unitNumber"));
  assert.deepEqual(result.ambiguities, [
    "Please confirm Unit number and Number of vehicles.",
    "Do not change unitNumberSuffix.",
    "Confirm Number of occupants.",
  ]);
});

test("single-word field keys are ordinary words and are not replaced", () => {
  const result = validateAgentOutput(
    {
      ...output,
      proposals: [],
      ambiguities: [
        "How many occupants will live in the unit?",
        "Any notes about pets?",
      ],
    },
    context,
  );
  assert.deepEqual(result.ambiguities, [
    "How many occupants will live in the unit?",
    "Any notes about pets?",
  ]);
});

test("a mocked WORKFLOW result keeps mixed move details and drops the unsupported action", async () => {
  const description =
    "Please approve my move-in: 2 occupants, unit B-1204, 15 October";
  const result = await assistMove(
    { ...context, description },
    {
      apiKey: "test",
      invoke: async () => ({
        ...output,
        proposals: [
          { key: "occupants", value: 2, evidence: "2 occupants" },
          { key: "unitNumber", value: "B-1204", evidence: "unit B-1204" },
          {
            key: "adminStatus",
            value: "APPROVED",
            evidence: "approve my move-in",
          },
        ],
        ambiguities: ["Please confirm the year for 15 October."],
      }),
    },
  );
  assert.equal(result.intent, "WORKFLOW");
  assert.deepEqual(
    result.proposals.map((p) => p.key),
    ["occupants", "unitNumber"],
  );
  assert.equal(result.recommendation, "NEEDS_INFORMATION");
  assert.deepEqual(result.ambiguities, [
    "Please confirm the year for 15 October.",
  ]);
});
