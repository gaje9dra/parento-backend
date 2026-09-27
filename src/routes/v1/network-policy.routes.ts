import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
import type { DeviceConnectionSessionRepository } from '../../repositories/device-connection-session-repository.js';
import type { NetworkPolicyService } from '../../services/network-policy-service.js';
import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
import { requireDeviceSession } from '../../middleware/device-session-auth.js';
import { createDeviceCommunicationRateLimiter } from '../../middleware/device-communication-rate-limit.js';
import { createNetworkPolicyController } from '../../controllers/network-policy.controller.js';

const methodNotAllowed=(allow:string):RequestHandler=>((_req,res)=>{res.setHeader('Allow',allow);res.status(405).json({error:{code:'METHOD_NOT_ALLOWED',message:'HTTP method is not allowed for this endpoint.'},requestId:res.locals.requestId});});

export const createNetworkPolicyRouter=(
 service:NetworkPolicyService,
 authentication:AdminAuthenticationService,
 sessions:DeviceConnectionSessionRepository,
 rateLimitConfig:AppConfig['rateLimit'],
 limits:{maxRules:number},
):Router=>{
 const router=Router(); const controller=createNetworkPolicyController(service,limits);
 const adminAuth=requireAdminAuthentication(authentication);
 const limiter=createDeviceCommunicationRateLimiter({enabled:rateLimitConfig.enabled,windowMs:rateLimitConfig.windowMs,maxRequests:rateLimitConfig.maxRequests,identifier:'network-policy-device',message:'Too many network-policy device requests. Please try again later.'});
 const adminLimiter=createDeviceCommunicationRateLimiter({enabled:rateLimitConfig.enabled,windowMs:rateLimitConfig.windowMs,maxRequests:rateLimitConfig.maxRequests,identifier:'network-policy-admin',message:'Too many network-policy administrative requests. Please try again later.'});
 const deviceAuth=[...(limiter?[limiter]:[]),requireDeviceSession(sessions)];
 const adminAuth=[...(adminLimiter?[adminLimiter]:[]),requireAdminAuthentication(authentication),requireAdminAuthorization];
 router.get('/device/network-policy',...deviceAuth,controller.getDevicePolicy);
 router.post('/device/network-policy/status',...deviceAuth,controller.reportStatus);
 router.post('/device/network-policy/capability',...deviceAuth,controller.reportCapability);

 router.post('/admin/network-policies',...adminAuth,controller.createPolicy);
 router.get('/admin/network-policies',...adminAuth,controller.listPolicies);
 router.get('/admin/network-policies/:policyId',...adminAuth,controller.getPolicy);
 router.patch('/admin/network-policies/:policyId',...adminAuth,controller.updatePolicy);
 router.get('/admin/devices/:deviceId/network-policy',...adminAuth,controller.effectivePolicy);
 router.post('/admin/devices/:deviceId/network-policy',...adminAuth,controller.assignPolicy);
 router.delete('/admin/devices/:deviceId/network-policy',...adminAuth,controller.removePolicy);
 router.get('/admin/devices/:deviceId/network-policy/status',...adminAuth,controller.enforcementStatus);
 router.get('/admin/devices/:deviceId/network-policy/capability',...adminAuth,controller.capability);
 router.post('/admin/devices/:deviceId/network-policy/sync',...adminAuth,controller.syncPolicy);
 router.post('/admin/devices/:deviceId/network-policy/status/request',...adminAuth,controller.requestStatus);

 router.all('/admin/network-policies',methodNotAllowed('GET, POST, OPTIONS'));
 router.all('/admin/devices/:deviceId/network-policy',methodNotAllowed('GET, POST, DELETE, OPTIONS'));
 return router;
};