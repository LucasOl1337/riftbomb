CREATE TABLE `pvp_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_token` text NOT NULL,
	`offer` text NOT NULL,
	`answer` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`guest_joined_at` integer
);
