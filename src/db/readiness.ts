import type { Database } from './index.js';

export interface DatabaseReadiness {
  readonly configured: boolean;
  readonly available: boolean;
}

export const checkDatabaseReadiness = async (
  database: Database,
): Promise<DatabaseReadiness> => ({
  configured: database.configured,
  available: database.configured ? await database.isReady() : false,
});
