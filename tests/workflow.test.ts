import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCommunities } from "../prisma/workflows";
import {
  daysUntil,
  diffAnswers,
  moveDateOf,
  parseWorkflow,
  requestTypeSchema,
  todayInCommunity,
  validateAnswers,
} from "../src/lib/workflow-config";
import {
  canTransition,
  replyError,
  reviewMessageError,
} from "../src/lib/request-status";

const config = demoCommunities[0].workflows.MOVE_IN;
const valid = {
  unitNumber: "B-1204",
  moveDate: "2030-04-15",
  residentType: "TENANT",
  occupants: 2,
  vehicleCount: 0,
};
const check = (answers: unknown, complete = true) =>
  validateAnswers(config, answers, complete, "2030-04-01");

test("all four workflows validate and community requirements differ", () => {
  for (const community of demoCommunities)
    for (const workflow of Object.values(community.workflows))
      assert.doesNotThrow(() => parseWorkflow(workflow));
  assert.notDeepEqual(
    config.fields,
    demoCommunities[1].workflows.MOVE_IN.fields,
  );
  assert.notDeepEqual(
    demoCommunities[0].workflows.MOVE_OUT.fields,
    demoCommunities[1].workflows.MOVE_OUT.fields,
  );
});
test("configuration rejects duplicate fields, missing options and unsupported types", () => {
  assert.throws(() =>
    parseWorkflow({ ...config, fields: [...config.fields, config.fields[0]] }),
  );
  assert.throws(() =>
    parseWorkflow({
      ...config,
      fields: [
        {
          key: "moveDate",
          label: "Date",
          type: "date",
          required: true,
          future: true,
        },
        { key: "choice", label: "Choice", type: "select", required: true },
      ],
    }),
  );
  assert.throws(() =>
    parseWorkflow({
      ...config,
      fields: [{ ...config.fields[0], type: "file" }],
    }),
  );
  assert.throws(() =>
    parseWorkflow({
      ...config,
      fields: config.fields.filter((field) => field.key !== "moveDate"),
    }),
  );
});
test("complete submission preserves zero values and trims text", () => {
  const result = check({ ...valid, unitNumber: " B-1204 " });
  assert.deepEqual(result.errors, {});
  assert.equal(result.answers.vehicleCount, 0);
  assert.equal(result.answers.unitNumber, "B-1204");
});
test("required fields and type-specific requirements are enforced", () => {
  assert.ok(check({ ...valid, unitNumber: " " }).errors.unitNumber);
  assert.ok(
    validateAnswers(
      demoCommunities[1].workflows.MOVE_IN,
      { unitNumber: "H-1", moveDate: "2030-04-15", occupants: 2 },
      true,
      "2030-04-01",
    ).errors.emergencyContact,
  );
  assert.ok(
    validateAnswers(
      demoCommunities[0].workflows.MOVE_OUT,
      { unitNumber: "B-1", moveDate: "2030-04-15" },
      true,
      "2030-04-01",
    ).errors.forwardingAddress,
  );
});
test("drafts allow missing values but never invalid supplied values", () => {
  assert.deepEqual(check({}, false).errors, {});
  assert.ok(check({ occupants: -1 }, false).errors.occupants);
});
test("rejects invalid numbers, selects, unknown fields and non-object input", () => {
  for (const occupants of [-1, 0, 13, 1.5, NaN, Infinity, "2", true])
    assert.ok(check({ ...valid, occupants }).errors.occupants);
  assert.ok(check({ ...valid, residentType: "GUEST" }).errors.residentType);
  assert.ok(check({ ...valid, status: "APPROVED" }).errors.form);
  for (const input of [null, [], "text"]) assert.ok(check(input).errors.form);
  assert.equal(requestTypeSchema.safeParse("OTHER").success, false);
});
test("dates must be real calendar dates after today in India", () => {
  for (const moveDate of [
    "2030-04-01",
    "2020-01-01",
    "2030-02-30",
    "tomorrow",
    "2030-13-01",
  ])
    assert.ok(check({ ...valid, moveDate }).errors.moveDate);
  assert.equal(
    todayInCommunity(new Date("2030-04-01T20:00:00Z")),
    "2030-04-02",
  );
});
test("only the allowed resident and admin transitions succeed", () => {
  const statuses = [
    "DRAFT",
    "SUBMITTED",
    "MORE_INFO_REQUIRED",
    "APPROVED",
    "REJECTED",
    "UNDER_REVIEW",
    "UNKNOWN",
  ];
  const resident = new Set([
    "DRAFT:DRAFT",
    "DRAFT:SUBMITTED",
    "MORE_INFO_REQUIRED:SUBMITTED",
  ]);
  const admin = new Set([
    "SUBMITTED:MORE_INFO_REQUIRED",
    "SUBMITTED:APPROVED",
    "SUBMITTED:REJECTED",
  ]);
  for (const from of statuses)
    for (const to of statuses) {
      assert.equal(
        canTransition(from, to, "RESIDENT"),
        resident.has(`${from}:${to}`),
      );
      assert.equal(
        canTransition(from, to, "ADMIN"),
        admin.has(`${from}:${to}`),
      );
    }
});
test("rejection and information requests need specific feedback", () => {
  assert.ok(reviewMessageError("REJECTED", " "));
  assert.ok(reviewMessageError("MORE_INFO_REQUIRED", "why"));
  assert.equal(
    reviewMessageError(
      "MORE_INFO_REQUIRED",
      "Please clarify your moving company.",
    ),
    null,
  );
  assert.equal(reviewMessageError("APPROVED", ""), null);
});

