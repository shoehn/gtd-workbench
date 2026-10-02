CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`summary` text NOT NULL,
	`changes` text NOT NULL,
	`undo_of` text
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`name` text NOT NULL,
	`preset` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text
);
