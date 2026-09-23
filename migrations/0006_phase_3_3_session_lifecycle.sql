CREATE INDEX admin_sessions_revoked_at_idx
  ON admin_sessions (revoked_at)
  WHERE revoked_at IS NOT NULL;
