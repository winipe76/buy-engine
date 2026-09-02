import type { CandidateSnapshot } from "@/lib/candidate-contract";

export async function syncCandidate(db: D1Database, snapshot: CandidateSnapshot) {
  const previous = await db.prepare("SELECT active FROM buy_candidates WHERE ticker=?").bind(snapshot.ticker).first<{ active: number }>();
  const receivedAt = new Date().toISOString();
  const sourceUpdatedAt = `${snapshot.source_snapshot_date}T00:00:00.000Z`;
  const sourceVersion = "fundamental-flow-candidate-v2";
  const metricsJson = JSON.stringify(snapshot.metrics);
  await db.batch([
    db.prepare(`INSERT INTO fundamental_reference_snapshots
      (ticker,company_name,fundamental_stage,fundamental_score,metrics_json,calculated_at,source_updated_at,source_snapshot_date,source_version,received_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(ticker,source_updated_at) DO NOTHING`
    ).bind(snapshot.ticker, snapshot.company_name, snapshot.fundamental_stage, snapshot.fundamental_score, metricsJson,
      sourceUpdatedAt, sourceUpdatedAt, snapshot.source_snapshot_date, sourceVersion, receivedAt),
    db.prepare(`INSERT INTO buy_candidates
      (ticker,company_name,active,added_at,deactivated_at,reactivated_at,fundamental_stage,fundamental_score,
       fundamental_calculated_at,fundamental_updated_at,source_snapshot_date,source_version,fundamental_metrics_json,last_synced_at)
      VALUES (?,?,1,?,NULL,NULL,?,?,?,?,?,?,?,?)
      ON CONFLICT(ticker) DO UPDATE SET
        company_name=excluded.company_name,active=1,
        deactivated_at=CASE WHEN buy_candidates.active=0 THEN NULL ELSE buy_candidates.deactivated_at END,
        reactivated_at=CASE WHEN buy_candidates.active=0 THEN excluded.last_synced_at ELSE buy_candidates.reactivated_at END,
        fundamental_stage=excluded.fundamental_stage,fundamental_score=excluded.fundamental_score,
        fundamental_calculated_at=excluded.fundamental_calculated_at,fundamental_updated_at=excluded.fundamental_updated_at,
        source_snapshot_date=excluded.source_snapshot_date,source_version=excluded.source_version,
        fundamental_metrics_json=excluded.fundamental_metrics_json,last_synced_at=excluded.last_synced_at`
    ).bind(snapshot.ticker, snapshot.company_name, receivedAt, snapshot.fundamental_stage, snapshot.fundamental_score,
      sourceUpdatedAt, sourceUpdatedAt, snapshot.source_snapshot_date, sourceVersion, metricsJson, receivedAt),
  ]);
  return { status: !previous ? "added" : previous.active === 0 ? "reactivated" : "updated", receivedAt } as const;
}

export async function setCandidateActive(db: D1Database, ticker: string, active: boolean) {
  const now = new Date().toISOString();
  const result = active
    ? await db.prepare("UPDATE buy_candidates SET active=1,reactivated_at=?,deactivated_at=NULL WHERE ticker=?").bind(now, ticker).run()
    : await db.prepare("UPDATE buy_candidates SET active=0,deactivated_at=? WHERE ticker=?").bind(now, ticker).run();
  if (!result.meta.changes) return null;
  return { ticker, active, changed_at: now };
}

