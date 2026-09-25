import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { DeviceMonitoringService } from '../services/device-monitoring-service.js';

const dateField = z.string().datetime({ offset: true }).transform(value => new Date(value));
const nullableDate = dateField.nullable();
const managementMode = z.enum(['UNMANAGED','PROFILE_OWNER','DEVICE_OWNER','UNKNOWN']);
const networkState = z.enum(['UNKNOWN','OFFLINE','WIFI','CELLULAR','OTHER']);
const charging = z.enum(['CHARGING','DISCHARGING','FULL','NOT_CHARGING','UNKNOWN']);
const batteryStatus = z.enum(['NORMAL','LOW','CRITICAL','FULL','UNKNOWN']);
const nonNegativeInt = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const monitoringSchema = z.object({
  schemaVersion: z.literal(1),
  observedAt: dateField,
  androidVersion: z.string().trim().min(1).max(32).nullable().optional(),
  apiLevel: z.number().int().min(1).max(100).nullable().optional(),
  appVersion: z.string().trim().min(1).max(64).nullable().optional(),
  appVersionCode: nonNegativeInt.nullable().optional(),
  batteryPercentage: z.number().int().min(0).max(100).nullable().optional(),
  batteryChargingState: charging.nullable().optional(),
  batteryStatus: batteryStatus.nullable().optional(),
  networkState: networkState.nullable().optional(),
  storageTotalBytes: nonNegativeInt.nullable().optional(),
  storageAvailableBytes: nonNegativeInt.nullable().optional(),
  storageUsedBytes: nonNegativeInt.nullable().optional(),
  memoryTotalBytes: nonNegativeInt.nullable().optional(),
  memoryAvailableBytes: nonNegativeInt.nullable().optional(),
  memoryLow: z.boolean().nullable().optional(),
  managementMode: managementMode.nullable().optional(),
  lastSuccessfulInitializationAt: nullableDate.optional(),
  lastSuccessfulCommunicationAt: nullableDate.optional(),
}).strict();

const deviceIdSchema = z.object({ deviceId: z.string().uuid() }).strict();

const toState = (state: any) => state === null ? null : {
  managedDeviceId: state.managedDeviceId,
  schemaVersion: state.schemaVersion,
  observedAt: state.observedAt.toISOString(),
  receivedAt: state.receivedAt.toISOString(),
  androidVersion: state.androidVersion,
  apiLevel: state.apiLevel,
  appVersion: state.appVersion,
  appVersionCode: state.appVersionCode,
  batteryPercentage: state.batteryPercentage,
  batteryChargingState: state.batteryChargingState,
  batteryStatus: state.batteryStatus,
  networkState: state.networkState,
  storageTotalBytes: state.storageTotalBytes,
  storageAvailableBytes: state.storageAvailableBytes,
  storageUsedBytes: state.storageUsedBytes,
  memoryTotalBytes: state.memoryTotalBytes,
  memoryAvailableBytes: state.memoryAvailableBytes,
  memoryLow: state.memoryLow,
  managementMode: state.managementMode,
  lastSuccessfulInitializationAt: state.lastSuccessfulInitializationAt?.toISOString() ?? null,
  lastSuccessfulCommunicationAt: state.lastSuccessfulCommunicationAt?.toISOString() ?? null,
  lastSeenAt: state.lastSeenAt?.toISOString() ?? null,
};

export const createDeviceMonitoringController = (service: DeviceMonitoringService) => ({
  ingest: (async (req, res, next) => {
    const parsed = monitoringSchema.safeParse(req.body);
    const session = req.authenticatedDeviceSession;
    if (!session) {
      res.status(401).json({ error: { code:'DEVICE_SESSION_INVALID', message:'Managed-device session is required.' }, requestId:res.locals.requestId });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error:{ code:'INVALID_REQUEST', message:'Invalid monitoring payload.' }, requestId:res.locals.requestId });
      return;
    }
    try {
      const result = await service.ingest({
        managedDeviceId: session.managedDeviceId,
        ...parsed.data,
        now: new Date(),
      });
      res.status(200).json({
        data: { accepted: result === 'updated', stateChanged: result === 'updated' },
        requestId: res.locals.requestId,
      });
    } catch (error) { next(error); }
  }) as RequestHandler,

  list: (async (req,res,next) => {
    const admin = req.authenticatedAdmin;
    if (!admin) {
      res.status(401).json({error:{code:'AUTHENTICATION_REQUIRED',message:'Administrator authentication is required.'},requestId:res.locals.requestId});
      return;
    }
    const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const cursorRaw = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
    const limit = limitRaw === undefined ? undefined : Number(limitRaw);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      res.status(400).json({error:{code:'INVALID_REQUEST',message:'Device page limit must be between 1 and 100.'},requestId:res.locals.requestId});
      return;
    }
    if (cursorRaw !== undefined && typeof cursorRaw !== 'string') {
      res.status(400).json({error:{code:'INVALID_REQUEST',message:'Invalid device page cursor.'},requestId:res.locals.requestId});
      return;
    }
    try {
      const page = await service.listForAdmin(admin.id,{limit,cursor:cursorRaw});
      res.status(200).json({data:{devices:page.items.map(item=>({
        monitoring:toState(item.state), enrollmentStatus:item.enrollmentStatus, operationalStatus:item.operationalStatus,
        communicationState:item.communicationState, freshness:item.freshness,
      })),nextCursor:page.nextCursor},requestId:res.locals.requestId});
    } catch(error){next(error);}
  }) as RequestHandler,

  get: (async (req,res,next) => {
    const parsed=deviceIdSchema.safeParse(req.params);
    const admin=req.authenticatedAdmin;
    if(!admin){res.status(401).json({error:{code:'AUTHENTICATION_REQUIRED',message:'Administrator authentication is required.'},requestId:res.locals.requestId});return;}
    if(!parsed.success){res.status(400).json({error:{code:'INVALID_REQUEST',message:'Invalid device identifier.'},requestId:res.locals.requestId});return;}
    try{
      const item=await service.getForAdmin(admin.id,parsed.data.deviceId);
      res.status(200).json({data:{device:{monitoring:toState(item.state),enrollmentStatus:item.enrollmentStatus,operationalStatus:item.operationalStatus,communicationState:item.communicationState,freshness:item.freshness}},requestId:res.locals.requestId});
    }catch(error){next(error);}
  }) as RequestHandler,
});

export const monitoringContentLengthLimit = (maxBytes:number): RequestHandler => (req,res,next) => {
  const value=req.header('content-length');
  if(value !== undefined && Number.isFinite(Number(value)) && Number(value)>maxBytes){
    res.status(413).json({error:{code:'REQUEST_TOO_LARGE',message:'Monitoring payload exceeds the configured limit.'},requestId:res.locals.requestId});
    return;
  }
  next();
};
