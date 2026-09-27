import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type {
  NetworkPolicy,
  NetworkPolicyAssignment,
  NetworkPolicyCapability,
  NetworkPolicySyncState,
  NetworkPolicyRule,
  NetworkRuleAction,
} from '../domain/network-policy.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import type { NetworkPolicyRepository } from './network-policy-repository.js';
import { PostgresRepository } from './postgres-repository.js';

interface PolicyRow extends QueryResultRow {
  id: string; admin_id: string; name: string; description: string | null;
  status: 'ACTIVE' | 'DISABLED'; version: number; created_at: Date; updated_at: Date;
  created_by: string; updated_by: string;
}
interface RuleRow extends QueryResultRow {
  id: string; policy_id: string; domain: string; action: NetworkRuleAction;
  enabled: boolean; created_at: Date; updated_at: Date;
}
interface AssignmentRow extends QueryResultRow {
  managed_device_id: string; policy_id: string; policy_version: number;
  assigned_at: Date; updated_at: Date; assigned_by: string;
}
interface SyncRow extends QueryResultRow {
  managed_device_id: string; desired_policy_id: string | null; desired_policy_version: number | null;
  reported_policy_id: string | null; reported_policy_version: number | null;
  status: NetworkPolicySyncState['status']; last_requested_at: Date | null;
  last_reported_at: Date | null; last_error_code: string | null; updated_at: Date;
}
interface CapabilityRow extends QueryResultRow {
  managed_device_id: string; supported: boolean; mode: NetworkPolicyCapability['mode'];
  capability_version: number | null; reported_at: Date; updated_at: Date;
}

const policyColumns = 'id,admin_id,name,description,status,version,created_at,updated_at,created_by,updated_by';
const ruleColumns = 'id,policy_id,domain,action,enabled,created_at,updated_at';

const toRule = (r: RuleRow): NetworkPolicyRule => ({
  id: r.id, policyId: r.policy_id, domain: r.domain, action: r.action,
  enabled: r.enabled, createdAt: r.created_at, updatedAt: r.updated_at,
});
const loadRules = async (
  query: <T extends QueryResultRow>(sql: string, values?: readonly unknown[]) => Promise<{rows:T[]}>,
  policyId: string,
) => (await query<RuleRow>(
  `SELECT ${ruleColumns} FROM network_policy_rules WHERE policy_id=$1 ORDER BY domain,id`,
  [policyId],
)).rows.map(toRule);

const toPolicy = (r: PolicyRow, rules: NetworkPolicyRule[]): NetworkPolicy => ({
  id:r.id, adminId:r.admin_id, name:r.name, description:r.description, status:r.status,
  version:r.version, createdAt:r.created_at, updatedAt:r.updated_at, createdBy:r.created_by,
  updatedBy:r.updated_by, rules,
});
const toAssignment = (r: AssignmentRow): NetworkPolicyAssignment => ({
  managedDeviceId:r.managed_device_id, policyId:r.policy_id, policyVersion:r.policy_version,
  assignedAt:r.assigned_at, updatedAt:r.updated_at, assignedBy:r.assigned_by,
});
const toSync = (r: SyncRow): NetworkPolicySyncState => ({
  managedDeviceId:r.managed_device_id, desiredPolicyId:r.desired_policy_id,
  desiredPolicyVersion:r.desired_policy_version, reportedPolicyId:r.reported_policy_id,
  reportedPolicyVersion:r.reported_policy_version, status:r.status,
  lastRequestedAt:r.last_requested_at, lastReportedAt:r.last_reported_at,
  lastErrorCode:r.last_error_code, updatedAt:r.updated_at,
});
const toCapability = (r: CapabilityRow): NetworkPolicyCapability => ({
  managedDeviceId:r.managed_device_id, supported:r.supported, mode:r.mode,
  capabilityVersion:r.capability_version, reportedAt:r.reported_at, updatedAt:r.updated_at,
});
const encodeCursor = (r: PolicyRow) => Buffer.from(JSON.stringify({updatedAt:r.updated_at.toISOString(),id:r.id})).toString('base64url');
const decodeCursor = (cursor:string) => {
  try {
    const p = JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')) as {updatedAt?:unknown;id?:unknown};
    if (typeof p.updatedAt !== 'string' || typeof p.id !== 'string') throw new Error();
    const d = new Date(p.updatedAt); if (Number.isNaN(d.getTime())) throw new Error();
    return {updatedAt:d,id:p.id};
  } catch { throw new PersistenceError('INVALID_STATE','The network policy page cursor is invalid.'); }
};

export class PostgresNetworkPolicyRepository extends PostgresRepository implements NetworkPolicyRepository {
  readonly name = 'network-policy';

