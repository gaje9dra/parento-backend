import { randomUUID } from 'node:crypto';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import type { CommandService } from './command-service.js';
import type { NetworkPolicyRepository } from '../repositories/network-policy-repository.js';
import type { NetworkPolicyEventRepository } from '../repositories/network-policy-event-repository.js';
import type {
  NetworkEnforcementStatus,
  NetworkPolicy,
  NetworkRuleAction,
} from '../domain/network-policy.js';
import { isValidNetworkDomain, normalizeDomain } from '../domain/network-policy.js';
import { PersistenceError } from '../domain/persistence-errors.js';
import { AppError } from '../types/errors.js';

export interface NetworkPolicyServiceOptions {
  readonly maxRules: number;
  readonly maxFutureSkewSeconds: number;
  readonly staleSeconds: number;
  readonly veryStaleSeconds: number;
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validateRules=(rules:readonly {domain:string;action:NetworkRuleAction;enabled:boolean}[],maxRules:number)=>{
  if(rules.length>maxRules) throw new AppError(413,'REQUEST_TOO_LARGE','Network policy contains too many rules.');
  const seen=new Set<string>();
  return rules.map(rule=>{
    if(!isValidNetworkDomain(rule.domain)) throw new AppError(400,'INVALID_REQUEST','Network policy contains an invalid domain.');
    const domain=normalizeDomain(rule.domain);
    if(seen.has(domain)) throw new AppError(409,'CONFLICT','Network policy contains duplicate domains.');
    seen.add(domain);
    if(rule.action!=='ALLOW'&&rule.action!=='BLOCK') throw new AppError(400,'INVALID_REQUEST','Network policy rule action is invalid.');
    return {...rule,domain};
  });
};

const validateTimestamp=(value:Date,now:Date,maxFutureSkew:number)=>{
  if(Number.isNaN(value.getTime())||value.getTime()<0||value.getTime()>now.getTime()+maxFutureSkew*1000)
    throw new AppError(400,'INVALID_REQUEST','Network policy timestamp is invalid.');
};

export class NetworkPolicyService {
  constructor(
    private readonly policies:NetworkPolicyRepository,
    private readonly devices:ManagedDeviceRepository,
    private readonly commands:CommandService,
    private readonly events:NetworkPolicyEventRepository,
    private readonly options:NetworkPolicyServiceOptions,
  ) {}

  private async requireOwnedDevice(adminId:string,deviceId:string,active=false){
    if(!UUID.test(deviceId)) throw new AppError(400,'INVALID_REQUEST','Managed-device identifier is invalid.');
    const device=await this.devices.findById(deviceId);
    if(!device) throw new AppError(404,'RESOURCE_NOT_FOUND','Managed device was not found.');
    if(device.adminId!==adminId) throw new AppError(403,'AUTHORIZATION_DENIED','The administrator does not control this device.');
    if(active && (device.enrollmentStatus!=='ACTIVE'||device.operationalStatus!=='ACTIVE'))
      throw new AppError(409,'DEVICE_NOT_READY','Managed device is not available for network-policy operations.');
    return device;
  }

  async createPolicy(input:{adminId:string;name:string;description:string|null;rules:readonly {domain:string;action:NetworkRuleAction;enabled:boolean}[]}){
    const rules=validateRules(input.rules,this.options.maxRules);
    let policy:NetworkPolicy;
    try {
      policy=await this.policies.create({id:randomUUID(),adminId:input.adminId,name:input.name.trim(),description:input.description,createdBy:input.adminId,rules});
    } catch(error) {
      if(error instanceof PersistenceError&&error.code==='CONFLICT') throw new AppError(409,'CONFLICT','A network policy with this name already exists.');
      throw error;
    }
    await this.events.record({id:randomUUID(),eventType:'POLICY_CREATED',adminId:input.adminId,managedDeviceId:null,policyId:policy.id,policyVersion:policy.version,metadata:{ruleCount:policy.rules.length}});
    return policy;
  }

  async getPolicy(adminId:string,policyId:string){
    if(!UUID.test(policyId)) throw new AppError(400,'INVALID_REQUEST','Policy identifier is invalid.');
    const policy=await this.policies.findOwned(policyId,adminId);
    if(!policy) throw new AppError(404,'RESOURCE_NOT_FOUND','Network policy was not found.');
    return policy;
  }

  async listPolicies(adminId:string,page?:{limit?:number;cursor?:string|null}){return this.policies.listOwned(adminId,page);}

