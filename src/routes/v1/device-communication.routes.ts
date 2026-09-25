import {Router,type RequestHandler} from 'express';
import type {AdminAuthenticationService} from '../../services/admin-authentication-service.js';
import type {CommandService} from '../../services/command-service.js';
import type {DeviceSessionService} from '../../services/device-session-service.js';
import {requireAdminAuthentication} from '../../middleware/admin-auth.js';
import {requireAdminAuthorization} from '../../middleware/admin-authorization.js';
import {createCommandController} from '../../controllers/command.controller.js';
import {createDeviceSessionController} from '../../controllers/device-session.controller.js';
const methodNotAllowed=(allow:string):RequestHandler=>(_req,res)=>{res.setHeader('Allow',allow);res.status(405).json({error:{code:'METHOD_NOT_ALLOWED',message:'HTTP method is not allowed for this endpoint.'},requestId:res.locals.requestId});};
export const createDeviceCommunicationRouter=(auth:AdminAuthenticationService,sessions:DeviceSessionService,commands:CommandService):Router=>{
 const r=Router();const adminAuth=requireAdminAuthentication(auth);const adminz=requireAdminAuthorization;const sc=createDeviceSessionController(sessions);const cc=createCommandController(commands);
 r.post('/devices/sessions',sc.connect);r.post('/devices/sessions/:sessionId/disconnect',sc.disconnect);
 r.post('/devices/commands',adminAuth,adminz,cc.create);r.get('/devices/commands/:commandId',adminAuth,adminz,cc.get);r.post('/devices/commands/:commandId/cancel',adminAuth,adminz,cc.cancel);
 r.all('/devices/sessions',methodNotAllowed('POST, OPTIONS'));r.all('/devices/sessions/:sessionId/disconnect',methodNotAllowed('POST, OPTIONS'));
 r.all('/devices/commands',methodNotAllowed('POST, OPTIONS'));r.all('/devices/commands/:commandId',methodNotAllowed('GET, OPTIONS'));r.all('/devices/commands/:commandId/cancel',methodNotAllowed('POST, OPTIONS'));return r;
};