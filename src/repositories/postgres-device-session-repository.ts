import type {DeviceSession} from '../domain/device-session.js';
import type {DeviceCredentialRecord,DeviceSessionRepository} from './device-session-repository.js';
import {PostgresRepository} from './postgres-repository.js';
import {mapPostgresPersistenceError} from '../db/errors.js';
interface C{id:string;managed_device_id:string;credential_hash:string;created_at:Date;expires_at:Date|null;revoked_at:Date|null}
interface S{id:string;managed_device_id:string;credential_id:string;state:DeviceSession['state'];created_at:Date;last_activity_at:Date;connected_at:Date|null;disconnected_at:Date|null;expires_at:Date}
const cc='id,managed_device_id,credential_hash,created_at,expires_at,revoked_at';
const sc='id,managed_device_id,credential_id,state,created_at,last_activity_at,connected_at,disconnected_at,expires_at';
const cm=(r:C):DeviceCredentialRecord=>({id:r.id,managedDeviceId:r.managed_device_id,credentialHash:r.credential_hash,createdAt:r.created_at,expiresAt:r.expires_at,revokedAt:r.revoked_at});
const sm=(r:S):DeviceSession=>({id:r.id,managedDeviceId:r.managed_device_id,credentialId:r.credential_id,state:r.state,createdAt:r.created_at,lastActivityAt:r.last_activity_at,connectedAt:r.connected_at,disconnectedAt:r.disconnected_at,expiresAt:r.expires_at});
export class PostgresDeviceSessionRepository extends PostgresRepository implements DeviceSessionRepository{
 readonly name='device-session';
 async createCredential(i:{id:string;managedDeviceId:string;credentialHash:string;expiresAt:Date|null}){try{const r=await this.query<C>('INSERT INTO device_credentials(id,managed_device_id,credential_hash,expires_at) VALUES($1,$2,$3,$4) RETURNING '+cc,[i.id,i.managedDeviceId,i.credentialHash,i.expiresAt]);return cm(r.rows[0]!);}catch(e){throw mapPostgresPersistenceError(e,'Unable to create device credential.');}}
 async findCredentialByHash(h:string){const r=await this.query<C>('SELECT '+cc+' FROM device_credentials WHERE credential_hash=$1',[h]);return r.rows[0]===undefined?null:cm(r.rows[0]);}
 async createSession(i:{id:string;managedDeviceId:string;credentialId:string;createdAt:Date;expiresAt:Date}){try{return await this.transaction(async client=>{const d=await client.query<{enrollment_status:string}>('SELECT enrollment_status FROM managed_devices WHERE id=$1 FOR UPDATE',[i.managedDeviceId]);if(d.rows[0]?.enrollment_status!=='ACTIVE') throw new Error('Managed device is not active.');const r=await client.query<S>("INSERT INTO device_sessions(id,managed_device_id,credential_id,state,created_at,last_activity_at,connected_at,expires_at) VALUES($1,$2,$3,'CONNECTED',$4,$4,$4,$5) RETURNING "+sc,[i.id,i.managedDeviceId,i.credentialId,i.createdAt,i.expiresAt]);return sm(r.rows[0]!);});}catch(e){throw mapPostgresPersistenceError(e,'Unable to create device session.');}}
 async findById(id:string){const r=await this.query<S>('SELECT '+sc+' FROM device_sessions WHERE id=$1',[id]);return r.rows[0]===undefined?null:sm(r.rows[0]);}
 async disconnect(id:string,now:Date){const r=await this.query<S>("UPDATE device_sessions SET state='DISCONNECTED',disconnected_at=$2,last_activity_at=$2 WHERE id=$1 AND state='CONNECTED' RETURNING "+sc,[id,now]);return r.rows[0]===undefined?null:sm(r.rows[0]);}
}
