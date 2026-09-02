CREATE TABLE `buy_candidates` (
	`ticker` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`added_at` text NOT NULL,
	`deactivated_at` text,
	`reactivated_at` text,
	`fundamental_stage` text NOT NULL,
	`fundamental_score` real,
	`fundamental_calculated_at` text NOT NULL,
	`fundamental_updated_at` text NOT NULL,
	`source_snapshot_date` text NOT NULL,
	`source_version` text NOT NULL,
	`fundamental_metrics_json` text NOT NULL,
	`last_synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_buy_candidates_active_synced` ON `buy_candidates` (`active`,`last_synced_at`);--> statement-breakpoint
CREATE TABLE `fundamental_reference_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`company_name` text NOT NULL,
	`fundamental_stage` text NOT NULL,
	`fundamental_score` real,
	`metrics_json` text NOT NULL,
	`calculated_at` text NOT NULL,
	`source_updated_at` text NOT NULL,
	`source_snapshot_date` text NOT NULL,
	`source_version` text NOT NULL,
	`received_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fundamental_reference_ticker_source_updated` ON `fundamental_reference_snapshots` (`ticker`,`source_updated_at`);--> statement-breakpoint
CREATE INDEX `idx_fundamental_reference_ticker_received` ON `fundamental_reference_snapshots` (`ticker`,`received_at`);
