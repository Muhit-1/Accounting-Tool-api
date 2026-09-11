-- RenameTable: preserves existing rows (vs. drop+recreate)
RENAME TABLE `ledgers` TO `accounts`;

-- RenameColumn: preserves existing values
ALTER TABLE `transactions` RENAME COLUMN `ledgerId` TO `accountId`;

-- Rename constraints/index to match the new names
ALTER TABLE `accounts` DROP FOREIGN KEY `ledgers_businessId_fkey`;
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `transactions` DROP FOREIGN KEY `transactions_ledgerId_fkey`;
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `transactions` RENAME INDEX `transactions_ledgerId_idx` TO `transactions_accountId_idx`;

-- Update the auto-created default account's display name
UPDATE `accounts` SET `name` = 'General account' WHERE `name` = 'General ledger';
