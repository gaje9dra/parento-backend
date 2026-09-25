import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { DeviceCommunicationService } from '../services/device-communication-service.js';
import type { CommandService } from '../services/command-service.js';
import type { Command } from '../domain/command.js';

const idSchema=z.object({commandId:z.string().uuid()}).strict();
const resultSchema=z.object({
 status:z.enum(['SUCCEEDED','FAILED']),
 resultCode:z.string().max(100).nullable().default(null),
 errorCategory:z.string().max(100).nullable().default(null),
 resultMetadata:z.record(z.string(),z.unknown()).nullable().default(null),
}).strict();

export const createDeviceCommunicationController=(communication:DeviceCommunicationService,commands:CommandService)=>({
 connect:(async(req,res,next)=>{
  try{
   const header=req.header('authorization'); const match=header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
   if(!match?.[1]){res.status(401).json({error:{code:'DEVICE_AUTHENTICATION_REQUIRED',message:'Managed-device authentication is required.'},requestId:res.locals.requestId});return;}
   const result=await communication.connect(match[1]);
   res.status(201).json({data:{session:toSession(result.session),sessionToken:result.sessionToken},requestId:res.locals.requestId});
  }catch(e){next(e);}
 }) as RequestHandler,
 heartbeat:(async(req,res,next)=>{
  try{if(!req.authenticatedDeviceSession){res.status(401).json({error:{code:'DEVICE_SESSION_INVALID',message:'Managed-device session is required.'},requestId:res.locals.requestId});return;}
   const result=await communication.heartbeat({id:req.authenticatedDeviceSession.id,managedDeviceId:req.authenticatedDeviceSession.managedDeviceId,state:req.authenticatedDeviceSession.state as any,createdAt:new Date(),connectedAt:null,lastActivityAt:new Date(),disconnectedAt:null,expiresAt:req.authenticatedDeviceSession.expiresAt});
   res.status(200).json({data:{session:toSession(result)},requestId:res.locals.requestId});
  }catch(e){next(e);}
 }) as RequestHandler,
 disconnect:(async(req,res,next)=>{
  try{if(!req.authenticatedDeviceSession){res.status(401).json({error:{code:'DEVICE_SESSION_INVALID',message:'Managed-device session is required.'},requestId:res.locals.requestId});return;}
   const result=await communication.disconnect({id:req.authenticatedDeviceSession.id,managedDeviceId:req.authenticatedDeviceSession.managedDeviceId,state:req.authenticatedDeviceSession.state as any,createdAt:new Date(),connectedAt:null,lastActivityAt:new Date(),disconnectedAt:null,expiresAt:req.authenticatedDeviceSession.expiresAt});
   res.status(200).json({data:{session:toSession(result)},requestId:res.locals.requestId});
  }catch(e){next(e);}
 }) as RequestHandler,
 acknowledge:(async(req,res,next)=>{try{const p=idSchema.safeParse(req.params);if(!p.success){res.status(400).json({error:{code:'INVALID_REQUEST',message:'Invalid command identifier.'},requestId:res.locals.requestId});return;}const s=req.authenticatedDeviceSession;if(!s){res.status(401).json({error:{code:'DEVICE_SESSION_INVALID',message:'Managed-device session is required.'},requestId:res.locals.requestId});return;}const c=await commands.acknowledge(p.data.commandId,s);res.status(200).json({data:{command:toCommand(c)},requestId:res.locals.requestId});}catch(e){next(e);}}) as RequestHandler,
 start:(async(req,res,next)=>{try{const p=idSchema.safeParse(req.params);if(!p.success){res.status(400).json({error:{code:'INVALID_REQUEST',message:'Invalid command identifier.'},requestId:res.locals.requestId});return;}const s=req.authenticatedDeviceSession;if(!s){res.status(401).json({error:{code:'DEVICE_SESSION_INVALID',message:'Managed-device session is required.'},requestId:res.locals.requestId});return;}const c=await commands.start(p.data.commandId,s);res.status(200).json({data:{command:toCommand(c)},requestId:res.locals.requestId});}catch(e){next(e);}}) as RequestHandler,
 result:(async(req,res,next)=>{try{const p=idSchema.safeParse(req.params);const b=resultSchema.safeParse(req.body);if(!p.success||!b.success){res.status(400).json({error:{code:'INVALID_REQUEST',message:'Invalid command result.'},requestId:res.locals.requestId});return;}const s=req.authenticatedDeviceSession;if(!s){res.status(401).json({error:{code:'DEVICE_SESSION_INVALID',message:'Managed-device session is required.'},requestId:res.locals.requestId});return;}const c=await commands.result(p.data.commandId,s,b.data.status,b.data.resultCode,b.data.errorCategory,b.data.resultMetadata);res.status(200).json({data:{command:toCommand(c)},requestId:res.locals.requestId});}catch(e){next(e);}}) as RequestHandler,
});
const toSession=(s:{id:string;managedDeviceId:string;state:string;createdAt:Date;connectedAt:Date|null;lastActivityAt:Date;disconnectedAt:Date|null;expiresAt:Date})=>({id:s.id,managedDeviceId:s.managedDeviceId,state:s.state,createdAt:s.createdAt.toISOString(),connectedAt:s.connectedAt?.toISOString()??null,lastActivityAt:s.lastActivityAt.toISOString(),disconnectedAt:s.disconnectedAt?.toISOString()??null,expiresAt:s.expiresAt.toISOString()});
const toCommand=(c:Command)=>({...c,createdAt:c.createdAt.toISOString(),expiresAt:c.expiresAt.toISOString(),deliveryAt:c.deliveryAt?.toISOString()??null,acknowledgedAt:c.acknowledgedAt?.toISOString()??null,startedAt:c.startedAt?.toISOString()??null,completedAt:c.completedAt?.toISOString()??null,cancelledAt:c.cancelledAt?.toISOString()??null});
