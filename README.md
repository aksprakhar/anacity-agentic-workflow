# ANACITY move-in / move-out

A prototype of the move-in and move-out journeys for residents and community admins. The forms are driven by each community's configuration, an AI assistant helps residents fill them in and helps admins review, and admins make every decision.

Built with Next.js 16, TypeScript, Prisma 7, PostgreSQL and the OpenAI Responses API.

The design write-up is in [docs/solution.md](docs/solution.md).

## Setup

You need Node.js 22.12+ and a PostgreSQL database.

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`.
3. Optional: set `OPENAI_API_KEY`. `OPENAI_MODEL` defaults to `gpt-4o-mini`; any model that supports structured outputs in the Responses API works. Without a key the app still works, and AI sections show a labelled fallback.
4. Install, migrate, seed and run:

```sh
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000.

The seed creates two communities (ANACITY Gardens and ANACITY Heights), a demo resident, a demo admin, four more sample residents, and six sample requests covering every status. You can re-run it at any time. It updates the community configurations and rebuilds the six sample requests with move dates relative to today, keeping their reference numbers. Any changes you made to those sample requests are discarded; requests you created in the app are not touched.

**Upgrading a database created by an earlier version of this repo?** The communities were renamed and the old seed looked them up by name, so reset the database before seeding. This deletes all local data:

```sh
npx prisma migrate reset
npm run db:seed
```

## Demo walkthrough

There is no login. The **Resident** pages act as `resident@demo.com` and the **Admin** pages as `admin@demo.com`.

**Admin triage**

1. Open **Admin**. The dashboard opens on **Needs action**, sorted by nearest move date. Vikram Nair's move-out is first because it's two days away.
2. Open Meera Iyer's move-in. It was resubmitted after the admin asked a question, so the **Resubmission** panel shows the question, her reply and the changed field. (Sample requests aren't sent to the model, so this one shows the no-AI message instead of a verdict. Step 6 shows a live verdict.)
3. Try the **More info requested**, **Decided** and **All** tabs.

**Resident: answering the admin**

4. Open **Resident**. Your G-1204 move-in is marked **Action needed**. Open it and read the admin's question about vehicle registrations.
5. Add `Vehicle registrations: KA01AB1234, KA01CD5678` to **Additional details**, write a **Reply to admin** such as `Added both registration numbers.`, and click **Resubmit request**.
6. Back in **Admin**, open the request. With an API key set, the Resubmission panel shows the AI's verdict (**Addressed**, **Partially addressed** or **Not addressed**) next to the computed changes. To see a different verdict, request more information again and resubmit with a reply that ignores the question.
7. **Approve** it. In Resident, the request now shows the Gardens move-in **Next steps**.
8. Your H-405 move-out is already approved. Compare its Heights next steps with the Gardens ones.

**Resident: a new request with the assistant**

9. **Resident → Move In → ANACITY Gardens**. Switch to **ANACITY Heights** and notice different fields (emergency contact, moving company, pets). Switch back.
10. With an API key, describe the move: `I am a tenant moving into B-1204 on 15 April 2030. There will be two occupants and one vehicle.` Click **Suggest field values**, check the values and the quoted phrases, then **Apply suggestions**.
11. Try `I might move on 15 March 2020 with some people` to see a rejected past date and clarifying questions instead of silently filled fields.
12. Submit. In Admin, the new request appears in Needs action with an AI summary and recommendation.

**Admin decisions**

13. On a submitted request, write a message and click **Reject**. Rejection asks for confirmation because it's final. The resident sees the reason on their request page.
14. Validation: past dates, negative counts and missing required fields are blocked in the browser and on the server. Approval re-checks the request against today's date.

## Assistant boundary

The resident assistant only helps complete the selected community move-in/move-out workflow. It receives the request type, community name, configured fields and rules, current answers, date and any current admin question. It must not invent community requirements. When move details are mixed with a request to approve, reject, delete, change status or reveal instructions, the prompt asks for `WORKFLOW`: extract the supported details and ignore the unsupported action. Unrelated questions or unsupported actions without relevant move content use `OFF_TOPIC`. Server code clears all proposals and model commentary for that result and returns "I can only help fill in your move-in or move-out request." The UI shows no suggestions. The assistant proposes field values and lists missing details or clarifications; it has no free-text guidance channel.

Configured-field, evidence, count and value checks still apply to `WORKFLOW` results; the assistant has no action tools, and server validation and manual admin decisions remain authoritative. Classification is model-based: these are prototype guardrails, not complete production abuse prevention. A missing key or failed call keeps the existing manual fallback. Tests mock the classification; they do not measure live-model accuracy.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` runs focused unit tests and needs no database or API key. See [docs/solution.md](docs/solution.md#9-testing) for what they cover.

## Where things live

| Path | What it does |
|---|---|
| `prisma/workflows.ts` | The two communities' configurations: fields, rules, next steps |
| `prisma/seed.ts` | Users, communities and sample requests |
| `src/lib/workflow-config.ts` | Configuration schema, answer validation, field diffs |
| `src/lib/request-status.ts` | Allowed transitions and message rules |
| `src/lib/request-service.ts` | Create, edit, resubmit and review, with transactions and conflict checks |
| `src/lib/agent.ts` | Extraction, assessment, feedback check, output guardrails and fallback |
| `src/components/RequestForm.tsx` | The form generated from configuration, plus the reply to the admin |
| `src/components/RequestDetail.tsx` | Request page for both roles: answers, checks, AI output, resubmission, history |
| `src/app/admin/page.tsx` | Admin dashboard with triage tabs |

## Known limits

This is a prototype with shared demo identities and no authentication. Anyone who can open the URL can act as the resident or the admin, so use demo data only. The full list of assumptions and limits is in [docs/solution.md](docs/solution.md#8-assumptions).
