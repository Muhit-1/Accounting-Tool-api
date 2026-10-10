-- `googleId` was reserved in the init migration and never written to, so it is
-- renamed (rows and the unique index are kept) instead of adding a second
-- Google identifier next to it. `passwordHash` is already nullable.
ALTER TABLE `users` RENAME COLUMN `googleId` TO `googleSub`;
ALTER TABLE `users` RENAME INDEX `users_googleId_key` TO `users_googleSub_key`;

-- Google refresh token, stored as AES-256-GCM ciphertext ("iv.tag.data").
ALTER TABLE `users` ADD COLUMN `googleRefreshTokenEnc` TEXT NULL;
