import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import type { DeviceCredentialRepository } from '../../repositories/device-credential-repository.js';
import type { DeviceConnectionSessionRepository } from '../../repositories/device-connection-session-repository.js';
import { requireDeviceSession } from '../../middleware/device-session-auth.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import type { DeviceMonitoringService } from '../../services/device-monitoring-service.js';
import { createDeviceMonitoringController, monitoringContentLengthLimit } from '../../controllers/device-monitoring.controller.js';

const methodNotAllowed=(allow:string):RequestHandler=> (_req,res)=>{res.setHeader('Allow',allow);res.status(405).json({error:{code:'METHOD_NOT_ALLOWED',message:'HTTP method is not allowed for this endpoint.'},requestId:res.locals.requestId});};

export const createDeviceMonitoringRouter=(
  service:DeviceMonitoringService,
  credentials:DeviceCredentialRepository,
  sessions:DeviceConnectionSessionRepository,
  rateLimitConfig:AppConfig['rateLimit'],
  maxPayloadBytes:number,
):Router=>{
  const router=Router();
  const controller=createDeviceMonitoringController(service);
  const auth=requireAdminAuthentication(new (class {
    authenticateAccessToken(token:string){ return Promise.reject(new Error('unwired')); }
  })() as never);
  void auth;
  const limiter = rateLimitConfig.enabled ? require('../../middleware/device-communication-rate-limit.js').createDeviceCommunicationRateLimiter({
    enabled:true,windowMs:rateLimitConfig.windowMs,maxRequests:rateLimitConfig.maxRequests,
  }) : undefined;
  const limited=limiter?[limiter]:[];
  router.post('/device/monitoring',...limited,requireDeviceSession(sessions),monitoringContentLengthLimit(maxPayloadBytes),controller.ingest);
  router.get('/admin/devices',controller.list);
  router.get('/admin/devices/:deviceId',controller.get);
  router.all('/device/monitoring',methodNotAllowed('POST, OPTIONS'));
  router.all('/admin/devices',methodNotAllowed('GET, OPTIONS'));
  router.all('/admin/devices/:deviceId',methodNotAllowed('GET, OPTIONS'));
  void credentials;
  return router;
};
