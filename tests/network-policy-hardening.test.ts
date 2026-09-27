import { describe, expect, it, vi } from 'vitest';
import { compareNetworkRules } from '../src/domain/network-policy.js';
import { NetworkPolicyService } from '../src/services/network-policy-service.js';
import type { NetworkPolicyRepository } from '../src/repositories/network-policy-repository.js';
import type { NetworkPolicyEventRepository } from '../src/repositories/network-policy-event-repository.js';
import type { ManagedDeviceRepository } from '../src/repositories/managed-device-repository.js';
import type { CommandService } from '../src/services/command-service.js';

const adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const deviceId='11111111-1111-4111-8111-111111111111';
const policyId='22222222-2222-4222-8222-222222222222';
const device={id:deviceId,adminId,stableIdentifier:'d',name:'D',platform:'android',enrollmentStatus:'ACTIVE',operationalStatus:'ACTIVE',createdAt:new Date(),updatedAt:new Date(),lastSeenAt:new Date()} as const;
const policy={id:policyId,adminId,name:'policy',description:null,status:'ACTIVE' as const,version:3,createdAt:new Date(),updatedAt:new Date(),createdBy:adminId,updatedBy:adminId,rules:[]};

const makeService=(overrides:Partial<NetworkPolicyRepository>={})=>{
  const policies={
    findOwned:async()=>policy,
    findAssignment:async()=>({managedDeviceId:deviceId,policyId,policyVersion:3,assignedAt:new Date(),updatedAt:new Date(),assignedBy:adminId}),
    findSyncState:async()=>({managedDeviceId:deviceId,desiredPolicyId:policyId,desiredPolicyVersion:3,reportedPolicyId:policyId,reportedPolicyVersion:2,status:'PENDING' as const,lastRequestedAt:null,lastReportedAt:new Date(),lastErrorCode:null,updatedAt:new Date()}),
    reportSync:vi.fn(async()=>{throw new Error('must not write a stale report')}),
    findCapability:async()=>null,
    setCapability:vi.fn(),
    ...overrides,
  } as unknown as NetworkPolicyRepository;
  const devices={findById:async()=>device,name:'devices'} as unknown as ManagedDeviceRepository;
  const commands={} as unknown as CommandService;
  const events={record:async()=>{},name:'events'} as unknown as NetworkPolicyEventRepository;
  return new NetworkPolicyService(policies,devices,commands,events,{maxRules:10,maxFutureSkewSeconds:300,staleSeconds:60,veryStaleSeconds:3600});
};

describe('Phase 12.4 network-policy hardening',()=>{
  it('orders exact rules before wildcards and BLOCK before ALLOW deterministically',()=>{
    const exactBlock={id:'1',policyId,domain:'example.com',action:'BLOCK' as const,enabled:true,createdAt:new Date(),updatedAt:new Date()};
    const wildcardAllow={...exactBlock,id:'2',domain:'*.example.com',action:'ALLOW' as const};
    const exactAllow={...exactBlock,id:'3',action:'ALLOW' as const};
    expect([wildcardAllow,exactAllow,exactBlock].sort(compareNetworkRules).map(r=>r.id)).toEqual(['1','3','2']);
  });

  it('ignores a report older than the current desired policy version',async()=>{
    const service=makeService();
    const result=await service.reportDeviceStatus({deviceId,policyId,policyVersion:2,status:'FAILED',reportedAt:new Date(),errorCode:'OLD'});
    expect(result.desiredPolicyVersion).toBe(3);
  });

  it('rejects a report for a policy outside the device administrative scope',async()=>{
    const foreignPolicy={...policy,adminId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
    const service=makeService({findOwned:async()=>foreignPolicy});
    await expect(service.reportDeviceStatus({deviceId,policyId,policyVersion:1,status:'FAILED',reportedAt:new Date(),errorCode:null})).rejects.toMatchObject({code:'CONFLICT'});
  });

  it('does not treat a future-dated report as authoritative',async()=>{
    const service=makeService();
    await expect(service.reportDeviceStatus({deviceId,policyId,policyVersion:3,status:'FAILED',reportedAt:new Date(Date.now()+301000),errorCode:null})).rejects.toMatchObject({code:'INVALID_REQUEST'});
  });
});
