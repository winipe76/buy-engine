import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const buyCandidates = sqliteTable("buy_candidates", {
  ticker: text("ticker").primaryKey(),
  companyName: text("company_name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  addedAt: text("added_at").notNull(),
  deactivatedAt: text("deactivated_at"),
  reactivatedAt: text("reactivated_at"),
  fundamentalStage: text("fundamental_stage", { enum: ["newly_selected", "continuing_improvement", "watch", "caution", "excluded"] }).notNull(),
  fundamentalScore: real("fundamental_score"),
  fundamentalCalculatedAt: text("fundamental_calculated_at").notNull(),
  fundamentalUpdatedAt: text("fundamental_updated_at").notNull(),
  sourceSnapshotDate: text("source_snapshot_date").notNull(),
  sourceVersion: text("source_version").notNull(),
  fundamentalMetricsJson: text("fundamental_metrics_json").notNull(),
  lastSyncedAt: text("last_synced_at").notNull(),
}, (table) => [index("idx_buy_candidates_active_synced").on(table.active, table.lastSyncedAt)]);

export const fundamentalReferenceSnapshots = sqliteTable("fundamental_reference_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  fundamentalStage: text("fundamental_stage", { enum: ["newly_selected", "continuing_improvement", "watch", "caution", "excluded"] }).notNull(),
  fundamentalScore: real("fundamental_score"),
  metricsJson: text("metrics_json").notNull(),
  calculatedAt: text("calculated_at").notNull(),
  sourceUpdatedAt: text("source_updated_at").notNull(),
  sourceSnapshotDate: text("source_snapshot_date").notNull(),
  sourceVersion: text("source_version").notNull(),
  receivedAt: text("received_at").notNull(),
}, (table) => [
  uniqueIndex("idx_fundamental_reference_ticker_source_updated").on(table.ticker, table.sourceUpdatedAt),
  index("idx_fundamental_reference_ticker_received").on(table.ticker, table.receivedAt),
]);

export const buyAnalysisSnapshots = sqliteTable("buy_analysis_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  analyzedAt: text("analyzed_at").notNull(),
  priceAsOf: text("price_as_of").notNull(),
  price: real("price").notNull(),
  valueScore: real("value_score"),
  overheatScore: real("overheat_score").notNull(),
  deltaOverheat: real("delta_overheat").notNull(),
  dcaMultiplier: real("dca_multiplier"),
  action: text("action", { enum: ["BUY", "PAUSE", "REVIEW"] }).notNull(),
  valueState: text("value_state"),
  overheatState: text("overheat_state").notNull(),
  valueMetricsJson: text("value_metrics_json").notNull(),
  overheatMetricsJson: text("overheat_metrics_json").notNull(),
  dataQualityJson: text("data_quality_json").notNull(),
  sourceVersion: text("source_version").notNull(),
}, (table) => [
  uniqueIndex("idx_buy_analysis_ticker_analyzed").on(table.ticker, table.analyzedAt),
]);

export const buyApiSnapshots = sqliteTable("buy_api_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotAt: text("snapshot_at").notNull(),
  ticker: text("ticker").notNull(),
  dataset: text("dataset").notNull(),
  rawJson: text("raw_json").notNull(),
}, (table) => [
  uniqueIndex("idx_buy_api_ticker_dataset_snapshot").on(table.ticker, table.dataset, table.snapshotAt),
]);