  async create(input:{id:string;adminId:string;name:string;description:string|null;createdBy:string;rules:readonly {domain:string;action:NetworkRuleAction;enabled:boolean}[]}):Promise<NetworkPolicy>{
    return this.transaction(async client=>{
      const result=await client.query<PolicyRow>(
        "INSERT INTO network_policies(id,admin_id,name,description,status,version,created_by,updated_by) VALUES($1,$2,$3,$4,'ACTIVE',1,$5,$5) RETURNING "+policyColumns,
        [input.id,input.adminId,input.name,input.description,input.createdBy],
      );
      const rules=input.rules.map(r=>({id:randomUUID(),policyId:input.id,domain:r.domain,action:r.action,enabled:r.enabled,createdAt:result.rows[0]!.created_at,updatedAt:result.rows[0]!.updated_at}));
      for(const rule of rules) await client.query(
        'INSERT INTO network_policy_rules(id,policy_id,domain,action,enabled,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [rule.id,rule.policyId,rule.domain,rule.action,rule.enabled,rule.createdAt,rule.updatedAt],
      );
      return toPolicy(result.rows[0]!,rules);
    });
  }

  async findOwned(id:string,adminId:string){
    const result=await this.query<PolicyRow>('SELECT '+policyColumns+' FROM network_policies WHERE id=$1 AND admin_id=$2',[id,adminId]);
    return result.rows[0] ? toPolicy(result.rows[0],await loadRules(this.query.bind(this),id)) : null;
  }

  async listOwned(adminId:string,page:{limit?:number;cursor?:string|null}={}){
    const limit=Math.min(Math.max(page.limit??50,1),100);
    const cursor=page.cursor?decodeCursor(page.cursor):null;
    const values:unknown[]=[adminId];
    const where=cursor?' AND (p.updated_at,p.id)<($2,$3)':'';
    if(cursor) values.push(cursor.updatedAt,cursor.id);
    values.push(limit+1);
    const rows=(await this.query<PolicyRow>(
      'SELECT '+policyColumns+' FROM network_policies p WHERE p.admin_id=$1'+where+' ORDER BY p.updated_at DESC,p.id DESC LIMIT $'+values.length,
      values,
    )).rows;
    const hasMore=rows.length>limit; const items=rows.slice(0,limit);
    return {items:await Promise.all(items.map(async r=>toPolicy(r,await loadRules(this.query.bind(this),r.id)))),nextCursor:hasMore?encodeCursor(rows[limit-1]!):null};
  }

  async updateOwned(input:{id:string;adminId:string;name:string;description:string|null;status:'ACTIVE'|'DISABLED';expectedVersion:number;updatedBy:string;rules:readonly {domain:string;action:NetworkRuleAction;enabled:boolean}[]}){
    return this.transaction(async client=>{
      const current=(await client.query<PolicyRow>('SELECT '+policyColumns+' FROM network_policies WHERE id=$1 AND admin_id=$2 FOR UPDATE',[input.id,input.adminId])).rows[0];
      if(!current) throw new PersistenceError('NOT_FOUND','Network policy was not found.');
      if(current.version!==input.expectedVersion) throw new PersistenceError('CONFLICT','Network policy version is stale.');
      const updated=(await client.query<PolicyRow>(
        'UPDATE network_policies SET name=$3,description=$4,status=$5,version=$6,updated_by=$7,updated_at=NOW() WHERE id=$1 AND admin_id=$2 RETURNING '+policyColumns,
        [input.id,input.adminId,input.name,input.description,input.status,current.version+1,input.updatedBy],
      )).rows[0]!;
      await client.query('DELETE FROM network_policy_rules WHERE policy_id=$1',[input.id]);
      const rules=input.rules.map(r=>({id:randomUUID(),policyId:input.id,domain:r.domain,action:r.action,enabled:r.enabled,createdAt:updated.created_at,updatedAt:updated.updated_at}));
      for(const rule of rules) await client.query(
        'INSERT INTO network_policy_rules(id,policy_id,domain,action,enabled,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [rule.id,rule.policyId,rule.domain,rule.action,rule.enabled,rule.createdAt,rule.updatedAt],
      );
      return toPolicy(updated,rules);
    });
  }

