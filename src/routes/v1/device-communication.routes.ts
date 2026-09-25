import { Router, type RequestHandler } from 'express';
import { requireDeviceSession } from '../../middleware/device-session-auth.js';
import { requireDeviceCredential } from '../../middleware/device-auth.js';
import type { DeviceCredentialRepository } from '../../repositories/device-credential-repository.js';
import type { DeviceConnectionSessionRepository } from '../../repositories/device-connection-session-repository.js';
import type { DeviceCommunicationService } from '../../services/device-communication-service.js';
import type { CommandService } from '../../services/command-service.js';
import { createDeviceCommunicationController } from '../../controllers/device-communication.controller.js';

const methodNotAllowed=(allow:string):RequestHandler=>(_req,res)=>{res.setHeader('Allow',allow);res.status(405).json({error:{code:'METHOD_NOT_ALLOWED',message:'HTTP method is not allowed for this endpoint.'},requestId:res.locals.requestId});};

export const createDeviceCommunicationRouter=(communication:DeviceCommunicationService,commands:CommandService,credentials:DeviceCredentialRepository,sessions:DeviceConnectionSessionRepository):Router=>{
 const router=Router(); const controller=createDeviceCommunicationController(communication,commands);
 router.post('/device/sessions',requireDeviceCredential(credentials),controller.connect);
 router.post('/device/sessions/heartbeat',requireDeviceSession(sessions),controller.heartbeat);
 router.post('/device/sessions/disconnect',requireDeviceSession(sessions),controller.disconnect);
 router.post('/device/commands/:commandId/ack',requireDeviceSession(sessions),controller.acknowledge);
 router.post('/device/commands/:commandId/start',requireDeviceSession(sessions),controller.start);
 router.post('/device/commands/:commandId/result',requireDeviceSession(sessions),controller.result);
 router.all('/device/sessions',methodNotAllowed('POST, OPTIONS'));
 router.all('/device/sessions/heartbeat',methodNotAllowed('POST, OPTIONS'));
 router.all('/device/sessions/disconnect',methodNotAllowed('POST, OPTIONS'));
 router.all('/device/commands/:commandId/ack',methodNotAllowed('POST, OPTIONS'));
 router.all('/device/commands/:commandId/start',methodNotAllowed('POST, OPTIONS'));
 router.all('/device/commands/:commandId/result',methodNotAllowed('POST, OPTIONS'));
 return router;
};
