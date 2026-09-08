CREATE TABLE `pension_etf_candidates` (
	`ticker` text PRIMARY KEY NOT NULL,
	`isin` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`valuation_profile` text NOT NULL,
	`valuation_json` text NOT NULL,
	`valuation_as_of` text,
	`added_at` text NOT NULL,
	`updated_at` text NOT NULL
);
