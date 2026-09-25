import { describe, expect, it } from 'vitest';
import { hashOpaqueToken } from '../src/auth/token.js';
import type { DeviceSession } from '../src/domain/device-session.js';
import type { DeviceCredentialRecord, DeviceSessionRepository } from '../src/repositories/device-session-repository.js';
import { DeviceSessionService } from '../src/services/device-session-service.js';
const token='A'.repeat(43);
class FakeRepository implements DeviceSessionRepository {
 readonly name='fake-session';
 readonly credential:DeviceCredentialRecord={id:'550e8400-e29b-41d4-a716-446655440000',managedDeviceId:'550e8400-e29b-41d4-a716-446655440001',credentialHash:hashOpaqueToken(token),createdAt:new Date(),expiresAt:null,revokedAt:null};
 private readonly sessions=new Map<string,DeviceSession>();
 async createCredential(input:Parameters<DeviceSessionRepository['createCredential']>[0]){return {...this.credential,...input};}
 async findCredentialByHash(hash:string){return hash===this.credential.credentialHash?this.credential:null;}
 async createSession(input:Parameters<DeviceSessionRepository['createSession']>[0]){const s:DeviceSession={...input,state:'CONNECTED',lastActivityAt:input.createdAt,connectedAt:input.createdAt,disconnectedAt:null};this.sessions.set(s.id,s);return s;}
 async findById(id:string){return this.sessions.get(id)??null;}
 async disconnect(id:string,now:Date){const s=this.sessions.get(id);if(!s)return null;const n={...s,state:'DISCONNECTED' as const,disconnectedAt:now,lastActivityAt:now};this.sessions.set(id,n);return n;}
}
describe('Phase 6.1 device sessions',()=>{
 it('rejects malformed credentials',async()=>await expect(new DeviceSessionService(new FakeRepository(),900).connect('bad')).rejects.toMatchObject({code:'AUTHENTICATION_REQUIRED'}));
 it('binds disconnect to the credential that opened the session',async()=>{
  const r=new FakeRepository();const service=new DeviceSessionService(r,900);const s=await service.connect(token);
  await expect(service.disconnect(s.id,'B'.repeat(43))).rejects.toMatchObject({code:'AUTHENTICATION_REQUIRED'});
  expect((await service.disconnect(s.id,token))?.state).toBe('DISCONNECTED');
 });
});
