-- Re-process every mail row so it picks up its links and its excerpt.
--
-- `summarisedAt` is the marker the summarise job uses to decide what it has
-- already handled, so clearing it is how rows collected before the extraction
-- existed get looked at again. **The model is not re-run for them**: the job
-- only calls it when `summary` is still null, which these are not.
--
-- Data only, and self-limiting — the job takes ten per run.
UPDATE "Item" SET "summarisedAt" = NULL WHERE "source" = 'gmail';
