import {randomUUID} from 'node:crypto';
import {generateOpaqueToken,hashOpaqueToken} from '../auth/token.js';
import type {DeviceSessionRepository} from '../repositories/device-session-repository.js';
import {AppError} from '../types/errors.js';
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export class DeviceSessionService{
 constructor(private readonly repository:DeviceSessionRepository,private readonly ttlSeconds:number){}
 async connect(token:string,now=new Date()){
  if(!TOKEN.test(token)) throw new AppError(401,'AUTHENTICATION_REQUIRED','Device authentication is required.');
  const c=await this.repository.findCredentialByHash(hashOpaqueToken(token));
  if(c===null||c.revokedAt!==null||(c.expiresAt!==null&&c.expiresAt<=now)) throw new AppError(401,'AUTHENTICATION_REQUIRED','Device authentication is required.');
  try{return await this.repository.createSession({id:randomUUID(),managedDeviceId:c.managedDeviceId,credentialId:c.id,createdAt:now,expiresAt:new Date(now.getTime()+this.ttlSeconds*1000)});}
  catch(e){if(e instanceof Error&&e.message==='Managed device is not active.') throw new AppError(403,'AUTHORIZATION_DENIED','Managed device is not active.');throw e;}
 }
 async disconnect(id:string,token:string,now=new Date()){
  const c=await this.repository.findCredentialByHash(hashOpaqueToken(token));
  const s=await this.repository.findById(id);
  if(c===null||s===null||s.credentialId!==c.id) throw new AppError(403,'AUTHORIZATION_DENIED','Device session is not authorized.');
  return this.repository.disconnect(id,now);
 }
 static issueCredential(){return generateOpaqueToken();}
}
