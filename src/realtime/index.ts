/**
 * Realtime transport boundary.
 *
 * Phase 6.4 provides an authenticated SSE adapter and an in-process connection
 * registry. Business services depend on CommandDeliveryPort rather than SSE.
 */
export { InMemoryDeviceConnectionRegistry } from './device-connection-registry.js';
export type {
  DeviceConnectionRegistry,
  ActiveDeviceConnection,
} from './device-connection-registry.js';
export { SseDeviceTransport } from './sse-device-transport.js';
export type { CommandDeliveryPort } from './command-delivery-port.js';
