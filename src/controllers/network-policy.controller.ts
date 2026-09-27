import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { NetworkPolicyService } from '../services/network-policy-service.js';

const policyId=z.string().uuid();
const deviceParam=z.object({deviceId:z.string().uuid()}).strict();
const policyParam=z.object({policyId}).strict();
const domain=z.string().trim().min(3).max(255);
const rule=z.object({domain,action:z.enum(['ALLOW','BLOCK']),enabled:z.boolean().default(true)}).strict();

const iso=(d:Date)=>d.toISOString();
const toRule=(r:any)=>({...r,createdAt:iso(r.createdAt),updatedAt:iso(r.updatedAt)});
const toPolicy=(p:any)=>({...p,createdAt:iso(p.createdAt),updatedAt:iso(p.updatedAt),rules:p.rules.map(toRule)});
const toAssignment=(a:any)=>({...a,assignedAt:iso(a.assignedAt),updatedAt:iso(a.updatedAt)});
const toSync=(s:any)=>s===null?null:{...s,lastRequestedAt:s.lastRequestedAt?.toISOString()??null,lastReportedAt:s.lastReportedAt?.toISOString()??null,updatedAt:s.updatedAt.toISOString()};
const toCapability=(c:any)=>c===null?null:{...c,reportedAt:c.reportedAt.toISOString(),updatedAt:c.updatedAt.toISOString()};

