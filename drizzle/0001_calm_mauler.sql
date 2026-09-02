CREATE TABLE `buy_analysis_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`analyzed_at` text NOT NULL,
	`price_as_of` text NOT NULL,
	`price` real NOT NULL,
	`value_score` real,
	`overheat_score` real NOT NULL,
	`delta_overheat` real NOT NULL,
	`dca_multiplier` real,
	`action` text NOT NULL,
	`value_state` text,
	`overheat_state` text NOT NULL,
	`value_metrics_json` text NOT NULL,
	`overheat_metrics_json` text NOT NULL,
	`data_quality_json` text NOT NULL,
	`source_version` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buy_analysis_ticker_analyzed` ON `buy_analysis_snapshots` (`ticker`,`analyzed_at`);--> statement-breakpoint
CREATE TABLE `buy_api_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_at` text NOT NULL,
	`ticker` text NOT NULL,
	`dataset` text NOT NULL,
	`raw_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buy_api_ticker_dataset_snapshot` ON `buy_api_snapshots` (`ticker`,`dataset`,`snapshot_at`);

