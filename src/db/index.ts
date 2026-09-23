/**
 * Database boundary for future Parento persistence.
 *
 * Phase 1.1 intentionally does not connect to a database or define domain tables.
 * Later phases should introduce the selected ORM/client here rather than coupling
 * HTTP handlers directly to persistence.
 */
export interface Database {
  readonly kind: 'not-configured';
}

export const database: Database = {
  kind: 'not-configured',
};
