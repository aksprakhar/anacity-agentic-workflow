BEGIN;

ALTER TABLE "MoveRequest" ADD COLUMN "reference" TEXT;
CREATE SEQUENCE "MoveRequest_reference_seq" START WITH 1001;
ALTER SEQUENCE "MoveRequest_reference_seq" OWNED BY "MoveRequest"."reference";

WITH numbered AS (
  SELECT "id", 1000 + ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS number
  FROM "MoveRequest"
)
UPDATE "MoveRequest" AS request
SET "reference" = 'REQ-' || CASE request."type" WHEN 'MOVE_IN' THEN 'MI' ELSE 'MO' END
  || '-' || numbered.number::TEXT
FROM numbered
WHERE request."id" = numbered."id";

SELECT setval('"MoveRequest_reference_seq"',
  COALESCE((SELECT MAX(SUBSTRING("reference" FROM '[0-9]+$')::BIGINT) FROM "MoveRequest"), 1000), true);

ALTER TABLE "MoveRequest" ALTER COLUMN "reference" SET NOT NULL;
CREATE UNIQUE INDEX "MoveRequest_reference_key" ON "MoveRequest"("reference");

COMMIT;
