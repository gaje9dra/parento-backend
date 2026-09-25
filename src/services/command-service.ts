import { randomUUID } from 'node:crypto';
import type { CommandRepository } from '../repositories/command-repository.js';
import type { DeviceCommand, CommandStatus } from '../domain/command.js';
import type { ManagedDeviceRepository } from '../repositories/managed-device-repository.js';
import { AppError } from '../types/errors.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_TYPES = new Set(['FUTURE_COMMAND']);
const MAX_PAYLOAD_BYTES = 4096;

export interface CommandServiceOptions {
  readonly defaultTtlSeconds: number;
  readonly maxTtlSeconds: number;
}

export interface CommandDeliveryPort {
  deliver(command: DeviceCommand): Promise<{ delivered: boolean; sessionId?: string }>;
}

export const notConfiguredCommandDelivery: CommandDeliveryPort = {
  async deliver() {
    return { delivered: false };
  },
};

export class CommandService {
  constructor(
    private readonly repository: CommandRepository,
    private readonly managedDevices: ManagedDeviceRepository,
    private readonly options: CommandServiceOptions,
    private readonly delivery: CommandDeliveryPort = notConfiguredCommandDelivery,
  ) {}

  async create(input: {
    adminId: string;
    managedDeviceId: string;
    type: string;
    schemaVersion: number;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    expiresAt?: Date;
  }): Promise<DeviceCommand> {
    if (!UUID_PATTERN.test(input.managedDeviceId)) {
      throw new AppError(400, 'INVALID_REQUEST', 'Managed-device identifier is invalid.');
    }
    const device = await this.managedDevices.findById(input.managedDeviceId);
    if (device === null) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Managed device was not found.');
    }
    if (device.adminId !== input.adminId) {
      throw new AppError(403, 'AUTHORIZATION_DENIED', 'Access to the managed device is denied.');
    }
    if (device.enrollmentStatus !== 'ACTIVE' || device.operationalStatus !== 'ACTIVE') {
      throw new AppError(409, 'CONFLICT', 'Managed device is not available for commands.');
    }
    if (!ALLOWED_TYPES.has(input.type) || input.type !== 'FUTURE_COMMAND') {
      throw new AppError(400, 'INVALID_REQUEST', 'Command type is not supported in this phase.');
    }
    if (input.schemaVersion !== 1) {
      throw new AppError(400, 'INVALID_REQUEST', 'Command schema version is not supported.');
    }
    const serialized = JSON.stringify(input.payload);
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new AppError(400, 'REQUEST_TOO_LARGE', 'Command payload is too large.');
    }
    if (
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 128 ||
      !/^[A-Za-z0-9._:-]+$/.test(input.idempotencyKey)
    ) {
      throw new AppError(400, 'INVALID_REQUEST', 'Idempotency key has an invalid format.');
    }

    const existing = await this.repository.findByIdempotency(
      input.adminId,
      input.idempotencyKey,
    );
    if (existing !== null) return existing;

    const now = new Date();
    const expiresAt =
      input.expiresAt ??
      new Date(now.getTime() + this.options.defaultTtlSeconds * 1000);
    if (
      expiresAt.getTime() <= now.getTime() ||
      expiresAt.getTime() >
        now.getTime() + this.options.maxTtlSeconds * 1000
    ) {
      throw new AppError(400, 'INVALID_REQUEST', 'Command expiration is invalid.');
    }

    try {
      const command = await this.repository.create({
        id: randomUUID(),
        managedDeviceId: input.managedDeviceId,
        adminId: input.adminId,
        type: 'FUTURE_COMMAND',
        schemaVersion: 1,
        payload: input.payload,
        expiresAt,
        correlationId: randomUUID(),
        idempotencyKey: input.idempotencyKey,
      });
      const queued = await this.repository.transition(
        command.id,
        'CREATED',
        'QUEUED',
        now,
      );
      if (queued === null) {
        throw new AppError(
          500,
          'INTERNAL_SERVER_ERROR',
          'Command could not be queued.',
        );
      }
      const delivery = await this.delivery.deliver(queued);
      if (delivery.delivered) {
        return (
          (await this.repository.transition(
            queued.id,
            'QUEUED',
            'DELIVERING',
            new Date(),
            { sessionId: delivery.sessionId ?? null },
          )) ?? queued
        );
      }
      return queued;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'CONFLICT'
      ) {
        const duplicate = await this.repository.findByIdempotency(
          input.adminId,
          input.idempotencyKey,
        );
        if (duplicate !== null) return duplicate;
      }
      throw error;
    }
  }

  async getOwned(id: string, adminId: string): Promise<DeviceCommand> {
    if (!UUID_PATTERN.test(id)) {
      throw new AppError(400, 'INVALID_REQUEST', 'Command identifier is invalid.');
    }
    const command = await this.repository.findById(id);
    if (command === null || command.adminId !== adminId) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Command was not found.');
    }
    return command;
  }

  listOwned(adminId: string) {
    return this.repository.listByAdminId(adminId);
  }

  async cancel(id: string, adminId: string): Promise<DeviceCommand> {
    const current = await this.getOwned(id, adminId);
    if (!['CREATED', 'QUEUED'].includes(current.status)) {
      throw new AppError(
        409,
        'CONFLICT',
        'Command cannot be cancelled in its current state.',
      );
    }
    const result = await this.repository.transition(
      id,
      current.status,
      'CANCELLED',
      new Date(),
    );
    if (result === null) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Command was not found.');
    }
    return result;
  }

  async transitionFromDevice(
    id: string,
    from: CommandStatus,
    to: CommandStatus,
    sessionId: string,
    failureCode?: string,
  ): Promise<DeviceCommand> {
    const command = await this.repository.findById(id);
    if (command === null) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Command was not found.');
    }
    if (command.sessionId !== null && command.sessionId !== sessionId) {
      throw new AppError(
        403,
        'AUTHORIZATION_DENIED',
        'Command session is not authorized.',
      );
    }
    const result = await this.repository.transition(id, from, to, new Date(), {
      sessionId,
      failureCode: failureCode ?? null,
    });
    if (result === null) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Command was not found.');
    }
    return result;
  }
}
