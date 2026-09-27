import { describe, expect, it } from 'vitest';
import { NetworkPolicyService } from '../src/services/network-policy-service.js';
import type { NetworkPolicyRepository } from '../src/repositories/network-policy-repository.js';
import type { NetworkPolicyEventRepository } from '../src/repositories/network-policy-event-repository.js';
import type { ManagedDeviceRepository } from '../src/repositories/managed-device-repository.js';
import type { CommandService } from '../src/services/command-service.js';

const device={id:'11111111-1111-4111-8111-111111111111',adminId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',stableIdentifier:'d',name:'D',platform:'android',enrollmentStatus:'ACTIVE',operationalStatus:'ACTIVE',createdAt:new Date(),updatedAt:new Date(),lastSeenAt:new Date()} as const;

describe('network policy service',()=>{
  it('rejects stale policy updates and duplicate domains',async()=>{
    const policies={
      create:async()=>{throw new Error('unused')},
      findOwned:async()=>({id:'22222222-2222-4222-8222-222222222222',adminId:device.adminId,name:'p',description:null,status:'ACTIVE',version:2,createdAt:new Date(),updatedAt:new Date(),createdBy:device.adminId,updatedBy:device.adminId,rules:[]}),
      listOwned:async()=>({items:[],nextCursor:null}),
      updateOwned:async()=>{throw Object.assign(new Error('stale'),{code:'CONFLICT'})},
      assign:async()=>{throw new Error('unused')},removeAssignment:async()=>{},findAssignment:async()=>null,
      findSyncState:async()=>null,setSyncRequested:async()=>{throw new Error('unused')},reportSync:async()=>{throw new Error('unused')},
      setCapability:async()=>{throw new Error('unused')},findCapability:async()=>null,
      name:'network-policy',
    } as unknown as NetworkPolicyRepository;
    const events={record:async()=>{},name:'events'} as unknown as NetworkPolicyEventRepository;
    const devices={findById:async()=>device,name:'devices'} as unknown as ManagedDeviceRepository;
    const commands={} as unknown as CommandService;
    const service=new NetworkPolicyService(policies,devices,commands,events,{maxRules:10,maxFutureSkewSeconds:300,staleSeconds:60,veryStaleSeconds:3600});
    await expect(service.updatePolicy({adminId:device.adminId,policyId:'22222222-2222-4222-8222-222222222222',name:'p',description:null,status:'ACTIVE',expectedVersion:1,rules:[{domain:'example.com',action:'BLOCK',enabled:true},{domain:'EXAMPLE.COM',action:'ALLOW',enabled:true}]})).rejects.toMatchObject({code:'CONFLICT'});
  });
});