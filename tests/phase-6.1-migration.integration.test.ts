import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {loadConfig} from '../src/config/env.js';
import {createDatabase} from '../src/db/index.js';
import {resetMigrations,runMigrations,migrationStatus} from '../src/db/migrate.js';
const hasDatabase=Boolean(process.env.DATABASE_URL);
describe.skipIf(!hasDatabase)('Phase 6.1 migration',()=>{
 const db=createDatabase(loadConfig());
 beforeAll(async()=>resetMigrations(db));afterAll(async()=>db.close());
 it('creates communication tables and records migration',async()=>{
  await runMigrations(db);const status=await migrationStatus(db);
  expect(status.find(x=>x.id==='0009_phase_6_1_communication')?.applied).toBe(true);
  const result=await db.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('device_credentials','device_sessions','commands','command_events') ORDER BY table_name");
  expect(result.rows.map(x=>x.table_name)).toEqual(['command_events','commands','device_credentials','device_sessions']);
 });
});
