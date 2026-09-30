import { parseWorkflow, type WorkflowConfig } from "../src/lib/workflow-config";

const unit: WorkflowConfig["fields"][number] = {
  key: "unitNumber",
  label: "Unit number",
  type: "text",
  required: true,
};
const date: WorkflowConfig["fields"][number] = {
  key: "moveDate",
  label: "Planned move date",
  type: "date",
  required: true,
  future: true,
  help: "Choose a date after today (India time).",
};
const notes: WorkflowConfig["fields"][number] = {
  key: "notes",
  label: "Additional details",
  type: "textarea",
  required: false,
};

export const demoCommunities = [
  {
    id: "anacity-gardens",
    name: "ANACITY Gardens",
    workflows: {
      MOVE_IN: parseWorkflow({
        version: 2,
        description:
          "Gardens residences: tell us who is moving in and how many vehicles need access.",
        nextSteps: [
          "Collect your gate pass from the security office on your move-in day.",
          "Register each vehicle at the management office to receive parking stickers.",
          "Moving trucks may use the service gate between 9 AM and 6 PM.",
        ],
        fields: [
          unit,
          date,
          {
            key: "residentType",
            label: "Resident type",
            type: "select",
            required: true,
            options: ["TENANT", "OWNER"],
          },
          {
            key: "occupants",
            label: "Number of occupants",
            type: "number",
            required: true,
            min: 1,
            max: 12,
          },
          {
            key: "vehicleCount",
            label: "Number of vehicles",
            type: "number",
            required: true,
            min: 0,
            max: 5,
          },
          notes,
        ],
      }),
      MOVE_OUT: parseWorkflow({
        version: 2,
        description:
          "Gardens residences: provide a forwarding address and your reason for leaving.",
        nextSteps: [
          "Return all access cards and parking stickers to the management office.",
          "Book the final meter reading at least two days before you leave.",
          "Collect your exit gate pass from security on moving day.",
        ],
        fields: [
          unit,
          date,
          {
            key: "reason",
            label: "Reason for moving out",
            type: "textarea",
            required: true,
          },
          {
            key: "forwardingAddress",
            label: "Forwarding address",
            type: "textarea",
            required: true,
          },
          notes,
        ],
      }),
    },
  },
  {
    id: "anacity-heights",
    name: "ANACITY Heights",
    workflows: {
      MOVE_IN: parseWorkflow({
        version: 2,
        description:
          "Heights apartments: an emergency contact and moving company are required for access coordination.",
        nextSteps: [
          "Book the service lift with the front desk at least 24 hours before moving.",
          "Share your moving company's vehicle number with security for gate entry.",
          "Collect your access card from the front desk after moving in.",
        ],
        fields: [
          unit,
          date,
          {
            key: "occupants",
            label: "Number of occupants",
            type: "number",
            required: true,
            min: 1,
            max: 6,
          },
          {
            key: "emergencyContact",
            label: "Emergency contact name and phone",
            type: "text",
            required: true,
          },
          {
            key: "movingCompany",
            label: "Moving company (or Self)",
            type: "text",
            required: true,
          },
          {
            key: "petCount",
            label: "Number of pets",
            type: "number",
            required: false,
            min: 0,
            max: 3,
          },
          notes,
        ],
      }),
      MOVE_OUT: parseWorkflow({
        version: 2,
        description:
          "Heights apartments: tell us who is moving your belongings and how keys will be returned.",
        nextSteps: [
          "Book the service lift with the front desk for your moving day.",
          "Return your keys and access card as planned before you leave.",
          "A unit inspection will be scheduled after your keys are returned.",
        ],
        fields: [
          unit,
          date,
          {
            key: "movingCompany",
            label: "Moving company (or Self)",
            type: "text",
            required: true,
          },
          {
            key: "keyReturn",
            label: "Key return plan",
            type: "select",
            required: true,
            options: ["HAND_TO_ADMIN", "HAND_TO_OWNER"],
          },
          {
            key: "reason",
            label: "Reason for moving out",
            type: "textarea",
            required: false,
          },
          notes,
        ],
      }),
    },
  },
];
