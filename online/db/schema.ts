import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pvpRooms = sqliteTable("pvp_rooms", {
  code: text("code").primaryKey(),
  hostToken: text("host_token").notNull(),
  offer: text("offer").notNull(),
  answer: text("answer"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  guestJoinedAt: integer("guest_joined_at"),
});
