import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const lockerShares = sqliteTable('locker_shares', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  writeKeyHash: text('write_key_hash'),
  liveSeason: text('live_season'),
  liveEnabled: integer('live_enabled').notNull().default(0),
  revision: integer('revision').notNull().default(0),
  updatedAt: integer('updated_at'),
}, table => [index('locker_shares_expiry').on(table.expiresAt)]);

export const shareTickets = sqliteTable('share_tickets', {
  hash: text('hash').primaryKey(),
  expiresAt: integer('expires_at').notNull(),
}, table => [index('share_tickets_expiry').on(table.expiresAt)]);

export const shareQuotas = sqliteTable('share_quotas', {
  bucket: text('bucket').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [index('share_quotas_expiry').on(table.expiresAt)]);
