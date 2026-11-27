export interface SyncConflictRow {
  id: string;
  kind: 'VERSION' | 'DUPLICATE';
  kindLabel: string;
  allowed: string[];
  entityType: string;
  entityId: string;
  serverVersion: number;
  clientVersion: number | null;
  server: Record<string, unknown>;
  device: Record<string, unknown>;
  resolution: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  notes: string | null;
  createdAt: string;
  operation: { id: string; operation: string; deviceId: string; clientTimestamp: string; user: { id: string; fullName: string } | null; message: string | null };
}

export interface SyncLogRow {
  id: string;
  deviceId: string;
  user: { id: string; fullName: string } | null;
  entityType: string;
  entityId: string;
  operation: string;
  status: string;
  message: string | null;
  result: Record<string, unknown> | null;
  clientTimestamp: string;
  serverTimestamp: string;
}

export interface SyncSummary {
  scope: 'all' | 'mine';
  last24h: Record<string, number>;
  pendingConflicts: number;
  devices: { deviceId: string; operations: number; lastSeen: string }[];
  lastOperationAt: string | null;
}
