import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  type ApprovalHistoryEntry,
  type PublishAttempt,
  type RunState,
  runStateSchema,
} from "@/lib/agents/schema";
import { isBlobStorageEnabled, isVercelDeployment } from "@/lib/storage/blob";

function shouldBypassMirror() {
  return isBlobStorageEnabled() || isVercelDeployment();
}

type DatabaseSyncInstance = import("node:sqlite").DatabaseSync;
type DatabaseSyncConstructor = typeof import("node:sqlite").DatabaseSync;

let cachedDatabaseSync: DatabaseSyncConstructor | null | undefined;

const dataRoot = path.join(process.cwd(), ".data");
const dbPath = path.join(dataRoot, "content-history.db");

type ApprovalEventRow = {
  event_id?: unknown;
  run_id?: unknown;
  approval_type?: unknown;
  event_type?: unknown;
  occurred_at?: unknown;
  approval_status?: unknown;
  workflow_status?: unknown;
  channel?: unknown;
  approver?: unknown;
  note?: unknown;
  chat_id?: unknown;
  telegram_message_id?: unknown;
  delivery_summary?: unknown;
};

type PublishAttemptRow = {
  attempt_id?: unknown;
  run_id?: unknown;
  trigger?: unknown;
  requested_by?: unknown;
  status?: unknown;
  requested_at?: unknown;
  started_at?: unknown;
  completed_at?: unknown;
  caption?: unknown;
  provider?: unknown;
  instagram_creation_id?: unknown;
  instagram_media_id?: unknown;
  permalink?: unknown;
  error?: unknown;
};

type RunStateMirrorRow = {
  state_json?: unknown;
};

export type RunApprovalEventRecord = {
  id: string;
  runId: string;
  approvalType: ApprovalHistoryEntry["approval_type"];
  eventType: ApprovalHistoryEntry["event_type"];
  occurredAt: string;
  approvalStatus: ApprovalHistoryEntry["approval_status"];
  workflowStatus: ApprovalHistoryEntry["workflow_status"];
  channel: ApprovalHistoryEntry["channel"];
  approver: string | null;
  note: string | null;
  chatId: string | null;
  telegramMessageId: string | null;
  deliverySummary: string | null;
};

export type RunPublishAttemptRecord = {
  id: string;
  runId: string;
  trigger: PublishAttempt["trigger"];
  requestedBy: string | null;
  status: PublishAttempt["status"];
  requestedAt: string;
  startedAt: string;
  completedAt: string | null;
  caption: string | null;
  provider: PublishAttempt["provider"];
  instagramCreationId: string | null;
  instagramMediaId: string | null;
  permalink: string | null;
  error: string | null;
};

export type RunOperationalEventRecord =
  | {
      kind: "approval";
      sortAt: string;
      record: RunApprovalEventRecord;
    }
  | {
      kind: "publish_attempt";
      sortAt: string;
      record: RunPublishAttemptRecord;
    };

function ensureDataRoot() {
  mkdirSync(dataRoot, { recursive: true });
}

function getDatabaseSyncConstructor() {
  if (cachedDatabaseSync !== undefined) {
    return cachedDatabaseSync;
  }

  try {
    const nodeRequire = eval("require") as NodeJS.Require;
    const sqliteModule = nodeRequire("node:sqlite") as typeof import("node:sqlite");
    cachedDatabaseSync = sqliteModule.DatabaseSync;
  } catch {
    cachedDatabaseSync = null;
  }

  return cachedDatabaseSync;
}

function withDb<T>(work: (db: DatabaseSyncInstance) => T) {
  ensureDataRoot();
  const DatabaseSync = getDatabaseSyncConstructor();

  if (!DatabaseSync) {
    throw new Error("node:sqlite is not available in this runtime.");
  }

  const db = new DatabaseSync(dbPath);

  try {
    initializeRunStateMirrorDb(db);
    return work(db);
  } finally {
    db.close();
  }
}

