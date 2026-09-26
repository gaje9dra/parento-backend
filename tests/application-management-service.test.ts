2026-09-26T11:55:54.8002964Z import { describe, expect, it, vi } from 'vitest';
2026-09-26T11:55:54.8003379Z import { ApplicationManagementService } from '../src/services/application-management-service.js';
2026-09-26T11:55:54.8003844Z import type { ApplicationInventoryRepository } from '../src/repositories/application-inventory-repository.js';
2026-09-26T11:55:54.8004275Z import type { ApplicationPolicyRepository } from '../src/repositories/application-policy-repository.js';
2026-09-26T11:55:54.8004821Z import type { ApplicationManagementEventRepository } from '../src/repositories/application-management-event-repository.js';
2026-09-26T11:55:54.8005211Z import type { ManagedDeviceRepository } from '../src/repositories/managed-device-repository.js';
2026-09-26T11:55:54.8005486Z import type { CommandService } from '../src/services/command-service.js';
2026-09-26T11:55:54.8005581Z import type {
2026-09-26T11:55:54.8005676Z   ApplicationPolicy,
2026-09-26T11:55:54.8005808Z   ApplicationPolicyAssignment,
2026-09-26T11:55:54.8005915Z   ApplicationPolicySyncState,
2026-09-26T11:55:54.8006098Z } from '../src/domain/application-management.js';
2026-09-26T11:55:54.8006361Z import type { ManagedDevice } from '../src/domain/managed-device.js';
2026-09-26T11:55:54.8006642Z import { PersistenceError } from '../src/domain/persistence-errors.js';
2026-09-26T11:55:54.8006650Z 
2026-09-26T11:55:54.8006836Z const adminId = '11111111-1111-4111-8111-111111111111';
2026-09-26T11:55:54.8007033Z const deviceId = '22222222-2222-4222-8222-222222222222';
2026-09-26T11:55:54.8007222Z const policyId = '33333333-3333-4333-8333-333333333333';
2026-09-26T11:55:54.8007235Z 
2026-09-26T11:55:54.8007366Z const device: ManagedDevice = {
2026-09-26T11:55:54.8007455Z   id: deviceId,
2026-09-26T11:55:54.8007541Z   adminId,
2026-09-26T11:55:54.8007790Z   stableIdentifier: 'installation-1',
2026-09-26T11:55:54.8007886Z   name: 'Test device',
2026-09-26T11:55:54.8007975Z   platform: 'android',
2026-09-26T11:55:54.8008080Z   enrollmentStatus: 'ACTIVE',
2026-09-26T11:55:54.8008201Z   operationalStatus: 'ACTIVE',
2026-09-26T11:55:54.8008340Z   createdAt: new Date('2026-01-01T00:00:00Z'),
2026-09-26T11:55:54.8008482Z   updatedAt: new Date('2026-01-01T00:00:00Z'),
2026-09-26T11:55:54.8008580Z   lastSeenAt: new Date(),
2026-09-26T11:55:54.8008661Z };
2026-09-26T11:55:54.8008669Z 
2026-09-26T11:55:54.8008874Z const policy = (version = 1): ApplicationPolicy => ({
2026-09-26T11:55:54.8008962Z   id: policyId,
2026-09-26T11:55:54.8009040Z   adminId,
2026-09-26T11:55:54.8009131Z   name: 'Default',
2026-09-26T11:55:54.8009219Z   description: null,
2026-09-26T11:55:54.8009440Z   status: 'ACTIVE',
2026-09-26T11:55:54.8009530Z   version,
2026-09-26T11:55:54.8009663Z   createdAt: new Date('2026-01-01T00:00:00Z'),
2026-09-26T11:55:54.8009800Z   updatedAt: new Date('2026-01-01T00:00:00Z'),
2026-09-26T11:55:54.8009900Z   createdBy: adminId,
2026-09-26T11:55:54.8009987Z   updatedBy: adminId,
2026-09-26T11:55:54.8010245Z   rules: [{ policyId, packageName: 'com.example.blocked', action: 'BLOCK' }],
2026-09-26T11:55:54.8010325Z });
2026-09-26T11:55:54.8010332Z 
2026-09-26T11:55:54.8010586Z class InventoryFake implements ApplicationInventoryRepository {
2026-09-26T11:55:54.8010707Z   readonly name = 'inventory';
2026-09-26T11:55:54.8010810Z   async replaceForDevice() {
2026-09-26T11:55:54.8010969Z     return { applied: true, receivedAt: new Date() };
2026-09-26T11:55:54.8011052Z   }
2026-09-26T11:55:54.8011149Z   async listForAdmin() {
2026-09-26T11:55:54.8011397Z     return { items: [], nextCursor: null, observedAt: null, receivedAt: null };
2026-09-26T11:55:54.8011477Z   }
2026-09-26T11:55:54.8011687Z   async findForAdmin() {
2026-09-26T11:55:54.8011782Z     return null;
2026-09-26T11:55:54.8011860Z   }
2026-09-26T11:55:54.8011935Z }
2026-09-26T11:55:54.8011942Z 
2026-09-26T11:55:54.8012175Z class PolicyFake implements ApplicationPolicyRepository {
2026-09-26T11:55:54.8012275Z   readonly name = 'policy';
2026-09-26T11:55:54.8012457Z   assignment: ApplicationPolicyAssignment | null = null;
2026-09-26T11:55:54.8012621Z   sync: ApplicationPolicySyncState | null = null;
2026-09-26T11:55:54.8012707Z   async create() {
2026-09-26T11:55:54.8012800Z     return policy();
2026-09-26T11:55:54.8012882Z   }
2026-09-26T11:55:54.8012969Z   async findOwned() {
2026-09-26T11:55:54.8013060Z     return policy();
2026-09-26T11:55:54.8013140Z   }
2026-09-26T11:55:54.8013227Z   async listOwned() {
2026-09-26T11:55:54.8013380Z     return { items: [policy()], nextCursor: null };
2026-09-26T11:55:54.8013462Z   }
2026-09-26T11:55:54.8013641Z   async updateOwned(input: { expectedVersion: number }) {
2026-09-26T11:55:54.8013778Z     if (input.expectedVersion !== 1)
2026-09-26T11:55:54.8013943Z       throw new PersistenceError('CONFLICT', 'stale');
2026-09-26T11:55:54.8014041Z     return policy(2);
2026-09-26T11:55:54.8014126Z   }
2026-09-26T11:55:54.8014220Z   async disableOwned() {
2026-09-26T11:55:54.8014311Z     return policy(2);
2026-09-26T11:55:54.8014394Z   }
2026-09-26T11:55:54.8014522Z   async listAssignmentsForPolicy() {
2026-09-26T11:55:54.8014688Z     return this.assignment ? [this.assignment] : [];
2026-09-26T11:55:54.8014770Z   }
2026-09-26T11:55:54.8014864Z   async assign(input: {
2026-09-26T11:55:54.8014969Z     managedDeviceId: string;
2026-09-26T11:55:54.8015057Z     policyId: string;
2026-09-26T11:55:54.8015158Z     policyVersion: number;
2026-09-26T11:55:54.8015253Z     assignedBy: string;
2026-09-26T11:55:54.8015332Z   }) {
2026-09-26T11:55:54.8015430Z     this.assignment = {
2026-09-26T11:55:54.8015517Z       ...input,
2026-09-26T11:55:54.8015612Z       assignedAt: new Date(),
2026-09-26T11:55:54.8015714Z       updatedAt: new Date(),
2026-09-26T11:55:54.8015794Z     };
2026-09-26T11:55:54.8015897Z     return this.assignment;
2026-09-26T11:55:54.8015977Z   }
2026-09-26T11:55:54.8016074Z   async removeAssignment() {
2026-09-26T11:55:54.8016292Z     this.assignment = null;
2026-09-26T11:55:54.8016370Z   }
2026-09-26T11:55:54.8016465Z   async findAssignment() {
2026-09-26T11:55:54.8016562Z     return this.assignment;
2026-09-26T11:55:54.8016638Z   }
2026-09-26T11:55:54.8016737Z   async findSyncState() {
2026-09-26T11:55:54.8016829Z     return this.sync;
2026-09-26T11:55:54.8016906Z   }
2026-09-26T11:55:54.8017037Z   async setSyncRequested(input: {
2026-09-26T11:55:54.8017133Z     managedDeviceId: string;
2026-09-26T11:55:54.8017225Z     policyId: string | null;
2026-09-26T11:55:54.8017346Z     policyVersion: number | null;
2026-09-26T11:55:54.8017437Z     requestedAt: Date;
2026-09-26T11:55:54.8017512Z   }) {
2026-09-26T11:55:54.8017599Z     this.sync = {
2026-09-26T11:55:54.8017755Z       managedDeviceId: input.managedDeviceId,
2026-09-26T11:55:54.8017889Z       desiredPolicyId: input.policyId,
2026-09-26T11:55:54.8018044Z       desiredPolicyVersion: input.policyVersion,
2026-09-26T11:55:54.8018142Z       reportedPolicyId: null,
2026-09-26T11:55:54.8018275Z       reportedPolicyVersion: null,
2026-09-26T11:55:54.8018370Z       status: 'PENDING',
2026-09-26T11:55:54.8018498Z       lastRequestedAt: input.requestedAt,
2026-09-26T11:55:54.8018597Z       lastReportedAt: null,
2026-09-26T11:55:54.8018693Z       lastErrorCode: null,
2026-09-26T11:55:54.8018813Z       updatedAt: input.requestedAt,
2026-09-26T11:55:54.8018897Z     };
2026-09-26T11:55:54.8018984Z     return this.sync;
2026-09-26T11:55:54.8019067Z   }
2026-09-26T11:55:54.8019167Z   async reportSync(input: {
2026-09-26T11:55:54.8019262Z     managedDeviceId: string;
2026-09-26T11:55:54.8019483Z     policyId: string | null;
2026-09-26T11:55:54.8019614Z     policyVersion: number | null;
2026-09-26T11:55:54.8019900Z     status: ApplicationPolicySyncState['status'];
2026-09-26T11:55:54.8019998Z     reportedAt: Date;
2026-09-26T11:55:54.8020096Z     errorCode: string | null;
2026-09-26T11:55:54.8020178Z   }) {
2026-09-26T11:55:54.8020267Z     this.sync = {
2026-09-26T11:55:54.8020413Z       managedDeviceId: input.managedDeviceId,
2026-09-26T11:55:54.8020600Z       desiredPolicyId: this.sync?.desiredPolicyId ?? null,
2026-09-26T11:55:54.8020828Z       desiredPolicyVersion: this.sync?.desiredPolicyVersion ?? null,
2026-09-26T11:55:54.8020959Z       reportedPolicyId: input.policyId,
2026-09-26T11:55:54.8021119Z       reportedPolicyVersion: input.policyVersion,
2026-09-26T11:55:54.8021217Z       status: input.status,
2026-09-26T11:55:54.8021392Z       lastRequestedAt: this.sync?.lastRequestedAt ?? null,
2026-09-26T11:55:54.8021520Z       lastReportedAt: input.reportedAt,
2026-09-26T11:55:54.8021645Z       lastErrorCode: input.errorCode,
2026-09-26T11:55:54.8021762Z       updatedAt: input.reportedAt,
2026-09-26T11:55:54.8021843Z     };
2026-09-26T11:55:54.8021937Z     return this.sync;
2026-09-26T11:55:54.8022021Z   }
2026-09-26T11:55:54.8022103Z }
2026-09-26T11:55:54.8022110Z 
2026-09-26T11:55:54.8022316Z class DeviceFake implements ManagedDeviceRepository {
2026-09-26T11:55:54.8022426Z   readonly name = 'devices';
2026-09-26T11:55:54.8022519Z   async create() {
2026-09-26T11:55:54.8022605Z     return device;
2026-09-26T11:55:54.8022686Z   }
2026-09-26T11:55:54.8022781Z   async findById() {
2026-09-26T11:55:54.8022866Z     return device;
2026-09-26T11:55:54.8022946Z   }
2026-09-26T11:55:54.8023071Z   async findByStableIdentifier() {
2026-09-26T11:55:54.8023162Z     return device;
2026-09-26T11:55:54.8023245Z   }
2026-09-26T11:55:54.8023328Z   async list() {
2026-09-26T11:55:54.8023479Z     return { items: [device], nextCursor: null };
2026-09-26T11:55:54.8023560Z   }
2026-09-26T11:55:54.8023654Z   async listByAdminId() {
2026-09-26T11:55:54.8023798Z     return { items: [device], nextCursor: null };
2026-09-26T11:55:54.8023873Z   }
2026-09-26T11:55:54.8023977Z   async updateStatus() {
2026-09-26T11:55:54.8024072Z     return device;
2026-09-26T11:55:54.8024149Z   }
2026-09-26T11:55:54.8024230Z }
2026-09-26T11:55:54.8024237Z 
2026-09-26T11:55:54.8024353Z const createService = () => {
2026-09-26T11:55:54.8024604Z   const policies = new PolicyFake();
2026-09-26T11:55:54.8024697Z   const commands = {
2026-09-26T11:55:54.8024888Z     createApplicationPolicyCommand: vi.fn(async () => ({
2026-09-26T11:55:54.8025058Z       command: { id: '44444444-4444-4444-8444-444444444444' },
2026-09-26T11:55:54.8025150Z       created: true,
2026-09-26T11:55:54.8025228Z     })),
2026-09-26T11:55:54.8025432Z     createApplicationInventoryRequest: vi.fn(async () => ({
2026-09-26T11:55:54.8025597Z       command: { id: '55555555-5555-4555-8555-555555555555' },
2026-09-26T11:55:54.8025682Z       created: true,
2026-09-26T11:55:54.8025763Z     })),
2026-09-26T11:55:54.8025891Z   } as unknown as CommandService;
2026-09-26T11:55:54.8025976Z   const events = {
2026-09-26T11:55:54.8026063Z     name: 'events',
2026-09-26T11:55:54.8026197Z     record: vi.fn(async () => undefined),
2026-09-26T11:55:54.8026381Z   } as unknown as ApplicationManagementEventRepository;
2026-09-26T11:55:54.8026464Z   return {
2026-09-26T11:55:54.8026551Z     policies,
2026-09-26T11:55:54.8026721Z     service: new ApplicationManagementService(
2026-09-26T11:55:54.8026818Z       new InventoryFake(),
2026-09-26T11:55:54.8026900Z       policies,
2026-09-26T11:55:54.8026995Z       new DeviceFake(),
2026-09-26T11:55:54.8027079Z       commands,
2026-09-26T11:55:54.8027158Z       events,
2026-09-26T11:55:54.8027240Z       {
2026-09-26T11:55:54.8027363Z         maxInventoryItems: 500,
2026-09-26T11:55:54.8027463Z         maxPolicyRules: 500,
2026-09-26T11:55:54.8027592Z         maxFutureSkewSeconds: 300,
2026-09-26T11:55:54.8027683Z         staleSeconds: 300,
2026-09-26T11:55:54.8027802Z         veryStaleSeconds: 86400,
2026-09-26T11:55:54.8027883Z       },
2026-09-26T11:55:54.8027965Z     ),
2026-09-26T11:55:54.8028045Z   };
2026-09-26T11:55:54.8028244Z };
2026-09-26T11:55:54.8028258Z 
2026-09-26T11:55:54.8028447Z describe('application management service', () => {
2026-09-26T11:55:54.8028650Z   it('rejects duplicate inventory package names', async () => {
2026-09-26T11:55:54.8028782Z     const { service } = createService();
2026-09-26T11:55:54.8028872Z     await expect(
2026-09-26T11:55:54.8028993Z       service.reportInventory({
2026-09-26T11:55:54.8029113Z         managedDeviceId: deviceId,
2026-09-26T11:55:54.8029227Z         observedAt: new Date(),
2026-09-26T11:55:54.8029463Z         receivedAt: new Date(),
2026-09-26T11:55:54.8029548Z         items: [
2026-09-26T11:55:54.8029633Z           {
2026-09-26T11:55:54.8029773Z             packageName: 'com.example.app',
2026-09-26T11:55:54.8029859Z             label: null,
2026-09-26T11:55:54.8029974Z             versionName: null,
2026-09-26T11:55:54.8030082Z             versionCode: null,
2026-09-26T11:55:54.8030211Z             installState: 'INSTALLED',
2026-09-26T11:55:54.8030307Z             enabled: true,
2026-09-26T11:55:54.8030422Z             sourceCategory: null,
2026-09-26T11:55:54.8030506Z           },
2026-09-26T11:55:54.8030588Z           {
2026-09-26T11:55:54.8030734Z             packageName: 'com.example.app',
2026-09-26T11:55:54.8030834Z             label: null,
2026-09-26T11:55:54.8030946Z             versionName: null,
2026-09-26T11:55:54.8031052Z             versionCode: null,
2026-09-26T11:55:54.8031175Z             installState: 'INSTALLED',
2026-09-26T11:55:54.8031262Z             enabled: true,
2026-09-26T11:55:54.8031381Z             sourceCategory: null,
2026-09-26T11:55:54.8031464Z           },
2026-09-26T11:55:54.8031541Z         ],
2026-09-26T11:55:54.8031622Z       }),
2026-09-26T11:55:54.8031785Z     ).rejects.toMatchObject({ code: 'CONFLICT' });
2026-09-26T11:55:54.8031861Z   });
2026-09-26T11:55:54.8031869Z 
2026-09-26T11:55:54.8032123Z   it('calculates an owned effective policy deterministically', async () => {
2026-09-26T11:55:54.8032283Z     const { service, policies } = createService();
2026-09-26T11:55:54.8032380Z     await policies.assign({
2026-09-26T11:55:54.8032503Z       managedDeviceId: deviceId,
2026-09-26T11:55:54.8032585Z       policyId,
2026-09-26T11:55:54.8032806Z       policyVersion: 1,
2026-09-26T11:55:54.8032903Z       assignedBy: adminId,
2026-09-26T11:55:54.8032980Z     });
2026-09-26T11:55:54.8033230Z     const effective = await service.getEffectivePolicy(adminId, deviceId);
2026-09-26T11:55:54.8033391Z     expect(effective.policy?.id).toBe(policyId);
2026-09-26T11:55:54.8033535Z     expect(effective.policy?.version).toBe(1);
2026-09-26T11:55:54.8033731Z     expect(effective.synchronizationRequired).toBe(false);
2026-09-26T11:55:54.8033812Z   });
2026-09-26T11:55:54.8033820Z 
2026-09-26T11:55:54.8033965Z   it('rejects stale policy updates', async () => {
2026-09-26T11:55:54.8034094Z     const { service } = createService();
2026-09-26T11:55:54.8034184Z     await expect(
2026-09-26T11:55:54.8034284Z       service.updatePolicy({
2026-09-26T11:55:54.8034376Z         adminId,
2026-09-26T11:55:54.8034461Z         policyId,
2026-09-26T11:55:54.8034555Z         name: 'Changed',
2026-09-26T11:55:54.8034653Z         description: null,
2026-09-26T11:55:54.8034743Z         status: 'ACTIVE',
2026-09-26T11:55:54.8034850Z         expectedVersion: 9,
2026-09-26T11:55:54.8035080Z         rules: [{ packageName: 'com.example.blocked', action: 'BLOCK' }],
2026-09-26T11:55:54.8035160Z       }),
2026-09-26T11:55:54.8035320Z     ).rejects.toMatchObject({ code: 'CONFLICT' });
2026-09-26T11:55:54.8035401Z   });
2026-09-26T11:55:54.8035478Z });
2026-09-26T11:55:54.8035637Z ===== tests/command-service.test.ts =====
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
