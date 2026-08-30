-- Session.token is already @unique, and Postgres backs a unique constraint
-- with an index. Session_token_idx was a second index over the same column:
-- no planner benefit, one extra write per session insert and delete.
-- Session_token_key, the unique one, stays.
DROP INDEX IF EXISTS "Session_token_idx";
