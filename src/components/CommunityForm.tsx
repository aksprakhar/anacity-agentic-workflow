"use client";

import { useState } from "react";
import RequestForm from "./RequestForm";
import type { RequestType, WorkflowConfig } from "@/lib/workflow-config";

export default function CommunityForm({
  communities,
  type,
  today,
}: {
  communities: { id: string; name: string; config: WorkflowConfig }[];
  type: RequestType;
  today: string;
}) {
  const [id, setId] = useState("");
  const selected = communities.find((community) => community.id === id);
  return (
    <div className="space-y-6">
      <div className="panel">
        <label htmlFor="community" className="mb-2 block font-medium">
          Community
        </label>
        <select
          id="community"
          className="input"
          value={id}
          onChange={(event) => setId(event.target.value)}
        >
          <option value="">Select a community</option>
          {communities.map((community) => (
            <option key={community.id} value={community.id}>
              {community.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-500">
          Changing community starts a new form and clears unsaved answers.
        </p>
      </div>
      {selected && (
        <RequestForm
          key={selected.id}
          communityId={selected.id}
          config={selected.config}
          type={type}
          today={today}
        />
      )}
    </div>
  );
}
