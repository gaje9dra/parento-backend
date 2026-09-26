2026-09-26T11:55:54.7332464Z import type { RequestHandler } from 'express';
2026-09-26T11:55:54.7333336Z import { z } from 'zod';
2026-09-26T11:55:54.7334727Z import type { ApplicationManagementService } from '../services/application-management-service.js';
2026-09-26T11:55:54.7335541Z 
2026-09-26T11:55:54.7335770Z const packageName = z
2026-09-26T11:55:54.7336250Z   .string()
2026-09-26T11:55:54.7336572Z   .trim()
2026-09-26T11:55:54.7336880Z   .min(3)
2026-09-26T11:55:54.7337186Z   .max(255)
2026-09-26T11:55:54.7337780Z   .regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/);
2026-09-26T11:55:54.7338375Z const dateField = z
2026-09-26T11:55:54.7338729Z   .string()
2026-09-26T11:55:54.7339082Z   .datetime({ offset: true })
2026-09-26T11:55:54.7339797Z   .transform((v) => new Date(v));
2026-09-26T11:55:54.7340254Z const policyId = z.string().uuid();
2026-09-26T11:55:54.7340527Z const rule = z
2026-09-26T11:55:54.7340857Z   .object({ packageName, action: z.enum(['ALLOW', 'BLOCK']) })
2026-09-26T11:55:54.7341210Z   .strict();
2026-09-26T11:55:54.7341440Z const inventoryItem = z
2026-09-26T11:55:54.7341669Z   .object({
2026-09-26T11:55:54.7341877Z     packageName,
2026-09-26T11:55:54.7342191Z     label: z.string().trim().max(512).nullable().optional(),
2026-09-26T11:55:54.7342643Z     versionName: z.string().trim().max(128).nullable().optional(),
2026-09-26T11:55:54.7343007Z     versionCode: z
2026-09-26T11:55:54.7343223Z       .number()
2026-09-26T11:55:54.7343417Z       .int()
2026-09-26T11:55:54.7343605Z       .min(0)
2026-09-26T11:55:54.7343839Z       .max(Number.MAX_SAFE_INTEGER)
2026-09-26T11:55:54.7344097Z       .nullable()
2026-09-26T11:55:54.7344308Z       .optional(),
2026-09-26T11:55:54.7344679Z     installState: z.enum(['INSTALLED', 'UPDATED', 'UNINSTALLED', 'UNKNOWN']),
2026-09-26T11:55:54.7345130Z     enabled: z.boolean().nullable().optional(),
2026-09-26T11:55:54.7345562Z     sourceCategory: z.string().trim().max(128).nullable().optional(),
2026-09-26T11:55:54.7345913Z   })
2026-09-26T11:55:54.7346101Z   .strict();
2026-09-26T11:55:54.7346219Z 
2026-09-26T11:55:54.7346519Z const deviceParam = z.object({ deviceId: z.string().uuid() }).strict();
2026-09-26T11:55:54.7347008Z const policyParam = z.object({ policyId }).strict();
2026-09-26T11:55:54.7347353Z const applicationParam = z
2026-09-26T11:55:54.7347688Z   .object({ deviceId: z.string().uuid(), packageName })
2026-09-26T11:55:54.7348204Z   .strict();
2026-09-26T11:55:54.7348321Z 
2026-09-26T11:55:54.7348479Z const toPolicy = (policy: any) => ({
2026-09-26T11:55:54.7348741Z   ...policy,
2026-09-26T11:55:54.7349002Z   createdAt: policy.createdAt.toISOString(),
2026-09-26T11:55:54.7349750Z   updatedAt: policy.updatedAt.toISOString(),
2026-09-26T11:55:54.7350376Z });
2026-09-26T11:55:54.7350573Z 
2026-09-26T11:55:54.7350850Z const toInventory = (item: any) => ({
2026-09-26T11:55:54.7351346Z   ...item,
2026-09-26T11:55:54.7351847Z   firstObservedAt: item.firstObservedAt.toISOString(),
2026-09-26T11:55:54.7352290Z   lastObservedAt: item.lastObservedAt.toISOString(),
2026-09-26T11:55:54.7352759Z   lastReceivedAt: item.lastReceivedAt.toISOString(),
2026-09-26T11:55:54.7353068Z });
2026-09-26T11:55:54.7353207Z 
2026-09-26T11:55:54.7353392Z const toAssignment = (assignment: any) => ({
2026-09-26T11:55:54.7353684Z   ...assignment,
2026-09-26T11:55:54.7353980Z   assignedAt: assignment.assignedAt.toISOString(),
2026-09-26T11:55:54.7354385Z   updatedAt: assignment.updatedAt.toISOString(),
2026-09-26T11:55:54.7354686Z });
2026-09-26T11:55:54.7354792Z 
2026-09-26T11:55:54.7354939Z const toSync = (sync: any) =>
2026-09-26T11:55:54.7355198Z   sync === null
2026-09-26T11:55:54.7355402Z     ? null
2026-09-26T11:55:54.7355589Z     : {
2026-09-26T11:55:54.7355780Z         ...sync,
2026-09-26T11:55:54.7356148Z         lastRequestedAt: sync.lastRequestedAt?.toISOString() ?? null,
2026-09-26T11:55:54.7356636Z         lastReportedAt: sync.lastReportedAt?.toISOString() ?? null,
2026-09-26T11:55:54.7357077Z         updatedAt: sync.updatedAt.toISOString(),
2026-09-26T11:55:54.7357432Z       };
2026-09-26T11:55:54.7357542Z 
2026-09-26T11:55:54.7357768Z export const createApplicationManagementController = (
2026-09-26T11:55:54.7358339Z   service: ApplicationManagementService,
2026-09-26T11:55:54.7358644Z   limits: {
2026-09-26T11:55:54.7358880Z     maxInventoryItems: number;
2026-09-26T11:55:54.7359149Z     maxPolicyRules: number;
2026-09-26T11:55:54.7361412Z     maxPayloadBytes: number;
2026-09-26T11:55:54.7361719Z   },
2026-09-26T11:55:54.7361910Z ) => ({
2026-09-26T11:55:54.7362266Z   ingestInventory: (async (req, res, next) => {
2026-09-26T11:55:54.7362715Z     const schema = z
2026-09-26T11:55:54.7362940Z       .object({
2026-09-26T11:55:54.7363186Z         schemaVersion: z.literal(1),
2026-09-26T11:55:54.7363486Z         observedAt: dateField,
2026-09-26T11:55:54.7364175Z         applications: z.array(inventoryItem).max(limits.maxInventoryItems),
2026-09-26T11:55:54.7364882Z       })
2026-09-26T11:55:54.7365222Z       .strict();
2026-09-26T11:55:54.7365707Z     const parsed = schema.safeParse(req.body);
2026-09-26T11:55:54.7366126Z     const session = req.authenticatedDeviceSession;
2026-09-26T11:55:54.7366453Z     if (!session) {
2026-09-26T11:55:54.7366678Z       res.status(401).json({
2026-09-26T11:55:54.7366919Z         error: {
2026-09-26T11:55:54.7367176Z           code: 'DEVICE_SESSION_INVALID',
2026-09-26T11:55:54.7367539Z           message: 'Managed-device session is required.',
2026-09-26T11:55:54.7367848Z         },
2026-09-26T11:55:54.7368085Z         requestId: res.locals.requestId,
2026-09-26T11:55:54.7368356Z       });
2026-09-26T11:55:54.7368550Z       return;
2026-09-26T11:55:54.7368739Z     }
2026-09-26T11:55:54.7368942Z     if (!parsed.success) {
2026-09-26T11:55:54.7369186Z       res.status(400).json({
2026-09-26T11:55:54.7369692Z         error: {
2026-09-26T11:55:54.7369952Z           code: 'INVALID_REQUEST',
2026-09-26T11:55:54.7370330Z           message: 'Invalid application inventory payload.',
2026-09-26T11:55:54.7370643Z         },
2026-09-26T11:55:54.7370882Z         requestId: res.locals.requestId,
2026-09-26T11:55:54.7371148Z       });
2026-09-26T11:55:54.7371334Z       return;
2026-09-26T11:55:54.7371533Z     }
2026-09-26T11:55:54.7371719Z     try {
2026-09-26T11:55:54.7372004Z       const result = await service.reportInventory({
2026-09-26T11:55:54.7372397Z         managedDeviceId: session.managedDeviceId,
2026-09-26T11:55:54.7372938Z         observedAt: parsed.data.observedAt,
2026-09-26T11:55:54.7373262Z         receivedAt: new Date(),
2026-09-26T11:55:54.7373603Z         items: parsed.data.applications.map((item) => ({
2026-09-26T11:55:54.7373972Z           packageName: item.packageName,
2026-09-26T11:55:54.7374278Z           label: item.label ?? null,
2026-09-26T11:55:54.7374595Z           versionName: item.versionName ?? null,
2026-09-26T11:55:54.7374937Z           versionCode: item.versionCode ?? null,
2026-09-26T11:55:54.7375265Z           installState: item.installState,
2026-09-26T11:55:54.7375706Z           enabled: item.enabled ?? null,
2026-09-26T11:55:54.7376300Z           sourceCategory: item.sourceCategory ?? null,
2026-09-26T11:55:54.7376776Z         })),
2026-09-26T11:55:54.7377031Z       });
2026-09-26T11:55:54.7377393Z       res.status(200).json({
2026-09-26T11:55:54.7377827Z         data: {
2026-09-26T11:55:54.7378252Z           accepted: result.applied,
2026-09-26T11:55:54.7378891Z           receivedAt: result.receivedAt.toISOString(),
2026-09-26T11:55:54.7379641Z         },
2026-09-26T11:55:54.7380059Z         requestId: res.locals.requestId,
2026-09-26T11:55:54.7380511Z       });
2026-09-26T11:55:54.7380825Z     } catch (error) {
2026-09-26T11:55:54.7381189Z       next(error);
2026-09-26T11:55:54.7381529Z     }
2026-09-26T11:55:54.7381850Z   }) as RequestHandler,
2026-09-26T11:55:54.7382083Z 
2026-09-26T11:55:54.7382348Z   getDevicePolicy: (async (req, res, next) => {
2026-09-26T11:55:54.7382948Z     if (!req.authenticatedDeviceSession) {
2026-09-26T11:55:54.7383312Z       res.status(401).json({
2026-09-26T11:55:54.7383547Z         error: {
2026-09-26T11:55:54.7383798Z           code: 'DEVICE_SESSION_INVALID',
2026-09-26T11:55:54.7384393Z           message: 'Managed-device session is required.',
2026-09-26T11:55:54.7384711Z         },
2026-09-26T11:55:54.7384947Z         requestId: res.locals.requestId,
2026-09-26T11:55:54.7385208Z       });
2026-09-26T11:55:54.7385390Z       return;
2026-09-26T11:55:54.7385611Z     }
2026-09-26T11:55:54.7385791Z     try {
2026-09-26T11:55:54.7386057Z       const result = await service.getDevicePolicy(
2026-09-26T11:55:54.7386479Z         req.authenticatedDeviceSession.managedDeviceId,
2026-09-26T11:55:54.7386796Z       );
2026-09-26T11:55:54.7387156Z       res.status(200).json({ data: result, requestId: res.locals.requestId });
2026-09-26T11:55:54.7387555Z     } catch (error) {
2026-09-26T11:55:54.7387775Z       next(error);
2026-09-26T11:55:54.7387972Z     }
2026-09-26T11:55:54.7388170Z   }) as RequestHandler,
2026-09-26T11:55:54.7388315Z 
2026-09-26T11:55:54.7388478Z   reportDeviceStatus: (async (req, res, next) => {
2026-09-26T11:55:54.7388791Z     const schema = z
2026-09-26T11:55:54.7389012Z       .object({
2026-09-26T11:55:54.7389936Z         policyId: policyId.nullable(),
2026-09-26T11:55:54.7390645Z         policyVersion: z.number().int().positive().nullable(),
2026-09-26T11:55:54.7391234Z         status: z.enum([
2026-09-26T11:55:54.7391658Z           'UNKNOWN',
2026-09-26T11:55:54.7392040Z           'PENDING',
2026-09-26T11:55:54.7392415Z           'APPLIED',
2026-09-26T11:55:54.7392844Z           'PARTIALLY_APPLIED',
2026-09-26T11:55:54.7393269Z           'FAILED',
2026-09-26T11:55:54.7393608Z           'STALE',
2026-09-26T11:55:54.7393936Z         ]),
2026-09-26T11:55:54.7394311Z         reportedAt: dateField,
2026-09-26T11:55:54.7394865Z         errorCode: z.string().trim().max(128).nullable(),
2026-09-26T11:55:54.7395373Z       })
2026-09-26T11:55:54.7395684Z       .strict();
2026-09-26T11:55:54.7396130Z     const parsed = schema.safeParse(req.body);
2026-09-26T11:55:54.7396763Z     const session = req.authenticatedDeviceSession;
2026-09-26T11:55:54.7397289Z     if (!session) {
2026-09-26T11:55:54.7397648Z       res.status(401).json({
2026-09-26T11:55:54.7398047Z         error: {
2026-09-26T11:55:54.7398464Z           code: 'DEVICE_SESSION_INVALID',
2026-09-26T11:55:54.7398851Z           message: 'Managed-device session is required.',
2026-09-26T11:55:54.7399582Z         },
2026-09-26T11:55:54.7399970Z         requestId: res.locals.requestId,
2026-09-26T11:55:54.7400252Z       });
2026-09-26T11:55:54.7400436Z       return;
2026-09-26T11:55:54.7400640Z     }
2026-09-26T11:55:54.7400847Z     if (!parsed.success) {
2026-09-26T11:55:54.7401090Z       res.status(400).json({
2026-09-26T11:55:54.7401318Z         error: {
2026-09-26T11:55:54.7401563Z           code: 'INVALID_REQUEST',
2026-09-26T11:55:54.7401929Z           message: 'Invalid application policy status payload.',
2026-09-26T11:55:54.7402263Z         },
2026-09-26T11:55:54.7402508Z         requestId: res.locals.requestId,
2026-09-26T11:55:54.7402773Z       });
2026-09-26T11:55:54.7402957Z       return;
2026-09-26T11:55:54.7403156Z     }
2026-09-26T11:55:54.7403334Z     try {
2026-09-26T11:55:54.7403813Z       const result = await service.reportDeviceStatus({
2026-09-26T11:55:54.7404286Z         deviceId: session.managedDeviceId,
2026-09-26T11:55:54.7404592Z         ...parsed.data,
2026-09-26T11:55:54.7404814Z       });
2026-09-26T11:55:54.7405084Z       res
2026-09-26T11:55:54.7405426Z         .status(200)
2026-09-26T11:55:54.7405814Z         .json({
2026-09-26T11:55:54.7406306Z           data: { synchronization: toSync(result) },
2026-09-26T11:55:54.7406928Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7407278Z         });
2026-09-26T11:55:54.7407478Z     } catch (error) {
2026-09-26T11:55:54.7407693Z       next(error);
2026-09-26T11:55:54.7407887Z     }
2026-09-26T11:55:54.7408082Z   }) as RequestHandler,
2026-09-26T11:55:54.7408228Z 
2026-09-26T11:55:54.7408380Z   listInventory: (async (req, res, next) => {
2026-09-26T11:55:54.7408745Z     const p = deviceParam.safeParse(req.params);
2026-09-26T11:55:54.7409112Z     if (!p.success || !req.authenticatedAdmin) {
2026-09-26T11:55:54.7410019Z       res.status(p.success ? 401 : 400).json({
2026-09-26T11:55:54.7410527Z         error: {
2026-09-26T11:55:54.7411107Z           code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST',
2026-09-26T11:55:54.7411742Z           message: p.success
2026-09-26T11:55:54.7412272Z             ? 'Administrator authentication is required.'
2026-09-26T11:55:54.7412863Z             : 'Invalid device identifier.',
2026-09-26T11:55:54.7413310Z         },
2026-09-26T11:55:54.7413711Z         requestId: res.locals.requestId,
2026-09-26T11:55:54.7414027Z       });
2026-09-26T11:55:54.7414218Z       return;
2026-09-26T11:55:54.7414408Z     }
2026-09-26T11:55:54.7414591Z     try {
2026-09-26T11:55:54.7414890Z       const limitRaw = Array.isArray(req.query.limit)
2026-09-26T11:55:54.7415243Z         ? req.query.limit[0]
2026-09-26T11:55:54.7415502Z         : req.query.limit;
2026-09-26T11:55:54.7415804Z       const cursor = Array.isArray(req.query.cursor)
2026-09-26T11:55:54.7416129Z         ? req.query.cursor[0]
2026-09-26T11:55:54.7416380Z         : req.query.cursor;
2026-09-26T11:55:54.7416762Z       const limit = limitRaw === undefined ? undefined : Number(limitRaw);
2026-09-26T11:55:54.7417128Z       if (
2026-09-26T11:55:54.7417409Z         limit !== undefined &&
2026-09-26T11:55:54.7418001Z         (!Number.isInteger(limit) || limit < 1 || limit > 100)
2026-09-26T11:55:54.7418552Z       ) {
2026-09-26T11:55:54.7418856Z         res
2026-09-26T11:55:54.7419186Z           .status(400)
2026-09-26T11:55:54.7419817Z           .json({
2026-09-26T11:55:54.7420201Z             error: {
2026-09-26T11:55:54.7420636Z               code: 'INVALID_REQUEST',
2026-09-26T11:55:54.7421336Z               message: 'Application page limit must be between 1 and 100.',
2026-09-26T11:55:54.7421958Z             },
2026-09-26T11:55:54.7422377Z             requestId: res.locals.requestId,
2026-09-26T11:55:54.7422838Z           });
2026-09-26T11:55:54.7423166Z         return;
2026-09-26T11:55:54.7423486Z       }
2026-09-26T11:55:54.7423921Z       const result = await service.listInventory(
2026-09-26T11:55:54.7424488Z         req.authenticatedAdmin.id,
2026-09-26T11:55:54.7424951Z         p.data.deviceId,
2026-09-26T11:55:54.7425515Z         { limit, cursor: typeof cursor === 'string' ? cursor : null },
2026-09-26T11:55:54.7425872Z       );
2026-09-26T11:55:54.7426076Z       res.status(200).json({
2026-09-26T11:55:54.7426317Z         data: {
2026-09-26T11:55:54.7426602Z           applications: result.items.map(toInventory),
2026-09-26T11:55:54.7426966Z           nextCursor: result.nextCursor,
2026-09-26T11:55:54.7427339Z           observedAt: result.observedAt?.toISOString() ?? null,
2026-09-26T11:55:54.7427781Z           receivedAt: result.receivedAt?.toISOString() ?? null,
2026-09-26T11:55:54.7428151Z           freshness: result.freshness,
2026-09-26T11:55:54.7428414Z         },
2026-09-26T11:55:54.7428647Z         requestId: res.locals.requestId,
2026-09-26T11:55:54.7428911Z       });
2026-09-26T11:55:54.7429117Z     } catch (error) {
2026-09-26T11:55:54.7429617Z       next(error);
2026-09-26T11:55:54.7429852Z     }
2026-09-26T11:55:54.7430067Z   }) as RequestHandler,
2026-09-26T11:55:54.7430219Z 
2026-09-26T11:55:54.7430386Z   getInventoryItem: (async (req, res, next) => {
2026-09-26T11:55:54.7430786Z     const p = applicationParam.safeParse(req.params);
2026-09-26T11:55:54.7431186Z     if (!p.success || !req.authenticatedAdmin) {
2026-09-26T11:55:54.7431536Z       res.status(p.success ? 401 : 400).json({
2026-09-26T11:55:54.7431818Z         error: {
2026-09-26T11:55:54.7432162Z           code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST',
2026-09-26T11:55:54.7432810Z           message: p.success
2026-09-26T11:55:54.7433358Z             ? 'Administrator authentication is required.'
2026-09-26T11:55:54.7433991Z             : 'Invalid application identifier.',
2026-09-26T11:55:54.7434505Z         },
2026-09-26T11:55:54.7434939Z         requestId: res.locals.requestId,
2026-09-26T11:55:54.7435417Z       });
2026-09-26T11:55:54.7435943Z       return;
2026-09-26T11:55:54.7436278Z     }
2026-09-26T11:55:54.7436593Z     try {
2026-09-26T11:55:54.7436951Z       const item = await service.getInventoryItem(
2026-09-26T11:55:54.7437313Z         req.authenticatedAdmin.id,
2026-09-26T11:55:54.7437600Z         p.data.deviceId,
2026-09-26T11:55:54.7437841Z         p.data.packageName,
2026-09-26T11:55:54.7438068Z       );
2026-09-26T11:55:54.7438260Z       if (!item) {
2026-09-26T11:55:54.7438461Z         res
2026-09-26T11:55:54.7438656Z           .status(404)
2026-09-26T11:55:54.7438875Z           .json({
2026-09-26T11:55:54.7439079Z             error: {
2026-09-26T11:55:54.7439583Z               code: 'RESOURCE_NOT_FOUND',
2026-09-26T11:55:54.7440055Z               message: 'Application inventory item was not found.',
2026-09-26T11:55:54.7440393Z             },
2026-09-26T11:55:54.7440646Z             requestId: res.locals.requestId,
2026-09-26T11:55:54.7440921Z           });
2026-09-26T11:55:54.7441114Z         return;
2026-09-26T11:55:54.7441315Z       }
2026-09-26T11:55:54.7441506Z       res
2026-09-26T11:55:54.7441696Z         .status(200)
2026-09-26T11:55:54.7441901Z         .json({
2026-09-26T11:55:54.7442166Z           data: { application: toInventory(item) },
2026-09-26T11:55:54.7442517Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7442782Z         });
2026-09-26T11:55:54.7442976Z     } catch (error) {
2026-09-26T11:55:54.7443197Z       next(error);
2026-09-26T11:55:54.7443400Z     }
2026-09-26T11:55:54.7443599Z   }) as RequestHandler,
2026-09-26T11:55:54.7443746Z 
2026-09-26T11:55:54.7444091Z   requestInventory: (async (req, res, next) => {
2026-09-26T11:55:54.7444460Z     const p = deviceParam.safeParse(req.params);
2026-09-26T11:55:54.7444822Z     if (!p.success || !req.authenticatedAdmin) {
2026-09-26T11:55:54.7445101Z       res
2026-09-26T11:55:54.7445326Z         .status(p.success ? 401 : 400)
2026-09-26T11:55:54.7445727Z         .json({
2026-09-26T11:55:54.7446076Z           error: {
2026-09-26T11:55:54.7446681Z             code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST',
2026-09-26T11:55:54.7447376Z             message: p.success
2026-09-26T11:55:54.7447964Z               ? 'Administrator authentication is required.'
2026-09-26T11:55:54.7448848Z               : 'Invalid device identifier.',
2026-09-26T11:55:54.7449560Z           },
2026-09-26T11:55:54.7449993Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7450470Z         });
2026-09-26T11:55:54.7450677Z       return;
2026-09-26T11:55:54.7450869Z     }
2026-09-26T11:55:54.7451048Z     try {
2026-09-26T11:55:54.7451349Z       const result = await service.requestInventory(
2026-09-26T11:55:54.7451694Z         req.authenticatedAdmin.id,
2026-09-26T11:55:54.7451963Z         p.data.deviceId,
2026-09-26T11:55:54.7452193Z       );
2026-09-26T11:55:54.7452413Z       res
2026-09-26T11:55:54.7452650Z         .status(result.created ? 201 : 200)
2026-09-26T11:55:54.7452929Z         .json({
2026-09-26T11:55:54.7453259Z           data: { command: result.command, created: result.created },
2026-09-26T11:55:54.7453661Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7453934Z         });
2026-09-26T11:55:54.7454124Z     } catch (error) {
2026-09-26T11:55:54.7454357Z       next(error);
2026-09-26T11:55:54.7454555Z     }
2026-09-26T11:55:54.7454752Z   }) as RequestHandler,
2026-09-26T11:55:54.7454894Z 
2026-09-26T11:55:54.7455034Z   createPolicy: (async (req, res, next) => {
2026-09-26T11:55:54.7455326Z     const schema = z
2026-09-26T11:55:54.7455534Z       .object({
2026-09-26T11:55:54.7455783Z         name: z.string().trim().min(1).max(160),
2026-09-26T11:55:54.7456370Z         description: z.string().trim().max(2000).nullable().optional(),
2026-09-26T11:55:54.7456825Z         rules: z.array(rule).max(limits.maxPolicyRules),
2026-09-26T11:55:54.7457141Z       })
2026-09-26T11:55:54.7457337Z       .strict();
2026-09-26T11:55:54.7457601Z     const parsed = schema.safeParse(req.body);
2026-09-26T11:55:54.7458133Z     if (!parsed.success || !req.authenticatedAdmin) {
2026-09-26T11:55:54.7458444Z       res
2026-09-26T11:55:54.7458676Z         .status(parsed.success ? 401 : 400)
2026-09-26T11:55:54.7458942Z         .json({
2026-09-26T11:55:54.7459152Z           error: {
2026-09-26T11:55:54.7459644Z             code: parsed.success
2026-09-26T11:55:54.7459959Z               ? 'AUTHENTICATION_REQUIRED'
2026-09-26T11:55:54.7460344Z               : 'INVALID_REQUEST',
2026-09-26T11:55:54.7460848Z             message: parsed.success
2026-09-26T11:55:54.7461433Z               ? 'Administrator authentication is required.'
2026-09-26T11:55:54.7462111Z               : 'Invalid application policy payload.',
2026-09-26T11:55:54.7462660Z           },
2026-09-26T11:55:54.7463103Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7463590Z         });
2026-09-26T11:55:54.7463927Z       return;
2026-09-26T11:55:54.7464257Z     }
2026-09-26T11:55:54.7464550Z     try {
2026-09-26T11:55:54.7464997Z       const policy = await service.createPolicy({
2026-09-26T11:55:54.7465595Z         adminId: req.authenticatedAdmin.id,
2026-09-26T11:55:54.7465950Z         name: parsed.data.name,
2026-09-26T11:55:54.7466284Z         description: parsed.data.description ?? null,
2026-09-26T11:55:54.7466641Z         rules: parsed.data.rules,
2026-09-26T11:55:54.7467089Z       });
2026-09-26T11:55:54.7467382Z       res
2026-09-26T11:55:54.7467583Z         .status(201)
2026-09-26T11:55:54.7467794Z         .json({
2026-09-26T11:55:54.7468046Z           data: { policy: toPolicy(policy) },
2026-09-26T11:55:54.7468377Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7468648Z         });
2026-09-26T11:55:54.7468842Z     } catch (error) {
2026-09-26T11:55:54.7469053Z       next(error);
2026-09-26T11:55:54.7469252Z     }
2026-09-26T11:55:54.7469769Z   }) as RequestHandler,
2026-09-26T11:55:54.7469945Z 
2026-09-26T11:55:54.7470094Z   listPolicies: (async (req, res, next) => {
2026-09-26T11:55:54.7470440Z     if (!req.authenticatedAdmin) {
2026-09-26T11:55:54.7470705Z       res
2026-09-26T11:55:54.7470897Z         .status(401)
2026-09-26T11:55:54.7471108Z         .json({
2026-09-26T11:55:54.7471308Z           error: {
2026-09-26T11:55:54.7471562Z             code: 'AUTHENTICATION_REQUIRED',
2026-09-26T11:55:54.7472131Z             message: 'Administrator authentication is required.',
2026-09-26T11:55:54.7472456Z           },
2026-09-26T11:55:54.7472694Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7472957Z         });
2026-09-26T11:55:54.7473139Z       return;
2026-09-26T11:55:54.7473322Z     }
2026-09-26T11:55:54.7473505Z     try {
2026-09-26T11:55:54.7473769Z       const cursor = Array.isArray(req.query.cursor)
2026-09-26T11:55:54.7474286Z         ? req.query.cursor[0]
2026-09-26T11:55:54.7474725Z         : req.query.cursor;
2026-09-26T11:55:54.7475264Z       const limitRaw = Array.isArray(req.query.limit)
2026-09-26T11:55:54.7475836Z         ? req.query.limit[0]
2026-09-26T11:55:54.7476286Z         : req.query.limit;
2026-09-26T11:55:54.7476963Z       const limit = limitRaw === undefined ? undefined : Number(limitRaw);
2026-09-26T11:55:54.7477608Z       if (
2026-09-26T11:55:54.7477987Z         limit !== undefined &&
2026-09-26T11:55:54.7478554Z         (!Number.isInteger(limit) || limit < 1 || limit > 100)
2026-09-26T11:55:54.7479005Z       ) {
2026-09-26T11:55:54.7479226Z         res.status(400).json({
2026-09-26T11:55:54.7479771Z           error: {
2026-09-26T11:55:54.7480022Z             code: 'INVALID_REQUEST',
2026-09-26T11:55:54.7480448Z             message: 'Application policy page limit must be between 1 and 100.',
2026-09-26T11:55:54.7480827Z           },
2026-09-26T11:55:54.7481079Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7481347Z         });
2026-09-26T11:55:54.7481541Z         return;
2026-09-26T11:55:54.7481739Z       }
2026-09-26T11:55:54.7482085Z       const result = await service.listPolicies(req.authenticatedAdmin.id, {
2026-09-26T11:55:54.7482469Z         limit,
2026-09-26T11:55:54.7482924Z         cursor: typeof cursor === 'string' ? cursor : null,
2026-09-26T11:55:54.7483241Z       });
2026-09-26T11:55:54.7483423Z       res
2026-09-26T11:55:54.7483611Z         .status(200)
2026-09-26T11:55:54.7483825Z         .json({
2026-09-26T11:55:54.7484024Z           data: {
2026-09-26T11:55:54.7484286Z             policies: result.items.map(toPolicy),
2026-09-26T11:55:54.7484626Z             nextCursor: result.nextCursor,
2026-09-26T11:55:54.7484888Z           },
2026-09-26T11:55:54.7485123Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7485385Z         });
2026-09-26T11:55:54.7485575Z     } catch (error) {
2026-09-26T11:55:54.7485788Z       next(error);
2026-09-26T11:55:54.7485986Z     }
2026-09-26T11:55:54.7486174Z   }) as RequestHandler,
2026-09-26T11:55:54.7486308Z 
2026-09-26T11:55:54.7486441Z   getPolicy: (async (req, res, next) => {
2026-09-26T11:55:54.7486780Z     const p = policyParam.safeParse(req.params);
2026-09-26T11:55:54.7487135Z     if (!p.success || !req.authenticatedAdmin) {
2026-09-26T11:55:54.7487424Z       res
2026-09-26T11:55:54.7487726Z         .status(p.success ? 401 : 400)
2026-09-26T11:55:54.7488178Z         .json({
2026-09-26T11:55:54.7488657Z           error: {
2026-09-26T11:55:54.7489304Z             code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST',
2026-09-26T11:55:54.7490288Z             message: p.success
2026-09-26T11:55:54.7490877Z               ? 'Administrator authentication is required.'
2026-09-26T11:55:54.7491502Z               : 'Invalid policy identifier.',
2026-09-26T11:55:54.7491979Z           },
2026-09-26T11:55:54.7492409Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7492890Z         });
2026-09-26T11:55:54.7493214Z       return;
2026-09-26T11:55:54.7493532Z     }
2026-09-26T11:55:54.7493820Z     try {
2026-09-26T11:55:54.7494192Z       const policy = await service.getPolicy(
2026-09-26T11:55:54.7494529Z         req.authenticatedAdmin.id,
2026-09-26T11:55:54.7494802Z         p.data.policyId,
2026-09-26T11:55:54.7495023Z       );
2026-09-26T11:55:54.7495210Z       res
2026-09-26T11:55:54.7520433Z         .status(200)
2026-09-26T11:55:54.7520888Z         .json({
2026-09-26T11:55:54.7521359Z           data: { policy: toPolicy(policy) },
2026-09-26T11:55:54.7522142Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7522584Z         });
2026-09-26T11:55:54.7522920Z     } catch (error) {
2026-09-26T11:55:54.7523307Z       next(error);
2026-09-26T11:55:54.7523635Z     }
2026-09-26T11:55:54.7523959Z   }) as RequestHandler,
2026-09-26T11:55:54.7524134Z 
2026-09-26T11:55:54.7524293Z   updatePolicy: (async (req, res, next) => {
2026-09-26T11:55:54.7524661Z     const p = policyParam.safeParse(req.params);
2026-09-26T11:55:54.7524979Z     const schema = z
2026-09-26T11:55:54.7525215Z       .object({
2026-09-26T11:55:54.7525476Z         name: z.string().trim().min(1).max(160),
2026-09-26T11:55:54.7525905Z         description: z.string().trim().max(2000).nullable().optional(),
2026-09-26T11:55:54.7526355Z         status: z.enum(['ACTIVE', 'DISABLED']),
2026-09-26T11:55:54.7526724Z         expectedVersion: z.number().int().positive(),
2026-09-26T11:55:54.7527135Z         rules: z.array(rule).max(limits.maxPolicyRules),
2026-09-26T11:55:54.7527460Z       })
2026-09-26T11:55:54.7527658Z       .strict();
2026-09-26T11:55:54.7527927Z     const parsed = schema.safeParse(req.body);
2026-09-26T11:55:54.7528370Z     if (!p.success || !parsed.success || !req.authenticatedAdmin) {
2026-09-26T11:55:54.7528721Z       res
2026-09-26T11:55:54.7529005Z         .status(p.success && parsed.success ? 401 : 400)
2026-09-26T11:55:54.7529560Z         .json({
2026-09-26T11:55:54.7529845Z           error: {
2026-09-26T11:55:54.7530060Z             code:
2026-09-26T11:55:54.7530313Z               p.success && parsed.success
2026-09-26T11:55:54.7530640Z                 ? 'AUTHENTICATION_REQUIRED'
2026-09-26T11:55:54.7530953Z                 : 'INVALID_REQUEST',
2026-09-26T11:55:54.7531209Z             message:
2026-09-26T11:55:54.7531741Z               p.success && parsed.success
2026-09-26T11:55:54.7532136Z                 ? 'Administrator authentication is required.'
2026-09-26T11:55:54.7532525Z                 : 'Invalid application policy update.',
2026-09-26T11:55:54.7532827Z           },
2026-09-26T11:55:54.7533102Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7533372Z         });
2026-09-26T11:55:54.7533553Z       return;
2026-09-26T11:55:54.7533749Z     }
2026-09-26T11:55:54.7533933Z     try {
2026-09-26T11:55:54.7534195Z       const policy = await service.updatePolicy({
2026-09-26T11:55:54.7534561Z         adminId: req.authenticatedAdmin.id,
2026-09-26T11:55:54.7534887Z         policyId: p.data.policyId,
2026-09-26T11:55:54.7535185Z         name: parsed.data.name,
2026-09-26T11:55:54.7535527Z         description: parsed.data.description ?? null,
2026-09-26T11:55:54.7535889Z         status: parsed.data.status,
2026-09-26T11:55:54.7536242Z         expectedVersion: parsed.data.expectedVersion,
2026-09-26T11:55:54.7536608Z         rules: parsed.data.rules,
2026-09-26T11:55:54.7536859Z       });
2026-09-26T11:55:54.7537050Z       res
2026-09-26T11:55:54.7537246Z         .status(200)
2026-09-26T11:55:54.7537461Z         .json({
2026-09-26T11:55:54.7537727Z           data: { policy: toPolicy(policy) },
2026-09-26T11:55:54.7538066Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7538345Z         });
2026-09-26T11:55:54.7538548Z     } catch (error) {
2026-09-26T11:55:54.7538770Z       next(error);
2026-09-26T11:55:54.7538976Z     }
2026-09-26T11:55:54.7539176Z   }) as RequestHandler,
2026-09-26T11:55:54.7539572Z 
2026-09-26T11:55:54.7539786Z   assignPolicy: (async (req, res, next) => {
2026-09-26T11:55:54.7540167Z     const p = deviceParam.safeParse(req.params);
2026-09-26T11:55:54.7540593Z     const b = z.object({ policyId }).strict().safeParse(req.body);
2026-09-26T11:55:54.7541049Z     if (!p.success || !b.success || !req.authenticatedAdmin) {
2026-09-26T11:55:54.7541379Z       res
2026-09-26T11:55:54.7541659Z         .status(p.success && b.success ? 401 : 400)
2026-09-26T11:55:54.7541947Z         .json({
2026-09-26T11:55:54.7542151Z           error: {
2026-09-26T11:55:54.7542358Z             code:
2026-09-26T11:55:54.7542595Z               p.success && b.success
2026-09-26T11:55:54.7543250Z                 ? 'AUTHENTICATION_REQUIRED'
2026-09-26T11:55:54.7543558Z                 : 'INVALID_REQUEST',
2026-09-26T11:55:54.7543816Z             message:
2026-09-26T11:55:54.7544054Z               p.success && b.success
2026-09-26T11:55:54.7544393Z                 ? 'Administrator authentication is required.'
2026-09-26T11:55:54.7544758Z                 : 'Invalid policy assignment.',
2026-09-26T11:55:54.7545039Z           },
2026-09-26T11:55:54.7545291Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7545562Z         });
2026-09-26T11:55:54.7545750Z       return;
2026-09-26T11:55:54.7545942Z     }
2026-09-26T11:55:54.7546123Z     try {
2026-09-26T11:55:54.7546375Z       const result = await service.assignPolicy(
2026-09-26T11:55:54.7546715Z         req.authenticatedAdmin.id,
2026-09-26T11:55:54.7546991Z         p.data.deviceId,
2026-09-26T11:55:54.7547236Z         b.data.policyId,
2026-09-26T11:55:54.7547463Z       );
2026-09-26T11:55:54.7547655Z       res
2026-09-26T11:55:54.7547851Z         .status(200)
2026-09-26T11:55:54.7548059Z         .json({
2026-09-26T11:55:54.7548264Z           data: {
2026-09-26T11:55:54.7548550Z             assignment: toAssignment(result.assignment),
2026-09-26T11:55:54.7548897Z             synchronization: {
2026-09-26T11:55:54.7549186Z               command: result.sync.command,
2026-09-26T11:55:54.7549784Z               state: toSync(result.sync.sync),
2026-09-26T11:55:54.7550078Z             },
2026-09-26T11:55:54.7550285Z           },
2026-09-26T11:55:54.7550531Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7550801Z         });
2026-09-26T11:55:54.7550995Z     } catch (error) {
2026-09-26T11:55:54.7551210Z       next(error);
2026-09-26T11:55:54.7551415Z     }
2026-09-26T11:55:54.7551741Z   }) as RequestHandler,
2026-09-26T11:55:54.7551886Z 
2026-09-26T11:55:54.7552035Z   removePolicy: (async (req, res, next) => {
2026-09-26T11:55:54.7552443Z     const p = deviceParam.safeParse(req.params);
2026-09-26T11:55:54.7552881Z     const b = z.object({ policyId }).strict().safeParse(req.body);
2026-09-26T11:55:54.7553333Z     if (!p.success || !b.success || !req.authenticatedAdmin) {
2026-09-26T11:55:54.7553656Z       res
2026-09-26T11:55:54.7553917Z         .status(p.success && b.success ? 401 : 400)
2026-09-26T11:55:54.7554206Z         .json({
2026-09-26T11:55:54.7554406Z           error: {
2026-09-26T11:55:54.7554607Z             code:
2026-09-26T11:55:54.7554842Z               p.success && b.success
2026-09-26T11:55:54.7555150Z                 ? 'AUTHENTICATION_REQUIRED'
2026-09-26T11:55:54.7555459Z                 : 'INVALID_REQUEST',
2026-09-26T11:55:54.7555708Z             message:
2026-09-26T11:55:54.7555944Z               p.success && b.success
2026-09-26T11:55:54.7556291Z                 ? 'Administrator authentication is required.'
2026-09-26T11:55:54.7556645Z                 : 'Invalid policy removal.',
2026-09-26T11:55:54.7556922Z           },
2026-09-26T11:55:54.7557162Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7557431Z         });
2026-09-26T11:55:54.7557613Z       return;
2026-09-26T11:55:54.7557804Z     }
2026-09-26T11:55:54.7557981Z     try {
2026-09-26T11:55:54.7558229Z       const result = await service.removePolicy(
2026-09-26T11:55:54.7558561Z         req.authenticatedAdmin.id,
2026-09-26T11:55:54.7558831Z         p.data.deviceId,
2026-09-26T11:55:54.7559059Z         b.data.policyId,
2026-09-26T11:55:54.7559279Z       );
2026-09-26T11:55:54.7559695Z       res
2026-09-26T11:55:54.7559901Z         .status(200)
2026-09-26T11:55:54.7560111Z         .json({
2026-09-26T11:55:54.7560319Z           data: {
2026-09-26T11:55:54.7560554Z             removed: result.removed,
2026-09-26T11:55:54.7560844Z             synchronization: {
2026-09-26T11:55:54.7561150Z               command: result.sync.command,
2026-09-26T11:55:54.7561482Z               state: toSync(result.sync.sync),
2026-09-26T11:55:54.7561771Z             },
2026-09-26T11:55:54.7561964Z           },
2026-09-26T11:55:54.7562426Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7562694Z         });
2026-09-26T11:55:54.7562881Z     } catch (error) {
2026-09-26T11:55:54.7563086Z       next(error);
2026-09-26T11:55:54.7563284Z     }
2026-09-26T11:55:54.7563493Z   }) as RequestHandler,
2026-09-26T11:55:54.7563631Z 
2026-09-26T11:55:54.7563784Z   effectivePolicy: (async (req, res, next) => {
2026-09-26T11:55:54.7564147Z     const p = deviceParam.safeParse(req.params);
2026-09-26T11:55:54.7564500Z     if (!p.success || !req.authenticatedAdmin) {
2026-09-26T11:55:54.7564778Z       res
2026-09-26T11:55:54.7565003Z         .status(p.success ? 401 : 400)
2026-09-26T11:55:54.7565263Z         .json({
2026-09-26T11:55:54.7565454Z           error: {
2026-09-26T11:55:54.7565804Z             code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST',
2026-09-26T11:55:54.7566195Z             message: p.success
2026-09-26T11:55:54.7566514Z               ? 'Administrator authentication is required.'
2026-09-26T11:55:54.7566879Z               : 'Invalid device identifier.',
2026-09-26T11:55:54.7567146Z           },
2026-09-26T11:55:54.7567383Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7567645Z         });
2026-09-26T11:55:54.7567835Z       return;
2026-09-26T11:55:54.7568019Z     }
2026-09-26T11:55:54.7568197Z     try {
2026-09-26T11:55:54.7568370Z       res
2026-09-26T11:55:54.7568552Z         .status(200)
2026-09-26T11:55:54.7568767Z         .json({
2026-09-26T11:55:54.7569026Z           data: await service.getEffectivePolicy(
2026-09-26T11:55:54.7569580Z             req.authenticatedAdmin.id,
2026-09-26T11:55:54.7569875Z             p.data.deviceId,
2026-09-26T11:55:54.7570106Z           ),
2026-09-26T11:55:54.7570344Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7570739Z         });
2026-09-26T11:55:54.7570941Z     } catch (error) {
2026-09-26T11:55:54.7571154Z       next(error);
2026-09-26T11:55:54.7571350Z     }
2026-09-26T11:55:54.7571546Z   }) as RequestHandler,
2026-09-26T11:55:54.7571689Z 
2026-09-26T11:55:54.7571849Z   enforcementStatus: (async (req, res, next) => {
2026-09-26T11:55:54.7572218Z     const p = deviceParam.safeParse(req.params);
2026-09-26T11:55:54.7572574Z     if (!p.success || !req.authenticatedAdmin) {
2026-09-26T11:55:54.7572853Z       res
2026-09-26T11:55:54.7573081Z         .status(p.success ? 401 : 400)
2026-09-26T11:55:54.7573337Z         .json({
2026-09-26T11:55:54.7573546Z           error: {
2026-09-26T11:55:54.7573881Z             code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST',
2026-09-26T11:55:54.7574265Z             message: p.success
2026-09-26T11:55:54.7574582Z               ? 'Administrator authentication is required.'
2026-09-26T11:55:54.7574933Z               : 'Invalid device identifier.',
2026-09-26T11:55:54.7575200Z           },
2026-09-26T11:55:54.7575430Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7575684Z         });
2026-09-26T11:55:54.7575859Z       return;
2026-09-26T11:55:54.7576035Z     }
2026-09-26T11:55:54.7576213Z     try {
2026-09-26T11:55:54.7576391Z       res
2026-09-26T11:55:54.7576572Z         .status(200)
2026-09-26T11:55:54.7576773Z         .json({
2026-09-26T11:55:54.7576962Z           data: {
2026-09-26T11:55:54.7577192Z             synchronization: toSync(
2026-09-26T11:55:54.7577509Z               await service.getEnforcementStatus(
2026-09-26T11:55:54.7577848Z                 req.authenticatedAdmin.id,
2026-09-26T11:55:54.7578145Z                 p.data.deviceId,
2026-09-26T11:55:54.7578381Z               ),
2026-09-26T11:55:54.7578571Z             ),
2026-09-26T11:55:54.7578756Z           },
2026-09-26T11:55:54.7578986Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7579249Z         });
2026-09-26T11:55:54.7579743Z     } catch (error) {
2026-09-26T11:55:54.7579980Z       next(error);
2026-09-26T11:55:54.7580179Z     }
2026-09-26T11:55:54.7580371Z   }) as RequestHandler,
2026-09-26T11:55:54.7580513Z 
2026-09-26T11:55:54.7580648Z   syncPolicy: (async (req, res, next) => {
2026-09-26T11:55:54.7581165Z     const p = deviceParam.safeParse(req.params);
2026-09-26T11:55:54.7581526Z     if (!p.success || !req.authenticatedAdmin) {
2026-09-26T11:55:54.7581806Z       res
2026-09-26T11:55:54.7582026Z         .status(p.success ? 401 : 400)
2026-09-26T11:55:54.7582281Z         .json({
2026-09-26T11:55:54.7582476Z           error: {
2026-09-26T11:55:54.7582820Z             code: p.success ? 'AUTHENTICATION_REQUIRED' : 'INVALID_REQUEST',
2026-09-26T11:55:54.7583210Z             message: p.success
2026-09-26T11:55:54.7583528Z               ? 'Administrator authentication is required.'
2026-09-26T11:55:54.7583889Z               : 'Invalid device identifier.',
2026-09-26T11:55:54.7584152Z           },
2026-09-26T11:55:54.7584391Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7584654Z         });
2026-09-26T11:55:54.7584832Z       return;
2026-09-26T11:55:54.7585016Z     }
2026-09-26T11:55:54.7585189Z     try {
2026-09-26T11:55:54.7585468Z       const effective = await service.getEffectivePolicy(
2026-09-26T11:55:54.7585840Z         req.authenticatedAdmin.id,
2026-09-26T11:55:54.7586105Z         p.data.deviceId,
2026-09-26T11:55:54.7586321Z       );
2026-09-26T11:55:54.7586581Z       const result = await service.requestPolicySync(
2026-09-26T11:55:54.7586915Z         req.authenticatedAdmin.id,
2026-09-26T11:55:54.7587165Z         p.data.deviceId,
2026-09-26T11:55:54.7587422Z         effective.policy?.id ?? null,
2026-09-26T11:55:54.7587721Z         effective.policy?.version ?? null,
2026-09-26T11:55:54.7587974Z       );
2026-09-26T11:55:54.7588146Z       res
2026-09-26T11:55:54.7588392Z         .status(result.command.created ? 201 : 200)
2026-09-26T11:55:54.7588679Z         .json({
2026-09-26T11:55:54.7588872Z           data: {
2026-09-26T11:55:54.7589238Z             command: result.command.command,
2026-09-26T11:55:54.7589851Z             synchronization: toSync(result.sync),
2026-09-26T11:55:54.7590144Z           },
2026-09-26T11:55:54.7590384Z           requestId: res.locals.requestId,
2026-09-26T11:55:54.7590652Z         });
2026-09-26T11:55:54.7590839Z     } catch (error) {
2026-09-26T11:55:54.7591053Z       next(error);
2026-09-26T11:55:54.7591244Z     }
2026-09-26T11:55:54.7591436Z   }) as RequestHandler,
2026-09-26T11:55:54.7591648Z });
2026-09-26T11:55:54.7591924Z ===== src/domain/application-management.ts =====
2026-09-26T11:55:54.7592400Z export const APPLICATION_RULE_ACTIONS = ['ALLOW', 'BLOCK'] as const;
2026-09-26T11:55:54.7592997Z export type ApplicationRuleAction = (typeof APPLICATION_RULE_ACTIONS)[number];
2026-09-26T11:55:54.7593327Z 
2026-09-26T11:55:54.7593619Z export const APPLICATION_POLICY_STATUSES = ['ACTIVE', 'DISABLED'] as const;
2026-09-26T11:55:54.7594085Z export type ApplicationPolicyStatus =
2026-09-26T11:55:54.7594431Z   (typeof APPLICATION_POLICY_STATUSES)[number];
2026-09-26T11:55:54.7594644Z 
2026-09-26T11:55:54.7594821Z export const APPLICATION_ENFORCEMENT_STATUSES = [
2026-09-26T11:55:54.7595123Z   'UNKNOWN',
2026-09-26T11:55:54.7595310Z   'PENDING',
2026-09-26T11:55:54.7595505Z   'APPLIED',
2026-09-26T11:55:54.7595704Z   'PARTIALLY_APPLIED',
2026-09-26T11:55:54.7595916Z   'FAILED',
2026-09-26T11:55:54.7596098Z   'STALE',
2026-09-26T11:55:54.7596279Z ] as const;
2026-09-26T11:55:54.7596550Z export type ApplicationEnforcementStatus =
2026-09-26T11:55:54.7596917Z   (typeof APPLICATION_ENFORCEMENT_STATUSES)[number];
2026-09-26T11:55:54.7597137Z 
2026-09-26T11:55:54.7597291Z export type ApplicationInstallState =
2026-09-26T11:55:54.7597630Z   'INSTALLED' | 'UPDATED' | 'UNINSTALLED' | 'UNKNOWN';
2026-09-26T11:55:54.7597851Z 
2026-09-26T11:55:54.7598014Z export interface ApplicationInventoryItem {
2026-09-26T11:55:54.7598344Z   readonly managedDeviceId: string;
2026-09-26T11:55:54.7598632Z   readonly packageName: string;
2026-09-26T11:55:54.7598913Z   readonly label: string | null;
2026-09-26T11:55:54.7599199Z   readonly versionName: string | null;
2026-09-26T11:55:54.7599723Z   readonly versionCode: number | null;
2026-09-26T11:55:54.7600079Z   readonly installState: ApplicationInstallState;
2026-09-26T11:55:54.7600561Z   readonly enabled: boolean | null;
2026-09-26T11:55:54.7600857Z   readonly firstObservedAt: Date;
2026-09-26T11:55:54.7601147Z   readonly lastObservedAt: Date;
2026-09-26T11:55:54.7601428Z   readonly lastReceivedAt: Date;
2026-09-26T11:55:54.7601719Z   readonly sourceCategory: string | null;
2026-09-26T11:55:54.7601987Z }
2026-09-26T11:55:54.7602083Z 
2026-09-26T11:55:54.7602246Z export interface ApplicationPolicyRule {
2026-09-26T11:55:54.7602543Z   readonly policyId: string;
2026-09-26T11:55:54.7602813Z   readonly packageName: string;
2026-09-26T11:55:54.7603101Z   readonly action: ApplicationRuleAction;
2026-09-26T11:55:54.7603360Z }
2026-09-26T11:55:54.7603456Z 
2026-09-26T11:55:54.7603606Z export interface ApplicationPolicy {
2026-09-26T11:55:54.7603879Z   readonly id: string;
2026-09-26T11:55:54.7604106Z   readonly adminId: string;
2026-09-26T11:55:54.7604343Z   readonly name: string;
2026-09-26T11:55:54.7604609Z   readonly description: string | null;
2026-09-26T11:55:54.7604932Z   readonly status: ApplicationPolicyStatus;
2026-09-26T11:55:54.7605230Z   readonly version: number;
2026-09-26T11:55:54.7605474Z   readonly createdAt: Date;
2026-09-26T11:55:54.7605716Z   readonly updatedAt: Date;
2026-09-26T11:55:54.7605958Z   readonly createdBy: string;
2026-09-26T11:55:54.7606208Z   readonly updatedBy: string;
2026-09-26T11:55:54.7606530Z   readonly rules: readonly ApplicationPolicyRule[];
2026-09-26T11:55:54.7606841Z }
2026-09-26T11:55:54.7606938Z 
2026-09-26T11:55:54.7607126Z export interface ApplicationPolicyAssignment {
2026-09-26T11:55:54.7607472Z   readonly managedDeviceId: string;
2026-09-26T11:55:54.7607743Z   readonly policyId: string;
2026-09-26T11:55:54.7608009Z   readonly policyVersion: number;
2026-09-26T11:55:54.7608388Z   readonly assignedAt: Date;
2026-09-26T11:55:54.7608646Z   readonly updatedAt: Date;
2026-09-26T11:55:54.7608905Z   readonly assignedBy: string;
2026-09-26T11:55:54.7609135Z }
2026-09-26T11:55:54.7609233Z 
2026-09-26T11:55:54.7609624Z export interface ApplicationPolicySyncState {
2026-09-26T11:55:54.7609981Z   readonly managedDeviceId: string;
2026-09-26T11:55:54.7610302Z   readonly desiredPolicyId: string | null;
2026-09-26T11:55:54.7610646Z   readonly desiredPolicyVersion: number | null;
2026-09-26T11:55:54.7610992Z   readonly reportedPolicyId: string | null;
2026-09-26T11:55:54.7611343Z   readonly reportedPolicyVersion: number | null;
2026-09-26T11:55:54.7611711Z   readonly status: ApplicationEnforcementStatus;
2026-09-26T11:55:54.7612054Z   readonly lastRequestedAt: Date | null;
2026-09-26T11:55:54.7612376Z   readonly lastReportedAt: Date | null;
2026-09-26T11:55:54.7612686Z   readonly lastErrorCode: string | null;
2026-09-26T11:55:54.7612970Z   readonly updatedAt: Date;
2026-09-26T11:55:54.7613196Z }
2026-09-26T11:55:54.7613307Z 
2026-09-26T11:55:54.7613579Z export const isValidAndroidPackageName = (value: string): boolean =>
2026-09-26T11:55:54.7614089Z   /^[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(value) &&
2026-09-26T11:55:54.7614446Z   value.length <= 255;
2026-09-26T11:55:54.7614829Z ===== src/repositories/application-inventory-repository.ts =====
2026-09-26T11:55:54.7615436Z import type { ApplicationInventoryItem } from '../domain/application-management.js';
2026-09-26T11:55:54.7615974Z import type { Repository } from './repository.js';
2026-09-26T11:55:54.7616199Z 
2026-09-26T11:55:54.7616473Z export interface ApplicationInventoryRepository extends Repository {
2026-09-26T11:55:54.7616867Z   replaceForDevice(input: {
2026-09-26T11:55:54.7617117Z     managedDeviceId: string;
2026-09-26T11:55:54.7617362Z     observedAt: Date;
2026-09-26T11:55:54.7617580Z     receivedAt: Date;
2026-09-26T11:55:54.7617800Z     items: readonly Omit<
2026-09-26T11:55:54.7618075Z       ApplicationInventoryItem,
2026-09-26T11:55:54.7618335Z       | 'managedDeviceId'
2026-09-26T11:55:54.7618568Z       | 'firstObservedAt'
2026-09-26T11:55:54.7618799Z       | 'lastObservedAt'
2026-09-26T11:55:54.7619030Z       | 'lastReceivedAt'
2026-09-26T11:55:54.7619648Z     >[];
2026-09-26T11:55:54.7619982Z   }): Promise<{ applied: boolean; receivedAt: Date }>;
2026-09-26T11:55:54.7620314Z   listForAdmin(
2026-09-26T11:55:54.7620522Z     adminId: string,
2026-09-26T11:55:54.7620745Z     managedDeviceId: string,
2026-09-26T11:55:54.7621055Z     page?: { limit?: number; cursor?: string | null },
2026-09-26T11:55:54.7621354Z   ): Promise<{
2026-09-26T11:55:54.7621606Z     items: ApplicationInventoryItem[];
2026-09-26T11:55:54.7621908Z     nextCursor: string | null;
2026-09-26T11:55:54.7622154Z     observedAt: Date | null;
2026-09-26T11:55:54.7622399Z     receivedAt: Date | null;
2026-09-26T11:55:54.7622621Z   }>;
2026-09-26T11:55:54.7622804Z   findForAdmin(
2026-09-26T11:55:54.7623011Z     adminId: string,
2026-09-26T11:55:54.7623245Z     managedDeviceId: string,
2026-09-26T11:55:54.7623490Z     packageName: string,
2026-09-26T11:55:54.7623781Z   ): Promise<ApplicationInventoryItem | null>;
2026-09-26T11:55:54.7624068Z }
2026-09-26T11:55:54.7624410Z ===== src/repositories/application-policy-repository.ts =====
2026-09-26T11:55:54.7624756Z import type {
2026-09-26T11:55:54.7624967Z   ApplicationPolicy,
2026-09-26T11:55:54.7625225Z   ApplicationPolicyAssignment,
2026-09-26T11:55:54.7625491Z   ApplicationPolicySyncState,
2026-09-26T11:55:54.7625749Z   ApplicationRuleAction,
2026-09-26T11:55:54.7626067Z } from '../domain/application-management.js';
2026-09-26T11:55:54.7626462Z import type { Repository } from './repository.js';
2026-09-26T11:55:54.7626688Z 
2026-09-26T11:55:54.7626954Z export interface ApplicationPolicyRepository extends Repository {
2026-09-26T11:55:54.7627326Z   create(input: {
2026-09-26T11:55:54.7627530Z     id: string;
2026-09-26T11:55:54.7627732Z     adminId: string;
2026-09-26T11:55:54.7627940Z     name: string;
2026-09-26T11:55:54.7628309Z     description: string | null;
2026-09-26T11:55:54.7628581Z     createdBy: string;
2026-09-26T11:55:54.7628970Z     rules: readonly { packageName: string; action: ApplicationRuleAction }[];
2026-09-26T11:55:54.7629742Z   }): Promise<ApplicationPolicy>;
2026-09-26T11:55:54.7630194Z   findOwned(id: string, adminId: string): Promise<ApplicationPolicy | null>;
2026-09-26T11:55:54.7630584Z   listOwned(
2026-09-26T11:55:54.7630791Z     adminId: string,
2026-09-26T11:55:54.7631078Z     page?: { limit?: number; cursor?: string | null },
2026-09-26T11:55:54.7631537Z   ): Promise<{ items: ApplicationPolicy[]; nextCursor: string | null }>;
2026-09-26T11:55:54.7631920Z   updateOwned(input: {
2026-09-26T11:55:54.7632131Z     id: string;
2026-09-26T11:55:54.7632333Z     adminId: string;
2026-09-26T11:55:54.7632536Z     name: string;
2026-09-26T11:55:54.7632761Z     description: string | null;
2026-09-26T11:55:54.7633031Z     status: 'ACTIVE' | 'DISABLED';
2026-09-26T11:55:54.7633301Z     expectedVersion: number;
2026-09-26T11:55:54.7633544Z     updatedBy: string;
2026-09-26T11:55:54.7633922Z     rules: readonly { packageName: string; action: ApplicationRuleAction }[];
2026-09-26T11:55:54.7634358Z   }): Promise<ApplicationPolicy>;
2026-09-26T11:55:54.7634618Z   disableOwned(
2026-09-26T11:55:54.7634813Z     id: string,
2026-09-26T11:55:54.7635010Z     adminId: string,
2026-09-26T11:55:54.7635230Z     expectedVersion: number,
2026-09-26T11:55:54.7635471Z     updatedBy: string,
2026-09-26T11:55:54.7635726Z   ): Promise<ApplicationPolicy>;
2026-09-26T11:55:54.7635993Z   listAssignmentsForPolicy(
2026-09-26T11:55:54.7636238Z     policyId: string,
2026-09-26T11:55:54.7636516Z   ): Promise<ApplicationPolicyAssignment[]>;
2026-09-26T11:55:54.7636803Z   assign(input: {
2026-09-26T11:55:54.7637019Z     managedDeviceId: string;
2026-09-26T11:55:54.7637260Z     policyId: string;
2026-09-26T11:55:54.7637481Z     policyVersion: number;
2026-09-26T11:55:54.7637714Z     assignedBy: string;
2026-09-26T11:55:54.7638000Z   }): Promise<ApplicationPolicyAssignment>;
2026-09-26T11:55:54.7638465Z   removeAssignment(managedDeviceId: string, policyId: string): Promise<void>;
2026-09-26T11:55:54.7638865Z   findAssignment(
2026-09-26T11:55:54.7639226Z     managedDeviceId: string,
2026-09-26T11:55:54.7639771Z   ): Promise<ApplicationPolicyAssignment | null>;
2026-09-26T11:55:54.7640086Z   findSyncState(
2026-09-26T11:55:54.7640309Z     managedDeviceId: string,
2026-09-26T11:55:54.7640616Z   ): Promise<ApplicationPolicySyncState | null>;
2026-09-26T11:55:54.7640931Z   setSyncRequested(input: {
2026-09-26T11:55:54.7641186Z     managedDeviceId: string;
2026-09-26T11:55:54.7641427Z     policyId: string | null;
2026-09-26T11:55:54.7641694Z     policyVersion: number | null;
2026-09-26T11:55:54.7641947Z     requestedAt: Date;
2026-09-26T11:55:54.7642223Z   }): Promise<ApplicationPolicySyncState>;
2026-09-26T11:55:54.7642512Z   reportSync(input: {
2026-09-26T11:55:54.7642748Z     managedDeviceId: string;
2026-09-26T11:55:54.7642996Z     policyId: string | null;
2026-09-26T11:55:54.7643263Z     policyVersion: number | null;
2026-09-26T11:55:54.7643508Z     status:
2026-09-26T11:55:54.7643695Z       | 'UNKNOWN'
2026-09-26T11:55:54.7643889Z       | 'PENDING'
2026-09-26T11:55:54.7644100Z       | 'APPLIED'
2026-09-26T11:55:54.7644307Z       | 'PARTIALLY_APPLIED'
2026-09-26T11:55:54.7644532Z       | 'FAILED'
2026-09-26T11:55:54.7644725Z       | 'STALE';
2026-09-26T11:55:54.7644923Z     reportedAt: Date;
2026-09-26T11:55:54.7645144Z     errorCode: string | null;
2026-09-26T11:55:54.7645442Z   }): Promise<ApplicationPolicySyncState>;
2026-09-26T11:55:54.7645718Z }
2026-09-26T11:55:54.7646110Z ===== src/repositories/postgres-application-inventory-repository.ts =====
2026-09-26T11:55:54.7646583Z import type { QueryResultRow } from 'pg';
2026-09-26T11:55:54.7647111Z import type { ApplicationInventoryItem } from '../domain/application-management.js';
2026-09-26T11:55:54.7647718Z import { PersistenceError } from '../domain/persistence-errors.js';
2026-09-26T11:55:54.7648509Z import type { ApplicationInventoryRepository } from './application-inventory-repository.js';
2026-09-26T11:55:54.7649150Z import { PostgresRepository } from './postgres-repository.js';
2026-09-26T11:55:54.7649637Z 
2026-09-26T11:55:54.7649808Z interface Row extends QueryResultRow {
2026-09-26T11:55:54.7650092Z   managed_device_id: string;
2026-09-26T11:55:54.7650335Z   package_name: string;
2026-09-26T11:55:54.7650573Z   label: string | null;
2026-09-26T11:55:54.7650823Z   version_name: string | null;
2026-09-26T11:55:54.7651102Z   version_code: string | number | null;
2026-09-26T11:55:54.7651483Z   install_state: ApplicationInventoryItem['installState'];
2026-09-26T11:55:54.7651830Z   enabled: boolean | null;
2026-09-26T11:55:54.7652070Z   first_observed_at: Date;
2026-09-26T11:55:54.7652317Z   last_observed_at: Date;
2026-09-26T11:55:54.7652586Z   last_received_at: Date;
2026-09-26T11:55:54.7652845Z   source_category: string | null;
2026-09-26T11:55:54.7653090Z }
2026-09-26T11:55:54.7653192Z 
2026-09-26T11:55:54.7653281Z const columns =
2026-09-26T11:55:54.7654000Z   'managed_device_id, package_name, label, version_name, version_code, install_state, enabled, first_observed_at, last_observed_at, last_received_at, source_category';
2026-09-26T11:55:54.7654611Z 
2026-09-26T11:55:54.7654830Z const toItem = (row: Row): ApplicationInventoryItem => ({
2026-09-26T11:55:54.7655209Z   managedDeviceId: row.managed_device_id,
2026-09-26T11:55:54.7655523Z   packageName: row.package_name,
2026-09-26T11:55:54.7655776Z   label: row.label,
2026-09-26T11:55:54.7656023Z   versionName: row.version_name,
2026-09-26T11:55:54.7656432Z   versionCode: row.version_code === null ? null : Number(row.version_code),
2026-09-26T11:55:54.7656853Z   installState: row.install_state,
2026-09-26T11:55:54.7657117Z   enabled: row.enabled,
2026-09-26T11:55:54.7657383Z   firstObservedAt: row.first_observed_at,
2026-09-26T11:55:54.7657698Z   lastObservedAt: row.last_observed_at,
2026-09-26T11:55:54.7658015Z   lastReceivedAt: row.last_received_at,
2026-09-26T11:55:54.7658321Z   sourceCategory: row.source_category,
2026-09-26T11:55:54.7658575Z });
2026-09-26T11:55:54.7658673Z 
2026-09-26T11:55:54.7658877Z const encodeCursor = (packageName: string): string =>
2026-09-26T11:55:54.7659768Z   Buffer.from(JSON.stringify({ packageName })).toString('base64url');
2026-09-26T11:55:54.7660073Z 
2026-09-26T11:55:54.7660264Z const decodeCursor = (cursor: string): string => {
2026-09-26T11:55:54.7660563Z   try {
2026-09-26T11:55:54.7660782Z     const parsed = JSON.parse(
2026-09-26T11:55:54.7661107Z       Buffer.from(cursor, 'base64url').toString('utf8'),
2026-09-26T11:55:54.7661458Z     ) as { packageName?: unknown };
2026-09-26T11:55:54.7661778Z     if (typeof parsed.packageName !== 'string')
2026-09-26T11:55:54.7662121Z       throw new Error('Invalid cursor.');
2026-09-26T11:55:54.7662421Z     return parsed.packageName;
2026-09-26T11:55:54.7662665Z   } catch {
2026-09-26T11:55:54.7662889Z     throw new PersistenceError(
2026-09-26T11:55:54.7663145Z       'INVALID_STATE',
2026-09-26T11:55:54.7663422Z       'The application page cursor is invalid.',
2026-09-26T11:55:54.7663711Z     );
2026-09-26T11:55:54.7663889Z   }
2026-09-26T11:55:54.7664061Z };
2026-09-26T11:55:54.7664165Z 
2026-09-26T11:55:54.7664381Z export class PostgresApplicationInventoryRepository
2026-09-26T11:55:54.7664720Z   extends PostgresRepository
2026-09-26T11:55:54.7665026Z   implements ApplicationInventoryRepository
2026-09-26T11:55:54.7665314Z {
2026-09-26T11:55:54.7665547Z   readonly name = 'application-inventory';
2026-09-26T11:55:54.7665741Z 
2026-09-26T11:55:54.7665868Z   async replaceForDevice(input: {
2026-09-26T11:55:54.7666138Z     managedDeviceId: string;
2026-09-26T11:55:54.7666384Z     observedAt: Date;
2026-09-26T11:55:54.7666603Z     receivedAt: Date;
2026-09-26T11:55:54.7666831Z     items: readonly Omit<
2026-09-26T11:55:54.7667094Z       ApplicationInventoryItem,
2026-09-26T11:55:54.7667356Z       | 'managedDeviceId'
2026-09-26T11:55:54.7667593Z       | 'firstObservedAt'
2026-09-26T11:55:54.7667960Z       | 'lastObservedAt'
2026-09-26T11:55:54.7668196Z       | 'lastReceivedAt'
2026-09-26T11:55:54.7668420Z     >[];
2026-09-26T11:55:54.7668696Z   }): Promise<{ applied: boolean; receivedAt: Date }> {
2026-09-26T11:55:54.7669079Z     return this.transaction(async (client) => {
2026-09-26T11:55:54.7669779Z       const current = await client.query<{ last_received_at: Date | null }>(
2026-09-26T11:55:54.7670459Z         'SELECT MAX(last_received_at) AS last_received_at FROM application_inventory WHERE managed_device_id=$1',
2026-09-26T11:55:54.7671008Z         [input.managedDeviceId],
2026-09-26T11:55:54.7671261Z       );
2026-09-26T11:55:54.7671588Z       const currentReceived = current.rows[0]?.last_received_at ?? null;
2026-09-26T11:55:54.7671952Z       if (
2026-09-26T11:55:54.7672177Z         currentReceived !== null &&
2026-09-26T11:55:54.7672545Z         input.receivedAt.getTime() <= currentReceived.getTime()
2026-09-26T11:55:54.7672887Z       ) {
2026-09-26T11:55:54.7673179Z         return { applied: false, receivedAt: currentReceived };
2026-09-26T11:55:54.7673499Z       }
2026-09-26T11:55:54.7673600Z 
2026-09-26T11:55:54.7673728Z       for (const item of input.items) {
2026-09-26T11:55:54.7674011Z         await client.query(
2026-09-26T11:55:54.7675068Z           'INSERT INTO application_inventory (managed_device_id, package_name, label, version_name, version_code, install_state, enabled, first_observed_at, last_observed_at, last_received_at, source_category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) ' +
2026-09-26T11:55:54.7677913Z             'ON CONFLICT (managed_device_id, package_name) DO UPDATE SET label=EXCLUDED.label, version_name=EXCLUDED.version_name, version_code=EXCLUDED.version_code, install_state=EXCLUDED.install_state, enabled=EXCLUDED.enabled, first_observed_at=LEAST(application_inventory.first_observed_at,EXCLUDED.first_observed_at), last_observed_at=GREATEST(application_inventory.last_observed_at,EXCLUDED.last_observed_at), last_received_at=EXCLUDED.last_received_at, source_category=EXCLUDED.source_category',
2026-09-26T11:55:54.7679971Z           [
2026-09-26T11:55:54.7680204Z             input.managedDeviceId,
2026-09-26T11:55:54.7680474Z             item.packageName,
2026-09-26T11:55:54.7680900Z             item.label,
2026-09-26T11:55:54.7681127Z             item.versionName,
2026-09-26T11:55:54.7681372Z             item.versionCode,
2026-09-26T11:55:54.7681632Z             item.installState,
2026-09-26T11:55:54.7681872Z             item.enabled,
2026-09-26T11:55:54.7682103Z             input.observedAt,
2026-09-26T11:55:54.7682344Z             input.receivedAt,
2026-09-26T11:55:54.7682608Z             item.sourceCategory,
2026-09-26T11:55:54.7682857Z           ],
2026-09-26T11:55:54.7683046Z         );
2026-09-26T11:55:54.7683227Z       }
2026-09-26T11:55:54.7683329Z 
2026-09-26T11:55:54.7683463Z       if (input.items.length === 0) {
2026-09-26T11:55:54.7683734Z         await client.query(
2026-09-26T11:55:54.7684115Z           'DELETE FROM application_inventory WHERE managed_device_id=$1',
2026-09-26T11:55:54.7684521Z           [input.managedDeviceId],
2026-09-26T11:55:54.7684769Z         );
2026-09-26T11:55:54.7684953Z       } else {
2026-09-26T11:55:54.7685164Z         await client.query(
2026-09-26T11:55:54.7685815Z           'DELETE FROM application_inventory WHERE managed_device_id=$1 AND NOT (package_name = ANY($2::text[]))',
2026-09-26T11:55:54.7686494Z           [input.managedDeviceId, input.items.map((item) => item.packageName)],
2026-09-26T11:55:54.7686882Z         );
2026-09-26T11:55:54.7687065Z       }
2026-09-26T11:55:54.7687165Z 
2026-09-26T11:55:54.7687359Z       return { applied: true, receivedAt: input.receivedAt };
2026-09-26T11:55:54.7687684Z     });
2026-09-26T11:55:54.7687863Z   }
2026-09-26T11:55:54.7687970Z 
2026-09-26T11:55:54.7688067Z   async listForAdmin(
2026-09-26T11:55:54.7688290Z     adminId: string,
2026-09-26T11:55:54.7688513Z     managedDeviceId: string,
2026-09-26T11:55:54.7688951Z     page: { limit?: number; cursor?: string | null } = {},
2026-09-26T11:55:54.7689269Z   ) {
2026-09-26T11:55:54.7689800Z     const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
2026-09-26T11:55:54.7690299Z     const cursor = page.cursor == null ? null : decodeCursor(page.cursor);
2026-09-26T11:55:54.7690785Z     const params: unknown[] = [managedDeviceId, adminId];
2026-09-26T11:55:54.7691251Z     const whereCursor = cursor === null ? '' : ' AND ai.package_name > $3';
2026-09-26T11:55:54.7691682Z     if (cursor !== null) params.push(cursor);
2026-09-26T11:55:54.7691978Z     params.push(limit + 1);
2026-09-26T11:55:54.7692133Z 
2026-09-26T11:55:54.7692266Z     const result = await this.query<Row>(
2026-09-26T11:55:54.7692533Z       'SELECT ' +
2026-09-26T11:55:54.7692748Z         columns +
2026-09-26T11:55:54.7693180Z         ' FROM application_inventory ai JOIN managed_devices md ON md.id=ai.managed_device_id ' +
2026-09-26T11:55:54.7693674Z         'WHERE md.id=$1 AND md.admin_id=$2' +
2026-09-26T11:55:54.7693962Z         whereCursor +
2026-09-26T11:55:54.7694239Z         ' ORDER BY ai.package_name ASC LIMIT $' +
2026-09-26T11:55:54.7694533Z         params.length,
2026-09-26T11:55:54.7694750Z       params,
2026-09-26T11:55:54.7694937Z     );
2026-09-26T11:55:54.7695062Z 
2026-09-26T11:55:54.7695210Z     const hasMore = result.rows.length > limit;
2026-09-26T11:55:54.7695634Z     const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
2026-09-26T11:55:54.7696028Z     const summary = await this.query<{
2026-09-26T11:55:54.7696323Z       observed_at: Date | null;
2026-09-26T11:55:54.7696590Z       received_at: Date | null;
2026-09-26T11:55:54.7696820Z     }>(
2026-09-26T11:55:54.7697187Z       'SELECT MAX(observed_at) AS observed_at, MAX(last_received_at) AS received_at ' +
2026-09-26T11:55:54.7697831Z         'FROM application_inventory ai JOIN managed_devices md ON md.id=ai.managed_device_id ' +
2026-09-26T11:55:54.7698323Z         'WHERE md.id=$1 AND md.admin_id=$2',
2026-09-26T11:55:54.7698632Z       [managedDeviceId, adminId],
2026-09-26T11:55:54.7698882Z     );
2026-09-26T11:55:54.7698986Z 
2026-09-26T11:55:54.7699067Z     return {
2026-09-26T11:55:54.7699299Z       items: rows.map(toItem),
2026-09-26T11:55:54.7699849Z       nextCursor: hasMore
2026-09-26T11:55:54.7700206Z         ? encodeCursor(rows[rows.length - 1]!.package_name)
2026-09-26T11:55:54.7700305Z         : null,
2026-09-26T11:55:54.7700487Z       observedAt: summary.rows[0]?.observed_at ?? null,
2026-09-26T11:55:54.7700651Z       receivedAt: summary.rows[0]?.received_at ?? null,
2026-09-26T11:55:54.7700737Z     };
2026-09-26T11:55:54.7700822Z   }
2026-09-26T11:55:54.7700830Z 
2026-09-26T11:55:54.7700921Z   async findForAdmin(
2026-09-26T11:55:54.7701020Z     adminId: string,
2026-09-26T11:55:54.7701129Z     managedDeviceId: string,
2026-09-26T11:55:54.7701226Z     packageName: string,
2026-09-26T11:55:54.7701390Z   ): Promise<ApplicationInventoryItem | null> {
2026-09-26T11:55:54.7701519Z     const result = await this.query<Row>(
2026-09-26T11:55:54.7701617Z       'SELECT ' +
2026-09-26T11:55:54.7701714Z         columns +
2026-09-26T11:55:54.7702031Z         ' FROM application_inventory ai JOIN managed_devices md ON md.id=ai.managed_device_id ' +
2026-09-26T11:55:54.7702240Z         'WHERE md.id=$1 AND md.admin_id=$2 AND ai.package_name=$3',
2026-09-26T11:55:54.7702400Z       [managedDeviceId, adminId, packageName],
2026-09-26T11:55:54.7702477Z     );
2026-09-26T11:55:54.7702707Z     return result.rows[0] === undefined ? null : toItem(result.rows[0]);
2026-09-26T11:55:54.7702790Z   }
2026-09-26T11:55:54.7702868Z }
2026-09-26T11:55:54.7703156Z ===== src/repositories/postgres-application-policy-repository.ts =====
2026-09-26T11:55:54.7703313Z import type { QueryResultRow } from 'pg';
2026-09-26T11:55:54.7703406Z import type {
2026-09-26T11:55:54.7703508Z   ApplicationPolicy,
2026-09-26T11:55:54.7703632Z   ApplicationPolicyAssignment,
2026-09-26T11:55:54.7703738Z   ApplicationPolicyRule,
2026-09-26T11:55:54.7703848Z   ApplicationPolicySyncState,
2026-09-26T11:55:54.7704056Z   ApplicationRuleAction,
2026-09-26T11:55:54.7704237Z } from '../domain/application-management.js';
2026-09-26T11:55:54.7704501Z import { PersistenceError } from '../domain/persistence-errors.js';
2026-09-26T11:55:54.7704859Z import type { ApplicationPolicyRepository } from './application-policy-repository.js';
2026-09-26T11:55:54.7705104Z import { PostgresRepository } from './postgres-repository.js';
2026-09-26T11:55:54.7705112Z 
2026-09-26T11:55:54.7705284Z interface PolicyRow extends QueryResultRow {
2026-09-26T11:55:54.7705368Z   id: string;
2026-09-26T11:55:54.7705460Z   admin_id: string;
2026-09-26T11:55:54.7705544Z   name: string;
2026-09-26T11:55:54.7705648Z   description: string | null;
2026-09-26T11:55:54.7705769Z   status: 'ACTIVE' | 'DISABLED';
2026-09-26T11:55:54.7705856Z   version: number;
2026-09-26T11:55:54.7705950Z   created_at: Date;
2026-09-26T11:55:54.7706042Z   updated_at: Date;
2026-09-26T11:55:54.7706131Z   created_by: string;
2026-09-26T11:55:54.7706224Z   updated_by: string;
2026-09-26T11:55:54.7706305Z }
2026-09-26T11:55:54.7706472Z interface RuleRow extends QueryResultRow {
2026-09-26T11:55:54.7706567Z   policy_id: string;
2026-09-26T11:55:54.7706663Z   package_name: string;
2026-09-26T11:55:54.7706797Z   action: ApplicationRuleAction;
2026-09-26T11:55:54.7706880Z }
2026-09-26T11:55:54.7707062Z interface AssignmentRow extends QueryResultRow {
2026-09-26T11:55:54.7707164Z   managed_device_id: string;
2026-09-26T11:55:54.7707254Z   policy_id: string;
2026-09-26T11:55:54.7707358Z   policy_version: number;
2026-09-26T11:55:54.7707454Z   assigned_at: Date;
2026-09-26T11:55:54.7707541Z   updated_at: Date;
2026-09-26T11:55:54.7707641Z   assigned_by: string;
2026-09-26T11:55:54.7707723Z }
2026-09-26T11:55:54.7707884Z interface SyncRow extends QueryResultRow {
2026-09-26T11:55:54.7707986Z   managed_device_id: string;
2026-09-26T11:55:54.7708119Z   desired_policy_id: string | null;
2026-09-26T11:55:54.7708249Z   desired_policy_version: number | null;
2026-09-26T11:55:54.7708382Z   reported_policy_id: string | null;
2026-09-26T11:55:54.7708513Z   reported_policy_version: number | null;
2026-09-26T11:55:54.7708677Z   status: ApplicationPolicySyncState['status'];
2026-09-26T11:55:54.7708802Z   last_requested_at: Date | null;
2026-09-26T11:55:54.7709042Z   last_reported_at: Date | null;
2026-09-26T11:55:54.7709166Z   last_error_code: string | null;
2026-09-26T11:55:54.7709260Z   updated_at: Date;
2026-09-26T11:55:54.7709610Z }
2026-09-26T11:55:54.7709746Z const policyColumns =
2026-09-26T11:55:54.7710108Z   'id, admin_id, name, description, status, version, created_at, updated_at, created_by, updated_by';
2026-09-26T11:55:54.7710117Z 
2026-09-26T11:55:54.7710217Z const toPolicy = (
2026-09-26T11:55:54.7710314Z   row: PolicyRow,
2026-09-26T11:55:54.7710698Z   rules: ApplicationPolicyRule[],
2026-09-26T11:55:54.7710892Z ): ApplicationPolicy => ({
2026-09-26T11:55:54.7711006Z   id: row.id,
2026-09-26T11:55:54.7711168Z   adminId: row.admin_id,
2026-09-26T11:55:54.7711357Z   name: row.name,
2026-09-26T11:55:54.7711538Z   description: row.description,
2026-09-26T11:55:54.7711700Z   status: row.status,
2026-09-26T11:55:54.7711822Z   version: row.version,
2026-09-26T11:55:54.7712028Z   createdAt: row.created_at,
2026-09-26T11:55:54.7712236Z   updatedAt: row.updated_at,
2026-09-26T11:55:54.7712383Z   createdBy: row.created_by,
2026-09-26T11:55:54.7712550Z   updatedBy: row.updated_by,
2026-09-26T11:55:54.7712698Z   rules,
2026-09-26T11:55:54.7712810Z });
2026-09-26T11:55:54.7712818Z 
2026-09-26T11:55:54.7713024Z const loadRules = async (
2026-09-26T11:55:54.7713245Z   query: <T extends QueryResultRow>(
2026-09-26T11:55:54.7713365Z     sql: string,
2026-09-26T11:55:54.7713589Z     values?: readonly unknown[],
2026-09-26T11:55:54.7713758Z   ) => Promise<{ rows: T[] }>,
2026-09-26T11:55:54.7713923Z   policyId: string,
2026-09-26T11:55:54.7714173Z ): Promise<ApplicationPolicyRule[]> => {
2026-09-26T11:55:54.7714337Z   const result = await query<RuleRow>(
2026-09-26T11:55:54.7714978Z     'SELECT policy_id, package_name, action FROM application_policy_rules WHERE policy_id=$1 ORDER BY package_name',
2026-09-26T11:55:54.7715131Z     [policyId],
2026-09-26T11:55:54.7715293Z   );
2026-09-26T11:55:54.7715481Z   return result.rows;
2026-09-26T11:55:54.7715666Z };
2026-09-26T11:55:54.7715674Z 
2026-09-26T11:55:54.7715918Z const encodePolicyCursor = (row: PolicyRow): string =>
2026-09-26T11:55:54.7716064Z   Buffer.from(
2026-09-26T11:55:54.7716448Z     JSON.stringify({ updatedAt: row.updated_at.toISOString(), id: row.id }),
2026-09-26T11:55:54.7716581Z   ).toString('base64url');
2026-09-26T11:55:54.7716589Z 
2026-09-26T11:55:54.7716779Z const decodePolicyCursor = (
2026-09-26T11:55:54.7716935Z   cursor: string,
2026-09-26T11:55:54.7717103Z ): { updatedAt: Date; id: string } => {
2026-09-26T11:55:54.7717319Z   try {
2026-09-26T11:55:54.7717539Z     const parsed = JSON.parse(
2026-09-26T11:55:54.7717746Z       Buffer.from(cursor, 'base64url').toString('utf8'),
2026-09-26T11:55:54.7717957Z     ) as { updatedAt?: unknown; id?: unknown };
2026-09-26T11:55:54.7718313Z     if (typeof parsed.updatedAt !== 'string' || typeof parsed.id !== 'string') {
2026-09-26T11:55:54.7718491Z       throw new Error('Invalid cursor.');
2026-09-26T11:55:54.7718640Z     }
2026-09-26T11:55:54.7718835Z     const updatedAt = new Date(parsed.updatedAt);
2026-09-26T11:55:54.7719153Z     if (Number.isNaN(updatedAt.getTime())) throw new Error('Invalid cursor.');
2026-09-26T11:55:54.7719612Z     return { updatedAt, id: parsed.id };
2026-09-26T11:55:54.7719774Z   } catch {
2026-09-26T11:55:54.7719996Z     throw new PersistenceError(
2026-09-26T11:55:54.7729010Z       'INVALID_STATE',
2026-09-26T11:55:54.7729647Z       'The application policy page cursor is invalid.',
2026-09-26T11:55:54.7729791Z     );
2026-09-26T11:55:54.7729930Z   }
2026-09-26T11:55:54.7730061Z };
2026-09-26T11:55:54.7730082Z 
2026-09-26T11:55:54.7730622Z const toAssignment = (row: AssignmentRow): ApplicationPolicyAssignment => ({
2026-09-26T11:55:54.7730857Z   managedDeviceId: row.managed_device_id,
2026-09-26T11:55:54.7730976Z   policyId: row.policy_id,
2026-09-26T11:55:54.7731118Z   policyVersion: row.policy_version,
2026-09-26T11:55:54.7731247Z   assignedAt: row.assigned_at,
2026-09-26T11:55:54.7731345Z   updatedAt: row.updated_at,
2026-09-26T11:55:54.7731677Z   assignedBy: row.assigned_by,
2026-09-26T11:55:54.7731764Z });
2026-09-26T11:55:54.7731773Z 
2026-09-26T11:55:54.7732035Z const toSync = (row: SyncRow): ApplicationPolicySyncState => ({
2026-09-26T11:55:54.7732185Z   managedDeviceId: row.managed_device_id,
2026-09-26T11:55:54.7732322Z   desiredPolicyId: row.desired_policy_id,
2026-09-26T11:55:54.7732486Z   desiredPolicyVersion: row.desired_policy_version,
2026-09-26T11:55:54.7732631Z   reportedPolicyId: row.reported_policy_id,
2026-09-26T11:55:54.7732806Z   reportedPolicyVersion: row.reported_policy_version,
2026-09-26T11:55:54.7732904Z   status: row.status,
2026-09-26T11:55:54.7733044Z   lastRequestedAt: row.last_requested_at,
2026-09-26T11:55:54.7733171Z   lastReportedAt: row.last_reported_at,
2026-09-26T11:55:54.7733309Z   lastErrorCode: row.last_error_code,
2026-09-26T11:55:54.7733414Z   updatedAt: row.updated_at,
2026-09-26T11:55:54.7733490Z });
2026-09-26T11:55:54.7733497Z 
2026-09-26T11:55:54.7733706Z export class PostgresApplicationPolicyRepository
2026-09-26T11:55:54.7733812Z   extends PostgresRepository
2026-09-26T11:55:54.7733949Z   implements ApplicationPolicyRepository
2026-09-26T11:55:54.7734035Z {
2026-09-26T11:55:54.7734172Z   readonly name = 'application-policy';
2026-09-26T11:55:54.7734181Z 
2026-09-26T11:55:54.7734272Z   async create(input: {
2026-09-26T11:55:54.7734362Z     id: string;
2026-09-26T11:55:54.7734449Z     adminId: string;
2026-09-26T11:55:54.7734536Z     name: string;
2026-09-26T11:55:54.7734660Z     description: string | null;
2026-09-26T11:55:54.7734746Z     createdBy: string;
2026-09-26T11:55:54.7735016Z     rules: readonly { packageName: string; action: ApplicationRuleAction }[];
2026-09-26T11:55:54.7735148Z   }): Promise<ApplicationPolicy> {
2026-09-26T11:55:54.7735412Z     return this.transaction(async (client) => {
2026-09-26T11:55:54.7735578Z       const result = await client.query<PolicyRow>(
2026-09-26T11:55:54.7736177Z         "INSERT INTO application_policies (id,admin_id,name,description,status,version,created_by,updated_by) VALUES ($1,$2,$3,$4,'ACTIVE',1,$5,$5) RETURNING " +
2026-09-26T11:55:54.7736278Z           policyColumns,
2026-09-26T11:55:54.7736362Z         [
2026-09-26T11:55:54.7736451Z           input.id,
2026-09-26T11:55:54.7736536Z           input.adminId,
2026-09-26T11:55:54.7736627Z           input.name,
2026-09-26T11:55:54.7736720Z           input.description,
2026-09-26T11:55:54.7736815Z           input.createdBy,
2026-09-26T11:55:54.7736895Z         ],
2026-09-26T11:55:54.7736974Z       );
2026-09-26T11:55:54.7737108Z       for (const rule of input.rules) {
2026-09-26T11:55:54.7737205Z         await client.query(
2026-09-26T11:55:54.7737537Z           'INSERT INTO application_policy_rules (policy_id,package_name,action) VALUES ($1,$2,$3)',
2026-09-26T11:55:54.7737707Z           [input.id, rule.packageName, rule.action],
2026-09-26T11:55:54.7737786Z         );
2026-09-26T11:55:54.7737862Z       }
2026-09-26T11:55:54.7737956Z       return toPolicy(
2026-09-26T11:55:54.7738050Z         result.rows[0]!,
2026-09-26T11:55:54.7738179Z         input.rules.map((rule) => ({
2026-09-26T11:55:54.7738282Z           policyId: input.id,
2026-09-26T11:55:54.7738412Z           packageName: rule.packageName,
2026-09-26T11:55:54.7738529Z           action: rule.action,
2026-09-26T11:55:54.7738614Z         })),
2026-09-26T11:55:54.7738692Z       );
2026-09-26T11:55:54.7738775Z     });
2026-09-26T11:55:54.7738857Z   }
2026-09-26T11:55:54.7738865Z 
2026-09-26T11:55:54.7739013Z   async findOwned(id: string, adminId: string) {
2026-09-26T11:55:54.7739171Z     const result = await this.query<PolicyRow>(
2026-09-26T11:55:54.7739255Z       'SELECT ' +
2026-09-26T11:55:54.7739609Z         policyColumns +
2026-09-26T11:55:54.7739897Z         ' FROM application_policies WHERE id=$1 AND admin_id=$2',
2026-09-26T11:55:54.7739990Z       [id, adminId],
2026-09-26T11:55:54.7740069Z     );
2026-09-26T11:55:54.7740224Z     if (result.rows[0] === undefined) return null;
2026-09-26T11:55:54.7740636Z     return toPolicy(result.rows[0], await loadRules(this.query.bind(this), id));
2026-09-26T11:55:54.7740719Z   }
2026-09-26T11:55:54.7740726Z 
2026-09-26T11:55:54.7740822Z   async listOwned(
2026-09-26T11:55:54.7740908Z     adminId: string,
2026-09-26T11:55:54.7741090Z     page: { limit?: number; cursor?: string | null } = {},
2026-09-26T11:55:54.7741171Z   ) {
2026-09-26T11:55:54.7741368Z     const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
2026-09-26T11:55:54.7741631Z     const cursor = page.cursor == null ? null : decodePolicyCursor(page.cursor);
2026-09-26T11:55:54.7741763Z     const params: unknown[] = [adminId];
2026-09-26T11:55:54.7741988Z     const where = cursor === null ? '' : ' AND (p.updated_at, p.id) < ($2, $3)';
2026-09-26T11:55:54.7742086Z     if (cursor !== null) {
2026-09-26T11:55:54.7742242Z       params.push(cursor.updatedAt, cursor.id);
2026-09-26T11:55:54.7742323Z     }
2026-09-26T11:55:54.7742428Z     params.push(limit + 1);
2026-09-26T11:55:54.7742569Z     const result = await this.query<PolicyRow>(
2026-09-26T11:55:54.7742665Z       'SELECT ' +
2026-09-26T11:55:54.7742763Z         policyColumns +
2026-09-26T11:55:54.7742942Z         ' FROM application_policies p WHERE p.admin_id=$1' +
2026-09-26T11:55:54.7743031Z         where +
2026-09-26T11:55:54.7743206Z         ' ORDER BY p.updated_at DESC,p.id DESC LIMIT $' +
2026-09-26T11:55:54.7743297Z         params.length,
2026-09-26T11:55:54.7743381Z       params,
2026-09-26T11:55:54.7743455Z     );
2026-09-26T11:55:54.7743557Z     const rows = result.rows;
2026-09-26T11:55:54.7743685Z     const hasMore = rows.length > limit;
2026-09-26T11:55:54.7743802Z     const items = rows.slice(0, limit);
2026-09-26T11:55:54.7743928Z     const policies = await Promise.all(
2026-09-26T11:55:54.7744042Z       items.map(async (row) =>
2026-09-26T11:55:54.7744366Z         toPolicy(row, await loadRules(this.query.bind(this), row.id)),
2026-09-26T11:55:54.7744453Z       ),
2026-09-26T11:55:54.7744533Z     );
2026-09-26T11:55:54.7744615Z     return {
2026-09-26T11:55:54.7744716Z       items: policies,
2026-09-26T11:55:54.7744946Z       nextCursor: hasMore ? encodePolicyCursor(rows[limit - 1]!) : null,
2026-09-26T11:55:54.7745027Z     };
2026-09-26T11:55:54.7745106Z   }
2026-09-26T11:55:54.7745113Z 
2026-09-26T11:55:54.7745211Z   async updateOwned(input: {
2026-09-26T11:55:54.7745297Z     id: string;
2026-09-26T11:55:54.7745386Z     adminId: string;
2026-09-26T11:55:54.7745466Z     name: string;
2026-09-26T11:55:54.7745586Z     description: string | null;
2026-09-26T11:55:54.7745706Z     status: 'ACTIVE' | 'DISABLED';
2026-09-26T11:55:54.7745802Z     expectedVersion: number;
2026-09-26T11:55:54.7745892Z     updatedBy: string;
2026-09-26T11:55:54.7746142Z     rules: readonly { packageName: string; action: ApplicationRuleAction }[];
2026-09-26T11:55:54.7746227Z   }) {
2026-09-26T11:55:54.7746374Z     return this.transaction(async (client) => {
2026-09-26T11:55:54.7746532Z       const current = await client.query<PolicyRow>(
2026-09-26T11:55:54.7746621Z         'SELECT ' +
2026-09-26T11:55:54.7746724Z           policyColumns +
2026-09-26T11:55:54.7746961Z           ' FROM application_policies WHERE id=$1 AND admin_id=$2 FOR UPDATE',
2026-09-26T11:55:54.7747081Z         [input.id, input.adminId],
2026-09-26T11:55:54.7747163Z       );
2026-09-26T11:55:54.7747276Z       const row = current.rows[0];
2026-09-26T11:55:54.7747362Z       if (!row)
2026-09-26T11:55:54.7747481Z         throw new PersistenceError(
2026-09-26T11:55:54.7747568Z           'NOT_FOUND',
2026-09-26T11:55:54.7747706Z           'Application policy was not found.',
2026-09-26T11:55:54.7747783Z         );
2026-09-26T11:55:54.7747933Z       if (row.version !== input.expectedVersion)
2026-09-26T11:55:54.7748054Z         throw new PersistenceError(
2026-09-26T11:55:54.7748138Z           'CONFLICT',
2026-09-26T11:55:54.7748294Z           'Application policy version is stale.',
2026-09-26T11:55:54.7748377Z         );
2026-09-26T11:55:54.7748384Z 
2026-09-26T11:55:54.7748510Z       const nextVersion = row.version + 1;
2026-09-26T11:55:54.7748757Z       const updated = await client.query<PolicyRow>(
2026-09-26T11:55:54.7749304Z         'UPDATE application_policies SET name=$3,description=$4,status=$5,version=$6,updated_by=$7,updated_at=NOW() WHERE id=$1 AND admin_id=$2 RETURNING ' +
2026-09-26T11:55:54.7749654Z           policyColumns,
2026-09-26T11:55:54.7749751Z         [
2026-09-26T11:55:54.7749840Z           input.id,
2026-09-26T11:55:54.7749927Z           input.adminId,
2026-09-26T11:55:54.7750013Z           input.name,
2026-09-26T11:55:54.7750106Z           input.description,
2026-09-26T11:55:54.7750197Z           input.status,
2026-09-26T11:55:54.7750284Z           nextVersion,
2026-09-26T11:55:54.7750374Z           input.updatedBy,
2026-09-26T11:55:54.7750454Z         ],
2026-09-26T11:55:54.7750541Z       );
2026-09-26T11:55:54.7750634Z       await client.query(
2026-09-26T11:55:54.7750840Z         'DELETE FROM application_policy_rules WHERE policy_id=$1',
2026-09-26T11:55:54.7750923Z         [input.id],
2026-09-26T11:55:54.7751007Z       );
2026-09-26T11:55:54.7751133Z       for (const rule of input.rules) {
2026-09-26T11:55:54.7751224Z         await client.query(
2026-09-26T11:55:54.7751543Z           'INSERT INTO application_policy_rules(policy_id,package_name,action) VALUES($1,$2,$3)',
2026-09-26T11:55:54.7751697Z           [input.id, rule.packageName, rule.action],
2026-09-26T11:55:54.7751772Z         );
2026-09-26T11:55:54.7751852Z       }
2026-09-26T11:55:54.7751942Z       return toPolicy(
2026-09-26T11:55:54.7752031Z         updated.rows[0]!,
2026-09-26T11:55:54.7752161Z         input.rules.map((rule) => ({
2026-09-26T11:55:54.7752255Z           policyId: input.id,
2026-09-26T11:55:54.7752389Z           packageName: rule.packageName,
2026-09-26T11:55:54.7752539Z           action: rule.action,
2026-09-26T11:55:54.7752748Z         })),
2026-09-26T11:55:54.7752838Z       );
2026-09-26T11:55:54.7752921Z     });
2026-09-26T11:55:54.7752997Z   }
2026-09-26T11:55:54.7753005Z 
2026-09-26T11:55:54.7753108Z   async disableOwned(
2026-09-26T11:55:54.7753200Z     id: string,
2026-09-26T11:55:54.7753286Z     adminId: string,
2026-09-26T11:55:54.7753386Z     expectedVersion: number,
2026-09-26T11:55:54.7753472Z     updatedBy: string,
2026-09-26T11:55:54.7753553Z   ) {
2026-09-26T11:55:54.7753723Z     const current = await this.findOwned(id, adminId);
2026-09-26T11:55:54.7753805Z     if (!current)
2026-09-26T11:55:54.7753936Z       throw new PersistenceError(
2026-09-26T11:55:54.7754024Z         'NOT_FOUND',
2026-09-26T11:55:54.7754162Z         'Application policy was not found.',
2026-09-26T11:55:54.7754246Z       );
2026-09-26T11:55:54.7754350Z     return this.updateOwned({
2026-09-26T11:55:54.7754428Z       id,
2026-09-26T11:55:54.7754519Z       adminId,
2026-09-26T11:55:54.7754611Z       name: current.name,
2026-09-26T11:55:54.7754757Z       description: current.description,
2026-09-26T11:55:54.7754851Z       status: 'DISABLED',
2026-09-26T11:55:54.7754940Z       expectedVersion,
2026-09-26T11:55:54.7755029Z       updatedBy,
2026-09-26T11:55:54.7755174Z       rules: current.rules.map((rule) => ({
2026-09-26T11:55:54.7755300Z         packageName: rule.packageName,
2026-09-26T11:55:54.7755397Z         action: rule.action,
2026-09-26T11:55:54.7755472Z       })),
2026-09-26T11:55:54.7755553Z     });
2026-09-26T11:55:54.7755631Z   }
2026-09-26T11:55:54.7755638Z 
2026-09-26T11:55:54.7755806Z   async listAssignmentsForPolicy(policyId: string) {
2026-09-26T11:55:54.7755976Z     const result = await this.query<AssignmentRow>(
2026-09-26T11:55:54.7756514Z       'SELECT managed_device_id,policy_id,policy_version,assigned_at,updated_at,assigned_by FROM application_policy_assignments WHERE policy_id=$1',
2026-09-26T11:55:54.7756598Z       [policyId],
2026-09-26T11:55:54.7756677Z     );
2026-09-26T11:55:54.7756817Z     return result.rows.map(toAssignment);
2026-09-26T11:55:54.7756896Z   }
2026-09-26T11:55:54.7756904Z 
2026-09-26T11:55:54.7756999Z   async assign(input: {
2026-09-26T11:55:54.7757098Z     managedDeviceId: string;
2026-09-26T11:55:54.7757304Z     policyId: string;
2026-09-26T11:55:54.7757403Z     policyVersion: number;
2026-09-26T11:55:54.7757494Z     assignedBy: string;
2026-09-26T11:55:54.7757570Z   }) {
2026-09-26T11:55:54.7757729Z     const result = await this.query<AssignmentRow>(
2026-09-26T11:55:54.7759167Z       'INSERT INTO application_policy_assignments(managed_device_id,policy_id,policy_version,assigned_by) VALUES($1,$2,$3,$4) ON CONFLICT(managed_device_id) DO UPDATE SET policy_id=EXCLUDED.policy_id,policy_version=EXCLUDED.policy_version,assigned_by=EXCLUDED.assigned_by,updated_at=NOW() RETURNING managed_device_id,policy_id,policy_version,assigned_at,updated_at,assigned_by',
2026-09-26T11:55:54.7759243Z       [
2026-09-26T11:55:54.7759615Z         input.managedDeviceId,
2026-09-26T11:55:54.7759733Z         input.policyId,
2026-09-26T11:55:54.7759836Z         input.policyVersion,
2026-09-26T11:55:54.7759931Z         input.assignedBy,
2026-09-26T11:55:54.7760008Z       ],
2026-09-26T11:55:54.7760093Z     );
2026-09-26T11:55:54.7760241Z     return toAssignment(result.rows[0]!);
2026-09-26T11:55:54.7760317Z   }
2026-09-26T11:55:54.7760324Z 
2026-09-26T11:55:54.7760567Z   async removeAssignment(managedDeviceId: string, policyId: string) {
2026-09-26T11:55:54.7760664Z     await this.query(
2026-09-26T11:55:54.7760989Z       'DELETE FROM application_policy_assignments WHERE managed_device_id=$1 AND policy_id=$2',
2026-09-26T11:55:54.7761117Z       [managedDeviceId, policyId],
2026-09-26T11:55:54.7761197Z     );
2026-09-26T11:55:54.7761270Z   }
2026-09-26T11:55:54.7761277Z 
2026-09-26T11:55:54.7761435Z   async findAssignment(managedDeviceId: string) {
2026-09-26T11:55:54.7761595Z     const result = await this.query<AssignmentRow>(
2026-09-26T11:55:54.7762286Z       'SELECT managed_device_id,policy_id,policy_version,assigned_at,updated_at,assigned_by FROM application_policy_assignments WHERE managed_device_id=$1',
2026-09-26T11:55:54.7762394Z       [managedDeviceId],
2026-09-26T11:55:54.7762479Z     );
2026-09-26T11:55:54.7762750Z     return result.rows[0] === undefined ? null : toAssignment(result.rows[0]);
2026-09-26T11:55:54.7762832Z   }
2026-09-26T11:55:54.7762839Z 
2026-09-26T11:55:54.7763001Z   async findSyncState(managedDeviceId: string) {
2026-09-26T11:55:54.7763138Z     const result = await this.query<SyncRow>(
2026-09-26T11:55:54.7764072Z       'SELECT managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at FROM application_policy_sync_state WHERE managed_device_id=$1',
2026-09-26T11:55:54.7764171Z       [managedDeviceId],
2026-09-26T11:55:54.7764246Z     );
2026-09-26T11:55:54.7764473Z     return result.rows[0] === undefined ? null : toSync(result.rows[0]);
2026-09-26T11:55:54.7764552Z   }
2026-09-26T11:55:54.7764564Z 
2026-09-26T11:55:54.7764683Z   async setSyncRequested(input: {
2026-09-26T11:55:54.7764794Z     managedDeviceId: string;
2026-09-26T11:55:54.7764900Z     policyId: string | null;
2026-09-26T11:55:54.7765021Z     policyVersion: number | null;
2026-09-26T11:55:54.7765114Z     requestedAt: Date;
2026-09-26T11:55:54.7765190Z   }) {
2026-09-26T11:55:54.7765332Z     const result = await this.query<SyncRow>(
2026-09-26T11:55:54.7767708Z       "INSERT INTO application_policy_sync_state(managed_device_id,desired_policy_id,desired_policy_version,status,last_requested_at,updated_at) VALUES($1,$2,$3,'PENDING',$4,NOW()) ON CONFLICT(managed_device_id) DO UPDATE SET desired_policy_id=EXCLUDED.desired_policy_id,desired_policy_version=EXCLUDED.desired_policy_version,status=EXCLUDED.status,last_requested_at=EXCLUDED.last_requested_at,last_error_code=NULL,updated_at=NOW() RETURNING managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at",
2026-09-26T11:55:54.7767796Z       [
2026-09-26T11:55:54.7767914Z         input.managedDeviceId,
2026-09-26T11:55:54.7768013Z         input.policyId,
2026-09-26T11:55:54.7768231Z         input.policyVersion,
2026-09-26T11:55:54.7768326Z         input.requestedAt,
2026-09-26T11:55:54.7768409Z       ],
2026-09-26T11:55:54.7768495Z     );
2026-09-26T11:55:54.7768614Z     return toSync(result.rows[0]!);
2026-09-26T11:55:54.7768693Z   }
2026-09-26T11:55:54.7768700Z 
2026-09-26T11:55:54.7768798Z   async reportSync(input: {
2026-09-26T11:55:54.7768890Z     managedDeviceId: string;
2026-09-26T11:55:54.7768984Z     policyId: string | null;
2026-09-26T11:55:54.7769098Z     policyVersion: number | null;
2026-09-26T11:55:54.7769257Z     status: ApplicationPolicySyncState['status'];
2026-09-26T11:55:54.7769581Z     reportedAt: Date;
2026-09-26T11:55:54.7769691Z     errorCode: string | null;
2026-09-26T11:55:54.7769772Z   }) {
2026-09-26T11:55:54.7769932Z     const result = await this.query<SyncRow>(
2026-09-26T11:55:54.7771329Z       'UPDATE application_policy_sync_state SET reported_policy_id=$2,reported_policy_version=$3,status=$4,last_reported_at=$5,last_error_code=$6,updated_at=NOW() WHERE managed_device_id=$1 RETURNING managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at',
2026-09-26T11:55:54.7771418Z       [
2026-09-26T11:55:54.7771534Z         input.managedDeviceId,
2026-09-26T11:55:54.7771622Z         input.policyId,
2026-09-26T11:55:54.7771724Z         input.policyVersion,
2026-09-26T11:55:54.7771813Z         input.status,
2026-09-26T11:55:54.7771902Z         input.reportedAt,
2026-09-26T11:55:54.7771995Z         input.errorCode,
2026-09-26T11:55:54.7772075Z       ],
2026-09-26T11:55:54.7772149Z     );
2026-09-26T11:55:54.7772274Z     if (result.rows[0] === undefined) {
2026-09-26T11:55:54.7772413Z       const created = await this.query<SyncRow>(
2026-09-26T11:55:54.7774167Z         'INSERT INTO application_policy_sync_state(managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_reported_at,last_error_code,updated_at) VALUES($1,NULL,NULL,$2,$3,$4,$5,$6,NOW()) RETURNING managed_device_id,desired_policy_id,desired_policy_version,reported_policy_id,reported_policy_version,status,last_requested_at,last_reported_at,last_error_code,updated_at',
2026-09-26T11:55:54.7774257Z         [
2026-09-26T11:55:54.7774378Z           input.managedDeviceId,
2026-09-26T11:55:54.7774467Z           input.policyId,
2026-09-26T11:55:54.7774578Z           input.policyVersion,
2026-09-26T11:55:54.7774669Z           input.status,
2026-09-26T11:55:54.7774759Z           input.reportedAt,
2026-09-26T11:55:54.7774853Z           input.errorCode,
2026-09-26T11:55:54.7774928Z         ],
2026-09-26T11:55:54.7775008Z       );
2026-09-26T11:55:54.7775136Z       return toSync(created.rows[0]!);
2026-09-26T11:55:54.7775212Z     }
2026-09-26T11:55:54.7775340Z     return toSync(result.rows[0]);
2026-09-26T11:55:54.7775420Z   }
2026-09-26T11:55:54.7775494Z }
2026-09-26T11:55:54.7775721Z ===== src/routes/v1/application-management.routes.ts =====
2026-09-26T11:55:54.7775925Z import { Router, type RequestHandler } from 'express';
2026-09-26T11:55:54.7776119Z import type { AppConfig } from '../../config/env.js';
2026-09-26T11:55:54.7776523Z import type { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
2026-09-26T11:55:54.7777016Z import type { DeviceConnectionSessionRepository } from '../../repositories/device-connection-session-repository.js';
2026-09-26T11:55:54.7777322Z import { requireAdminAuthentication } from '../../middleware/admin-auth.js';
2026-09-26T11:55:54.7777663Z import { requireAdminAuthorization } from '../../middleware/admin-authorization.js';
2026-09-26T11:55:54.7777972Z import { requireDeviceSession } from '../../middleware/device-session-auth.js';
2026-09-26T11:55:54.7778438Z import { createDeviceCommunicationRateLimiter } from '../../middleware/device-communication-rate-limit.js';
2026-09-26T11:55:54.7778864Z import type { ApplicationManagementService } from '../../services/application-management-service.js';
2026-09-26T11:55:54.7779740Z import { createApplicationManagementController } from '../../controllers/application-management.controller.js';
2026-09-26T11:55:54.7779757Z 
2026-09-26T11:55:54.7779882Z const methodNotAllowed =
2026-09-26T11:55:54.7780018Z   (allow: string): RequestHandler =>
2026-09-26T11:55:54.7780103Z   (_req, res) => {
2026-09-26T11:55:54.7780226Z     res.setHeader('Allow', allow);
2026-09-26T11:55:54.7780321Z     res.status(405).json({
2026-09-26T11:55:54.7780402Z       error: {
2026-09-26T11:55:54.7780525Z         code: 'METHOD_NOT_ALLOWED',
2026-09-26T11:55:54.7780733Z         message: 'HTTP method is not allowed for this endpoint.',
2026-09-26T11:55:54.7780810Z       },
2026-09-26T11:55:54.7780942Z       requestId: res.locals.requestId,
2026-09-26T11:55:54.7781018Z     });
2026-09-26T11:55:54.7781108Z   };
2026-09-26T11:55:54.7781116Z 
2026-09-26T11:55:54.7781320Z export const createApplicationManagementRouter = (
2026-09-26T11:55:54.7781459Z   service: ApplicationManagementService,
2026-09-26T11:55:54.7781618Z   authentication: AdminAuthenticationService,
2026-09-26T11:55:54.7781776Z   sessions: DeviceConnectionSessionRepository,
2026-09-26T11:55:54.7781908Z   rateLimitConfig: AppConfig['rateLimit'],
2026-09-26T11:55:54.7781991Z   limits: {
2026-09-26T11:55:54.7782110Z     maxInventoryItems: number;
2026-09-26T11:55:54.7782205Z     maxPolicyRules: number;
2026-09-26T11:55:54.7782304Z     maxPayloadBytes: number;
2026-09-26T11:55:54.7782376Z   },
2026-09-26T11:55:54.7782460Z ): Router => {
2026-09-26T11:55:54.7782554Z   const router = Router();
2026-09-26T11:55:54.7782820Z   const controller = createApplicationManagementController(service, limits);
2026-09-26T11:55:54.7783040Z   const adminAuth = requireAdminAuthentication(authentication);
2026-09-26T11:55:54.7783362Z   const limiter = createDeviceCommunicationRateLimiter({
2026-09-26T11:55:54.7783498Z     enabled: rateLimitConfig.enabled,
2026-09-26T11:55:54.7783635Z     windowMs: rateLimitConfig.windowMs,
2026-09-26T11:55:54.7783789Z     maxRequests: rateLimitConfig.maxRequests,
2026-09-26T11:55:54.7783867Z   });
2026-09-26T11:55:54.7784002Z   const limited = limiter ? [limiter] : [];
2026-09-26T11:55:54.7784218Z   const deviceAuth = [...limited, requireDeviceSession(sessions)];
2026-09-26T11:55:54.7784226Z 
2026-09-26T11:55:54.7784309Z   router.post(
2026-09-26T11:55:54.7784437Z     '/device/applications/inventory',
2026-09-26T11:55:54.7784528Z     ...deviceAuth,
2026-09-26T11:55:54.7784649Z     controller.ingestInventory,
2026-09-26T11:55:54.7784727Z   );
2026-09-26T11:55:54.7784810Z   router.get(
2026-09-26T11:55:54.7784935Z     '/device/application-policy',
2026-09-26T11:55:54.7785020Z     ...deviceAuth,
2026-09-26T11:55:54.7785136Z     controller.getDevicePolicy,
2026-09-26T11:55:54.7785213Z   );
2026-09-26T11:55:54.7785302Z   router.post(
2026-09-26T11:55:54.7785429Z     '/device/application-policy/status',
2026-09-26T11:55:54.7785515Z     ...deviceAuth,
2026-09-26T11:55:54.7785638Z     controller.reportDeviceStatus,
2026-09-26T11:55:54.7785722Z   );
2026-09-26T11:55:54.7785728Z 
2026-09-26T11:55:54.7785808Z   router.get(
2026-09-26T11:55:54.7785944Z     '/admin/devices/:deviceId/applications',
2026-09-26T11:55:54.7786030Z     adminAuth,
2026-09-26T11:55:54.7786149Z     requireAdminAuthorization,
2026-09-26T11:55:54.7786247Z     controller.listInventory,
2026-09-26T11:55:54.7786323Z   );
2026-09-26T11:55:54.7786407Z   router.get(
2026-09-26T11:55:54.7786588Z     '/admin/devices/:deviceId/applications/:packageName',
2026-09-26T11:55:54.7786671Z     adminAuth,
2026-09-26T11:55:54.7786785Z     requireAdminAuthorization,
2026-09-26T11:55:54.7786912Z     controller.getInventoryItem,
2026-09-26T11:55:54.7786992Z   );
2026-09-26T11:55:54.7787074Z   router.post(
2026-09-26T11:55:54.7787270Z     '/admin/devices/:deviceId/applications/inventory/request',
2026-09-26T11:55:54.7787350Z     adminAuth,
2026-09-26T11:55:54.7787462Z     requireAdminAuthorization,
2026-09-26T11:55:54.7787582Z     controller.requestInventory,
2026-09-26T11:55:54.7787769Z   );
2026-09-26T11:55:54.7787779Z 
2026-09-26T11:55:54.7787855Z   router.post(
2026-09-26T11:55:54.7787979Z     '/admin/application-policies',
2026-09-26T11:55:54.7788056Z     adminAuth,
2026-09-26T11:55:54.7788173Z     requireAdminAuthorization,
2026-09-26T11:55:54.7788274Z     controller.createPolicy,
2026-09-26T11:55:54.7788346Z   );
2026-09-26T11:55:54.7788432Z   router.get(
2026-09-26T11:55:54.7788554Z     '/admin/application-policies',
2026-09-26T11:55:54.7788634Z     adminAuth,
2026-09-26T11:55:54.7788751Z     requireAdminAuthorization,
2026-09-26T11:55:54.7788845Z     controller.listPolicies,
2026-09-26T11:55:54.7788922Z   );
2026-09-26T11:55:54.7789007Z   router.get(
2026-09-26T11:55:54.7789145Z     '/admin/application-policies/:policyId',
2026-09-26T11:55:54.7789228Z     adminAuth,
2026-09-26T11:55:54.7789662Z     requireAdminAuthorization,
2026-09-26T11:55:54.7789781Z     controller.getPolicy,
2026-09-26T11:55:54.7789861Z   );
2026-09-26T11:55:54.7789952Z   router.patch(
2026-09-26T11:55:54.7790109Z     '/admin/application-policies/:policyId',
2026-09-26T11:55:54.7790193Z     adminAuth,
2026-09-26T11:55:54.7790306Z     requireAdminAuthorization,
2026-09-26T11:55:54.7790408Z     controller.updatePolicy,
2026-09-26T11:55:54.7790486Z   );
2026-09-26T11:55:54.7790494Z 
2026-09-26T11:55:54.7790570Z   router.get(
2026-09-26T11:55:54.7790732Z     '/admin/devices/:deviceId/application-policy',
2026-09-26T11:55:54.7790815Z     adminAuth,
2026-09-26T11:55:54.7790928Z     requireAdminAuthorization,
2026-09-26T11:55:54.7791051Z     controller.effectivePolicy,
2026-09-26T11:55:54.7791130Z   );
2026-09-26T11:55:54.7791211Z   router.post(
2026-09-26T11:55:54.7791365Z     '/admin/devices/:deviceId/application-policy',
2026-09-26T11:55:54.7791443Z     adminAuth,
2026-09-26T11:55:54.7791691Z     requireAdminAuthorization,
2026-09-26T11:55:54.7791799Z     controller.assignPolicy,
2026-09-26T11:55:54.7791873Z   );
2026-09-26T11:55:54.7791958Z   router.delete(
2026-09-26T11:55:54.7792108Z     '/admin/devices/:deviceId/application-policy',
2026-09-26T11:55:54.7792191Z     adminAuth,
2026-09-26T11:55:54.7792310Z     requireAdminAuthorization,
2026-09-26T11:55:54.7792405Z     controller.removePolicy,
2026-09-26T11:55:54.7792481Z   );
2026-09-26T11:55:54.7792563Z   router.get(
2026-09-26T11:55:54.7792736Z     '/admin/devices/:deviceId/application-policy/status',
2026-09-26T11:55:54.7792818Z     adminAuth,
2026-09-26T11:55:54.7792934Z     requireAdminAuthorization,
2026-09-26T11:55:54.7793054Z     controller.enforcementStatus,
2026-09-26T11:55:54.7793134Z   );
2026-09-26T11:55:54.7793219Z   router.post(
2026-09-26T11:55:54.7793384Z     '/admin/devices/:deviceId/application-policy/sync',
2026-09-26T11:55:54.7793466Z     adminAuth,
2026-09-26T11:55:54.7793579Z     requireAdminAuthorization,
2026-09-26T11:55:54.7793684Z     controller.syncPolicy,
2026-09-26T11:55:54.7793763Z   );
2026-09-26T11:55:54.7793770Z 
2026-09-26T11:55:54.7793846Z   router.all(
2026-09-26T11:55:54.7793974Z     '/device/applications/inventory',
2026-09-26T11:55:54.7794110Z     methodNotAllowed('POST, OPTIONS'),
2026-09-26T11:55:54.7794184Z   );
2026-09-26T11:55:54.7794452Z   router.all('/device/application-policy', methodNotAllowed('GET, OPTIONS'));
2026-09-26T11:55:54.7794536Z   router.all(
2026-09-26T11:55:54.7794666Z     '/device/application-policy/status',
2026-09-26T11:55:54.7794797Z     methodNotAllowed('POST, OPTIONS'),
2026-09-26T11:55:54.7794870Z   );
2026-09-26T11:55:54.7794951Z   router.all(
2026-09-26T11:55:54.7795087Z     '/admin/devices/:deviceId/applications',
2026-09-26T11:55:54.7795208Z     methodNotAllowed('GET, OPTIONS'),
2026-09-26T11:55:54.7795286Z   );
2026-09-26T11:55:54.7795366Z   router.all(
2026-09-26T11:55:54.7795484Z     '/admin/application-policies',
2026-09-26T11:55:54.7795619Z     methodNotAllowed('GET, POST, OPTIONS'),
2026-09-26T11:55:54.7795706Z   );
2026-09-26T11:55:54.7795713Z 
2026-09-26T11:55:54.7795796Z   return router;
2026-09-26T11:55:54.7795877Z };
2026-09-26T11:55:54.7796010Z ===== src/routes/v1/index.ts =====
2026-09-26T11:55:54.7796504Z import { Router } from 'express';
2026-09-26T11:55:54.7796702Z import type { AppConfig } from '../../config/env.js';
2026-09-26T11:55:54.7796876Z import type { Database } from '../../db/index.js';
2026-09-26T11:55:54.7797243Z import { PostgresAdminRepository } from '../../repositories/postgres-admin-repository.js';
2026-09-26T11:55:54.7797729Z import { PostgresDeviceCredentialRepository } from '../../repositories/postgres-device-credential-repository.js';
2026-09-26T11:55:54.7798288Z import { PostgresDeviceConnectionSessionRepository } from '../../repositories/postgres-device-connection-session-repository.js';
2026-09-26T11:55:54.7798743Z import { PostgresManagedDeviceRepository } from '../../repositories/postgres-managed-device-repository.js';
2026-09-26T11:55:54.7799132Z import { PostgresCommandRepository } from '../../repositories/postgres-command-repository.js';
2026-09-26T11:55:54.7799783Z import { PostgresEnrollmentSessionRepository } from '../../repositories/postgres-enrollment-session-repository.js';
2026-09-26T11:55:54.7800167Z import { AdminAuthenticationService } from '../../services/admin-authentication-service.js';
2026-09-26T11:55:54.7800517Z import { EnrollmentSessionService } from '../../services/enrollment-session-service.js';
2026-09-26T11:55:54.7800754Z import { createAdminAuthRouter } from './admin-auth.routes.js';
2026-09-26T11:55:54.7800996Z import { createEnrollmentRouter } from './enrollment.routes.js';
2026-09-26T11:55:54.7801203Z import { createHealthRouter } from './health.routes.js';
2026-09-26T11:55:54.7801413Z import { createCommandRouter } from './command.routes.js';
2026-09-26T11:55:54.7801756Z import { createDeviceCommunicationRouter } from './device-communication.routes.js';
2026-09-26T11:55:54.7802276Z import { DeviceCommunicationService } from '../../services/device-communication-service.js';
2026-09-26T11:55:54.7802530Z import { CommandService } from '../../services/command-service.js';
2026-09-26T11:55:54.7802919Z import { PostgresLocationRepository } from '../../repositories/postgres-location-repository.js';
2026-09-26T11:55:54.7803183Z import { LocationService } from '../../services/location-service.js';
2026-09-26T11:55:54.7803403Z import { createLocationRouter } from './location.routes.js';
2026-09-26T11:55:54.7803681Z import { createScreenSharingRouter } from './screen-sharing.routes.js';
2026-09-26T11:55:54.7804064Z import { InMemoryDeviceConnectionRegistry } from '../../realtime/device-connection-registry.js';
2026-09-26T11:55:54.7804357Z import { SseDeviceTransport } from '../../realtime/sse-device-transport.js';
2026-09-26T11:55:54.7804684Z import { CommandDeliveryService } from '../../services/command-delivery-service.js';
2026-09-26T11:55:54.7804990Z import { ScreenSharingService } from '../../services/screen-sharing-service.js';
2026-09-26T11:55:54.7805529Z import { PostgresScreenSharingSessionRepository } from '../../repositories/postgres-screen-sharing-session-repository.js';
2026-09-26T11:55:54.7806033Z import { PostgresAudioAccessSessionRepository } from '../../repositories/postgres-audio-access-session-repository.js';
2026-09-26T11:55:54.7806366Z import { DeviceMonitoringService } from '../../services/device-monitoring-service.js';
2026-09-26T11:55:54.7806843Z import { PostgresDeviceMonitoringRepository } from '../../repositories/postgres-device-monitoring-repository.js';
2026-09-26T11:55:54.7807153Z import { createDeviceMonitoringRouter } from './device-monitoring.routes.js';
2026-09-26T11:55:54.7807406Z import { createAudioAccessRouter } from './audio-access.routes.js';
2026-09-26T11:55:54.7807695Z import { AudioAccessService } from '../../services/audio-access-service.js';
2026-09-26T11:55:54.7808218Z import { PostgresApplicationInventoryRepository } from '../../repositories/postgres-application-inventory-repository.js';
2026-09-26T11:55:54.7808708Z import { PostgresApplicationPolicyRepository } from '../../repositories/postgres-application-policy-repository.js';
2026-09-26T11:55:54.7809460Z import { PostgresApplicationManagementEventRepository } from '../../repositories/postgres-application-management-event-repository.js';
2026-09-26T11:55:54.7809992Z import { ApplicationManagementService } from '../../services/application-management-service.js';
2026-09-26T11:55:54.7810357Z import { createApplicationManagementRouter } from './application-management.routes.js';
2026-09-26T11:55:54.7810366Z 
2026-09-26T11:55:54.7810510Z export const createV1Router = (
2026-09-26T11:55:54.7810605Z   database: Database,
2026-09-26T11:55:54.7810726Z   security: AppConfig['security'],
2026-09-26T11:55:54.7810855Z   rateLimit: AppConfig['rateLimit'],
2026-09-26T11:55:54.7811030Z   realtime: AppConfig['realtime'] = { enabled: false },
2026-09-26T11:55:54.7811112Z ): Router => {
2026-09-26T11:55:54.7811209Z   const router = Router();
2026-09-26T11:55:54.7811494Z   const screenSessions = new PostgresScreenSharingSessionRepository(database);
2026-09-26T11:55:54.7811757Z   const audioSessions = new PostgresAudioAccessSessionRepository(database);
2026-09-26T11:55:54.7811974Z   const adminRepository = new PostgresAdminRepository(database);
2026-09-26T11:55:54.7812158Z   const authentication = new AdminAuthenticationService(
2026-09-26T11:55:54.7812248Z     adminRepository,
2026-09-26T11:55:54.7812331Z     undefined,
2026-09-26T11:55:54.7812457Z     security.accessTokenTtlSeconds,
2026-09-26T11:55:54.7812581Z     security.sessionTtlSeconds,
2026-09-26T11:55:54.7812676Z     async (adminId) => {
2026-09-26T11:55:54.7812873Z       await screenSessions.expireForAdmin(adminId, new Date());
2026-09-26T11:55:54.7813073Z       await audioSessions.expireForAdmin(adminId, new Date());
2026-09-26T11:55:54.7813154Z     },
2026-09-26T11:55:54.7813228Z   );
2026-09-26T11:55:54.7813236Z 
2026-09-26T11:55:54.7813376Z   router.use(createHealthRouter(database));
2026-09-26T11:55:54.7813694Z   router.use(createAdminAuthRouter(authentication, rateLimit));
2026-09-26T11:55:54.7813704Z 
2026-09-26T11:55:54.7813950Z   const enrollmentRepository = new PostgresEnrollmentSessionRepository(
2026-09-26T11:55:54.7814039Z     database,
2026-09-26T11:55:54.7814116Z   );
2026-09-26T11:55:54.7814389Z   const enrollmentService = new EnrollmentSessionService(enrollmentRepository, {
2026-09-26T11:55:54.7814568Z     ttlSeconds: security.enrollmentSessionTtlSeconds,
2026-09-26T11:55:54.7814824Z     maxVerificationAttempts: security.enrollmentVerificationMaxAttempts,
2026-09-26T11:55:54.7814897Z   });
2026-09-26T11:55:54.7814905Z 
2026-09-26T11:55:54.7814985Z   router.use(
2026-09-26T11:55:54.7815234Z     createEnrollmentRouter(authentication, enrollmentService, rateLimit),
2026-09-26T11:55:54.7815306Z   );
2026-09-26T11:55:54.7815313Z 
2026-09-26T11:55:54.7815581Z   const deviceCredentials = new PostgresDeviceCredentialRepository(database);
2026-09-26T11:55:54.7815830Z   const deviceSessions = new PostgresDeviceConnectionSessionRepository(
2026-09-26T11:55:54.7815907Z     database,
2026-09-26T11:55:54.7815984Z   );
2026-09-26T11:55:54.7816214Z   const managedDevices = new PostgresManagedDeviceRepository(database);
2026-09-26T11:55:54.7816414Z   const commands = new PostgresCommandRepository(database);
2026-09-26T11:55:54.7816592Z   const communication = new DeviceCommunicationService(
2026-09-26T11:55:54.7816680Z     deviceCredentials,
2026-09-26T11:55:54.7816770Z     deviceSessions,
2026-09-26T11:55:54.7816860Z     managedDevices,
2026-09-26T11:55:54.7817052Z     { sessionTtlSeconds: security.deviceSessionTtlSeconds },
2026-09-26T11:55:54.7817130Z   );
2026-09-26T11:55:54.7817353Z   const realtimeRegistry = new InMemoryDeviceConnectionRegistry();
2026-09-26T11:55:54.7817493Z   const realtimeTransport = realtime.enabled
2026-09-26T11:55:54.7817641Z     ? new SseDeviceTransport(realtimeRegistry)
2026-09-26T11:55:54.7817725Z     : undefined;
2026-09-26T11:55:54.7817818Z   const commandDelivery =
2026-09-26T11:55:54.7817947Z     realtimeTransport === undefined
2026-09-26T11:55:54.7818029Z       ? undefined
2026-09-26T11:55:54.7818155Z       : new CommandDeliveryService(
2026-09-26T11:55:54.7818240Z           commands,
2026-09-26T11:55:54.7818445Z           realtimeTransport,
2026-09-26T11:55:54.7818538Z           deviceSessions,
2026-09-26T11:55:54.7818634Z           realtimeRegistry,
2026-09-26T11:55:54.7818712Z         );
2026-09-26T11:55:54.7818855Z   const commandService = new CommandService(
2026-09-26T11:55:54.7818932Z     commands,
2026-09-26T11:55:54.7819020Z     managedDevices,
2026-09-26T11:55:54.7819099Z     {
2026-09-26T11:55:54.7819240Z       ttlSeconds: security.commandTtlSeconds,
2026-09-26T11:55:54.7819548Z       maxPayloadBytes: security.commandMaxPayloadBytes,
2026-09-26T11:55:54.7819629Z     },
2026-09-26T11:55:54.7819715Z     commandDelivery,
2026-09-26T11:55:54.7819804Z     screenSessions,
2026-09-26T11:55:54.7819898Z     audioSessions,
2026-09-26T11:55:54.7819971Z   );
2026-09-26T11:55:54.7819978Z 
2026-09-26T11:55:54.7820200Z   router.use(createCommandRouter(authentication, commandService));
2026-09-26T11:55:54.7820483Z   const monitoringRepository = new PostgresDeviceMonitoringRepository(database);
2026-09-26T11:55:54.7820674Z   const monitoringService = new DeviceMonitoringService(
2026-09-26T11:55:54.7820772Z     monitoringRepository,
2026-09-26T11:55:54.7820855Z     managedDevices,
2026-09-26T11:55:54.7820934Z     {
2026-09-26T11:55:54.7821101Z       staleSeconds: security.monitoringStaleSeconds,
2026-09-26T11:55:54.7821290Z       veryStaleSeconds: security.monitoringVeryStaleSeconds,
2026-09-26T11:55:54.7821523Z       maxFutureSkewSeconds: security.monitoringMaxFutureSkewSeconds,
2026-09-26T11:55:54.7821606Z     },
2026-09-26T11:55:54.7821682Z   );
2026-09-26T11:55:54.7821688Z 
2026-09-26T11:55:54.7821773Z   router.use(
2026-09-26T11:55:54.7821905Z     createDeviceMonitoringRouter(
2026-09-26T11:55:54.7821999Z       monitoringService,
2026-09-26T11:55:54.7822092Z       authentication,
2026-09-26T11:55:54.7822304Z       deviceSessions,
2026-09-26T11:55:54.7822389Z       rateLimit,
2026-09-26T11:55:54.7822535Z       security.monitoringMaxPayloadBytes,
2026-09-26T11:55:54.7822609Z     ),
2026-09-26T11:55:54.7822695Z   );
2026-09-26T11:55:54.7822702Z 
2026-09-26T11:55:54.7822785Z   router.use(
2026-09-26T11:55:54.7822912Z     createDeviceCommunicationRouter(
2026-09-26T11:55:54.7823005Z       communication,
2026-09-26T11:55:54.7823098Z       commandService,
2026-09-26T11:55:54.7823188Z       deviceCredentials,
2026-09-26T11:55:54.7823278Z       deviceSessions,
2026-09-26T11:55:54.7823355Z       rateLimit,
2026-09-26T11:55:54.7823449Z       realtimeTransport,
2026-09-26T11:55:54.7823543Z       commandDelivery,
2026-09-26T11:55:54.7823617Z     ),
2026-09-26T11:55:54.7823694Z   );
2026-09-26T11:55:54.7823701Z 
2026-09-26T11:55:54.7823904Z   const locations = new PostgresLocationRepository(database);
2026-09-26T11:55:54.7824145Z   const locationService = new LocationService(locations, managedDevices);
2026-09-26T11:55:54.7824235Z   router.use(
2026-09-26T11:55:54.7824335Z     createLocationRouter(
2026-09-26T11:55:54.7824420Z       authentication,
2026-09-26T11:55:54.7824509Z       locationService,
2026-09-26T11:55:54.7824604Z       deviceSessions,
2026-09-26T11:55:54.7824684Z       rateLimit,
2026-09-26T11:55:54.7824763Z     ),
2026-09-26T11:55:54.7824835Z   );
2026-09-26T11:55:54.7824842Z 
2026-09-26T11:55:54.7825000Z   const screenSharing = new ScreenSharingService(
2026-09-26T11:55:54.7825090Z     screenSessions,
2026-09-26T11:55:54.7825176Z     managedDevices,
2026-09-26T11:55:54.7825263Z     deviceSessions,
2026-09-26T11:55:54.7825354Z     commandService,
2026-09-26T11:55:54.7825428Z     {
2026-09-26T11:55:54.7825659Z       maxDurationSeconds: security.screenSharingMaxDurationSeconds,
2026-09-26T11:55:54.7825869Z       retentionSeconds: security.screenSharingRetentionSeconds,
2026-09-26T11:55:54.7825948Z     },
2026-09-26T11:55:54.7826027Z   );
2026-09-26T11:55:54.7826108Z   router.use(
2026-09-26T11:55:54.7826238Z     createScreenSharingRouter(
2026-09-26T11:55:54.7826347Z       authentication,
2026-09-26T11:55:54.7826431Z       screenSharing,
2026-09-26T11:55:54.7826521Z       deviceSessions,
2026-09-26T11:55:54.7826725Z       rateLimit,
2026-09-26T11:55:54.7826799Z     ),
2026-09-26T11:55:54.7826876Z   );
2026-09-26T11:55:54.7826883Z 
2026-09-26T11:55:54.7827143Z   const applicationInventory = new PostgresApplicationInventoryRepository(
2026-09-26T11:55:54.7827229Z     database,
2026-09-26T11:55:54.7827307Z   );
2026-09-26T11:55:54.7827588Z   const applicationPolicies = new PostgresApplicationPolicyRepository(database);
2026-09-26T11:55:54.7827868Z   const applicationEvents = new PostgresApplicationManagementEventRepository(
2026-09-26T11:55:54.7827952Z     database,
2026-09-26T11:55:54.7828026Z   );
2026-09-26T11:55:54.7828251Z   const applicationManagement = new ApplicationManagementService(
2026-09-26T11:55:54.7828350Z     applicationInventory,
2026-09-26T11:55:54.7828442Z     applicationPolicies,
2026-09-26T11:55:54.7828537Z     managedDevices,
2026-09-26T11:55:54.7828625Z     commandService,
2026-09-26T11:55:54.7828714Z     applicationEvents,
2026-09-26T11:55:54.7828792Z     {
2026-09-26T11:55:54.7828997Z       maxInventoryItems: security.applicationInventoryMaxItems,
2026-09-26T11:55:54.7829192Z       maxPolicyRules: security.applicationPolicyMaxRules,
2026-09-26T11:55:54.7829544Z       maxFutureSkewSeconds: security.monitoringMaxFutureSkewSeconds,
2026-09-26T11:55:54.7829711Z       staleSeconds: security.monitoringStaleSeconds,
2026-09-26T11:55:54.7829909Z       veryStaleSeconds: security.monitoringVeryStaleSeconds,
2026-09-26T11:55:54.7829990Z     },
2026-09-26T11:55:54.7830062Z   );
2026-09-26T11:55:54.7830148Z   router.use(
2026-09-26T11:55:54.7830294Z     createApplicationManagementRouter(
2026-09-26T11:55:54.7830395Z       applicationManagement,
2026-09-26T11:55:54.7830487Z       authentication,
2026-09-26T11:55:54.7830573Z       deviceSessions,
2026-09-26T11:55:54.7830661Z       rateLimit,
2026-09-26T11:55:54.7830857Z       {
2026-09-26T11:55:54.7831081Z         maxInventoryItems: security.applicationInventoryMaxItems,
2026-09-26T11:55:54.7831276Z         maxPolicyRules: security.applicationPolicyMaxRules,
2026-09-26T11:55:54.7831523Z         maxPayloadBytes: security.applicationInventoryMaxPayloadBytes,
2026-09-26T11:55:54.7831601Z       },
2026-09-26T11:55:54.7831680Z     ),
2026-09-26T11:55:54.7831760Z   );
2026-09-26T11:55:54.7831767Z 
2026-09-26T11:55:54.7831907Z   const audioAccess = new AudioAccessService(
2026-09-26T11:55:54.7831999Z     audioSessions,
2026-09-26T11:55:54.7832088Z     managedDevices,
2026-09-26T11:55:54.7832182Z     deviceSessions,
2026-09-26T11:55:54.7832271Z     commandService,
2026-09-26T11:55:54.7832343Z     {
2026-09-26T11:55:54.7832564Z       maxDurationSeconds: security.audioAccessMaxDurationSeconds,
2026-09-26T11:55:54.7832767Z       retentionSeconds: security.audioAccessRetentionSeconds,
2026-09-26T11:55:54.7832840Z     },
2026-09-26T11:55:54.7832915Z   );
2026-09-26T11:55:54.7833006Z   router.use(
2026-09-26T11:55:54.7833108Z     createAudioAccessRouter(
2026-09-26T11:55:54.7833200Z       authentication,
2026-09-26T11:55:54.7833283Z       audioAccess,
2026-09-26T11:55:54.7833375Z       deviceSessions,
2026-09-26T11:55:54.7833468Z       rateLimit,
2026-09-26T11:55:54.7833542Z     ),
2026-09-26T11:55:54.7833622Z   );
2026-09-26T11:55:54.7833629Z 
2026-09-26T11:55:54.7833712Z   return router;
2026-09-26T11:55:54.7833787Z };
2026-09-26T11:55:54.7834011Z ===== src/services/application-management-service.ts =====
2026-09-26T11:55:54.7834173Z import { randomUUID } from 'node:crypto';
2026-09-26T11:55:54.7834257Z import type {
2026-09-26T11:55:54.7834385Z   ApplicationEnforcementStatus,
2026-09-26T11:55:54.7834488Z   ApplicationInventoryItem,
2026-09-26T11:55:54.7834585Z   ApplicationPolicy,
2026-09-26T11:55:54.7834708Z   ApplicationPolicyAssignment,
2026-09-26T11:55:54.7834814Z   ApplicationPolicySyncState,
2026-09-26T11:55:54.7834915Z   ApplicationRuleAction,
2026-09-26T11:55:54.7835089Z } from '../domain/application-management.js';
2026-09-26T11:55:54.7835413Z import { isValidAndroidPackageName } from '../domain/application-management.js';
2026-09-26T11:55:54.7835869Z import type { ApplicationInventoryRepository } from '../repositories/application-inventory-repository.js';
2026-09-26T11:55:54.7836509Z import type { ApplicationManagementEventRepository } from '../repositories/application-management-event-repository.js';
2026-09-26T11:55:54.7836924Z import type { ApplicationPolicyRepository } from '../repositories/application-policy-repository.js';
2026-09-26T11:55:54.7837294Z import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
2026-09-26T11:55:54.7837519Z import type { CommandService } from './command-service.js';
2026-09-26T11:55:54.7837688Z import { AppError } from '../types/errors.js';
2026-09-26T11:55:54.7837947Z import { PersistenceError } from '../domain/persistence-errors.js';
2026-09-26T11:55:54.7837954Z 
2026-09-26T11:55:54.7838140Z export interface ApplicationManagementOptions {
2026-09-26T11:55:54.7838275Z   readonly maxInventoryItems: number;
2026-09-26T11:55:54.7838397Z   readonly maxPolicyRules: number;
2026-09-26T11:55:54.7838527Z   readonly maxFutureSkewSeconds: number;
2026-09-26T11:55:54.7838656Z   readonly staleSeconds: number;
2026-09-26T11:55:54.7838780Z   readonly veryStaleSeconds: number;
2026-09-26T11:55:54.7838857Z }
2026-09-26T11:55:54.7838865Z 
2026-09-26T11:55:54.7838948Z const UUID =
2026-09-26T11:55:54.7839176Z   /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
2026-09-26T11:55:54.7839184Z 
2026-09-26T11:55:54.7839517Z const validatePackage = (packageName: string): void => {
2026-09-26T11:55:54.7839682Z   if (!isValidAndroidPackageName(packageName)) {
2026-09-26T11:55:54.7839780Z     throw new AppError(
2026-09-26T11:55:54.7839858Z       400,
2026-09-26T11:55:54.7839956Z       'INVALID_REQUEST',
2026-09-26T11:55:54.7840102Z       'Application package name is invalid.',
2026-09-26T11:55:54.7840177Z     );
2026-09-26T11:55:54.7840374Z   }
2026-09-26T11:55:54.7840454Z };
2026-09-26T11:55:54.7840462Z 
2026-09-26T11:55:54.7840581Z const validateTimestamp = (
2026-09-26T11:55:54.7840671Z   value: Date,
2026-09-26T11:55:54.7840757Z   now: Date,
2026-09-26T11:55:54.7840884Z   maxFutureSkewSeconds: number,
2026-09-26T11:55:54.7840967Z ): void => {
2026-09-26T11:55:54.7841158Z   if (Number.isNaN(value.getTime()) || value.getTime() < 0) {
2026-09-26T11:55:54.7841256Z     throw new AppError(
2026-09-26T11:55:54.7841331Z       400,
2026-09-26T11:55:54.7841426Z       'INVALID_REQUEST',
2026-09-26T11:55:54.7841562Z       'Application timestamp is invalid.',
2026-09-26T11:55:54.7841637Z     );
2026-09-26T11:55:54.7841717Z   }
2026-09-26T11:55:54.7841944Z   if (value.getTime() > now.getTime() + maxFutureSkewSeconds * 1000) {
2026-09-26T11:55:54.7842034Z     throw new AppError(
2026-09-26T11:55:54.7842116Z       400,
2026-09-26T11:55:54.7842209Z       'INVALID_REQUEST',
2026-09-26T11:55:54.7842383Z       'Application timestamp is too far in the future.',
2026-09-26T11:55:54.7842466Z     );
2026-09-26T11:55:54.7842540Z   }
2026-09-26T11:55:54.7842622Z };
2026-09-26T11:55:54.7842628Z 
2026-09-26T11:55:54.7842735Z const validateRules = (
2026-09-26T11:55:54.7842988Z   rules: readonly { packageName: string; action: ApplicationRuleAction }[],
2026-09-26T11:55:54.7843084Z   maxRules: number,
2026-09-26T11:55:54.7843168Z ): void => {
2026-09-26T11:55:54.7843283Z   if (rules.length > maxRules) {
2026-09-26T11:55:54.7843381Z     throw new AppError(
2026-09-26T11:55:54.7843460Z       413,
2026-09-26T11:55:54.7843550Z       'REQUEST_TOO_LARGE',
2026-09-26T11:55:54.7843709Z       'Application policy contains too many rules.',
2026-09-26T11:55:54.7843786Z     );
2026-09-26T11:55:54.7843866Z   }
2026-09-26T11:55:54.7843984Z   const seen = new Set<string>();
2026-09-26T11:55:54.7844080Z   for (const rule of rules) {
2026-09-26T11:55:54.7844220Z     validatePackage(rule.packageName);
2026-09-26T11:55:54.7844355Z     if (seen.has(rule.packageName)) {
2026-09-26T11:55:54.7844450Z       throw new AppError(
2026-09-26T11:55:54.7844536Z         409,
2026-09-26T11:55:54.7844618Z         'CONFLICT',
2026-09-26T11:55:54.7844818Z         'Application policy contains duplicate package rules.',
2026-09-26T11:55:54.7845019Z       );
2026-09-26T11:55:54.7845094Z     }
2026-09-26T11:55:54.7845216Z     seen.add(rule.packageName);
2026-09-26T11:55:54.7845398Z     if (rule.action !== 'ALLOW' && rule.action !== 'BLOCK') {
2026-09-26T11:55:54.7845491Z       throw new AppError(
2026-09-26T11:55:54.7845574Z         400,
2026-09-26T11:55:54.7845671Z         'INVALID_REQUEST',
2026-09-26T11:55:54.7845825Z         'Application policy rule action is invalid.',
2026-09-26T11:55:54.7845906Z       );
2026-09-26T11:55:54.7845981Z     }
2026-09-26T11:55:54.7846060Z   }
2026-09-26T11:55:54.7846139Z };
2026-09-26T11:55:54.7846146Z 
2026-09-26T11:55:54.7846314Z export class ApplicationManagementService {
2026-09-26T11:55:54.7846402Z   constructor(
2026-09-26T11:55:54.7846621Z     private readonly inventory: ApplicationInventoryRepository,
2026-09-26T11:55:54.7846811Z     private readonly policies: ApplicationPolicyRepository,
2026-09-26T11:55:54.7846984Z     private readonly devices: ManagedDeviceRepository,
2026-09-26T11:55:54.7847137Z     private readonly commands: CommandService,
2026-09-26T11:55:54.7847354Z     private readonly events: ApplicationManagementEventRepository,
2026-09-26T11:55:54.7847545Z     private readonly options: ApplicationManagementOptions,
2026-09-26T11:55:54.7847626Z   ) {}
2026-09-26T11:55:54.7847633Z 
2026-09-26T11:55:54.7847752Z   async reportInventory(input: {
2026-09-26T11:55:54.7847856Z     managedDeviceId: string;
2026-09-26T11:55:54.7847948Z     observedAt: Date;
2026-09-26T11:55:54.7848033Z     receivedAt: Date;
2026-09-26T11:55:54.7848126Z     items: readonly Omit<
2026-09-26T11:55:54.7848242Z       ApplicationInventoryItem,
2026-09-26T11:55:54.7848336Z       | 'managedDeviceId'
2026-09-26T11:55:54.7848429Z       | 'firstObservedAt'
2026-09-26T11:55:54.7848597Z       | 'lastObservedAt'
2026-09-26T11:55:54.7848695Z       | 'lastReceivedAt'
2026-09-26T11:55:54.7848774Z     >[];
2026-09-26T11:55:54.7848849Z   }) {
2026-09-26T11:55:54.7848969Z     const now = input.receivedAt;
2026-09-26T11:55:54.7849254Z     validateTimestamp(input.observedAt, now, this.options.maxFutureSkewSeconds);
2026-09-26T11:55:54.7849583Z     if (input.items.length > this.options.maxInventoryItems) {
2026-09-26T11:55:54.7849683Z       throw new AppError(
2026-09-26T11:55:54.7849764Z         413,
2026-09-26T11:55:54.7849860Z         'REQUEST_TOO_LARGE',
2026-09-26T11:55:54.7850059Z         'Application inventory contains too many applications.',
2026-09-26T11:55:54.7850136Z       );
2026-09-26T11:55:54.7850217Z     }
2026-09-26T11:55:54.7850224Z 
2026-09-26T11:55:54.7850345Z     const seen = new Set<string>();
2026-09-26T11:55:54.7850466Z     for (const item of input.items) {
2026-09-26T11:55:54.7850604Z       validatePackage(item.packageName);
2026-09-26T11:55:54.7850741Z       if (seen.has(item.packageName)) {
2026-09-26T11:55:54.7850833Z         throw new AppError(
2026-09-26T11:55:54.7850919Z           409,
2026-09-26T11:55:54.7851003Z           'CONFLICT',
2026-09-26T11:55:54.7851222Z           'Application inventory contains duplicate package names.',
2026-09-26T11:55:54.7851304Z         );
2026-09-26T11:55:54.7851381Z       }
2026-09-26T11:55:54.7851510Z       seen.add(item.packageName);
2026-09-26T11:55:54.7851593Z       if (
2026-09-26T11:55:54.7851709Z         item.versionCode !== null &&
2026-09-26T11:55:54.7851944Z         (!Number.isSafeInteger(item.versionCode) || item.versionCode < 0)
2026-09-26T11:55:54.7852026Z       ) {
2026-09-26T11:55:54.7852117Z         throw new AppError(
2026-09-26T11:55:54.7852202Z           400,
2026-09-26T11:55:54.7852292Z           'INVALID_REQUEST',
2026-09-26T11:55:54.7852481Z           'Application version code is invalid.',
2026-09-26T11:55:54.7852567Z         );
2026-09-26T11:55:54.7852643Z       }
2026-09-26T11:55:54.7852723Z     }
2026-09-26T11:55:54.7852739Z 
2026-09-26T11:55:54.7852965Z     const device = await this.devices.findById(input.managedDeviceId);
2026-09-26T11:55:54.7853039Z     if (
2026-09-26T11:55:54.7853131Z       device === null ||
2026-09-26T11:55:54.7853398Z       device.enrollmentStatus !== 'ACTIVE' ||
2026-09-26T11:55:54.7853531Z       device.operationalStatus !== 'ACTIVE'
2026-09-26T11:55:54.7853613Z     ) {
2026-09-26T11:55:54.7853709Z       throw new AppError(
2026-09-26T11:55:54.7853796Z         403,
2026-09-26T11:55:54.7853920Z         'DEVICE_AUTHORIZATION_DENIED',
2026-09-26T11:55:54.7854100Z         'Application inventory reporting is not authorized.',
2026-09-26T11:55:54.7854183Z       );
2026-09-26T11:55:54.7854263Z     }
2026-09-26T11:55:54.7854271Z 
2026-09-26T11:55:54.7854471Z     const result = await this.inventory.replaceForDevice(input);
2026-09-26T11:55:54.7854567Z     if (result.applied) {
2026-09-26T11:55:54.7854686Z       await this.events.record({
2026-09-26T11:55:54.7854773Z         id: randomUUID(),
2026-09-26T11:55:54.7854917Z         eventType: 'INVENTORY_SYNCHRONIZED',
2026-09-26T11:55:54.7855034Z         adminId: device.adminId,
2026-09-26T11:55:54.7855154Z         managedDeviceId: device.id,
2026-09-26T11:55:54.7855253Z         policyId: null,
2026-09-26T11:55:54.7855348Z         policyVersion: null,
2026-09-26T11:55:54.7855529Z         metadata: { applicationCount: input.items.length },
2026-09-26T11:55:54.7855609Z       });
2026-09-26T11:55:54.7855683Z     }
2026-09-26T11:55:54.7855774Z     return result;
2026-09-26T11:55:54.7855854Z   }
2026-09-26T11:55:54.7855861Z 
2026-09-26T11:55:54.7855950Z   async listInventory(
2026-09-26T11:55:54.7856040Z     adminId: string,
2026-09-26T11:55:54.7856126Z     deviceId: string,
2026-09-26T11:55:54.7856288Z     page?: { limit?: number; cursor?: string | null },
2026-09-26T11:55:54.7856367Z   ) {
2026-09-26T11:55:54.7856579Z     const device = await this.requireOwnedDevice(adminId, deviceId);
2026-09-26T11:55:54.7856951Z     const result = await this.inventory.listForAdmin(adminId, device.id, page);
2026-09-26T11:55:54.7857103Z     const freshness = this.inventoryFreshness(
2026-09-26T11:55:54.7857194Z       result.receivedAt,
2026-09-26T11:55:54.7857322Z       device.enrollmentStatus,
2026-09-26T11:55:54.7857441Z       device.operationalStatus,
2026-09-26T11:55:54.7857530Z       device.lastSeenAt,
2026-09-26T11:55:54.7857620Z       new Date(),
2026-09-26T11:55:54.7857698Z     );
2026-09-26T11:55:54.7857814Z     return { ...result, freshness };
2026-09-26T11:55:54.7857893Z   }
2026-09-26T11:55:54.7857900Z 
2026-09-26T11:55:54.7857991Z   async getInventoryItem(
2026-09-26T11:55:54.7858080Z     adminId: string,
2026-09-26T11:55:54.7858168Z     deviceId: string,
2026-09-26T11:55:54.7858257Z     packageName: string,
2026-09-26T11:55:54.7858335Z   ) {
2026-09-26T11:55:54.7858457Z     validatePackage(packageName);
2026-09-26T11:55:54.7858625Z     await this.requireOwnedDevice(adminId, deviceId);
2026-09-26T11:55:54.7858874Z     return this.inventory.findForAdmin(adminId, deviceId, packageName);
2026-09-26T11:55:54.7858954Z   }
2026-09-26T11:55:54.7858961Z 
2026-09-26T11:55:54.7859155Z   async requestInventory(adminId: string, deviceId: string) {
2026-09-26T11:55:54.7859527Z     const device = await this.requireOwnedActiveDevice(adminId, deviceId);
2026-09-26T11:55:54.7859661Z     const correlationId = randomUUID();
2026-09-26T11:55:54.7859911Z     const result = await this.commands.createApplicationInventoryRequest(
2026-09-26T11:55:54.7859997Z       adminId,
2026-09-26T11:55:54.7860136Z       { deviceId: device.id, correlationId },
2026-09-26T11:55:54.7860211Z     );
2026-09-26T11:55:54.7860329Z     await this.events.record({
2026-09-26T11:55:54.7860418Z       id: randomUUID(),
2026-09-26T11:55:54.7860553Z       eventType: 'POLICY_SYNC_REQUESTED',
2026-09-26T11:55:54.7860638Z       adminId,
2026-09-26T11:55:54.7860754Z       managedDeviceId: device.id,
2026-09-26T11:55:54.7860850Z       policyId: null,
2026-09-26T11:55:54.7860950Z       policyVersion: null,
2026-09-26T11:55:54.7861162Z       metadata: { commandType: 'REQUEST_APPLICATION_INVENTORY' },
2026-09-26T11:55:54.7861244Z     });
2026-09-26T11:55:54.7861328Z     return result;
2026-09-26T11:55:54.7861406Z   }
2026-09-26T11:55:54.7861535Z 
2026-09-26T11:55:54.7861643Z   async createPolicy(input: {
2026-09-26T11:55:54.7861728Z     adminId: string;
2026-09-26T11:55:54.7861819Z     name: string;
2026-09-26T11:55:54.7861937Z     description: string | null;
2026-09-26T11:55:54.7862188Z     rules: readonly { packageName: string; action: ApplicationRuleAction }[];
2026-09-26T11:55:54.7862269Z   }) {
2026-09-26T11:55:54.7862471Z     validateRules(input.rules, this.options.maxPolicyRules);
2026-09-26T11:55:54.7862595Z     let policy: ApplicationPolicy;
2026-09-26T11:55:54.7862680Z     try {
2026-09-26T11:55:54.7862822Z       policy = await this.policies.create({
2026-09-26T11:55:54.7862911Z         id: randomUUID(),
2026-09-26T11:55:54.7863025Z         adminId: input.adminId,
2026-09-26T11:55:54.7863141Z         name: input.name.trim(),
2026-09-26T11:55:54.7863277Z         description: input.description,
2026-09-26T11:55:54.7863399Z         createdBy: input.adminId,
2026-09-26T11:55:54.7863492Z         rules: input.rules,
2026-09-26T11:55:54.7863578Z       });
2026-09-26T11:55:54.7863668Z     } catch (error) {
2026-09-26T11:55:54.7863903Z       if (error instanceof PersistenceError && error.code === 'CONFLICT') {
2026-09-26T11:55:54.7864002Z         throw new AppError(
2026-09-26T11:55:54.7864086Z           409,
2026-09-26T11:55:54.7864170Z           'CONFLICT',
2026-09-26T11:55:54.7864361Z           'An application policy with this name already exists.',
2026-09-26T11:55:54.7864436Z         );
2026-09-26T11:55:54.7864518Z       }
2026-09-26T11:55:54.7864605Z       throw error;
2026-09-26T11:55:54.7864678Z     }
2026-09-26T11:55:54.7864794Z     await this.events.record({
2026-09-26T11:55:54.7864885Z       id: randomUUID(),
2026-09-26T11:55:54.7865003Z       eventType: 'POLICY_CREATED',
2026-09-26T11:55:54.7865220Z       adminId: input.adminId,
2026-09-26T11:55:54.7865324Z       managedDeviceId: null,
2026-09-26T11:55:54.7865418Z       policyId: policy.id,
2026-09-26T11:55:54.7865542Z       policyVersion: policy.version,
2026-09-26T11:55:54.7865703Z       metadata: { ruleCount: policy.rules.length },
2026-09-26T11:55:54.7865784Z     });
2026-09-26T11:55:54.7865872Z     return policy;
2026-09-26T11:55:54.7865946Z   }
2026-09-26T11:55:54.7865954Z 
2026-09-26T11:55:54.7866126Z   async getPolicy(adminId: string, policyId: string) {
2026-09-26T11:55:54.7866330Z     this.assertUuid(policyId, 'Policy identifier is invalid.');
2026-09-26T11:55:54.7866545Z     const policy = await this.policies.findOwned(policyId, adminId);
2026-09-26T11:55:54.7866632Z     if (!policy)
2026-09-26T11:55:54.7866727Z       throw new AppError(
2026-09-26T11:55:54.7866807Z         404,
2026-09-26T11:55:54.7866902Z         'RESOURCE_NOT_FOUND',
2026-09-26T11:55:54.7867036Z         'Application policy was not found.',
2026-09-26T11:55:54.7867115Z       );
2026-09-26T11:55:54.7867209Z     return policy;
2026-09-26T11:55:54.7867283Z   }
2026-09-26T11:55:54.7867291Z 
2026-09-26T11:55:54.7867383Z   async listPolicies(
2026-09-26T11:55:54.7867472Z     adminId: string,
2026-09-26T11:55:54.7867629Z     page?: { limit?: number; cursor?: string | null },
2026-09-26T11:55:54.7867708Z   ) {
2026-09-26T11:55:54.7867870Z     return this.policies.listOwned(adminId, page);
2026-09-26T11:55:54.7867945Z   }
2026-09-26T11:55:54.7867952Z 
2026-09-26T11:55:54.7868052Z   async updatePolicy(input: {
2026-09-26T11:55:54.7868142Z     adminId: string;
2026-09-26T11:55:54.7868231Z     policyId: string;
2026-09-26T11:55:54.7868317Z     name: string;
2026-09-26T11:55:54.7868430Z     description: string | null;
2026-09-26T11:55:54.7868550Z     status: 'ACTIVE' | 'DISABLED';
2026-09-26T11:55:54.7868652Z     expectedVersion: number;
2026-09-26T11:55:54.7868900Z     rules: readonly { packageName: string; action: ApplicationRuleAction }[];
2026-09-26T11:55:54.7868980Z   }) {
2026-09-26T11:55:54.7869184Z     validateRules(input.rules, this.options.maxPolicyRules);
2026-09-26T11:55:54.7869260Z     try {
2026-09-26T11:55:54.7869552Z       const policy = await this.policies.updateOwned({
2026-09-26T11:55:54.7869796Z         ...input,
2026-09-26T11:55:54.7869913Z         updatedBy: input.adminId,
2026-09-26T11:55:54.7869992Z       });
2026-09-26T11:55:54.7870109Z       await this.events.record({
2026-09-26T11:55:54.7870203Z         id: randomUUID(),
2026-09-26T11:55:54.7870291Z         eventType:
2026-09-26T11:55:54.7870518Z           input.status === 'DISABLED' ? 'POLICY_DISABLED' : 'POLICY_UPDATED',
2026-09-26T11:55:54.7870633Z         adminId: input.adminId,
2026-09-26T11:55:54.7870746Z         managedDeviceId: null,
2026-09-26T11:55:54.7870837Z         policyId: policy.id,
2026-09-26T11:55:54.7870966Z         policyVersion: policy.version,
2026-09-26T11:55:54.7871139Z         metadata: { ruleCount: policy.rules.length },
2026-09-26T11:55:54.7871216Z       });
2026-09-26T11:55:54.7871419Z       await this.syncAssignedDevices(input.adminId, policy);
2026-09-26T11:55:54.7871507Z       return policy;
2026-09-26T11:55:54.7871601Z     } catch (error) {
2026-09-26T11:55:54.7871840Z       if (error instanceof PersistenceError && error.code === 'CONFLICT') {
2026-09-26T11:55:54.7871939Z         throw new AppError(
2026-09-26T11:55:54.7872028Z           409,
2026-09-26T11:55:54.7872118Z           'CONFLICT',
2026-09-26T11:55:54.7872264Z           'Application policy version is stale.',
2026-09-26T11:55:54.7872344Z         );
2026-09-26T11:55:54.7872426Z       }
2026-09-26T11:55:54.7872660Z       if (error instanceof PersistenceError && error.code === 'NOT_FOUND') {
2026-09-26T11:55:54.7872757Z         throw new AppError(
2026-09-26T11:55:54.7872836Z           404,
2026-09-26T11:55:54.7872948Z           'RESOURCE_NOT_FOUND',
2026-09-26T11:55:54.7873085Z           'Application policy was not found.',
2026-09-26T11:55:54.7873163Z         );
2026-09-26T11:55:54.7873243Z       }
2026-09-26T11:55:54.7873329Z       throw error;
2026-09-26T11:55:54.7873519Z     }
2026-09-26T11:55:54.7873602Z   }
2026-09-26T11:55:54.7873610Z 
2026-09-26T11:55:54.7873858Z   async assignPolicy(adminId: string, deviceId: string, policyId: string) {
2026-09-26T11:55:54.7874099Z     const device = await this.requireOwnedActiveDevice(adminId, deviceId);
2026-09-26T11:55:54.7874280Z     const policy = await this.getPolicy(adminId, policyId);
2026-09-26T11:55:54.7874404Z     if (policy.status !== 'ACTIVE') {
2026-09-26T11:55:54.7874496Z       throw new AppError(
2026-09-26T11:55:54.7874577Z         409,
2026-09-26T11:55:54.7874658Z         'CONFLICT',
2026-09-26T11:55:54.7874838Z         'A disabled application policy cannot be assigned.',
2026-09-26T11:55:54.7874917Z       );
2026-09-26T11:55:54.7874993Z     }
2026-09-26T11:55:54.7875155Z     let assignment: ApplicationPolicyAssignment;
2026-09-26T11:55:54.7875232Z     try {
2026-09-26T11:55:54.7875374Z       assignment = await this.policies.assign({
2026-09-26T11:55:54.7875502Z         managedDeviceId: device.id,
2026-09-26T11:55:54.7875598Z         policyId: policy.id,
2026-09-26T11:55:54.7875723Z         policyVersion: policy.version,
2026-09-26T11:55:54.7875817Z         assignedBy: adminId,
2026-09-26T11:55:54.7875898Z       });
2026-09-26T11:55:54.7875987Z     } catch (error) {
2026-09-26T11:55:54.7876133Z       if (error instanceof PersistenceError) {
2026-09-26T11:55:54.7876223Z         throw new AppError(
2026-09-26T11:55:54.7876309Z           409,
2026-09-26T11:55:54.7876396Z           'CONFLICT',
2026-09-26T11:55:54.7876585Z           'Application policy assignment could not be applied.',
2026-09-26T11:55:54.7876666Z         );
2026-09-26T11:55:54.7876739Z       }
2026-09-26T11:55:54.7876826Z       throw error;
2026-09-26T11:55:54.7876906Z     }
2026-09-26T11:55:54.7877046Z     const sync = await this.requestPolicySync(
2026-09-26T11:55:54.7877133Z       adminId,
2026-09-26T11:55:54.7877219Z       device.id,
2026-09-26T11:55:54.7877304Z       policy.id,
2026-09-26T11:55:54.7877401Z       policy.version,
2026-09-26T11:55:54.7877486Z     );
2026-09-26T11:55:54.7877603Z     await this.events.record({
2026-09-26T11:55:54.7877696Z       id: randomUUID(),
2026-09-26T11:55:54.7877814Z       eventType: 'POLICY_ASSIGNED',
2026-09-26T11:55:54.7877989Z       adminId,
2026-09-26T11:55:54.7878111Z       managedDeviceId: device.id,
2026-09-26T11:55:54.7878205Z       policyId: policy.id,
2026-09-26T11:55:54.7878333Z       policyVersion: policy.version,
2026-09-26T11:55:54.7878484Z       metadata: { commandId: sync.command.id },
2026-09-26T11:55:54.7878560Z     });
2026-09-26T11:55:54.7878680Z     return { assignment, sync };
2026-09-26T11:55:54.7878754Z   }
2026-09-26T11:55:54.7878766Z 
2026-09-26T11:55:54.7879019Z   async removePolicy(adminId: string, deviceId: string, policyId: string) {
2026-09-26T11:55:54.7879264Z     const device = await this.requireOwnedActiveDevice(adminId, deviceId);
2026-09-26T11:55:54.7879569Z     const policy = await this.getPolicy(adminId, policyId);
2026-09-26T11:55:54.7879801Z     const assignment = await this.policies.findAssignment(device.id);
2026-09-26T11:55:54.7879978Z     if (!assignment || assignment.policyId !== policy.id) {
2026-09-26T11:55:54.7880078Z       throw new AppError(
2026-09-26T11:55:54.7880167Z         404,
2026-09-26T11:55:54.7880262Z         'RESOURCE_NOT_FOUND',
2026-09-26T11:55:54.7880423Z         'Application policy assignment was not found.',
2026-09-26T11:55:54.7880506Z       );
2026-09-26T11:55:54.7880585Z     }
2026-09-26T11:55:54.7880797Z     await this.policies.removeAssignment(device.id, policy.id);
2026-09-26T11:55:54.7881047Z     const sync = await this.requestPolicySync(adminId, device.id, null, null);
2026-09-26T11:55:54.7881173Z     await this.events.record({
2026-09-26T11:55:54.7881262Z       id: randomUUID(),
2026-09-26T11:55:54.7881394Z       eventType: 'POLICY_REMOVED',
2026-09-26T11:55:54.7881480Z       adminId,
2026-09-26T11:55:54.7881602Z       managedDeviceId: device.id,
2026-09-26T11:55:54.7881702Z       policyId: policy.id,
2026-09-26T11:55:54.7881966Z       policyVersion: assignment.policyVersion,
2026-09-26T11:55:54.7882117Z       metadata: { commandId: sync.command.id },
2026-09-26T11:55:54.7882199Z     });
2026-09-26T11:55:54.7882318Z     return { removed: true, sync };
2026-09-26T11:55:54.7882408Z   }
2026-09-26T11:55:54.7882415Z 
2026-09-26T11:55:54.7882618Z   async getEffectivePolicy(adminId: string, deviceId: string) {
2026-09-26T11:55:54.7882832Z     const device = await this.requireOwnedDevice(adminId, deviceId);
2026-09-26T11:55:54.7883059Z     const assignment = await this.policies.findAssignment(device.id);
2026-09-26T11:55:54.7883153Z     if (!assignment) {
2026-09-26T11:55:54.7883233Z       return {
2026-09-26T11:55:54.7883353Z         managedDeviceId: device.id,
2026-09-26T11:55:54.7883440Z         policy: null,
2026-09-26T11:55:54.7883539Z         policyVersion: null,
2026-09-26T11:55:54.7883670Z         synchronizationRequired: false,
2026-09-26T11:55:54.7883746Z       };
2026-09-26T11:55:54.7883824Z     }
2026-09-26T11:55:54.7884051Z     const policy = await this.getPolicy(adminId, assignment.policyId);
2026-09-26T11:55:54.7884178Z     if (policy.status !== 'ACTIVE') {
2026-09-26T11:55:54.7884262Z       return {
2026-09-26T11:55:54.7884389Z         managedDeviceId: device.id,
2026-09-26T11:55:54.7884474Z         policy: null,
2026-09-26T11:55:54.7884603Z         policyVersion: policy.version,
2026-09-26T11:55:54.7884730Z         synchronizationRequired: true,
2026-09-26T11:55:54.7884812Z       };
2026-09-26T11:55:54.7884892Z     }
2026-09-26T11:55:54.7884972Z     return {
2026-09-26T11:55:54.7885090Z       managedDeviceId: device.id,
2026-09-26T11:55:54.7885175Z       policy: {
2026-09-26T11:55:54.7885259Z         id: policy.id,
2026-09-26T11:55:54.7885376Z         version: policy.version,
2026-09-26T11:55:54.7885474Z         rules: policy.rules,
2026-09-26T11:55:54.7885547Z       },
2026-09-26T11:55:54.7885671Z       policyVersion: policy.version,
2026-09-26T11:55:54.7885929Z       synchronizationRequired: assignment.policyVersion !== policy.version,
2026-09-26T11:55:54.7886013Z     };
2026-09-26T11:55:54.7886090Z   }
2026-09-26T11:55:54.7886098Z 
2026-09-26T11:55:54.7886304Z   async getEnforcementStatus(adminId: string, deviceId: string) {
2026-09-26T11:55:54.7886591Z     await this.requireOwnedDevice(adminId, deviceId);
2026-09-26T11:55:54.7886746Z     return this.policies.findSyncState(deviceId);
2026-09-26T11:55:54.7886817Z   }
2026-09-26T11:55:54.7886824Z 
2026-09-26T11:55:54.7886963Z   async getDevicePolicy(deviceId: string) {
2026-09-26T11:55:54.7887192Z     const device = await this.requireOwnedActiveDevice(null, deviceId);
2026-09-26T11:55:54.7887410Z     const assignment = await this.policies.findAssignment(device.id);
2026-09-26T11:55:54.7887503Z     if (!assignment) {
2026-09-26T11:55:54.7887590Z       return {
2026-09-26T11:55:54.7887711Z         managedDeviceId: device.id,
2026-09-26T11:55:54.7887803Z         policy: null,
2026-09-26T11:55:54.7887905Z         policyVersion: null,
2026-09-26T11:55:54.7888037Z         synchronizationRequired: false,
2026-09-26T11:55:54.7888119Z       };
2026-09-26T11:55:54.7888193Z     }
2026-09-26T11:55:54.7888352Z     const policy = await this.policies.findOwned(
2026-09-26T11:55:54.7888459Z       assignment.policyId,
2026-09-26T11:55:54.7888545Z       device.adminId,
2026-09-26T11:55:54.7888627Z     );
2026-09-26T11:55:54.7888770Z     if (!policy || policy.status !== 'ACTIVE') {
2026-09-26T11:55:54.7888849Z       return {
2026-09-26T11:55:54.7888971Z         managedDeviceId: device.id,
2026-09-26T11:55:54.7889057Z         policy: null,
2026-09-26T11:55:54.7889158Z         policyVersion: null,
2026-09-26T11:55:54.7889291Z         synchronizationRequired: true,
2026-09-26T11:55:54.7889494Z       };
2026-09-26T11:55:54.7889578Z     }
2026-09-26T11:55:54.7889665Z     return {
2026-09-26T11:55:54.7889787Z       managedDeviceId: device.id,
2026-09-26T11:55:54.7890042Z       policy: { id: policy.id, version: policy.version, rules: policy.rules },
2026-09-26T11:55:54.7890288Z       policyVersion: policy.version,
2026-09-26T11:55:54.7890547Z       synchronizationRequired: assignment.policyVersion !== policy.version,
2026-09-26T11:55:54.7890630Z     };
2026-09-26T11:55:54.7890706Z   }
2026-09-26T11:55:54.7890726Z 
2026-09-26T11:55:54.7890849Z   async reportDeviceStatus(input: {
2026-09-26T11:55:54.7890944Z     deviceId: string;
2026-09-26T11:55:54.7891038Z     policyId: string | null;
2026-09-26T11:55:54.7891163Z     policyVersion: number | null;
2026-09-26T11:55:54.7891305Z     status: ApplicationEnforcementStatus;
2026-09-26T11:55:54.7891394Z     reportedAt: Date;
2026-09-26T11:55:54.7891494Z     errorCode: string | null;
2026-09-26T11:55:54.7891576Z   }) {
2026-09-26T11:55:54.7891835Z     const device = await this.requireOwnedActiveDevice(null, input.deviceId);
2026-09-26T11:55:54.7891933Z     validateTimestamp(
2026-09-26T11:55:54.7892030Z       input.reportedAt,
2026-09-26T11:55:54.7892112Z       new Date(),
2026-09-26T11:55:54.7892250Z       this.options.maxFutureSkewSeconds,
2026-09-26T11:55:54.7892330Z     );
2026-09-26T11:55:54.7892451Z     if (input.policyId !== null)
2026-09-26T11:55:54.7892682Z       this.assertUuid(input.policyId, 'Policy identifier is invalid.');
2026-09-26T11:55:54.7892760Z     if (
2026-09-26T11:55:54.7892896Z       input.policyVersion !== null &&
2026-09-26T11:55:54.7893139Z       (!Number.isInteger(input.policyVersion) || input.policyVersion <= 0)
2026-09-26T11:55:54.7893215Z     ) {
2026-09-26T11:55:54.7893462Z       throw new AppError(400, 'INVALID_REQUEST', 'Policy version is invalid.');
2026-09-26T11:55:54.7893540Z     }
2026-09-26T11:55:54.7893766Z     const assignment = await this.policies.findAssignment(device.id);
2026-09-26T11:55:54.7893891Z     if (input.status === 'APPLIED') {
2026-09-26T11:55:54.7893979Z       if (assignment) {
2026-09-26T11:55:54.7894061Z         if (
2026-09-26T11:55:54.7894218Z           input.policyId !== assignment.policyId ||
2026-09-26T11:55:54.7894395Z           input.policyVersion !== assignment.policyVersion
2026-09-26T11:55:54.7894484Z         ) {
2026-09-26T11:55:54.7894582Z           throw new AppError(
2026-09-26T11:55:54.7894664Z             409,
2026-09-26T11:55:54.7894752Z             'CONFLICT',
2026-09-26T11:55:54.7895037Z             'A device cannot report an applied policy that is not its current assignment.',
2026-09-26T11:55:54.7895236Z           );
2026-09-26T11:55:54.7895316Z         }
2026-09-26T11:55:54.7895541Z       } else if (input.policyId !== null || input.policyVersion !== null) {
2026-09-26T11:55:54.7895642Z         throw new AppError(
2026-09-26T11:55:54.7895724Z           409,
2026-09-26T11:55:54.7895808Z           'CONFLICT',
2026-09-26T11:55:54.7896034Z           'A device without an assigned policy must report a null policy.',
2026-09-26T11:55:54.7896114Z         );
2026-09-26T11:55:54.7896190Z       }
2026-09-26T11:55:54.7896269Z     }
2026-09-26T11:55:54.7896481Z     const current = await this.policies.findSyncState(device.id);
2026-09-26T11:55:54.7896639Z     const result = await this.policies.reportSync({
2026-09-26T11:55:54.7896730Z       ...input,
2026-09-26T11:55:54.7896897Z       errorCode: input.errorCode?.slice(0, 128) ?? null,
2026-09-26T11:55:54.7896981Z     });
2026-09-26T11:55:54.7897063Z     if (
2026-09-26T11:55:54.7897196Z       current?.status !== result.status ||
2026-09-26T11:55:54.7897425Z       current?.reportedPolicyVersion !== result.reportedPolicyVersion
2026-09-26T11:55:54.7897503Z     ) {
2026-09-26T11:55:54.7897620Z       await this.events.record({
2026-09-26T11:55:54.7897717Z         id: randomUUID(),
2026-09-26T11:55:54.7897864Z         eventType: 'ENFORCEMENT_STATUS_CHANGED',
2026-09-26T11:55:54.7897976Z         adminId: device.adminId,
2026-09-26T11:55:54.7898099Z         managedDeviceId: device.id,
2026-09-26T11:55:54.7898234Z         policyId: result.reportedPolicyId,
2026-09-26T11:55:54.7898396Z         policyVersion: result.reportedPolicyVersion,
2026-09-26T11:55:54.7898531Z         metadata: { status: result.status },
2026-09-26T11:55:54.7898608Z       });
2026-09-26T11:55:54.7898770Z     }
2026-09-26T11:55:54.7898861Z     return result;
2026-09-26T11:55:54.7898934Z   }
2026-09-26T11:55:54.7898942Z 
2026-09-26T11:55:54.7899038Z   async requestPolicySync(
2026-09-26T11:55:54.7899129Z     adminId: string,
2026-09-26T11:55:54.7899213Z     deviceId: string,
2026-09-26T11:55:54.7899429Z     policyId: string | null,
2026-09-26T11:55:54.7899557Z     policyVersion: number | null,
2026-09-26T11:55:54.7899633Z   ) {
2026-09-26T11:55:54.7899828Z     await this.requireOwnedActiveDevice(adminId, deviceId);
2026-09-26T11:55:54.7899953Z     const correlationId = randomUUID();
2026-09-26T11:55:54.7900198Z     const command = await this.commands.createApplicationPolicyCommand(
2026-09-26T11:55:54.7900280Z       adminId,
2026-09-26T11:55:54.7900453Z       { deviceId, policyId, policyVersion, correlationId },
2026-09-26T11:55:54.7900532Z     );
2026-09-26T11:55:54.7900704Z     const sync = await this.policies.setSyncRequested({
2026-09-26T11:55:54.7900823Z       managedDeviceId: deviceId,
2026-09-26T11:55:54.7900914Z       policyId,
2026-09-26T11:55:54.7901005Z       policyVersion,
2026-09-26T11:55:54.7901118Z       requestedAt: new Date(),
2026-09-26T11:55:54.7901197Z     });
2026-09-26T11:55:54.7901314Z     await this.events.record({
2026-09-26T11:55:54.7901408Z       id: randomUUID(),
2026-09-26T11:55:54.7901540Z       eventType: 'POLICY_SYNC_REQUESTED',
2026-09-26T11:55:54.7901620Z       adminId,
2026-09-26T11:55:54.7901740Z       managedDeviceId: deviceId,
2026-09-26T11:55:54.7901829Z       policyId,
2026-09-26T11:55:54.7901914Z       policyVersion,
2026-09-26T11:55:54.7902068Z       metadata: { commandId: command.command.id },
2026-09-26T11:55:54.7902145Z     });
2026-09-26T11:55:54.7902239Z     return { command, sync };
2026-09-26T11:55:54.7902319Z   }
2026-09-26T11:55:54.7902326Z 
2026-09-26T11:55:54.7902448Z   private async syncAssignedDevices(
2026-09-26T11:55:54.7902539Z     adminId: string,
2026-09-26T11:55:54.7902661Z     policy: ApplicationPolicy,
2026-09-26T11:55:54.7902738Z   ) {
2026-09-26T11:55:54.7903026Z     const assignments = await this.policies.listAssignmentsForPolicy(policy.id);
2026-09-26T11:55:54.7903166Z     for (const assignment of assignments) {
2026-09-26T11:55:54.7903416Z       const device = await this.devices.findById(assignment.managedDeviceId);
2026-09-26T11:55:54.7903655Z       if (
2026-09-26T11:55:54.7903747Z         !device ||
2026-09-26T11:55:54.7903870Z         device.adminId !== adminId ||
2026-09-26T11:55:54.7904019Z         device.enrollmentStatus !== 'ACTIVE' ||
2026-09-26T11:55:54.7904156Z         device.operationalStatus !== 'ACTIVE'
2026-09-26T11:55:54.7904240Z       ) {
2026-09-26T11:55:54.7904327Z         continue;
2026-09-26T11:55:54.7904402Z       }
2026-09-26T11:55:54.7904534Z       const correlationId = randomUUID();
2026-09-26T11:55:54.7904789Z       const command = await this.commands.createApplicationPolicyCommand(
2026-09-26T11:55:54.7904868Z         adminId,
2026-09-26T11:55:54.7904949Z         {
2026-09-26T11:55:54.7905062Z           deviceId: device.id,
2026-09-26T11:55:54.7905266Z           policyId: policy.status === 'ACTIVE' ? policy.id : null,
2026-09-26T11:55:54.7905506Z           policyVersion: policy.status === 'ACTIVE' ? policy.version : null,
2026-09-26T11:55:54.7905606Z           correlationId,
2026-09-26T11:55:54.7905685Z         },
2026-09-26T11:55:54.7905765Z       );
2026-09-26T11:55:54.7905908Z       await this.policies.setSyncRequested({
2026-09-26T11:55:54.7906036Z         managedDeviceId: device.id,
2026-09-26T11:55:54.7906236Z         policyId: policy.status === 'ACTIVE' ? policy.id : null,
2026-09-26T11:55:54.7906463Z         policyVersion: policy.status === 'ACTIVE' ? policy.version : null,
2026-09-26T11:55:54.7906581Z         requestedAt: new Date(),
2026-09-26T11:55:54.7906719Z       });
2026-09-26T11:55:54.7906867Z       await this.events.record({
2026-09-26T11:55:54.7907023Z         id: randomUUID(),
2026-09-26T11:55:54.7907276Z         eventType: 'POLICY_SYNC_REQUESTED',
2026-09-26T11:55:54.7907477Z         adminId,
2026-09-26T11:55:54.7907777Z         managedDeviceId: device.id,
2026-09-26T11:55:54.7908005Z         policyId: policy.status === 'ACTIVE' ? policy.id : null,
2026-09-26T11:55:54.7908289Z         policyVersion: policy.status === 'ACTIVE' ? policy.version : null,
2026-09-26T11:55:54.7915876Z         metadata: { commandId: command.command.id, reason: 'POLICY_CHANGED' },
2026-09-26T11:55:54.7916004Z       });
2026-09-26T11:55:54.7916089Z     }
2026-09-26T11:55:54.7916166Z   }
2026-09-26T11:55:54.7916175Z 
2026-09-26T11:55:54.7916473Z   private async requireOwnedDevice(adminId: string | null, deviceId: string) {
2026-09-26T11:55:54.7916728Z     this.assertUuid(deviceId, 'Managed-device identifier is invalid.');
2026-09-26T11:55:54.7916922Z     const device = await this.devices.findById(deviceId);
2026-09-26T11:55:54.7917009Z     if (!device)
2026-09-26T11:55:54.7917115Z       throw new AppError(
2026-09-26T11:55:54.7917199Z         404,
2026-09-26T11:55:54.7917303Z         'DEVICE_NOT_FOUND',
2026-09-26T11:55:54.7917447Z         'Managed device was not found.',
2026-09-26T11:55:54.7917528Z       );
2026-09-26T11:55:54.7917705Z     if (adminId !== null && device.adminId !== adminId) {
2026-09-26T11:55:54.7917805Z       throw new AppError(
2026-09-26T11:55:54.7917891Z         403,
2026-09-26T11:55:54.7918015Z         'AUTHORIZATION_DENIED',
2026-09-26T11:55:54.7918201Z         'The administrator does not control this device.',
2026-09-26T11:55:54.7918280Z       );
2026-09-26T11:55:54.7918364Z     }
2026-09-26T11:55:54.7918453Z     return device;
2026-09-26T11:55:54.7918539Z   }
2026-09-26T11:55:54.7918547Z 
2026-09-26T11:55:54.7918695Z   private async requireOwnedActiveDevice(
2026-09-26T11:55:54.7918790Z     adminId: string | null,
2026-09-26T11:55:54.7918886Z     deviceId: string,
2026-09-26T11:55:54.7918968Z   ) {
2026-09-26T11:55:54.7919192Z     const device = await this.requireOwnedDevice(adminId, deviceId);
2026-09-26T11:55:54.7919278Z     if (
2026-09-26T11:55:54.7919616Z       device.enrollmentStatus !== 'ACTIVE' ||
2026-09-26T11:55:54.7919762Z       device.operationalStatus !== 'ACTIVE'
2026-09-26T11:55:54.7919846Z     ) {
2026-09-26T11:55:54.7919940Z       throw new AppError(
2026-09-26T11:55:54.7920031Z         403,
2026-09-26T11:55:54.7920350Z         'DEVICE_AUTHORIZATION_DENIED',
2026-09-26T11:55:54.7920578Z         'Managed device is not authorized for application management.',
2026-09-26T11:55:54.7920664Z       );
2026-09-26T11:55:54.7920743Z     }
2026-09-26T11:55:54.7920829Z     return device;
2026-09-26T11:55:54.7920909Z   }
2026-09-26T11:55:54.7920917Z 
2026-09-26T11:55:54.7921024Z   private inventoryFreshness(
2026-09-26T11:55:54.7921122Z     receivedAt: Date | null,
2026-09-26T11:55:54.7921226Z     enrollmentStatus: string,
2026-09-26T11:55:54.7921346Z     operationalStatus: string,
2026-09-26T11:55:54.7921444Z     lastSeenAt: Date | null,
2026-09-26T11:55:54.7921529Z     now: Date,
2026-09-26T11:55:54.7921605Z   ):
2026-09-26T11:55:54.7921689Z     | 'FRESH'
2026-09-26T11:55:54.7921770Z     | 'STALE'
2026-09-26T11:55:54.7921859Z     | 'VERY_STALE'
2026-09-26T11:55:54.7921954Z     | 'NEVER_REPORTED'
2026-09-26T11:55:54.7922041Z     | 'DISCONNECTED'
2026-09-26T11:55:54.7922127Z     | 'REVOKED' {
2026-09-26T11:55:54.7922384Z     if (enrollmentStatus === 'REVOKED' || operationalStatus === 'REVOKED')
2026-09-26T11:55:54.7922478Z       return 'REVOKED';
2026-09-26T11:55:54.7922634Z     if (!receivedAt) return 'NEVER_REPORTED';
2026-09-26T11:55:54.7922718Z     if (
2026-09-26T11:55:54.7922806Z       !lastSeenAt ||
2026-09-26T11:55:54.7923082Z       now.getTime() - lastSeenAt.getTime() > this.options.staleSeconds * 1000
2026-09-26T11:55:54.7923162Z     ) {
2026-09-26T11:55:54.7923258Z       return 'DISCONNECTED';
2026-09-26T11:55:54.7923335Z     }
2026-09-26T11:55:54.7923501Z     const age = now.getTime() - receivedAt.getTime();
2026-09-26T11:55:54.7923737Z     if (age >= this.options.veryStaleSeconds * 1000) return 'VERY_STALE';
2026-09-26T11:55:54.7923932Z     if (age >= this.options.staleSeconds * 1000) return 'STALE';
2026-09-26T11:55:54.7924134Z     return 'FRESH';
2026-09-26T11:55:54.7924223Z   }
2026-09-26T11:55:54.7924232Z 
2026-09-26T11:55:54.7924435Z   private assertUuid(value: string, message: string): void {
2026-09-26T11:55:54.7924692Z     if (!UUID.test(value)) throw new AppError(400, 'INVALID_REQUEST', message);
2026-09-26T11:55:54.7924773Z   }
2026-09-26T11:55:54.7924859Z }
2026-09-26T11:55:54.7925020Z ===== src/services/command-service.ts =====
2026-09-26T11:55:54.7925186Z import { randomUUID } from 'node:crypto';
2026-09-26T11:55:54.7925508Z import type { Command, CommandStatus, CommandType } from '../domain/command.js';
2026-09-26T11:55:54.7925770Z import { PersistenceError } from '../domain/persistence-errors.js';
2026-09-26T11:55:54.7926083Z import type { CommandRepository } from '../repositories/command-repository.js';
2026-09-26T11:55:54.7926459Z import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
2026-09-26T11:55:54.7926626Z import { AppError } from '../types/errors.js';
2026-09-26T11:55:54.7926945Z import type { CommandDeliveryService } from './command-delivery-service.js';
2026-09-26T11:55:54.7927403Z import type { ScreenSharingSessionRepository } from '../repositories/screen-sharing-session-repository.js';
2026-09-26T11:55:54.7927842Z import type { AudioAccessSessionRepository } from '../repositories/audio-access-session-repository.js';
2026-09-26T11:55:54.7927849Z 
2026-09-26T11:55:54.7928010Z export interface CommandServiceOptions {
2026-09-26T11:55:54.7928131Z   readonly ttlSeconds: number;
2026-09-26T11:55:54.7928261Z   readonly maxPayloadBytes: number;
2026-09-26T11:55:54.7928343Z }
2026-09-26T11:55:54.7928349Z 
2026-09-26T11:55:54.7928428Z const UUID =
2026-09-26T11:55:54.7928655Z   /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
2026-09-26T11:55:54.7928662Z 
2026-09-26T11:55:54.7928780Z export class CommandService {
2026-09-26T11:55:54.7928867Z   constructor(
2026-09-26T11:55:54.7929042Z     private readonly commands: CommandRepository,
2026-09-26T11:55:54.7929225Z     private readonly devices: ManagedDeviceRepository,
2026-09-26T11:55:54.7929618Z     private readonly options: CommandServiceOptions,
2026-09-26T11:55:54.7929813Z     private readonly delivery?: CommandDeliveryService,
2026-09-26T11:55:54.7930193Z     private readonly screenSessions?: ScreenSharingSessionRepository,
2026-09-26T11:55:54.7930416Z     private readonly audioSessions?: AudioAccessSessionRepository,
2026-09-26T11:55:54.7930503Z   ) {}
2026-09-26T11:55:54.7930596Z   async create(
2026-09-26T11:55:54.7930686Z     adminId: string,
2026-09-26T11:55:54.7930776Z     input: {
2026-09-26T11:55:54.7930867Z       deviceId: string;
2026-09-26T11:55:54.7930967Z       type: CommandType;
2026-09-26T11:55:54.7931055Z       version: number;
2026-09-26T11:55:54.7931143Z       payload: unknown;
2026-09-26T11:55:54.7931272Z       idempotencyKey: string | null;
2026-09-26T11:55:54.7931395Z       correlationId: string | null;
2026-09-26T11:55:54.7931471Z     },
2026-09-26T11:55:54.7931647Z   ): Promise<{ command: Command; created: boolean }> {
2026-09-26T11:55:54.7931770Z     if (!UUID.test(input.deviceId))
2026-09-26T11:55:54.7931863Z       throw new AppError(
2026-09-26T11:55:54.7931954Z         400,
2026-09-26T11:55:54.7932047Z         'INVALID_REQUEST',
2026-09-26T11:55:54.7932199Z         'Managed-device identifier is invalid.',
2026-09-26T11:55:54.7932285Z       );
2026-09-26T11:55:54.7932365Z     if (
2026-09-26T11:55:54.7932447Z       ![
2026-09-26T11:55:54.7932543Z         'FUTURE_COMMAND',
2026-09-26T11:55:54.7932637Z         'START_SCREEN_SHARE',
2026-09-26T11:55:54.7932736Z         'STOP_SCREEN_SHARE',
2026-09-26T11:55:54.7932826Z         'START_AUDIO_ACCESS',
2026-09-26T11:55:54.7932925Z         'STOP_AUDIO_ACCESS',
2026-09-26T11:55:54.7933051Z         'SYNC_APPLICATION_POLICY',
2026-09-26T11:55:54.7933182Z         'REQUEST_APPLICATION_INVENTORY',
2026-09-26T11:55:54.7933301Z       ].includes(input.type) ||
2026-09-26T11:55:54.7933397Z       input.version !== 1
2026-09-26T11:55:54.7933587Z     )
2026-09-26T11:55:54.7933689Z       throw new AppError(
2026-09-26T11:55:54.7933774Z         400,
2026-09-26T11:55:54.7933892Z         'UNSUPPORTED_COMMAND_TYPE',
2026-09-26T11:55:54.7934108Z         'The requested command type is not enabled in this phase.',
2026-09-26T11:55:54.7934186Z       );
2026-09-26T11:55:54.7934271Z     if (
2026-09-26T11:55:54.7934388Z       input.payload === null ||
2026-09-26T11:55:54.7934519Z       typeof input.payload !== 'object' ||
2026-09-26T11:55:54.7934643Z       Array.isArray(input.payload)
2026-09-26T11:55:54.7934724Z     )
2026-09-26T11:55:54.7934812Z       throw new AppError(
2026-09-26T11:55:54.7934892Z         400,
2026-09-26T11:55:54.7935006Z         'INVALID_COMMAND_PAYLOAD',
2026-09-26T11:55:54.7935152Z         'Command payload must be a JSON object.',
2026-09-26T11:55:54.7935233Z       );
2026-09-26T11:55:54.7935426Z     const payload = input.payload as Record<string, unknown>;
2026-09-26T11:55:54.7935679Z     if (input.type === 'FUTURE_COMMAND' && Object.keys(payload).length !== 0)
2026-09-26T11:55:54.7935776Z       throw new AppError(
2026-09-26T11:55:54.7935855Z         400,
2026-09-26T11:55:54.7935974Z         'INVALID_COMMAND_PAYLOAD',
2026-09-26T11:55:54.7936252Z         'FUTURE_COMMAND does not accept executable or device-control payload data.',
2026-09-26T11:55:54.7936329Z       );
2026-09-26T11:55:54.7936467Z     if (input.type !== 'FUTURE_COMMAND') {
2026-09-26T11:55:54.7936599Z       const keys = Object.keys(payload);
2026-09-26T11:55:54.7936689Z       const key = keys[0];
2026-09-26T11:55:54.7936788Z       const validCapability =
2026-09-26T11:55:54.7936884Z         keys.length === 1 &&
2026-09-26T11:55:54.7937073Z         (key === 'screenSessionId' || key === 'audioSessionId');
2026-09-26T11:55:54.7937200Z       const validCapabilityValue =
2026-09-26T11:55:54.7937321Z         (key === 'screenSessionId' &&
2026-09-26T11:55:54.7937496Z           typeof payload.screenSessionId === 'string' &&
2026-09-26T11:55:54.7937654Z           UUID.test(payload.screenSessionId)) ||
2026-09-26T11:55:54.7937769Z         (key === 'audioSessionId' &&
2026-09-26T11:55:54.7937938Z           typeof payload.audioSessionId === 'string' &&
2026-09-26T11:55:54.7938165Z           UUID.test(payload.audioSessionId));
2026-09-26T11:55:54.7938290Z       const validApplicationPolicy =
2026-09-26T11:55:54.7938445Z         input.type === 'SYNC_APPLICATION_POLICY' &&
2026-09-26T11:55:54.7938538Z         keys.length === 2 &&
2026-09-26T11:55:54.7938678Z         typeof payload.policyId === 'string' &&
2026-09-26T11:55:54.7938806Z         UUID.test(payload.policyId) &&
2026-09-26T11:55:54.7938962Z         Number.isInteger(payload.policyVersion) &&
2026-09-26T11:55:54.7939091Z         Number(payload.policyVersion) > 0;
2026-09-26T11:55:54.7939233Z       const validApplicationPolicyRemoval =
2026-09-26T11:55:54.7939512Z         input.type === 'SYNC_APPLICATION_POLICY' &&
2026-09-26T11:55:54.7939613Z         keys.length === 2 &&
2026-09-26T11:55:54.7939740Z         payload.policyId === null &&
2026-09-26T11:55:54.7939865Z         payload.policyVersion === null;
2026-09-26T11:55:54.7939992Z       const validInventoryRequest =
2026-09-26T11:55:54.7940166Z         input.type === 'REQUEST_APPLICATION_INVENTORY' &&
2026-09-26T11:55:54.7940265Z         keys.length === 1 &&
2026-09-26T11:55:54.7940394Z         payload.schemaVersion === 1;
2026-09-26T11:55:54.7940484Z       if (
2026-09-26T11:55:54.7940583Z         !validCapability &&
2026-09-26T11:55:54.7940712Z         !validApplicationPolicy &&
2026-09-26T11:55:54.7940849Z         !validApplicationPolicyRemoval &&
2026-09-26T11:55:54.7940971Z         !validInventoryRequest
2026-09-26T11:55:54.7941054Z       ) {
2026-09-26T11:55:54.7941147Z         throw new AppError(
2026-09-26T11:55:54.7941234Z           400,
2026-09-26T11:55:54.7941357Z           'INVALID_COMMAND_PAYLOAD',
2026-09-26T11:55:54.7941592Z           'The command payload is not valid for the requested command type.',
2026-09-26T11:55:54.7941673Z         );
2026-09-26T11:55:54.7941876Z       }
2026-09-26T11:55:54.7941956Z     }
2026-09-26T11:55:54.7942184Z     const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
2026-09-26T11:55:54.7942332Z     if (bytes > this.options.maxPayloadBytes)
2026-09-26T11:55:54.7942450Z       throw new AppError(
2026-09-26T11:55:54.7942539Z         413,
2026-09-26T11:55:54.7942657Z         'COMMAND_PAYLOAD_TOO_LARGE',
2026-09-26T11:55:54.7942789Z         'Command payload is too large.',
2026-09-26T11:55:54.7942883Z       );
2026-09-26T11:55:54.7943085Z     const device = await this.devices.findById(input.deviceId);
2026-09-26T11:55:54.7943189Z     if (device === null)
2026-09-26T11:55:54.7943286Z       throw new AppError(
2026-09-26T11:55:54.7943365Z         404,
2026-09-26T11:55:54.7943470Z         'DEVICE_NOT_FOUND',
2026-09-26T11:55:54.7943599Z         'Managed device was not found.',
2026-09-26T11:55:54.7943682Z       );
2026-09-26T11:55:54.7943803Z     if (device.adminId !== adminId)
2026-09-26T11:55:54.7943897Z       throw new AppError(
2026-09-26T11:55:54.7943980Z         403,
2026-09-26T11:55:54.7944097Z         'AUTHORIZATION_DENIED',
2026-09-26T11:55:54.7944266Z         'The administrator does not control this device.',
2026-09-26T11:55:54.7944349Z       );
2026-09-26T11:55:54.7944425Z     if (
2026-09-26T11:55:54.7944567Z       device.enrollmentStatus !== 'ACTIVE' ||
2026-09-26T11:55:54.7944705Z       device.operationalStatus !== 'ACTIVE'
2026-09-26T11:55:54.7944782Z     )
2026-09-26T11:55:54.7944876Z       throw new AppError(
2026-09-26T11:55:54.7944961Z         409,
2026-09-26T11:55:54.7945050Z         'DEVICE_NOT_READY',
2026-09-26T11:55:54.7945218Z         'Managed device is not available for commands.',
2026-09-26T11:55:54.7945299Z       );
2026-09-26T11:55:54.7945377Z     if (
2026-09-26T11:55:54.7945507Z       input.idempotencyKey !== null &&
2026-09-26T11:55:54.7945686Z       !/^[A-Za-z0-9._:-]{1,128}$/.test(input.idempotencyKey)
2026-09-26T11:55:54.7945767Z     )
2026-09-26T11:55:54.7946025Z       throw new AppError(400, 'INVALID_REQUEST', 'Idempotency key is invalid.');
2026-09-26T11:55:54.7946116Z     const now = new Date();
2026-09-26T11:55:54.7946202Z     try {
2026-09-26T11:55:54.7946358Z       const created = await this.commands.create({
2026-09-26T11:55:54.7946569Z         id: randomUUID(),
2026-09-26T11:55:54.7946696Z         managedDeviceId: device.id,
2026-09-26T11:55:54.7946782Z         adminId,
2026-09-26T11:55:54.7946873Z         type: input.type,
2026-09-26T11:55:54.7946961Z         version: 1,
2026-09-26T11:55:54.7947042Z         payload,
2026-09-26T11:55:54.7947182Z         correlationId: input.correlationId,
2026-09-26T11:55:54.7947324Z         idempotencyKey: input.idempotencyKey,
2026-09-26T11:55:54.7947564Z         expiresAt: new Date(now.getTime() + this.options.ttlSeconds * 1000),
2026-09-26T11:55:54.7947647Z       });
2026-09-26T11:55:54.7947751Z       if (!created.created) {
2026-09-26T11:55:54.7947874Z         if (this.delivery !== undefined)
2026-09-26T11:55:54.7948084Z           await this.delivery.deliverQueuedForDevice(device.id);
2026-09-26T11:55:54.7948319Z         const existing = await this.commands.findById(created.command.id);
2026-09-26T11:55:54.7948534Z         return { command: existing ?? created.command, created: false };
2026-09-26T11:55:54.7948626Z       }
2026-09-26T11:55:54.7948794Z       const queued = await this.commands.transition({
2026-09-26T11:55:54.7948906Z         id: created.command.id,
2026-09-26T11:55:54.7949001Z         from: 'CREATED',
2026-09-26T11:55:54.7949086Z         to: 'QUEUED',
2026-09-26T11:55:54.7949188Z         actorType: 'SYSTEM',
2026-09-26T11:55:54.7949282Z         actorId: null,
2026-09-26T11:55:54.7949635Z         now: new Date(),
2026-09-26T11:55:54.7949907Z         correlationId: created.command.correlationId,
2026-09-26T11:55:54.7949998Z       });
2026-09-26T11:55:54.7950125Z       if (this.delivery !== undefined) {
2026-09-26T11:55:54.7950331Z         await this.delivery.deliverQueuedForDevice(device.id);
2026-09-26T11:55:54.7950414Z       }
2026-09-26T11:55:54.7950747Z       const latest = await this.commands.findById(queued.id);
2026-09-26T11:55:54.7950939Z       return { command: latest ?? queued, created: true };
2026-09-26T11:55:54.7951035Z     } catch (error) {
2026-09-26T11:55:54.7951287Z       if (error instanceof PersistenceError && error.code === 'CONFLICT')
2026-09-26T11:55:54.7951387Z         throw new AppError(
2026-09-26T11:55:54.7951469Z           409,
2026-09-26T11:55:54.7951604Z           'COMMAND_IDEMPOTENCY_CONFLICT',
2026-09-26T11:55:54.7951792Z           'A command already exists for this idempotency key.',
2026-09-26T11:55:54.7951877Z         );
2026-09-26T11:55:54.7951966Z       throw error;
2026-09-26T11:55:54.7952042Z     }
2026-09-26T11:55:54.7952119Z   }
2026-09-26T11:55:54.7952247Z   async createScreenShareCommand(
2026-09-26T11:55:54.7952339Z     adminId: string,
2026-09-26T11:55:54.7952424Z     input: {
2026-09-26T11:55:54.7952554Z       deviceId: string;
2026-09-26T11:55:54.7952727Z       type: 'START_SCREEN_SHARE' | 'STOP_SCREEN_SHARE';
2026-09-26T11:55:54.7952848Z       screenSessionId: string;
2026-09-26T11:55:54.7952942Z       correlationId: string;
2026-09-26T11:55:54.7953025Z     },
2026-09-26T11:55:54.7953191Z   ): Promise<{ command: Command; created: boolean }> {
2026-09-26T11:55:54.7953338Z     if (this.screenSessions === undefined) {
2026-09-26T11:55:54.7953435Z       throw new AppError(
2026-09-26T11:55:54.7953517Z         503,
2026-09-26T11:55:54.7953631Z         'SERVICE_UNAVAILABLE',
2026-09-26T11:55:54.7953818Z         'Screen-sharing command security is not configured.',
2026-09-26T11:55:54.7953895Z       );
2026-09-26T11:55:54.7953977Z     }
2026-09-26T11:55:54.7954171Z     const screenSession = await this.screenSessions.findById(
2026-09-26T11:55:54.7954267Z       input.screenSessionId,
2026-09-26T11:55:54.7954346Z     );
2026-09-26T11:55:54.7954425Z     if (
2026-09-26T11:55:54.7954535Z       screenSession === null ||
2026-09-26T11:55:54.7954714Z       screenSession.managedDeviceId !== input.deviceId ||
2026-09-26T11:55:54.7954843Z       screenSession.adminId !== adminId
2026-09-26T11:55:54.7954923Z     ) {
2026-09-26T11:55:54.7955016Z       throw new AppError(
2026-09-26T11:55:54.7955093Z         404,
2026-09-26T11:55:54.7955341Z         'SCREEN_SESSION_NOT_FOUND',
2026-09-26T11:55:54.7955485Z         'Screen-sharing session was not found.',
2026-09-26T11:55:54.7955559Z       );
2026-09-26T11:55:54.7955635Z     }
2026-09-26T11:55:54.7955644Z 
2026-09-26T11:55:54.7955736Z     const startAllowed =
2026-09-26T11:55:54.7955864Z       input.type === 'START_SCREEN_SHARE' &&
2026-09-26T11:55:54.7955999Z       screenSession.status === 'AUTHORIZED';
2026-09-26T11:55:54.7956088Z     const stopAllowed =
2026-09-26T11:55:54.7956222Z       input.type === 'STOP_SCREEN_SHARE' &&
2026-09-26T11:55:54.7956410Z       ['AUTHORIZED', 'STARTING', 'ACTIVE', 'STOPPING'].includes(
2026-09-26T11:55:54.7956507Z         screenSession.status,
2026-09-26T11:55:54.7956586Z       );
2026-09-26T11:55:54.7956593Z 
2026-09-26T11:55:54.7956724Z     if (!startAllowed && !stopAllowed) {
2026-09-26T11:55:54.7956813Z       throw new AppError(
2026-09-26T11:55:54.7956894Z         409,
2026-09-26T11:55:54.7957020Z         'SCREEN_SESSION_STATE_CONFLICT',
2026-09-26T11:55:54.7957276Z         'The screen-sharing command is not valid for the current session state.',
2026-09-26T11:55:54.7957354Z       );
2026-09-26T11:55:54.7957434Z     }
2026-09-26T11:55:54.7957441Z 
2026-09-26T11:55:54.7957537Z     const idempotencyKey =
2026-09-26T11:55:54.7957748Z       'screen-session:' + input.screenSessionId + ':' + input.type;
2026-09-26T11:55:54.7957865Z     return this.create(adminId, {
2026-09-26T11:55:54.7957980Z       deviceId: input.deviceId,
2026-09-26T11:55:54.7958073Z       type: input.type,
2026-09-26T11:55:54.7958156Z       version: 1,
2026-09-26T11:55:54.7958337Z       payload: { screenSessionId: input.screenSessionId },
2026-09-26T11:55:54.7958429Z       idempotencyKey,
2026-09-26T11:55:54.7958564Z       correlationId: input.correlationId,
2026-09-26T11:55:54.7958766Z     });
2026-09-26T11:55:54.7958848Z   }
2026-09-26T11:55:54.7958856Z 
2026-09-26T11:55:54.7958977Z   async createAudioAccessCommand(
2026-09-26T11:55:54.7959067Z     adminId: string,
2026-09-26T11:55:54.7959156Z     input: {
2026-09-26T11:55:54.7959244Z       deviceId: string;
2026-09-26T11:55:54.7959552Z       type: 'START_AUDIO_ACCESS' | 'STOP_AUDIO_ACCESS';
2026-09-26T11:55:54.7959652Z       audioSessionId: string;
2026-09-26T11:55:54.7959749Z       correlationId: string;
2026-09-26T11:55:54.7959827Z     },
2026-09-26T11:55:54.7959985Z   ): Promise<{ command: Command; created: boolean }> {
2026-09-26T11:55:54.7960121Z     if (this.audioSessions === undefined) {
2026-09-26T11:55:54.7960214Z       throw new AppError(
2026-09-26T11:55:54.7960293Z         503,
2026-09-26T11:55:54.7960407Z         'SERVICE_UNAVAILABLE',
2026-09-26T11:55:54.7960585Z         'Audio-access command security is not configured.',
2026-09-26T11:55:54.7960662Z       );
2026-09-26T11:55:54.7960738Z     }
2026-09-26T11:55:54.7960995Z     const session = await this.audioSessions.findById(input.audioSessionId);
2026-09-26T11:55:54.7961077Z     if (
2026-09-26T11:55:54.7961167Z       session === null ||
2026-09-26T11:55:54.7961333Z       session.managedDeviceId !== input.deviceId ||
2026-09-26T11:55:54.7961451Z       session.adminId !== adminId
2026-09-26T11:55:54.7961532Z     ) {
2026-09-26T11:55:54.7961623Z       throw new AppError(
2026-09-26T11:55:54.7961704Z         404,
2026-09-26T11:55:54.7961818Z         'AUDIO_SESSION_NOT_FOUND',
2026-09-26T11:55:54.7961957Z         'Audio-access session was not found.',
2026-09-26T11:55:54.7962037Z       );
2026-09-26T11:55:54.7962112Z     }
2026-09-26T11:55:54.7962206Z     const startAllowed =
2026-09-26T11:55:54.7962436Z       input.type === 'START_AUDIO_ACCESS' && session.status === 'AUTHORIZED';
2026-09-26T11:55:54.7962527Z     const stopAllowed =
2026-09-26T11:55:54.7962656Z       input.type === 'STOP_AUDIO_ACCESS' &&
2026-09-26T11:55:54.7962904Z       ['AUTHORIZED', 'STARTING', 'ACTIVE', 'STOPPING'].includes(session.status);
2026-09-26T11:55:54.7963029Z     if (!startAllowed && !stopAllowed) {
2026-09-26T11:55:54.7963122Z       throw new AppError(
2026-09-26T11:55:54.7963202Z         409,
2026-09-26T11:55:54.7963448Z         'AUDIO_SESSION_STATE_CONFLICT',
2026-09-26T11:55:54.7963692Z         'The audio-access command is not valid for the current session state.',
2026-09-26T11:55:54.7963768Z       );
2026-09-26T11:55:54.7963845Z     }
2026-09-26T11:55:54.7963965Z     return this.create(adminId, {
2026-09-26T11:55:54.7964078Z       deviceId: input.deviceId,
2026-09-26T11:55:54.7964169Z       type: input.type,
2026-09-26T11:55:54.7964254Z       version: 1,
2026-09-26T11:55:54.7964423Z       payload: { audioSessionId: input.audioSessionId },
2026-09-26T11:55:54.7964519Z       idempotencyKey:
2026-09-26T11:55:54.7964725Z         'audio-session:' + input.audioSessionId + ':' + input.type,
2026-09-26T11:55:54.7964855Z       correlationId: input.correlationId,
2026-09-26T11:55:54.7964934Z     });
2026-09-26T11:55:54.7965012Z   }
2026-09-26T11:55:54.7965025Z 
2026-09-26T11:55:54.7965158Z   async createApplicationPolicyCommand(
2026-09-26T11:55:54.7965244Z     adminId: string,
2026-09-26T11:55:54.7965329Z     input: {
2026-09-26T11:55:54.7965419Z       deviceId: string;
2026-09-26T11:55:54.7965533Z       policyId: string | null;
2026-09-26T11:55:54.7965652Z       policyVersion: number | null;
2026-09-26T11:55:54.7965749Z       correlationId: string;
2026-09-26T11:55:54.7965827Z     },
2026-09-26T11:55:54.7965985Z   ): Promise<{ command: Command; created: boolean }> {
2026-09-26T11:55:54.7966239Z     const isRemoval = input.policyId === null && input.policyVersion === null;
2026-09-26T11:55:54.7966316Z     if (
2026-09-26T11:55:54.7966403Z       !isRemoval &&
2026-09-26T11:55:54.7966595Z       (input.policyId === null || input.policyVersion === null)
2026-09-26T11:55:54.7966671Z     ) {
2026-09-26T11:55:54.7966768Z       throw new AppError(
2026-09-26T11:55:54.7966851Z         400,
2026-09-26T11:55:54.7967056Z         'INVALID_REQUEST',
2026-09-26T11:55:54.7967191Z         'Policy identity is incomplete.',
2026-09-26T11:55:54.7967270Z       );
2026-09-26T11:55:54.7967343Z     }
2026-09-26T11:55:54.7967465Z     return this.create(adminId, {
2026-09-26T11:55:54.7967578Z       deviceId: input.deviceId,
2026-09-26T11:55:54.7967711Z       type: 'SYNC_APPLICATION_POLICY',
2026-09-26T11:55:54.7967797Z       version: 1,
2026-09-26T11:55:54.7968060Z       payload: { policyId: input.policyId, policyVersion: input.policyVersion },
2026-09-26T11:55:54.7968155Z       idempotencyKey:
2026-09-26T11:55:54.7968274Z         'application-policy:' +
2026-09-26T11:55:54.7968363Z         input.deviceId +
2026-09-26T11:55:54.7968444Z         ':' +
2026-09-26T11:55:54.7968663Z         (input.policyVersion === null ? 'none' : input.policyVersion),
2026-09-26T11:55:54.7968791Z       correlationId: input.correlationId,
2026-09-26T11:55:54.7968872Z     });
2026-09-26T11:55:54.7968946Z   }
2026-09-26T11:55:54.7968958Z 
2026-09-26T11:55:54.7969103Z   async createApplicationInventoryRequest(
2026-09-26T11:55:54.7969193Z     adminId: string,
2026-09-26T11:55:54.7969489Z     input: { deviceId: string; correlationId: string },
2026-09-26T11:55:54.7969667Z   ): Promise<{ command: Command; created: boolean }> {
2026-09-26T11:55:54.7969786Z     return this.create(adminId, {
2026-09-26T11:55:54.7969898Z       deviceId: input.deviceId,
2026-09-26T11:55:54.7970039Z       type: 'REQUEST_APPLICATION_INVENTORY',
2026-09-26T11:55:54.7970123Z       version: 1,
2026-09-26T11:55:54.7970242Z       payload: { schemaVersion: 1 },
2026-09-26T11:55:54.7970337Z       idempotencyKey:
2026-09-26T11:55:54.7970590Z         'application-inventory:' + input.deviceId + ':' + input.correlationId,
2026-09-26T11:55:54.7970718Z       correlationId: input.correlationId,
2026-09-26T11:55:54.7970799Z     });
2026-09-26T11:55:54.7970874Z   }
2026-09-26T11:55:54.7970884Z 
2026-09-26T11:55:54.7971092Z   async getOwned(id: string, adminId: string): Promise<Command> {
2026-09-26T11:55:54.7971295Z     const command = await this.commands.findOwned(id, adminId);
2026-09-26T11:55:54.7971386Z     if (command === null)
2026-09-26T11:55:54.7971626Z       throw new AppError(404, 'COMMAND_NOT_FOUND', 'Command was not found.');
2026-09-26T11:55:54.7971881Z     return this.expireIfNeeded(command);
2026-09-26T11:55:54.7971955Z   }
2026-09-26T11:55:54.7972057Z   async getOwnedForDevice(
2026-09-26T11:55:54.7972142Z     id: string,
2026-09-26T11:55:54.7972227Z     adminId: string,
2026-09-26T11:55:54.7972315Z     deviceId: string,
2026-09-26T11:55:54.7972408Z   ): Promise<Command> {
2026-09-26T11:55:54.7972565Z     const command = await this.getOwned(id, adminId);
2026-09-26T11:55:54.7972706Z     if (command.managedDeviceId !== deviceId)
2026-09-26T11:55:54.7972794Z       throw new AppError(
2026-09-26T11:55:54.7972877Z         403,
2026-09-26T11:55:54.7972990Z         'AUTHORIZATION_DENIED',
2026-09-26T11:55:54.7973141Z         'The command is not assigned to this device.',
2026-09-26T11:55:54.7973225Z       );
2026-09-26T11:55:54.7973313Z     return command;
2026-09-26T11:55:54.7973386Z   }
2026-09-26T11:55:54.7973470Z   async cancel(
2026-09-26T11:55:54.7973550Z     id: string,
2026-09-26T11:55:54.7973640Z     adminId: string,
2026-09-26T11:55:54.7973727Z     deviceId?: string,
2026-09-26T11:55:54.7973815Z   ): Promise<Command> {
2026-09-26T11:55:54.7973973Z     const command = await this.getOwned(id, adminId);
2026-09-26T11:55:54.7974193Z     if (deviceId !== undefined && command.managedDeviceId !== deviceId)
2026-09-26T11:55:54.7974283Z       throw new AppError(
2026-09-26T11:55:54.7974364Z         403,
2026-09-26T11:55:54.7974478Z         'AUTHORIZATION_DENIED',
2026-09-26T11:55:54.7974627Z         'The command is not assigned to this device.',
2026-09-26T11:55:54.7974707Z       );
2026-09-26T11:55:54.7974784Z     if (
2026-09-26T11:55:54.7975003Z       ['SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REJECTED'].includes(
2026-09-26T11:55:54.7975094Z         command.status,
2026-09-26T11:55:54.7975286Z       )
2026-09-26T11:55:54.7975369Z     )
2026-09-26T11:55:54.7975461Z       throw new AppError(
2026-09-26T11:55:54.7975538Z         409,
2026-09-26T11:55:54.7975652Z         'COMMAND_STATE_CONFLICT',
2026-09-26T11:55:54.7975840Z         'The command cannot be cancelled in its current state.',
2026-09-26T11:55:54.7975916Z       );
2026-09-26T11:55:54.7975997Z     try {
2026-09-26T11:55:54.7976217Z       return await this.commands.cancelOwned(id, adminId, new Date());
2026-09-26T11:55:54.7976305Z     } catch (error) {
2026-09-26T11:55:54.7976441Z       if (error instanceof PersistenceError)
2026-09-26T11:55:54.7976657Z         throw new AppError(409, 'COMMAND_STATE_CONFLICT', error.message);
2026-09-26T11:55:54.7976745Z       throw error;
2026-09-26T11:55:54.7976823Z     }
2026-09-26T11:55:54.7976896Z   }
2026-09-26T11:55:54.7976987Z   async acknowledge(
2026-09-26T11:55:54.7977073Z     id: string,
2026-09-26T11:55:54.7977229Z     session: { id: string; managedDeviceId: string },
2026-09-26T11:55:54.7977329Z   ): Promise<Command> {
2026-09-26T11:55:54.7977571Z     return this.deviceTransition(id, session, 'DELIVERED', 'ACKNOWLEDGED');
2026-09-26T11:55:54.7977653Z   }
2026-09-26T11:55:54.7977739Z   async start(
2026-09-26T11:55:54.7977823Z     id: string,
2026-09-26T11:55:54.7977981Z     session: { id: string; managedDeviceId: string },
2026-09-26T11:55:54.7978072Z   ): Promise<Command> {
2026-09-26T11:55:54.7978302Z     return this.deviceTransition(id, session, 'ACKNOWLEDGED', 'RUNNING');
2026-09-26T11:55:54.7978383Z   }
2026-09-26T11:55:54.7978466Z   async result(
2026-09-26T11:55:54.7978545Z     id: string,
2026-09-26T11:55:54.7978698Z     session: { id: string; managedDeviceId: string },
2026-09-26T11:55:54.7978814Z     status: 'SUCCEEDED' | 'FAILED',
2026-09-26T11:55:54.7978929Z     resultCode: string | null,
2026-09-26T11:55:54.7979050Z     errorCategory: string | null,
2026-09-26T11:55:54.7979204Z     resultMetadata: Record<string, unknown> | null,
2026-09-26T11:55:54.7979300Z   ): Promise<Command> {
2026-09-26T11:55:54.7979595Z     const command = await this.commands.findById(id);
2026-09-26T11:55:54.7979775Z     this.assertDevice(command, session.managedDeviceId);
2026-09-26T11:55:54.7979897Z     if (resultMetadata !== null) {
2026-09-26T11:55:54.7980267Z       const bytes = Buffer.byteLength(JSON.stringify(resultMetadata), 'utf8');
2026-09-26T11:55:54.7980421Z       if (bytes > this.options.maxPayloadBytes) {
2026-09-26T11:55:54.7980521Z         throw new AppError(
2026-09-26T11:55:54.7980607Z           413,
2026-09-26T11:55:54.7980728Z           'COMMAND_PAYLOAD_TOO_LARGE',
2026-09-26T11:55:54.7980875Z           'Command result metadata is too large.',
2026-09-26T11:55:54.7980952Z         );
2026-09-26T11:55:54.7981034Z       }
2026-09-26T11:55:54.7981111Z     }
2026-09-26T11:55:54.7981231Z     if (command!.status !== 'RUNNING')
2026-09-26T11:55:54.7981327Z       throw new AppError(
2026-09-26T11:55:54.7981408Z         409,
2026-09-26T11:55:54.7981520Z         'COMMAND_STATE_CONFLICT',
2026-09-26T11:55:54.7981641Z         'Command is not running.',
2026-09-26T11:55:54.7981719Z       );
2026-09-26T11:55:54.7981795Z     try {
2026-09-26T11:55:54.7981939Z       return await this.commands.transition({
2026-09-26T11:55:54.7982022Z         id,
2026-09-26T11:55:54.7982114Z         from: 'RUNNING',
2026-09-26T11:55:54.7982200Z         to: status,
2026-09-26T11:55:54.7982292Z         actorType: 'DEVICE',
2026-09-26T11:55:54.7982426Z         actorId: session.managedDeviceId,
2026-09-26T11:55:54.7982517Z         now: new Date(),
2026-09-26T11:55:54.7982654Z         correlationId: command!.correlationId,
2026-09-26T11:55:54.7982741Z         resultCode,
2026-09-26T11:55:54.7982826Z         errorCategory,
2026-09-26T11:55:54.7982915Z         resultMetadata,
2026-09-26T11:55:54.7982993Z       });
2026-09-26T11:55:54.7983077Z     } catch (error) {
2026-09-26T11:55:54.7983216Z       if (error instanceof PersistenceError)
2026-09-26T11:55:54.7983433Z         throw new AppError(409, 'COMMAND_STATE_CONFLICT', error.message);
2026-09-26T11:55:54.7983630Z       throw error;
2026-09-26T11:55:54.7983712Z     }
2026-09-26T11:55:54.7983789Z   }
2026-09-26T11:55:54.7983907Z   private async deviceTransition(
2026-09-26T11:55:54.7983994Z     id: string,
2026-09-26T11:55:54.7984150Z     session: { id: string; managedDeviceId: string },
2026-09-26T11:55:54.7984243Z     from: CommandStatus,
2026-09-26T11:55:54.7984331Z     to: CommandStatus,
2026-09-26T11:55:54.7984419Z   ): Promise<Command> {
2026-09-26T11:55:54.7984579Z     const command = await this.commands.findById(id);
2026-09-26T11:55:54.7984758Z     this.assertDevice(command, session.managedDeviceId);
2026-09-26T11:55:54.7984868Z     if (command!.status !== from)
2026-09-26T11:55:54.7984960Z       throw new AppError(
2026-09-26T11:55:54.7985041Z         409,
2026-09-26T11:55:54.7985150Z         'COMMAND_STATE_CONFLICT',
2026-09-26T11:55:54.7985288Z         'Command is not in the required state.',
2026-09-26T11:55:54.7985363Z       );
2026-09-26T11:55:54.7985444Z     try {
2026-09-26T11:55:54.7985590Z       return await this.commands.transition({
2026-09-26T11:55:54.7985670Z         id,
2026-09-26T11:55:54.7985751Z         from,
2026-09-26T11:55:54.7985835Z         to,
2026-09-26T11:55:54.7985931Z         actorType: 'DEVICE',
2026-09-26T11:55:54.7986061Z         actorId: session.managedDeviceId,
2026-09-26T11:55:54.7986150Z         now: new Date(),
2026-09-26T11:55:54.7986284Z         correlationId: command!.correlationId,
2026-09-26T11:55:54.7986363Z       });
2026-09-26T11:55:54.7986450Z     } catch (error) {
2026-09-26T11:55:54.7986587Z       if (error instanceof PersistenceError)
2026-09-26T11:55:54.7986805Z         throw new AppError(409, 'COMMAND_STATE_CONFLICT', error.message);
2026-09-26T11:55:54.7986888Z       throw error;
2026-09-26T11:55:54.7986965Z     }
2026-09-26T11:55:54.7987040Z   }
2026-09-26T11:55:54.7987132Z   private assertDevice(
2026-09-26T11:55:54.7987226Z     command: Command | null,
2026-09-26T11:55:54.7987310Z     deviceId: string,
2026-09-26T11:55:54.7987430Z   ): asserts command is Command {
2026-09-26T11:55:54.7987521Z     if (command === null)
2026-09-26T11:55:54.7987752Z       throw new AppError(404, 'COMMAND_NOT_FOUND', 'Command was not found.');
2026-09-26T11:55:54.7987982Z     if (command.managedDeviceId !== deviceId)
2026-09-26T11:55:54.7988075Z       throw new AppError(
2026-09-26T11:55:54.7988153Z         403,
2026-09-26T11:55:54.7988268Z         'AUTHORIZATION_DENIED',
2026-09-26T11:55:54.7988422Z         'The command is not assigned to this device.',
2026-09-26T11:55:54.7988497Z       );
2026-09-26T11:55:54.7988574Z   }
2026-09-26T11:55:54.7988801Z   private async expireIfNeeded(command: Command): Promise<Command> {
2026-09-26T11:55:54.7988879Z     if (
2026-09-26T11:55:54.7989029Z       command.expiresAt.getTime() > Date.now() ||
2026-09-26T11:55:54.7989250Z       ['SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REJECTED'].includes(
2026-09-26T11:55:54.7989585Z         command.status,
2026-09-26T11:55:54.7989755Z       )
2026-09-26T11:55:54.7989845Z     )
2026-09-26T11:55:54.7989951Z       return command;
2026-09-26T11:55:54.7990034Z     try {
2026-09-26T11:55:54.7990180Z       return await this.commands.transition({
2026-09-26T11:55:54.7990274Z         id: command.id,
2026-09-26T11:55:54.7990384Z         from: command.status,
2026-09-26T11:55:54.7990478Z         to: 'EXPIRED',
2026-09-26T11:55:54.7990575Z         actorType: 'SYSTEM',
2026-09-26T11:55:54.7990662Z         actorId: null,
2026-09-26T11:55:54.7990756Z         now: new Date(),
2026-09-26T11:55:54.7990900Z         correlationId: command.correlationId,
2026-09-26T11:55:54.7990977Z       });
2026-09-26T11:55:54.7991063Z     } catch {
2026-09-26T11:55:54.7991154Z       return command;
2026-09-26T11:55:54.7991230Z     }
2026-09-26T11:55:54.7991307Z   }
2026-09-26T11:55:54.7991382Z }
2026-09-26T11:55:54.7991677Z ===== tests/application-management-database.integration.test.ts =====
2026-09-26T11:55:54.7991934Z import { afterAll, beforeAll, describe, expect, it } from 'vitest';
2026-09-26T11:55:54.7992267Z import { loadConfig } from '../src/config/env.js';
2026-09-26T11:55:54.7992472Z import { createDatabase } from '../src/db/index.js';
2026-09-26T11:55:54.7992669Z import { runMigrations } from '../src/db/migrate.js';
2026-09-26T11:55:54.7992683Z 
2026-09-26T11:55:54.7992885Z const hasDatabase = Boolean(process.env.DATABASE_URL);
2026-09-26T11:55:54.7992893Z 
2026-09-26T11:55:54.7993038Z describe.skipIf(!hasDatabase)(
2026-09-26T11:55:54.7993209Z   'Phase 11.1 application-management database',
2026-09-26T11:55:54.7993286Z   () => {
2026-09-26T11:55:54.7993447Z     const database = createDatabase(loadConfig());
2026-09-26T11:55:54.7993453Z 
2026-09-26T11:55:54.7993549Z     beforeAll(async () => {
2026-09-26T11:55:54.7993672Z       await runMigrations(database);
2026-09-26T11:55:54.7993756Z     });
2026-09-26T11:55:54.7993763Z 
2026-09-26T11:55:54.7993855Z     afterAll(async () => {
2026-09-26T11:55:54.7993952Z       await database.close();
2026-09-26T11:55:54.7994037Z     });
2026-09-26T11:55:54.7994044Z 
2026-09-26T11:55:54.7994302Z     it('creates the application-management tables and indexes', async () => {
2026-09-26T11:55:54.7994511Z       const tables = await database.query<{ tablename: string }>(
2026-09-26T11:55:54.7995565Z         "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('application_inventory','application_policies','application_policy_rules','application_policy_assignments','application_policy_sync_state','application_management_events') ORDER BY tablename",
2026-09-26T11:55:54.7995649Z       );
2026-09-26T11:55:54.7995847Z       expect(tables.rows.map((row) => row.tablename)).toEqual([
2026-09-26T11:55:54.7995974Z         'application_inventory',
2026-09-26T11:55:54.7996108Z         'application_management_events',
2026-09-26T11:55:54.7996220Z         'application_policies',
2026-09-26T11:55:54.7996352Z         'application_policy_assignments',
2026-09-26T11:55:54.7996471Z         'application_policy_rules',
2026-09-26T11:55:54.7996606Z         'application_policy_sync_state',
2026-09-26T11:55:54.7996688Z       ]);
2026-09-26T11:55:54.7996696Z 
2026-09-26T11:55:54.7996898Z       const indexes = await database.query<{ indexname: string }>(
2026-09-26T11:55:54.7998128Z         "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('application_inventory_package_idx','application_inventory_device_observed_idx','application_policy_admin_name_idx','application_policy_assignment_policy_idx','application_sync_status_idx') ORDER BY indexname",
2026-09-26T11:55:54.7998215Z       );
2026-09-26T11:55:54.7998416Z       expect(indexes.rows.map((row) => row.indexname)).toEqual([
2026-09-26T11:55:54.7998569Z         'application_inventory_device_observed_idx',
2026-09-26T11:55:54.7998708Z         'application_inventory_package_idx',
2026-09-26T11:55:54.7998836Z         'application_policy_admin_name_idx',
2026-09-26T11:55:54.7998990Z         'application_policy_assignment_policy_idx',
2026-09-26T11:55:54.7999116Z         'application_sync_status_idx',
2026-09-26T11:55:54.7999197Z       ]);
2026-09-26T11:55:54.7999279Z     });
2026-09-26T11:55:54.7999287Z 
2026-09-26T11:55:54.7999789Z     it('extends the existing command allowlist without creating a second command table', async () => {
2026-09-26T11:55:54.7999996Z       const result = await database.query<{ definition: string }>(
2026-09-26T11:55:54.8000596Z         "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='commands'::regclass AND conname='commands_type_check'",
2026-09-26T11:55:54.8000678Z       );
2026-09-26T11:55:54.8000926Z       expect(result.rows[0]?.definition).toContain('SYNC_APPLICATION_POLICY');
2026-09-26T11:55:54.8001083Z       expect(result.rows[0]?.definition).toContain(
2026-09-26T11:55:54.8001214Z         'REQUEST_APPLICATION_INVENTORY',
2026-09-26T11:55:54.8001291Z       );
2026-09-26T11:55:54.8001299Z 
2026-09-26T11:55:54.8001516Z       const commandTables = await database.query<{ count: string }>(
2026-09-26T11:55:54.8002015Z         "SELECT count(*)::text AS count FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%command%'",
2026-09-26T11:55:54.8002099Z       );
2026-09-26T11:55:54.8002314Z       expect(Number(commandTables.rows[0]?.count ?? '0')).toBe(2);
2026-09-26T11:55:54.8002402Z     });
2026-09-26T11:55:54.8002481Z   },
2026-09-26T11:55:54.8002562Z );
2026-09-26T11:55:54.8002781Z ===== tests/application-management-service.test.ts =====
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
