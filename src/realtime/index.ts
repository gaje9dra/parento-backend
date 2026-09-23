/**
 * Realtime boundary for future secure device communication.
 *
 * Phase 1.1 exposes architecture only. No commands, device control, or session
 * signaling are implemented here.
 */
export interface RealtimeTransport {
  readonly kind: 'not-configured';
}

export const realtimeTransport: RealtimeTransport = {
  kind: 'not-configured',
};
