import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { demoCommunities } from "./workflows";
import { assistMove } from "../src/lib/agent";
import {
  diffAnswers,
  requestTypeSchema,
  todayInCommunity,
  validateAnswers,
  type Answers,
  type RequestType,
  type WorkflowConfig,
} from "../src/lib/workflow-config";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const residents = [
  { name: "Demo Resident", email: "resident@demo.com" },
  { name: "Ananya Rao", email: "ananya.rao@demo.com" },
  { name: "Vikram Nair", email: "vikram.nair@demo.com" },
  { name: "Meera Iyer", email: "meera.iyer@demo.com" },
  { name: "Rohan Das", email: "rohan.das@demo.com" },
];
const admin = "admin@demo.com";

type SampleEvent =
  | { type: "SUBMIT"; hoursAgo: number }
  | { type: "MORE_INFO"; hoursAgo: number; message: string }
  | {
      type: "RESUBMIT";
      hoursAgo: number;
      reply: string;
      answers: Answers;
    }
  | { type: "APPROVED" | "REJECTED"; hoursAgo: number; message?: string };

type Sample = {
  id: string;
  resident: string;
  communityId: string;
  type: RequestType;
  moveInDays: number;
  answers: Answers;
  events: SampleEvent[];
};

// One request per status so both dashboards have something to show on first run.
// Move dates are relative to the seed date so the samples stay valid.
const samples: Sample[] = [
  {
    id: "sample-heights-move-out-submitted",
    resident: "vikram.nair@demo.com",
    communityId: "anacity-heights",
    type: "MOVE_OUT",
    moveInDays: 2,
    answers: {
      unitNumber: "H-702",
      movingCompany: "SafeMove Packers",
      keyReturn: "HAND_TO_OWNER",
      reason: "Relocating to Pune for work.",
    },
    events: [{ type: "SUBMIT", hoursAgo: 5 }],
  },
  {
    id: "sample-gardens-move-in-submitted",
    resident: "ananya.rao@demo.com",
    communityId: "anacity-gardens",
    type: "MOVE_IN",
    moveInDays: 6,
    answers: {
      unitNumber: "G-304",
      residentType: "OWNER",
      occupants: 3,
      vehicleCount: 1,
    },
    events: [{ type: "SUBMIT", hoursAgo: 20 }],
  },
  {
    id: "sample-heights-move-in-resubmitted",
    resident: "meera.iyer@demo.com",
    communityId: "anacity-heights",
    type: "MOVE_IN",
    moveInDays: 12,
    answers: {
      unitNumber: "H-1101",
      occupants: 2,
      emergencyContact: "Ravi Iyer",
      movingCompany: "Self",
    },
    events: [
      { type: "SUBMIT", hoursAgo: 72 },
      {
        type: "MORE_INFO",
        hoursAgo: 48,
        message: "Please add a phone number for your emergency contact.",
      },
      {
        type: "RESUBMIT",
        hoursAgo: 24,
        reply: "Added my brother's phone number to the emergency contact.",
        answers: { emergencyContact: "Ravi Iyer, +91 90000 00000" },
      },
    ],
  },
  {
    id: "sample-gardens-move-in-more-info",
    resident: "resident@demo.com",
    communityId: "anacity-gardens",
    type: "MOVE_IN",
    moveInDays: 9,
    answers: {
      unitNumber: "G-1204",
      residentType: "TENANT",
      occupants: 2,
      vehicleCount: 2,
    },
    events: [
      { type: "SUBMIT", hoursAgo: 50 },
      {
        type: "MORE_INFO",
        hoursAgo: 26,
        message:
          "You listed two vehicles. Please add both registration numbers in Additional details.",
      },
    ],
  },
  {
    id: "sample-heights-move-out-approved",
    resident: "resident@demo.com",
    communityId: "anacity-heights",
    type: "MOVE_OUT",
    moveInDays: 8,
    answers: {
      unitNumber: "H-405",
      movingCompany: "Self",
      keyReturn: "HAND_TO_ADMIN",
      reason: "Moving to ANACITY Gardens.",
    },
    events: [
      { type: "SUBMIT", hoursAgo: 96 },
      { type: "APPROVED", hoursAgo: 70 },
    ],
  },
  {
    id: "sample-gardens-move-out-rejected",
    resident: "rohan.das@demo.com",
    communityId: "anacity-gardens",
    type: "MOVE_OUT",
    moveInDays: 5,
    answers: {
      unitNumber: "G-110",
      reason: "Bought a flat nearby.",
      forwardingAddress: "12 Lake Road, Bengaluru 560001",
    },
    events: [
      { type: "SUBMIT", hoursAgo: 144 },
      {
        type: "REJECTED",
        hoursAgo: 120,
        message:
          "Our records show outstanding maintenance dues for G-110. Please clear them and submit a new request.",
      },
    ],
  },
];

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