  async updatePolicy(input:{adminId:string;policyId:string;name:string;description:string|null;status:'ACTIVE'|'DISABLED';expectedVersion:number;rules:readonly {domain:string;action:NetworkRuleAction;enabled:boolean}[]}){
    const rules=validateRules(input.rules,this.options.maxRules);
    try {
      const policy=await this.policies.updateOwned({id:input.policyId,adminId:input.adminId,name:input.name,description:input.description,status:input.status,expectedVersion:input.expectedVersion,updatedBy:input.adminId,rules});
      await this.events.record({id:randomUUID(),eventType:input.status==='DISABLED'?'POLICY_DISABLED':'POLICY_UPDATED',adminId:input.adminId,managedDeviceId:null,policyId:policy.id,policyVersion:policy.version,metadata:{ruleCount:policy.rules.length}});
      return policy;
    } catch(error) {
      if(error instanceof PersistenceError&&error.code==='CONFLICT') throw new AppError(409,'CONFLICT','Network policy version is stale.');
      if(error instanceof PersistenceError&&error.code==='NOT_FOUND') throw new AppError(404,'RESOURCE_NOT_FOUND','Network policy was not found.');
      throw error;
    }
  }

  async assignPolicy(adminId:string,deviceId:string,policyId:string){
    const device=await this.requireOwnedDevice(adminId,deviceId,true);
    const policy=await this.getPolicy(adminId,policyId);
    if(policy.status!=='ACTIVE') throw new AppError(409,'CONFLICT','A disabled network policy cannot be assigned.');
    try {
      const assignment=await this.policies.assign({managedDeviceId:device.id,policyId:policy.id,policyVersion:policy.version,assignedBy:adminId});
      const sync=await this.requestPolicySync(adminId,device.id,policy.id,policy.version);
      await this.events.record({id:randomUUID(),eventType:'POLICY_ASSIGNED',adminId,managedDeviceId:device.id,policyId:policy.id,policyVersion:policy.version,metadata:{commandId:sync.command.id}});
      return {assignment,sync};
    } catch(error) {
      if(error instanceof PersistenceError) throw new AppError(409,'CONFLICT','Network policy assignment could not be applied.');
      throw error;
    }
  }

  async removePolicy(adminId:string,deviceId:string,policyId:string){
    const device=await this.requireOwnedDevice(adminId,deviceId,true);
    const assignment=await this.policies.findAssignment(device.id);
    if(!assignment||assignment.policyId!==policyId) throw new AppError(404,'RESOURCE_NOT_FOUND','Network policy assignment was not found.');
    await this.policies.removeAssignment(device.id,policyId);
    const sync=await this.requestPolicySync(adminId,device.id,null,null);
    await this.events.record({id:randomUUID(),eventType:'POLICY_REMOVED',adminId,managedDeviceId:device.id,policyId,policyVersion:assignment.policyVersion,metadata:{commandId:sync.command.id}});
    return {removed:true,sync};
  }

  async getEffectivePolicy(adminId:string,deviceId:string){
    const device=await this.requireOwnedDevice(adminId,deviceId);
    const assignment=await this.policies.findAssignment(device.id);
    if(!assignment) return {managedDeviceId:device.id,policy:null,policyVersion:null,synchronizationRequired:false};
    const policy=await this.getPolicy(adminId,assignment.policyId);
    if(policy.status!=='ACTIVE') return {managedDeviceId:device.id,policy:null,policyVersion:policy.version,synchronizationRequired:true};
    return {managedDeviceId:device.id,policy:{id:policy.id,version:policy.version,rules:policy.rules},policyVersion:policy.version,synchronizationRequired:assignment.policyVersion!==policy.version};
  }

  async getDevicePolicy(deviceId:string){
    const device=await this.devices.findById(deviceId);
    if(!device||device.enrollmentStatus!=='ACTIVE'||device.operationalStatus!=='ACTIVE')
      throw new AppError(403,'DEVICE_AUTHORIZATION_DENIED','Network policy access is not authorized.');
    const assignment=await this.policies.findAssignment(device.id);
    if(!assignment) return {managedDeviceId:device.id,policy:null,policyVersion:null,synchronizationRequired:false};
    const policy=await this.policies.findOwned(assignment.policyId,device.adminId);
    if(!policy||policy.status!=='ACTIVE') return {managedDeviceId:device.id,policy:null,policyVersion:null,synchronizationRequired:true};
    return {managedDeviceId:device.id,policy:{id:policy.id,version:policy.version,rules:policy.rules},policyVersion:policy.version,synchronizationRequired:assignment.policyVersion!==policy.version};
  }

  async requestPolicySync(adminId:string,deviceId:string,policyId:string|null,policyVersion:number|null){
    await this.requireOwnedDevice(adminId,deviceId,true);
    const command=await this.commands.createNetworkPolicyCommand(adminId,{deviceId,policyId,policyVersion,correlationId:randomUUID()});
    const sync=await this.policies.setSyncRequested({managedDeviceId:deviceId,policyId,policyVersion,requestedAt:new Date()});
    await this.events.record({id:randomUUID(),eventType:'POLICY_SYNC_REQUESTED',adminId,managedDeviceId:deviceId,policyId,policyVersion,metadata:{commandId:command.command.id}});
    return {command:command.command,created:command.created,sync};
  }

