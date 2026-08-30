-- CreateTable
CREATE TABLE `ledgers` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill: one default ledger per existing business, so existing
-- transactions have somewhere to attach to below.
INSERT INTO `ledgers` (`id`, `businessId`, `name`, `createdAt`, `updatedAt`)
SELECT UUID(), `id`, 'General ledger', NOW(3), NOW(3) FROM `businesses`;

-- AlterTable: widen logoUrl for base64 data-URI uploads
ALTER TABLE `businesses` MODIFY COLUMN `logoUrl` TEXT NULL;

-- AlterTable: add ledgerId as nullable first so existing rows can be backfilled
ALTER TABLE `transactions` ADD COLUMN `ledgerId` VARCHAR(191) NULL;

UPDATE `transactions` t
JOIN `ledgers` l ON l.`businessId` = t.`businessId`
SET t.`ledgerId` = l.`id`;

ALTER TABLE `transactions` MODIFY COLUMN `ledgerId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `transactions_ledgerId_idx` ON `transactions`(`ledgerId`);

-- AddForeignKey
ALTER TABLE `ledgers` ADD CONSTRAINT `ledgers_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_ledgerId_fkey` FOREIGN KEY (`ledgerId`) REFERENCES `ledgers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