export const createNetworkPolicyController=(service:NetworkPolicyService,limits:{maxRules:number})=>({
  createPolicy:(async(req,res,next)=>{
    const parsed=z.object({name:z.string().trim().min(1).max(160),description:z.string().trim().max(2000).nullable().optional(),rules:z.array(rule).max(limits.maxRules)}).strict().safeParse(req.body);
    if(!parsed.success||!req.authenticatedAdmin){res.status(parsed.success?401:400).json({error:{code:parsed.success?'AUTHENTICATION_REQUIRED':'INVALID_REQUEST',message:'Invalid network policy payload.'},requestId:res.locals.requestId});return;}
    try{const policy=await service.createPolicy({adminId:req.authenticatedAdmin.id,name:parsed.data.name,description:parsed.data.description??null,rules:parsed.data.rules});res.status(201).json({data:{policy:toPolicy(policy)},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  listPolicies:(async(req,res,next)=>{
    if(!req.authenticatedAdmin){res.status(401).json({error:{code:'AUTHENTICATION_REQUIRED',message:'Administrator authentication is required.'},requestId:res.locals.requestId});return;}
    try{
      const raw=Array.isArray(req.query.limit)?req.query.limit[0]:req.query.limit;
      const cursor=Array.isArray(req.query.cursor)?req.query.cursor[0]:req.query.cursor;
      const limit=raw===undefined?undefined:Number(raw);
      if(limit!==undefined&&(!Number.isInteger(limit)||limit<1||limit>100)){res.status(400).json({error:{code:'INVALID_REQUEST',message:'Network policy page limit must be between 1 and 100.'},requestId:res.locals.requestId});return;}
      const result=await service.listPolicies(req.authenticatedAdmin.id,{...(limit===undefined?{}:{limit}),cursor:typeof cursor==='string'?cursor:null});
      res.status(200).json({data:{policies:result.items.map(toPolicy),nextCursor:result.nextCursor},requestId:res.locals.requestId});
    }catch(e){next(e);}
  }) as RequestHandler,

  getPolicy:(async(req,res,next)=>{
    const p=policyParam.safeParse(req.params);
    if(!p.success||!req.authenticatedAdmin){res.status(p.success?401:400).json({error:{code:p.success?'AUTHENTICATION_REQUIRED':'INVALID_REQUEST',message:'Invalid policy identifier.'},requestId:res.locals.requestId});return;}
    try{res.status(200).json({data:{policy:toPolicy(await service.getPolicy(req.authenticatedAdmin.id,p.data.policyId))},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  updatePolicy:(async(req,res,next)=>{
    const p=policyParam.safeParse(req.params);
    const b=z.object({name:z.string().trim().min(1).max(160),description:z.string().trim().max(2000).nullable().optional(),status:z.enum(['ACTIVE','DISABLED']),expectedVersion:z.number().int().positive(),rules:z.array(rule).max(limits.maxRules)}).strict().safeParse(req.body);
    if(!p.success||!b.success||!req.authenticatedAdmin){res.status(p.success&&b.success?401:400).json({error:{code:p.success&&b.success?'AUTHENTICATION_REQUIRED':'INVALID_REQUEST',message:'Invalid network policy update.'},requestId:res.locals.requestId});return;}
    try{const policy=await service.updatePolicy({adminId:req.authenticatedAdmin.id,policyId:p.data.policyId,name:b.data.name,description:b.data.description??null,status:b.data.status,expectedVersion:b.data.expectedVersion,rules:b.data.rules});res.status(200).json({data:{policy:toPolicy(policy)},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  assignPolicy:(async(req,res,next)=>{
    const p=deviceParam.safeParse(req.params); const b=z.object({policyId}).strict().safeParse(req.body);
    if(!p.success||!b.success||!req.authenticatedAdmin){res.status(p.success&&b.success?401:400).json({error:{code:p.success&&b.success?'AUTHENTICATION_REQUIRED':'INVALID_REQUEST',message:'Invalid network policy assignment.'},requestId:res.locals.requestId});return;}
    try{const r=await service.assignPolicy(req.authenticatedAdmin.id,p.data.deviceId,b.data.policyId);res.status(r.sync.created?201:200).json({data:{assignment:toAssignment(r.assignment),synchronization:{command:r.sync.command,state:toSync(r.sync.sync)}},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  removePolicy:(async(req,res,next)=>{
    const p=deviceParam.safeParse(req.params); const b=z.object({policyId}).strict().safeParse(req.body);
    if(!p.success||!b.success||!req.authenticatedAdmin){res.status(p.success&&b.success?401:400).json({error:{code:p.success&&b.success?'AUTHENTICATION_REQUIRED':'INVALID_REQUEST',message:'Invalid network policy removal.'},requestId:res.locals.requestId});return;}
    try{const r=await service.removePolicy(req.authenticatedAdmin.id,p.data.deviceId,b.data.policyId);res.status(200).json({data:{removed:true,synchronization:{command:r.sync.command,state:toSync(r.sync.sync)}},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  effectivePolicy:(async(req,res,next)=>{
    const p=deviceParam.safeParse(req.params); if(!p.success||!req.authenticatedAdmin){res.status(p.success?401:400).json({error:{code:p.success?'AUTHENTICATION_REQUIRED':'INVALID_REQUEST',message:'Invalid device identifier.'},requestId:res.locals.requestId});return;}
    try{const r=await service.getEffectivePolicy(req.authenticatedAdmin.id,p.data.deviceId);res.status(200).json({data:{...r,policy:r.policy?{...r.policy,rules:r.policy.rules.map(toRule)}:null},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  enforcementStatus:(async(req,res,next)=>{
    const p=deviceParam.safeParse(req.params); if(!p.success||!req.authenticatedAdmin){res.status(p.success?401:400).json({error:{code:p.success?'AUTHENTICATION_REQUIRED':'INVALID_REQUEST',message:'Invalid device identifier.'},requestId:res.locals.requestId});return;}
    try{res.status(200).json({data:{synchronization:toSync(await service.getEnforcementStatus(req.authenticatedAdmin.id,p.data.deviceId))},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  capability:(async(req,res,next)=>{
    const p=deviceParam.safeParse(req.params); if(!p.success||!req.authenticatedAdmin){res.status(p.success?401:400).json({error:{code:p.success?'AUTHENTICATION_REQUIRED':'INVALID_REQUEST',message:'Invalid device identifier.'},requestId:res.locals.requestId});return;}
    try{res.status(200).json({data:{capability:toCapability(await service.getCapability(req.authenticatedAdmin.id,p.data.deviceId))},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  syncPolicy:(async(req,res,next)=>{
    const p=deviceParam.safeParse(req.params); if(!p.success||!req.authenticatedAdmin){res.status(p.success?401:400).json({error:{code:p.success?'AUTHENTICATION_REQUIRED':'INVALID_REQUEST',message:'Invalid device identifier.'},requestId:res.locals.requestId});return;}
    try{const e=await service.getEffectivePolicy(req.authenticatedAdmin.id,p.data.deviceId);const r=await service.requestPolicySync(req.authenticatedAdmin.id,p.data.deviceId,e.policy?.id??null,e.policy?.version??null);res.status(r.created?201:200).json({data:{command:r.command,synchronization:toSync(r.sync)},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  requestStatus:(async(req,res,next)=>{
    const p=deviceParam.safeParse(req.params); if(!p.success||!req.authenticatedAdmin){res.status(p.success?401:400).json({error:{code:p.success?'AUTHENTICATION_REQUIRED':'INVALID_REQUEST',message:'Invalid device identifier.'},requestId:res.locals.requestId});return;}
    try{const r=await service.requestStatus(req.authenticatedAdmin.id,p.data.deviceId);res.status(r.command.created?201:200).json({data:{command:r.command},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  getDevicePolicy:(async(req,res,next)=>{
    if(!req.authenticatedDeviceSession){res.status(401).json({error:{code:'DEVICE_SESSION_INVALID',message:'Managed-device session is required.'},requestId:res.locals.requestId});return;}
    try{const r=await service.getDevicePolicy(req.authenticatedDeviceSession.managedDeviceId);res.status(200).json({data:{...r,policy:r.policy?{...r.policy,rules:r.policy.rules.map(toRule)}:null},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  reportStatus:(async(req,res,next)=>{
    const b=z.object({policyId:policyId.nullable(),policyVersion:z.number().int().positive().nullable(),status:z.enum(['UNKNOWN','PENDING','APPLIED','PARTIALLY_APPLIED','FAILED','UNSUPPORTED','STALE','REVOKED']),reportedAt:z.string().datetime({offset:true}).transform(v=>new Date(v)),errorCode:z.string().trim().max(128).nullable()}).strict().safeParse(req.body);
    if(!b.success||!req.authenticatedDeviceSession){res.status(req.authenticatedDeviceSession?400:401).json({error:{code:req.authenticatedDeviceSession?'INVALID_REQUEST':'DEVICE_SESSION_INVALID',message:'Invalid network policy status payload.'},requestId:res.locals.requestId});return;}
    try{const s=await service.reportDeviceStatus({deviceId:req.authenticatedDeviceSession.managedDeviceId,...b.data});res.status(200).json({data:{synchronization:toSync(s)},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,

  reportCapability:(async(req,res,next)=>{
    const b=z.object({supported:z.boolean(),mode:z.enum(['UNKNOWN','UNSUPPORTED','SUPPORTED']),capabilityVersion:z.number().int().positive().nullable(),reportedAt:z.string().datetime({offset:true}).transform(v=>new Date(v))}).strict().safeParse(req.body);
    if(!b.success||!req.authenticatedDeviceSession){res.status(req.authenticatedDeviceSession?400:401).json({error:{code:req.authenticatedDeviceSession?'INVALID_REQUEST':'DEVICE_SESSION_INVALID',message:'Invalid network capability payload.'},requestId:res.locals.requestId});return;}
    try{const c=await service.reportCapability({deviceId:req.authenticatedDeviceSession.managedDeviceId,...b.data});res.status(200).json({data:{capability:toCapability(c)},requestId:res.locals.requestId});}catch(e){next(e);}
  }) as RequestHandler,
});