  async assign(input:{managedDeviceId:string;policyId:string;policyVersion:number;assignedBy:string}){
    try{
      const r=await this.query<AssignmentRow>(
        'INSERT INTO network_policy_assignments(managed_device_id,policy_id,policy_version,assigned_by) VALUES($1,$2,$3,$4) ON CONFLICT(managed_device_id) DO UPDATE SET policy_id=EXCLUDED.policy_id,policy_version=EXCLUDED.policy_version,assigned_by=EXCLUDED.assigned_by,updated_at=NOW() RETURNING managed_device_id,policy_id,policy_version,assigned_at,updated_at,assigned_by',
        [input.managedDeviceId,input.policyId,input.policyVersion,input.assignedBy],
      ); return toAssignment(r.rows[0]!);
    }catch(e){throw new PersistenceError('CONFLICT',e instanceof Error?e.message:'Network policy assignment failed.');}
  }
  async removeAssignment(managedDeviceId:string,policyId:string){await this.query('DELETE FROM network_policy_assignments WHERE managed_device_id=$1 AND policy_id=$2',[managedDeviceId,policyId]);}
  async findAssignment(managedDeviceId:string){const r=await this.query<AssignmentRow>('SELECT managed_device_id,policy_id,policy_version,assigned_at,updated_at,assigned_by FROM network_policy_assignments WHERE managed_device_id=$1',[managedDeviceId]);return r.rows[0]?toAssignment(r.rows[0]):null;}
  async findSyncState(managedDeviceId:string){const r=await this.query<SyncRow>('SELECT managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at FROM network_policy_sync_state WHERE managed_device_id=$1',[managedDeviceId]);return r.rows[0]?toSync(r.rows[0]):null;}
  async setSyncRequested(input:{managedDeviceId:string;policyId:string|null;policyVersion:number|null;requestedAt:Date}){
    const r=await this.query<SyncRow>(
      "INSERT INTO network_policy_sync_state(managed_device_id,desired_policy_id,desired_policy_version,status,last_requested_at,updated_at) VALUES($1,$2,$3,'PENDING',$4,NOW()) ON CONFLICT(managed_device_id) DO UPDATE SET desired_policy_id=EXCLUDED.desired_policy_id,desired_policy_version=EXCLUDED.desired_policy_version,status='PENDING',last_requested_at=EXCLUDED.last_requested_at,last_error_code=NULL,updated_at=NOW() RETURNING managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at",
      [input.managedDeviceId,input.policyId,input.policyVersion,input.requestedAt],
    ); return toSync(r.rows[0]!);
  }
  async reportSync(input:{managedDeviceId:string;policyId:string|null;policyVersion:number|null;status:NetworkPolicySyncState['status'];reportedAt:Date;errorCode:string|null}){
    return this.transaction(async client=>{
      const current=(await client.query<SyncRow>('SELECT managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at FROM network_policy_sync_state WHERE managed_device_id=$1 FOR UPDATE',[input.managedDeviceId])).rows[0];
      if(current?.last_reported_at && input.reportedAt.getTime()<current.last_reported_at.getTime()) return toSync(current);
      const result=current
        ? await client.query<SyncRow>('UPDATE network_policy_sync_state SET reported_policy_id=$2,reported_policy_version=$3,status=$4,last_reported_at=$5,last_error_code=$6,updated_at=NOW() WHERE managed_device_id=$1 RETURNING managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at',[input.managedDeviceId,input.policyId,input.policyVersion,input.status,input.reportedAt,input.errorCode])
        : await client.query<SyncRow>('INSERT INTO network_policy_sync_state(managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_reported_at,last_error_code,updated_at) VALUES($1,NULL,NULL,$2,$3,$4,$5,$6,NOW()) RETURNING managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at',[input.managedDeviceId,input.policyId,input.policyVersion,input.status,input.reportedAt,input.errorCode]);
      return toSync(result.rows[0]!);
    });
  }
  async setCapability(input:{managedDeviceId:string;supported:boolean;mode:NetworkPolicyCapability['mode'];capabilityVersion:number|null;reportedAt:Date}){
    const r=await this.query<CapabilityRow>(
      'INSERT INTO network_policy_capabilities(managed_device_id,supported,mode,capability_version,reported_at,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(managed_device_id) DO UPDATE SET supported=EXCLUDED.supported,mode=EXCLUDED.mode,capability_version=EXCLUDED.capability_version,reported_at=EXCLUDED.reported_at,updated_at=NOW() RETURNING managed_device_id,supported,mode,capability_version,reported_at,updated_at',
      [input.managedDeviceId,input.supported,input.mode,input.capabilityVersion,input.reportedAt],
    ); return toCapability(r.rows[0]!);
  }
  async findCapability(managedDeviceId:string){const r=await this.query<CapabilityRow>('SELECT managed_device_id,supported,mode,capability_version,reported_at,updated_at FROM network_policy_capabilities WHERE managed_device_id=$1',[managedDeviceId]);return r.rows[0]?toCapability(r.rows[0]):null;}
}