async function rulesAssessment(config: WorkflowConfig, answers: Answers) {
  // Samples never call the model; new submissions made in the app do.
  const assessment = await assistMove(
    { mode: "assess", config, answers, description: "" },
    { apiKey: "" },
  );
  return {
    ...assessment,
    notice: "Sample request created by the seed script; no AI assessment was run.",
  };
}

async function seedSample(sample: Sample, userIds: Map<string, string>) {
  const community = demoCommunities.find(
    (community) => community.id === sample.communityId,
  );
  if (!community) throw new Error(`Unknown community ${sample.communityId}`);
  const config = community.workflows[sample.type];
  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000);

  let answers: Answers = {
    ...sample.answers,
    moveDate: addDays(todayInCommunity(), sample.moveInDays),
  };
  let status: "SUBMITTED" | "MORE_INFO_REQUIRED" | "APPROVED" | "REJECTED" =
    "SUBMITTED";
  let question = "";
  let assessment = await rulesAssessment(config, answers);
  const events = [];
  for (const event of sample.events) {
    if (event.type === "SUBMIT") {
      status = "SUBMITTED";
      events.push({
        eventType: "REQUEST_SUBMITTED",
        actor: sample.resident,
        createdAt: at(event.hoursAgo),
        metadata: { answers, assessment },
      });
    } else if (event.type === "MORE_INFO") {
      status = "MORE_INFO_REQUIRED";
      question = event.message;
      events.push({
        eventType: "MORE_INFO_REQUIRED",
        actor: admin,
        createdAt: at(event.hoursAgo),
        metadata: { message: event.message },
      });
    } else if (event.type === "RESUBMIT") {
      const previous = answers;
      answers = { ...answers, ...event.answers };
      assessment = await rulesAssessment(config, answers);
      status = "SUBMITTED";
      events.push({
        eventType: "REQUEST_RESUBMITTED",
        actor: sample.resident,
        createdAt: at(event.hoursAgo),
        metadata: {
          answers,
          assessment,
          message: event.reply,
          question,
          changes: diffAnswers(config, previous, answers),
        },
      });
    } else {
      status = event.type;
      events.push({
        eventType: event.type,
        actor: admin,
        createdAt: at(event.hoursAgo),
        metadata: event.message ? { message: event.message } : {},
      });
    }
  }

  const errors = validateAnswers(config, answers).errors;
  if (Object.keys(errors).length)
    throw new Error(`Sample ${sample.id} is invalid: ${JSON.stringify(errors)}`);
  // Re-running the seed rebuilds each sample (same id and reference) with move
  // dates relative to today, so the demo never shows stale dates. Only these
  // fixed sample ids are touched; requests created in the app are left alone.
  const existing = await prisma.moveRequest.findUnique({
    where: { id: sample.id },
    select: { reference: true },
  });
  let reference = existing?.reference;
  if (!reference) {
    const [sequence] = await prisma.$queryRaw<{ number: bigint }[]>`
      SELECT nextval('"MoveRequest_reference_seq"') AS number
    `;
    const prefix = sample.type === "MOVE_IN" ? "MI" : "MO";
    reference = `REQ-${prefix}-${sequence.number.toString().padStart(4, "0")}`;
  }
  const deleteExisting = prisma.moveRequest.deleteMany({
    where: { id: sample.id },
  });
  const create = prisma.moveRequest.create({
    data: {
      id: sample.id,
      reference,
      userId: userIds.get(sample.resident)!,
      communityId: sample.communityId,
      type: sample.type,
      status,
      data: answers,
      workflowSnapshot: config,
      aiSummary: assessment.summary,
      aiAssessment: assessment,
      createdAt: events[0].createdAt,
      updatedAt: events[events.length - 1].createdAt,
      events: { create: events },
    },
  });
  await prisma.$transaction([deleteExisting, create]);
}

async function main() {
  const userIds = new Map<string, string>();
  for (const resident of residents) {
    const user = await prisma.user.upsert({
      where: { email: resident.email },
      update: {},
      create: { ...resident, role: "RESIDENT" },
    });
    userIds.set(user.email, user.id);
  }
  await prisma.user.upsert({
    where: { email: admin },
    update: {},
    create: { name: "Community Admin", email: admin, role: "ADMIN" },
  });
  for (const demo of demoCommunities) {
    await prisma.community.upsert({
      where: { id: demo.id },
      update: { name: demo.name },
      create: { id: demo.id, name: demo.name },
    });
    for (const [key, config] of Object.entries(demo.workflows)) {
      const type = requestTypeSchema.parse(key);
      await prisma.communityWorkflow.upsert({
        where: { communityId_type: { communityId: demo.id, type } },
        update: { config },
        create: { communityId: demo.id, type, config },
      });
    }
    console.log(`Ready: ${demo.name}`);
  }
  for (const sample of samples) await seedSample(sample, userIds);
  console.log(`Sample requests refreshed: ${samples.length}`);
}

main()
  .catch((error) => {
    console.error("Seed failed. Check DATABASE_URL and apply migrations first.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
