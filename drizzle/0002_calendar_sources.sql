-- Calendars are keyed by source id (synced) or demo:<name>, so two may share a name.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_external_calendars` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`seq` integer NOT NULL,
	`via` text NOT NULL,
	`source_id` text,
	`host` text,
	`last_sync_at` text,
	`last_error` text,
	`last_error_at` text
);
--> statement-breakpoint
INSERT INTO `__new_external_calendars`("key", "name", "seq", "via", "source_id", "host", "last_sync_at", "last_error", "last_error_at") SELECT 'demo:' || "name", "name", "seq", "via", NULL, NULL, NULL, NULL, NULL FROM `external_calendars`;--> statement-breakpoint
DROP TABLE `external_calendars`;--> statement-breakpoint
ALTER TABLE `__new_external_calendars` RENAME TO `external_calendars`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `external_events` ADD `location` text;--> statement-breakpoint
ALTER TABLE `external_events` ADD `source_id` text;