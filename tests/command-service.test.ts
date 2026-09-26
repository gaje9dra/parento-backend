2026-09-26T11:55:54.8035792Z import { randomUUID } from 'node:crypto';
2026-09-26T11:55:54.8035963Z import { describe, expect, it } from 'vitest';
2026-09-26T11:55:54.8036224Z import { CommandService } from '../src/services/command-service.js';
2026-09-26T11:55:54.8036479Z import type { ManagedDevice } from '../src/domain/managed-device.js';
2026-09-26T11:55:54.8036986Z import type { ManagedDeviceRepository } from '../src/repositories/managed-device-repository.js';
2026-09-26T11:55:54.8037196Z import type { Command } from '../src/domain/command.js';
2026-09-26T11:55:54.8037527Z import type { CommandRepository } from '../src/repositories/command-repository.js';
2026-09-26T11:55:54.8037999Z import type { ScreenSharingSessionRepository } from '../src/repositories/screen-sharing-session-repository.js';
2026-09-26T11:55:54.8038006Z 
2026-09-26T11:55:54.8038204Z const device = (adminId: string): ManagedDevice => ({
2026-09-26T11:55:54.8038297Z   id: randomUUID(),
2026-09-26T11:55:54.8038382Z   adminId,
2026-09-26T11:55:54.8038547Z   stableIdentifier: 'managed-installation-test',
2026-09-26T11:55:54.8038637Z   name: 'Test Device',
2026-09-26T11:55:54.8038732Z   platform: 'android',
2026-09-26T11:55:54.8038830Z   enrollmentStatus: 'ACTIVE',
2026-09-26T11:55:54.8038953Z   operationalStatus: 'ACTIVE',
2026-09-26T11:55:54.8039050Z   createdAt: new Date(),
2026-09-26T11:55:54.8039147Z   updatedAt: new Date(),
2026-09-26T11:55:54.8039242Z   lastSeenAt: null,
2026-09-26T11:55:54.8039441Z });
2026-09-26T11:55:54.8039665Z class FakeDevices implements ManagedDeviceRepository {
2026-09-26T11:55:54.8039795Z   readonly name = 'fake-devices';
2026-09-26T11:55:54.8039925Z   item: ManagedDevice | null = null;
2026-09-26T11:55:54.8040063Z   async create(): Promise<ManagedDevice> {
2026-09-26T11:55:54.8040180Z     throw new Error('unused');
2026-09-26T11:55:54.8040259Z   }
2026-09-26T11:55:54.8040424Z   async findById(): Promise<ManagedDevice | null> {
2026-09-26T11:55:54.8040517Z     return this.item;
2026-09-26T11:55:54.8040594Z   }
2026-09-26T11:55:54.8040819Z   async findByStableIdentifier(): Promise<ManagedDevice | null> {
2026-09-26T11:55:54.8040909Z     return null;
2026-09-26T11:55:54.8040987Z   }
2026-09-26T11:55:54.8041078Z   async list() {
2026-09-26T11:55:54.8041209Z     return { items: [], nextCursor: null };
2026-09-26T11:55:54.8041295Z   }
2026-09-26T11:55:54.8041394Z   async listByAdminId() {
2026-09-26T11:55:54.8041523Z     return { items: [], nextCursor: null };
2026-09-26T11:55:54.8041605Z   }
2026-09-26T11:55:54.8041703Z   async updateStatus() {
2026-09-26T11:55:54.8041786Z     return null;
2026-09-26T11:55:54.8041991Z   }
2026-09-26T11:55:54.8042068Z }
2026-09-26T11:55:54.8042261Z class FakeCommands implements CommandRepository {
2026-09-26T11:55:54.8042391Z   readonly name = 'fake-commands';
2026-09-26T11:55:54.8042507Z   command: Command | null = null;
2026-09-26T11:55:54.8042734Z   async create(input: Parameters<CommandRepository['create']>[0]) {
2026-09-26T11:55:54.8042852Z     const command: Command = {
2026-09-26T11:55:54.8042939Z       id: input.id,
2026-09-26T11:55:54.8043090Z       managedDeviceId: input.managedDeviceId,
2026-09-26T11:55:54.8043191Z       adminId: input.adminId,
2026-09-26T11:55:54.8043284Z       type: 'FUTURE_COMMAND',
2026-09-26T11:55:54.8043377Z       version: 1,
2026-09-26T11:55:54.8043470Z       status: 'CREATED',
2026-09-26T11:55:54.8043570Z       payload: input.payload,
2026-09-26T11:55:54.8043708Z       correlationId: input.correlationId,
2026-09-26T11:55:54.8043843Z       idempotencyKey: input.idempotencyKey,
2026-09-26T11:55:54.8043944Z       createdAt: new Date(),
2026-09-26T11:55:54.8044077Z       expiresAt: input.expiresAt,
2026-09-26T11:55:54.8044167Z       deliveryAt: null,
2026-09-26T11:55:54.8044269Z       acknowledgedAt: null,
2026-09-26T11:55:54.8044364Z       startedAt: null,
2026-09-26T11:55:54.8044454Z       completedAt: null,
2026-09-26T11:55:54.8044551Z       cancelledAt: null,
2026-09-26T11:55:54.8044647Z       failureCode: null,
2026-09-26T11:55:54.8044742Z       errorCategory: null,
2026-09-26T11:55:54.8044835Z       resultCode: null,
2026-09-26T11:55:54.8044926Z       resultMetadata: null,
2026-09-26T11:55:54.8045010Z     };
2026-09-26T11:55:54.8045108Z     this.command = command;
2026-09-26T11:55:54.8045231Z     return { command, created: true };
2026-09-26T11:55:54.8045311Z   }
2026-09-26T11:55:54.8045409Z   async findById() {
2026-09-26T11:55:54.8045618Z     return this.command;
2026-09-26T11:55:54.8045704Z   }
2026-09-26T11:55:54.8045795Z   async findOwned() {
2026-09-26T11:55:54.8045892Z     return this.command;
2026-09-26T11:55:54.8045979Z   }
2026-09-26T11:55:54.8046069Z   async cancelOwned() {
2026-09-26T11:55:54.8046221Z     if (!this.command) throw new Error('unused');
2026-09-26T11:55:54.8046315Z     return this.command;
2026-09-26T11:55:54.8046390Z   }
2026-09-26T11:55:54.8046656Z   async transition(input: Parameters<CommandRepository['transition']>[0]) {
2026-09-26T11:55:54.8046802Z     if (!this.command) throw new Error('unused');
2026-09-26T11:55:54.8046977Z     this.command = { ...this.command, status: input.to };
2026-09-26T11:55:54.8047071Z     return this.command;
2026-09-26T11:55:54.8047145Z   }
2026-09-26T11:55:54.8047227Z }
2026-09-26T11:55:54.8047418Z describe('Phase 6.1 command authorization', () => {
2026-09-26T11:55:54.8047717Z   it('binds command creation to the authenticated administrator ownership', async () => {
2026-09-26T11:55:54.8047843Z     const owner = randomUUID(),
2026-09-26T11:55:54.8047941Z       other = randomUUID(),
2026-09-26T11:55:54.8048061Z       devices = new FakeDevices();
2026-09-26T11:55:54.8048191Z     devices.item = device(owner);
2026-09-26T11:55:54.8048416Z     const service = new CommandService(new FakeCommands(), devices, {
2026-09-26T11:55:54.8048504Z       ttlSeconds: 300,
2026-09-26T11:55:54.8048605Z       maxPayloadBytes: 4096,
2026-09-26T11:55:54.8048681Z     });
2026-09-26T11:55:54.8048771Z     await expect(
2026-09-26T11:55:54.8048870Z       service.create(other, {
2026-09-26T11:55:54.8048988Z         deviceId: devices.item.id,
2026-09-26T11:55:54.8049105Z         type: 'FUTURE_COMMAND',
2026-09-26T11:55:54.8049193Z         version: 1,
2026-09-26T11:55:54.8049283Z         payload: {},
2026-09-26T11:55:54.8049507Z         idempotencyKey: null,
2026-09-26T11:55:54.8049609Z         correlationId: null,
2026-09-26T11:55:54.8049687Z       }),
2026-09-26T11:55:54.8049955Z     ).rejects.toMatchObject({ statusCode: 403, code: 'AUTHORIZATION_DENIED' });
2026-09-26T11:55:54.8050031Z   });
2026-09-26T11:55:54.8050329Z   it('rejects arbitrary payload content in the neutral command registry', async () => {
2026-09-26T11:55:54.8050572Z     const owner = randomUUID(),
2026-09-26T11:55:54.8050689Z       devices = new FakeDevices();
2026-09-26T11:55:54.8050809Z     devices.item = device(owner);
2026-09-26T11:55:54.8051027Z     const service = new CommandService(new FakeCommands(), devices, {
2026-09-26T11:55:54.8051115Z       ttlSeconds: 300,
2026-09-26T11:55:54.8051214Z       maxPayloadBytes: 4096,
2026-09-26T11:55:54.8051294Z     });
2026-09-26T11:55:54.8051379Z     await expect(
2026-09-26T11:55:54.8051476Z       service.create(owner, {
2026-09-26T11:55:54.8051592Z         deviceId: devices.item.id,
2026-09-26T11:55:54.8051706Z         type: 'FUTURE_COMMAND',
2026-09-26T11:55:54.8051796Z         version: 1,
2026-09-26T11:55:54.8051919Z         payload: { command: 'shell' },
2026-09-26T11:55:54.8052026Z         idempotencyKey: null,
2026-09-26T11:55:54.8052123Z         correlationId: null,
2026-09-26T11:55:54.8052201Z       }),
2026-09-26T11:55:54.8052304Z     ).rejects.toMatchObject({
2026-09-26T11:55:54.8052401Z       statusCode: 400,
2026-09-26T11:55:54.8052563Z       code: 'INVALID_COMMAND_PAYLOAD',
2026-09-26T11:55:54.8052646Z     });
2026-09-26T11:55:54.8052722Z   });
2026-09-26T11:55:54.8052803Z });
2026-09-26T11:55:54.8052811Z 
2026-09-26T11:55:54.8053043Z describe('Phase 9.4 screen-sharing command binding', () => {
2026-09-26T11:55:54.8053321Z   it('rejects a screen command whose session belongs to another device', async () => {
2026-09-26T11:55:54.8053437Z     const owner = randomUUID();
2026-09-26T11:55:54.8053555Z     const managed = device(owner);
2026-09-26T11:55:54.8053684Z     const foreignDevice = randomUUID();
2026-09-26T11:55:54.8053812Z     const sessionId = randomUUID();
2026-09-26T11:55:54.8053910Z     const screenSessions = {
2026-09-26T11:55:54.8054020Z       findById: async () => ({
2026-09-26T11:55:54.8054226Z         id: sessionId,
2026-09-26T11:55:54.8054356Z         managedDeviceId: foreignDevice,
2026-09-26T11:55:54.8054449Z         adminId: owner,
2026-09-26T11:55:54.8054545Z         status: 'AUTHORIZED',
2026-09-26T11:55:54.8054629Z       }),
2026-09-26T11:55:54.8054798Z     } as unknown as ScreenSharingSessionRepository;
2026-09-26T11:55:54.8054924Z     const devices = new FakeDevices();
2026-09-26T11:55:54.8055016Z     devices.item = managed;
2026-09-26T11:55:54.8055141Z     const service = new CommandService(
2026-09-26T11:55:54.8055239Z       new FakeCommands(),
2026-09-26T11:55:54.8055322Z       devices,
2026-09-26T11:55:54.8055474Z       { ttlSeconds: 300, maxPayloadBytes: 4096 },
2026-09-26T11:55:54.8055557Z       undefined,
2026-09-26T11:55:54.8055655Z       screenSessions,
2026-09-26T11:55:54.8055737Z     );
2026-09-26T11:55:54.8055744Z 
2026-09-26T11:55:54.8055825Z     await expect(
2026-09-26T11:55:54.8055983Z       service.createScreenShareCommand(owner, {
2026-09-26T11:55:54.8056085Z         deviceId: managed.id,
2026-09-26T11:55:54.8056201Z         type: 'START_SCREEN_SHARE',
2026-09-26T11:55:54.8056323Z         screenSessionId: sessionId,
2026-09-26T11:55:54.8056453Z         correlationId: randomUUID(),
2026-09-26T11:55:54.8056530Z       }),
2026-09-26T11:55:54.8056631Z     ).rejects.toMatchObject({
2026-09-26T11:55:54.8056723Z       statusCode: 404,
2026-09-26T11:55:54.8056842Z       code: 'SCREEN_SESSION_NOT_FOUND',
2026-09-26T11:55:54.8056923Z     });
2026-09-26T11:55:54.8056999Z   });
2026-09-26T11:55:54.8057005Z 
2026-09-26T11:55:54.8057259Z   it('rejects replayed screen start against an ACTIVE session', async () => {
2026-09-26T11:55:54.8057375Z     const owner = randomUUID();
2026-09-26T11:55:54.8057494Z     const managed = device(owner);
2026-09-26T11:55:54.8057613Z     const sessionId = randomUUID();
2026-09-26T11:55:54.8057714Z     const screenSessions = {
2026-09-26T11:55:54.8057826Z       findById: async () => ({
2026-09-26T11:55:54.8057915Z         id: sessionId,
2026-09-26T11:55:54.8058040Z         managedDeviceId: managed.id,
2026-09-26T11:55:54.8058127Z         adminId: owner,
2026-09-26T11:55:54.8058219Z         status: 'ACTIVE',
2026-09-26T11:55:54.8058385Z       }),
2026-09-26T11:55:54.8058553Z     } as unknown as ScreenSharingSessionRepository;
2026-09-26T11:55:54.8058679Z     const devices = new FakeDevices();
2026-09-26T11:55:54.8058772Z     devices.item = managed;
2026-09-26T11:55:54.8058901Z     const service = new CommandService(
2026-09-26T11:55:54.8058996Z       new FakeCommands(),
2026-09-26T11:55:54.8059076Z       devices,
2026-09-26T11:55:54.8059226Z       { ttlSeconds: 300, maxPayloadBytes: 4096 },
2026-09-26T11:55:54.8059432Z       undefined,
2026-09-26T11:55:54.8059525Z       screenSessions,
2026-09-26T11:55:54.8059603Z     );
2026-09-26T11:55:54.8059611Z 
2026-09-26T11:55:54.8059692Z     await expect(
2026-09-26T11:55:54.8059847Z       service.createScreenShareCommand(owner, {
2026-09-26T11:55:54.8059943Z         deviceId: managed.id,
2026-09-26T11:55:54.8060065Z         type: 'START_SCREEN_SHARE',
2026-09-26T11:55:54.8060187Z         screenSessionId: sessionId,
2026-09-26T11:55:54.8060310Z         correlationId: randomUUID(),
2026-09-26T11:55:54.8060391Z       }),
2026-09-26T11:55:54.8060495Z     ).rejects.toMatchObject({
2026-09-26T11:55:54.8060587Z       statusCode: 409,
2026-09-26T11:55:54.8060720Z       code: 'SCREEN_SESSION_STATE_CONFLICT',
2026-09-26T11:55:54.8060801Z     });
2026-09-26T11:55:54.8060877Z   });
2026-09-26T11:55:54.8060958Z });
2026-09-26T11:55:54.8060965Z 
2026-09-26T11:55:54.8061192Z describe('Phase 10.1 audio-access command binding', () => {
2026-09-26T11:55:54.8061464Z   it('rejects an audio command whose session belongs to another device', async () => {
2026-09-26T11:55:54.8061579Z     const owner = randomUUID();
2026-09-26T11:55:54.8061698Z     const managed = device(owner);
2026-09-26T11:55:54.8061825Z     const audioSessionId = randomUUID();
2026-09-26T11:55:54.8061923Z     const audioSessions = {
2026-09-26T11:55:54.8062159Z       findById: async () => ({
2026-09-26T11:55:54.8062257Z         id: audioSessionId,
2026-09-26T11:55:54.8062386Z         managedDeviceId: randomUUID(),
2026-09-26T11:55:54.8062479Z         adminId: owner,
2026-09-26T11:55:54.8062576Z         status: 'AUTHORIZED',
2026-09-26T11:55:54.8062658Z       }),
2026-09-26T11:55:54.8063086Z     } as unknown as import('../src/repositories/audio-access-session-repository.js').AudioAccessSessionRepository;
2026-09-26T11:55:54.8063216Z     const devices = new FakeDevices();
2026-09-26T11:55:54.8063314Z     devices.item = managed;
2026-09-26T11:55:54.8063438Z     const service = new CommandService(
2026-09-26T11:55:54.8063538Z       new FakeCommands(),
2026-09-26T11:55:54.8063624Z       devices,
2026-09-26T11:55:54.8063768Z       { ttlSeconds: 300, maxPayloadBytes: 4096 },
2026-09-26T11:55:54.8063854Z       undefined,
2026-09-26T11:55:54.8063940Z       undefined,
2026-09-26T11:55:54.8064031Z       audioSessions,
2026-09-26T11:55:54.8064109Z     );
2026-09-26T11:55:54.8064122Z 
2026-09-26T11:55:54.8064211Z     await expect(
2026-09-26T11:55:54.8064362Z       service.createAudioAccessCommand(owner, {
2026-09-26T11:55:54.8064459Z         deviceId: managed.id,
2026-09-26T11:55:54.8064579Z         type: 'START_AUDIO_ACCESS',
2026-09-26T11:55:54.8064673Z         audioSessionId,
2026-09-26T11:55:54.8064798Z         correlationId: randomUUID(),
2026-09-26T11:55:54.8064874Z       }),
2026-09-26T11:55:54.8064977Z     ).rejects.toMatchObject({
2026-09-26T11:55:54.8065068Z       statusCode: 404,
2026-09-26T11:55:54.8065186Z       code: 'AUDIO_SESSION_NOT_FOUND',
2026-09-26T11:55:54.8065267Z     });
2026-09-26T11:55:54.8065342Z   });
2026-09-26T11:55:54.8065353Z 
2026-09-26T11:55:54.8065593Z   it('rejects replayed audio start against an ACTIVE session', async () => {
2026-09-26T11:55:54.8065707Z     const owner = randomUUID();
2026-09-26T11:55:54.8065822Z     const managed = device(owner);
2026-09-26T11:55:54.8065952Z     const audioSessionId = randomUUID();
2026-09-26T11:55:54.8066052Z     const audioSessions = {
2026-09-26T11:55:54.8066164Z       findById: async () => ({
2026-09-26T11:55:54.8066260Z         id: audioSessionId,
2026-09-26T11:55:54.8066382Z         managedDeviceId: managed.id,
2026-09-26T11:55:54.8066587Z         adminId: owner,
2026-09-26T11:55:54.8066679Z         status: 'ACTIVE',
2026-09-26T11:55:54.8066757Z       }),
2026-09-26T11:55:54.8067167Z     } as unknown as import('../src/repositories/audio-access-session-repository.js').AudioAccessSessionRepository;
2026-09-26T11:55:54.8067293Z     const devices = new FakeDevices();
2026-09-26T11:55:54.8067388Z     devices.item = managed;
2026-09-26T11:55:54.8067513Z     const service = new CommandService(
2026-09-26T11:55:54.8067608Z       new FakeCommands(),
2026-09-26T11:55:54.8067688Z       devices,
2026-09-26T11:55:54.8067834Z       { ttlSeconds: 300, maxPayloadBytes: 4096 },
2026-09-26T11:55:54.8067918Z       undefined,
2026-09-26T11:55:54.8067999Z       undefined,
2026-09-26T11:55:54.8068089Z       audioSessions,
2026-09-26T11:55:54.8068174Z     );
2026-09-26T11:55:54.8068181Z 
2026-09-26T11:55:54.8068263Z     await expect(
2026-09-26T11:55:54.8068416Z       service.createAudioAccessCommand(owner, {
2026-09-26T11:55:54.8068517Z         deviceId: managed.id,
2026-09-26T11:55:54.8068632Z         type: 'START_AUDIO_ACCESS',
2026-09-26T11:55:54.8068724Z         audioSessionId,
2026-09-26T11:55:54.8068842Z         correlationId: randomUUID(),
2026-09-26T11:55:54.8068925Z       }),
2026-09-26T11:55:54.8069026Z     ).rejects.toMatchObject({
2026-09-26T11:55:54.8069113Z       statusCode: 409,
2026-09-26T11:55:54.8069251Z       code: 'AUDIO_SESSION_STATE_CONFLICT',
2026-09-26T11:55:54.8069447Z     });
2026-09-26T11:55:54.8069528Z   });
2026-09-26T11:55:54.8069820Z   it('creates only the allowlisted application policy command payload', async () => {
2026-09-26T11:55:54.8069936Z     const owner = randomUUID();
2026-09-26T11:55:54.8070058Z     const devices = new FakeDevices();
2026-09-26T11:55:54.8070294Z     devices.item = device(owner);
2026-09-26T11:55:54.8070517Z     const service = new CommandService(new FakeCommands(), devices, {
2026-09-26T11:55:54.8070610Z       ttlSeconds: 300,
2026-09-26T11:55:54.8070711Z       maxPayloadBytes: 4096,
2026-09-26T11:55:54.8070793Z     });
2026-09-26T11:55:54.8070800Z 
2026-09-26T11:55:54.8070888Z     await expect(
2026-09-26T11:55:54.8071071Z       service.createApplicationPolicyCommand(owner, {
2026-09-26T11:55:54.8071188Z         deviceId: devices.item.id,
2026-09-26T11:55:54.8071306Z         policyId: randomUUID(),
2026-09-26T11:55:54.8071403Z         policyVersion: 3,
2026-09-26T11:55:54.8071544Z         correlationId: 'policy-sync-test',
2026-09-26T11:55:54.8071626Z       }),
2026-09-26T11:55:54.8071778Z     ).resolves.toMatchObject({ created: true });
2026-09-26T11:55:54.8071786Z 
2026-09-26T11:55:54.8071866Z     await expect(
2026-09-26T11:55:54.8071964Z       service.create(owner, {
2026-09-26T11:55:54.8072079Z         deviceId: devices.item.id,
2026-09-26T11:55:54.8072211Z         type: 'SYNC_APPLICATION_POLICY',
2026-09-26T11:55:54.8072299Z         version: 1,
2026-09-26T11:55:54.8072419Z         payload: { arbitrary: 'code' },
2026-09-26T11:55:54.8072539Z         idempotencyKey: 'bad',
2026-09-26T11:55:54.8072640Z         correlationId: null,
2026-09-26T11:55:54.8072716Z       }),
2026-09-26T11:55:54.8072925Z     ).rejects.toMatchObject({ code: 'INVALID_COMMAND_PAYLOAD' });
2026-09-26T11:55:54.8073004Z   });
2026-09-26T11:55:54.8073011Z 
2026-09-26T11:55:54.8073207Z   it('creates a bounded inventory-request command', async () => {
2026-09-26T11:55:54.8073319Z     const owner = randomUUID();
2026-09-26T11:55:54.8073443Z     const devices = new FakeDevices();
2026-09-26T11:55:54.8073557Z     devices.item = device(owner);
2026-09-26T11:55:54.8073774Z     const service = new CommandService(new FakeCommands(), devices, {
2026-09-26T11:55:54.8073864Z       ttlSeconds: 300,
2026-09-26T11:55:54.8073962Z       maxPayloadBytes: 4096,
2026-09-26T11:55:54.8074039Z     });
2026-09-26T11:55:54.8074051Z 
2026-09-26T11:55:54.8074135Z     await expect(
2026-09-26T11:55:54.8074329Z       service.createApplicationInventoryRequest(owner, {
2026-09-26T11:55:54.8074451Z         deviceId: devices.item.id,
2026-09-26T11:55:54.8074699Z         correlationId: 'inventory-test',
2026-09-26T11:55:54.8074781Z       }),
2026-09-26T11:55:54.8074937Z     ).resolves.toMatchObject({ created: true });
2026-09-26T11:55:54.8075014Z   });
2026-09-26T11:55:54.8075097Z });
2026-09-26T11:55:54.8181824Z Post job cleanup.
2026-09-26T11:55:54.9413929Z (node:2346) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
2026-09-26T11:55:54.9414908Z (Use `node --trace-deprecation ...` to show where the warning was created)
2026-09-26T11:55:54.9628053Z Post job cleanup.
2026-09-26T11:55:55.0486415Z [command]/usr/bin/git version
2026-09-26T11:55:55.0529886Z git version 2.55.0
2026-09-26T11:55:55.0577927Z Temporarily overriding HOME='/home/runner/work/_temp/e10b3868-31a5-407b-8847-8b75dea1f11f' before making global git config changes
2026-09-26T11:55:55.0582190Z Adding repository directory to the temporary git global config as a safe directory
2026-09-26T11:55:55.0592887Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/parento-backend/parento-backend
2026-09-26T11:55:55.0622758Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-09-26T11:55:55.0657952Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-09-26T11:55:55.0912112Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-09-26T11:55:55.0939645Z http.https://github.com/.extraheader
2026-09-26T11:55:55.0950673Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-09-26T11:55:55.0985996Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-09-26T11:55:55.1242621Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-09-26T11:55:55.1292542Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-09-26T11:55:55.1707369Z Cleaning up orphan processes
2026-09-26T11:55:55.1985732Z ##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