function initializeRunStateMirrorDb(db: DatabaseSyncInstance) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS run_state_mirror (
      run_id TEXT PRIMARY KEY,
      title TEXT,
      audience TEXT NOT NULL,
      status TEXT NOT NULL,
      workflow_status TEXT NOT NULL,
      current_stage TEXT,
      script_approval_status TEXT NOT NULL,
      image_approval_status TEXT NOT NULL,
      publish_status TEXT NOT NULL,
      telegram_last_chat_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      state_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_run_state_mirror_updated_at
    ON run_state_mirror (updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_run_state_mirror_workflow_status
    ON run_state_mirror (workflow_status);

    CREATE TABLE IF NOT EXISTS run_approval_events (
      event_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      approval_type TEXT NOT NULL,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      approval_status TEXT NOT NULL,
      workflow_status TEXT NOT NULL,
      channel TEXT,
      approver TEXT,
      note TEXT,
      chat_id TEXT,
      telegram_message_id TEXT,
      delivery_summary TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_run_approval_events_run_id
    ON run_approval_events (run_id, occurred_at DESC);

    CREATE INDEX IF NOT EXISTS idx_run_approval_events_message_id
    ON run_approval_events (telegram_message_id);

    CREATE TABLE IF NOT EXISTS run_publish_attempts (
      attempt_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      requested_by TEXT,
      status TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      caption TEXT,
      provider TEXT,
      instagram_creation_id TEXT,
      instagram_media_id TEXT,
      permalink TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_run_publish_attempts_run_id
    ON run_publish_attempts (run_id, requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_run_publish_attempts_status
    ON run_publish_attempts (status);
  `);
}

function syncRunStateRecord(db: DatabaseSyncInstance, run: RunState) {
  const statement = db.prepare(`
    INSERT INTO run_state_mirror (
      run_id,
      title,
      audience,
      status,
      workflow_status,
      current_stage,
      script_approval_status,
      image_approval_status,
      publish_status,
      telegram_last_chat_id,
      error,
      created_at,
      updated_at,
      state_json
    ) VALUES (
      $run_id,
      $title,
      $audience,
      $status,
      $workflow_status,
      $current_stage,
      $script_approval_status,
      $image_approval_status,
      $publish_status,
      $telegram_last_chat_id,
      $error,
      $created_at,
      $updated_at,
      $state_json
    )
    ON CONFLICT(run_id) DO UPDATE SET
      title = excluded.title,
      audience = excluded.audience,
      status = excluded.status,
      workflow_status = excluded.workflow_status,
      current_stage = excluded.current_stage,
      script_approval_status = excluded.script_approval_status,
      image_approval_status = excluded.image_approval_status,
      publish_status = excluded.publish_status,
      telegram_last_chat_id = excluded.telegram_last_chat_id,
      error = excluded.error,
      updated_at = excluded.updated_at,
      state_json = excluded.state_json
  `);

  statement.run({
    $run_id: run.id,
    $title: run.title,
    $audience: run.audience,
    $status: run.status,
    $workflow_status: run.workflow_status,
    $current_stage: run.current_stage,
    $script_approval_status: run.script_approval.status,
    $image_approval_status: run.image_approval.status,
    $publish_status: run.publish_result.status,
    $telegram_last_chat_id: run.telegram.last_chat_id,
    $error: run.error,
    $created_at: run.created_at,
    $updated_at: run.updated_at,
    $state_json: JSON.stringify(run),
  });
}

function syncApprovalEventRecords(db: DatabaseSyncInstance, run: RunState) {
  db.prepare(`DELETE FROM run_approval_events WHERE run_id = ?`).run(run.id);

  if (run.approval_history.length === 0) {
    return;
  }

  const statement = db.prepare(`
    INSERT INTO run_approval_events (
      event_id,
      run_id,
      approval_type,
      event_type,
      occurred_at,
      approval_status,
      workflow_status,
      channel,
      approver,
      note,
      chat_id,
      telegram_message_id,
      delivery_summary
    ) VALUES (
      $event_id,
      $run_id,
      $approval_type,
      $event_type,
      $occurred_at,
      $approval_status,
      $workflow_status,
      $channel,
      $approver,
      $note,
      $chat_id,
      $telegram_message_id,
      $delivery_summary
    )
  `);

  for (const entry of run.approval_history) {
    statement.run({
      $event_id: entry.id,
      $run_id: run.id,
      $approval_type: entry.approval_type,
      $event_type: entry.event_type,
      $occurred_at: entry.occurred_at,
      $approval_status: entry.approval_status,
      $workflow_status: entry.workflow_status,
      $channel: entry.channel,
      $approver: entry.approver,
      $note: entry.note,
      $chat_id: entry.chat_id,
      $telegram_message_id: entry.telegram_message_id,
      $delivery_summary: entry.delivery_summary,
    });
  }
}

function syncPublishAttemptRecords(db: DatabaseSyncInstance, run: RunState) {
  db.prepare(`DELETE FROM run_publish_attempts WHERE run_id = ?`).run(run.id);

  if (run.publish_attempts.length === 0) {
    return;
  }

  const statement = db.prepare(`
    INSERT INTO run_publish_attempts (
      attempt_id,
      run_id,
      trigger,
      requested_by,
      status,
      requested_at,
      started_at,
      completed_at,
      caption,
      provider,
      instagram_creation_id,
      instagram_media_id,
      permalink,
      error
    ) VALUES (
      $attempt_id,
      $run_id,
      $trigger,
      $requested_by,
      $status,
      $requested_at,
      $started_at,
      $completed_at,
      $caption,
      $provider,
      $instagram_creation_id,
      $instagram_media_id,
      $permalink,
      $error
    )
  `);

  for (const attempt of run.publish_attempts) {
    statement.run({
      $attempt_id: attempt.id,
      $run_id: run.id,
      $trigger: attempt.trigger,
      $requested_by: attempt.requested_by,
      $status: attempt.status,
      $requested_at: attempt.requested_at,
      $started_at: attempt.started_at,
      $completed_at: attempt.completed_at,
      $caption: attempt.caption,
      $provider: attempt.provider,
      $instagram_creation_id: attempt.instagram_creation_id,
      $instagram_media_id: attempt.instagram_media_id,
      $permalink: attempt.permalink,
      $error: attempt.error,
    });
  }
}

export function syncRunStateToMirror(run: RunState) {
  if (shouldBypassMirror()) {
    return;
  }

  withDb((db) => {
    db.exec("BEGIN");

    try {
      syncRunStateRecord(db, run);
      syncApprovalEventRecords(db, run);
      syncPublishAttemptRecords(db, run);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}

function mapApprovalEventRow(row: ApprovalEventRow): RunApprovalEventRecord {
  return {
    id: String(row.event_id),
    runId: String(row.run_id),
    approvalType: String(row.approval_type) as ApprovalHistoryEntry["approval_type"],
    eventType: String(row.event_type) as ApprovalHistoryEntry["event_type"],
    occurredAt: String(row.occurred_at),
    approvalStatus: String(row.approval_status) as ApprovalHistoryEntry["approval_status"],
    workflowStatus: String(row.workflow_status) as ApprovalHistoryEntry["workflow_status"],
    channel: row.channel ? (String(row.channel) as ApprovalHistoryEntry["channel"]) : null,
    approver: row.approver ? String(row.approver) : null,
    note: row.note ? String(row.note) : null,
    chatId: row.chat_id ? String(row.chat_id) : null,
    telegramMessageId: row.telegram_message_id ? String(row.telegram_message_id) : null,
    deliverySummary: row.delivery_summary ? String(row.delivery_summary) : null,
  };
}

function mapPublishAttemptRow(row: PublishAttemptRow): RunPublishAttemptRecord {
  return {
    id: String(row.attempt_id),
    runId: String(row.run_id),
    trigger: String(row.trigger) as PublishAttempt["trigger"],
    requestedBy: row.requested_by ? String(row.requested_by) : null,
    status: String(row.status) as PublishAttempt["status"],
    requestedAt: String(row.requested_at),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    caption: row.caption ? String(row.caption) : null,
    provider: row.provider ? (String(row.provider) as PublishAttempt["provider"]) : null,
    instagramCreationId: row.instagram_creation_id ? String(row.instagram_creation_id) : null,
    instagramMediaId: row.instagram_media_id ? String(row.instagram_media_id) : null,
    permalink: row.permalink ? String(row.permalink) : null,
    error: row.error ? String(row.error) : null,
  };
}

export function listRunApprovalEvents(runId: string) {
  if (shouldBypassMirror()) {
    return [];
  }

  return withDb((db) => {
    const statement = db.prepare(`
      SELECT *
      FROM run_approval_events
      WHERE run_id = ?
      ORDER BY occurred_at DESC
    `);

    return (statement.all(runId) as ApprovalEventRow[]).map(mapApprovalEventRow);
  });
}

export function listRunPublishAttempts(runId: string) {
  if (shouldBypassMirror()) {
    return [];
  }

  return withDb((db) => {
    const statement = db.prepare(`
      SELECT *
      FROM run_publish_attempts
      WHERE run_id = ?
      ORDER BY requested_at DESC
    `);

    return (statement.all(runId) as PublishAttemptRow[]).map(mapPublishAttemptRow);
  });
}

export function listRunOperationalEvents(runId: string) {
  if (shouldBypassMirror()) {
    return [];
  }

  const approvalEvents = listRunApprovalEvents(runId).map<RunOperationalEventRecord>(
    (record) => ({
      kind: "approval",
      sortAt: record.occurredAt,
      record,
    }),
  );
  const publishEvents = listRunPublishAttempts(runId).map<RunOperationalEventRecord>(
    (record) => ({
      kind: "publish_attempt",
      sortAt: record.completedAt ?? record.startedAt ?? record.requestedAt,
      record,
    }),
  );

  return [...approvalEvents, ...publishEvents].sort((left, right) =>
    right.sortAt.localeCompare(left.sortAt),
  );
}

export function readMirroredRunState(runId: string) {
  if (shouldBypassMirror()) {
    return null;
  }

  return withDb((db) => {
    const statement = db.prepare(`
      SELECT state_json
      FROM run_state_mirror
      WHERE run_id = ?
      LIMIT 1
    `);
    const row = (statement.all(runId) as RunStateMirrorRow[])[0];

    if (!row?.state_json || typeof row.state_json !== "string") {
      return null;
    }

    return runStateSchema.parse(JSON.parse(row.state_json));
  });
}
