CREATE TABLE `mail_seen` (
	`message_id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`at` text NOT NULL,
	`outcome` text NOT NULL,
	`item_id` text
);
