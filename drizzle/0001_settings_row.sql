-- Carry an existing database's contexts, buckets and review template into the one Settings
-- row before their tables go (a database without them is new and gets its seed on open).
INSERT OR REPLACE INTO `settings` (`key`, `value`)
SELECT 'settings', json_object(
  'contexts', (SELECT json_group_array(`name`) FROM (SELECT `name` FROM `contexts` ORDER BY `seq`)),
  'buckets', (SELECT json_group_array(`name`) FROM (SELECT `name` FROM `buckets` ORDER BY `seq`)),
  'reviewTemplate', json_object('phases', json(`phases`)),
  'weekStart', 'mon',
  'timezone', 'Europe/Zurich'
) FROM `review_templates` WHERE `id` = 'default';--> statement-breakpoint
ALTER TABLE `review_runs` ADD `template` text;--> statement-breakpoint
-- Runs that exist already keep the checklist they were started with from now on.
UPDATE `review_runs` SET `template` = (
  SELECT json_object('phases', json(`phases`)) FROM `review_templates` WHERE `id` = 'default'
);--> statement-breakpoint
DROP TABLE `buckets`;--> statement-breakpoint
DROP TABLE `contexts`;--> statement-breakpoint
DROP TABLE `review_templates`;