  async getEnforcementStatus(adminId:string,deviceId:string){
    await this.requireOwnedDevice(adminId,deviceId);
    const state=await this.policies.findSyncState(deviceId);
    if(!state) return null;
    const age=state.lastReportedAt===null?null:(Date.now()-state.lastReportedAt.getTime())/1000;
    const freshness=age===null?'NEVER_REPORTED':age<=this.options.staleSeconds?'FRESH':age<=this.options.veryStaleSeconds?'STALE':'VERY_STALE';
    return {...state,freshness};
  }

  async requestStatus(adminId:string,deviceId:string){
    await this.requireOwnedDevice(adminId,deviceId,true);
    return this.commands.createNetworkPolicyStatusRequest(adminId,{deviceId,correlationId:randomUUID()});
  }

  async reportDeviceStatus(input:{deviceId:string;policyId:string|null;policyVersion:number|null;status:NetworkEnforcementStatus;reportedAt:Date;errorCode:string|null}){
    const device=await this.devices.findById(input.deviceId);
    if(!device||device.enrollmentStatus!=='ACTIVE'||device.operationalStatus!=='ACTIVE') throw new AppError(403,'DEVICE_AUTHORIZATION_DENIED','Network policy reporting is not authorized.');
    validateTimestamp(input.reportedAt,new Date(),this.options.maxFutureSkewSeconds);
    if(input.policyId!==null&&!UUID.test(input.policyId)) throw new AppError(400,'INVALID_REQUEST','Policy identifier is invalid.');
    if(input.policyVersion!==null&&(!Number.isInteger(input.policyVersion)||input.policyVersion<=0)) throw new AppError(400,'INVALID_REQUEST','Policy version is invalid.');
    if(input.policyId!==null){
      const reportedPolicy=await this.policies.findOwned(input.policyId,device.adminId);
      if(!reportedPolicy) throw new AppError(409,'CONFLICT','Reported network policy is not authorized for this device.');
      if(input.policyVersion===null || input.policyVersion>reportedPolicy.version)
        throw new AppError(409,'CONFLICT','Reported network policy version is invalid.');
    }
    const assignment=await this.policies.findAssignment(input.deviceId);
    if(input.status==='APPLIED'&&(
      assignment?.policyId!==input.policyId||assignment.policyVersion!==input.policyVersion
    )) throw new AppError(409,'CONFLICT','APPLIED state must match the current network policy assignment.');
    if(input.status==='APPLIED'&&assignment===null&&input.policyId!==null) throw new AppError(409,'CONFLICT','An unassigned device cannot report an applied policy.');
    const current=await this.policies.findSyncState(input.deviceId);
    if(current && current.desiredPolicyVersion!==null && input.policyVersion!==null && input.policyVersion<current.desiredPolicyVersion){
      return current;
    }
    const result=await this.policies.reportSync({managedDeviceId:input.deviceId,policyId:input.policyId,policyVersion:input.policyVersion,status:input.status,reportedAt:input.reportedAt,errorCode:input.errorCode?.slice(0,128)??null});
    if(current?.status!==result.status||current?.reportedPolicyVersion!==result.reportedPolicyVersion)
      await this.events.record({id:randomUUID(),eventType:'ENFORCEMENT_STATUS_CHANGED',adminId:device.adminId,managedDeviceId:device.id,policyId:result.reportedPolicyId,policyVersion:result.reportedPolicyVersion,metadata:{status:result.status}});
    return result;
  }

  async reportCapability(input:{deviceId:string;supported:boolean;mode:'UNKNOWN'|'UNSUPPORTED'|'SUPPORTED';capabilityVersion:number|null;reportedAt:Date}){
    const device=await this.devices.findById(input.deviceId);
    if(!device||device.enrollmentStatus!=='ACTIVE'||device.operationalStatus!=='ACTIVE') throw new AppError(403,'DEVICE_AUTHORIZATION_DENIED','Network capability reporting is not authorized.');
    validateTimestamp(input.reportedAt,new Date(),this.options.maxFutureSkewSeconds);
    if(input.mode==='SUPPORTED'&&!input.supported) throw new AppError(400,'INVALID_REQUEST','Supported mode requires supported=true.');
    if(input.capabilityVersion!==null&&(!Number.isInteger(input.capabilityVersion)||input.capabilityVersion<=0)) throw new AppError(400,'INVALID_REQUEST','Capability version is invalid.');
    const previous=await this.policies.findCapability(input.deviceId);
    const capability=await this.policies.setCapability({managedDeviceId:input.deviceId,supported:input.supported,mode:input.mode,capabilityVersion:input.capabilityVersion,reportedAt:input.reportedAt});
    if(!previous||previous.supported!==capability.supported||previous.mode!==capability.mode||previous.capabilityVersion!==capability.capabilityVersion)
      await this.events.record({id:randomUUID(),eventType:'CAPABILITY_CHANGED',adminId:device.adminId,managedDeviceId:device.id,policyId:null,policyVersion:null,metadata:{supported:capability.supported,mode:capability.mode,capabilityVersion:capability.capabilityVersion}});
    return capability;
  }

  async getCapability(adminId:string,deviceId:string){
    await this.requireOwnedDevice(adminId,deviceId);
    return this.policies.findCapability(deviceId);
  }
}