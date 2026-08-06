import { createHash } from 'node:crypto';

import type { WorkflowState } from './state.js';

export interface ActionGroup {
  readonly allowedPaths: readonly string[];
  readonly id: string;
  readonly requiredAssertionIds: readonly string[];
  readonly title: string;
}

export interface ActionPacket {
  readonly forbiddenActions: readonly string[];
  readonly intentId: string;
  readonly knownUserQuestions: readonly string[];
  readonly nextPhase: string;
  readonly packetFingerprint: string;
  readonly packetId: string;
  readonly requiredActionGroups: readonly ActionGroup[];
  readonly state: WorkflowState;
}

export interface ActionPacketInput
  extends Omit<ActionPacket, 'packetFingerprint'> {}

export const fingerprint = (value: object | string): string =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

export const createActionPacket = (input: ActionPacketInput): ActionPacket => {
  if (
    !input.intentId.trim() ||
    !input.packetId.trim() ||
    !input.nextPhase.trim()
  ) {
    throw new Error('Action packet identity and next phase are required.');
  }
  if (input.requiredActionGroups.length === 0) {
    throw new Error('At least one action group is required.');
  }
  const ids = new Set<string>();
  for (const group of input.requiredActionGroups) {
    if (
      !group.id.trim() ||
      ids.has(group.id) ||
      group.requiredAssertionIds.length === 0
    ) {
      throw new Error(
        'Action group IDs and assertion IDs must be unique and present.',
      );
    }
    ids.add(group.id);
  }
  return { ...input, packetFingerprint: fingerprint(input) };
};

export const renderActionPacket = (packet: ActionPacket): string =>
  JSON.stringify(packet, null, 2);
