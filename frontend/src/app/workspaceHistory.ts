export interface WorkspaceHistoryMarker { identity: string; kind: 'floor' | 'workspace' }

export function workspaceHistoryAction(identity: string | null, initialized: string | null, marker?: WorkspaceHistoryMarker) {
  if (!identity) return 'none';
  if (marker?.identity === identity && marker.kind === 'floor') return 'push';
  if (initialized === identity || (marker?.identity === identity && marker.kind === 'workspace')) return 'none';
  return 'seed';
}
