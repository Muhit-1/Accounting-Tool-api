-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `receiptFileName` VARCHAR(191) NULL,
    ADD COLUMN `receiptFileReference` VARCHAR(191) NULL,
    ADD COLUMN `receiptMimeType` VARCHAR(191) NULL;
