ALTER TABLE `locker_shares` ADD `write_key_hash` text;--> statement-breakpoint
ALTER TABLE `locker_shares` ADD `live_season` text;--> statement-breakpoint
ALTER TABLE `locker_shares` ADD `live_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `locker_shares` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `locker_shares` ADD `updated_at` integer;