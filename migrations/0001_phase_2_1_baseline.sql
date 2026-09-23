-- Phase 2.1 intentionally creates no business entities.
-- The migration runner owns schema_migrations. This baseline proves that
-- versioned SQL migrations can be applied transactionally without creating
-- speculative Parento tables.
SELECT 1;
