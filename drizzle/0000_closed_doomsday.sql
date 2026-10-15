CREATE TABLE `locker_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `locker_shares_expiry` ON `locker_shares` (`expires_at`);--> statement-breakpoint
CREATE TABLE `share_quotas` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `share_quotas_expiry` ON `share_quotas` (`expires_at`);--> statement-breakpoint
CREATE TABLE `share_tickets` (
	`hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `share_tickets_expiry` ON `share_tickets` (`expires_at`);