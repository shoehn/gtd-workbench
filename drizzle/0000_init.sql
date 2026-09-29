CREATE TABLE `area_kinds` (
	`area` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `buckets` (
	`name` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contexts` (
	`name` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `external_calendars` (
	`name` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`via` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `external_events` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`calendar` text NOT NULL,
	`title` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`all_day` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`text` text NOT NULL,
	`captured` text NOT NULL,
	`source` text NOT NULL,
	`captured_at` text NOT NULL,
	`status` text NOT NULL,
	`project_id` text,
	`context` text,
	`priority` text,
	`priority_no` real,
	`time` integer,
	`energy` text,
	`deadline` text,
	`day` text,
	`time_slot_start` text,
	`time_slot_end` text,
	`focus_on` text,
	`waiting_who` text,
	`waiting_since` text,
	`waiting_follow_up` text,
	`bucket` text,
	`tags` text NOT NULL,
	`done_at` text,
	`trashed_at` text
);
--> statement-breakpoint
CREATE INDEX `items_status` ON `items` (`status`);--> statement-breakpoint
CREATE INDEX `items_project_id` ON `items` (`project_id`);--> statement-breakpoint
CREATE INDEX `items_day` ON `items` (`day`);--> statement-breakpoint
CREATE INDEX `items_deadline` ON `items` (`deadline`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`title` text NOT NULL,
	`successful_when` text,
	`area` text,
	`goal` text,
	`deadline` text,
	`status` text NOT NULL,
	`notes` text NOT NULL,
	`last_reviewed_at` text,
	`created_at` text,
	`created_from` text,
	`dropped` integer,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `review_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`paused_ms` integer NOT NULL,
	`paused_at` text,
	`steps` text NOT NULL,
	`notes` text NOT NULL,
	`outcome` text
);
--> statement-breakpoint
CREATE TABLE `review_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`phases` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tickler` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`day` text NOT NULL,
	`text` text NOT NULL
);