test("select configuration trims options and rejects blank or duplicate trimmed values", () => {
  const withOptions = (options: string[]) => ({
    ...config,
    fields: config.fields.map((field) =>
      field.key === "residentType" ? { ...field, options } : field,
    ),
  });
  assert.throws(() => parseWorkflow(withOptions([" ", "OWNER"])));
  assert.throws(() => parseWorkflow(withOptions(["TENANT", " TENANT "])));
  const normalized = parseWorkflow(withOptions([" TENANT ", "OWNER"]));
  assert.deepEqual(
    normalized.fields.find((field) => field.key === "residentType")?.options,
    ["TENANT", "OWNER"],
  );
  assert.deepEqual(
    validateAnswers(normalized, valid, true, "2030-04-01").errors,
    {},
  );
});

test("malformed optional numeric input is rejected rather than treated as empty", () => {
  const moveIn = demoCommunities[1].workflows.MOVE_IN;
  for (const complete of [false, true]) {
    assert.ok(
      validateAnswers(moveIn, { petCount: Number.NaN }, complete, "2030-04-01")
        .errors.petCount,
    );
    assert.equal(
      validateAnswers(moveIn, { petCount: "" }, complete, "2030-04-01").errors
        .petCount,
      undefined,
    );
    assert.equal(
      validateAnswers(moveIn, { petCount: 0 }, complete, "2030-04-01").errors
        .petCount,
      undefined,
    );
  }
});

test("resident replies to the admin must be specific and bounded", () => {
  assert.ok(replyError(""));
  assert.ok(replyError("ok"));
  assert.ok(replyError("x".repeat(2001)));
  assert.equal(replyError("Added both registration numbers."), null);
});

test("answer diffs list only changed fields, including added and cleared ones", () => {
  const changes = diffAnswers(
    config,
    { ...valid, notes: "old" },
    { ...valid, vehicleCount: 1, residentType: "OWNER" },
  );
  assert.deepEqual(
    changes.map((change) => [change.key, change.before, change.after]),
    [
      ["residentType", "TENANT", "OWNER"],
      ["vehicleCount", 0, 1],
      ["notes", "old", null],
    ],
  );
  assert.deepEqual(diffAnswers(config, valid, { ...valid }), []);
});

test("next steps are configurable per community and validated", () => {
  const [gardens, heights] = demoCommunities;
  assert.ok(gardens.workflows.MOVE_IN.nextSteps?.length);
  assert.notDeepEqual(
    gardens.workflows.MOVE_OUT.nextSteps,
    heights.workflows.MOVE_OUT.nextSteps,
  );
  assert.throws(() => parseWorkflow({ ...config, nextSteps: [" "] }));
  assert.throws(() =>
    parseWorkflow({ ...config, nextSteps: Array(11).fill("Step") }),
  );
  const { nextSteps: _omitted, ...withoutSteps } = config;
  void _omitted;
  assert.doesNotThrow(() => parseWorkflow(withoutSteps));
});

test("move dates are read from stored answers for dashboards", () => {
  assert.equal(moveDateOf({ moveDate: "2030-04-15" }), "2030-04-15");
  for (const data of [{}, null, [], { moveDate: 5 }, { moveDate: "soon" }])
    assert.equal(moveDateOf(data), null);
  assert.equal(daysUntil("2030-04-15", "2030-04-01"), 14);
  assert.equal(daysUntil("2030-04-01", "2030-04-01"), 0);
});
