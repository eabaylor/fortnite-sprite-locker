CREATE TABLE `locker_players` (
	`season` text NOT NULL,
	`name_key` text NOT NULL,
	`name` text NOT NULL,
	`share_id` text NOT NULL,
	PRIMARY KEY(`season`, `name_key`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locker_players_share` ON `locker_players` (`share_id`);