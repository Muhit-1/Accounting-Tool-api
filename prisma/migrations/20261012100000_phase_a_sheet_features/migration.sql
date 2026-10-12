-- Phase A of "replace the Google Sheet": all additive, all nullable, so every
-- existing row keeps working (amountType NULL = a plain fixed amount).

-- AlterTable
ALTER TABLE `categories` ADD COLUMN `groupName` VARCHAR(60) NULL;

-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `proofUrl` TEXT NULL,
    ADD COLUMN `amountType` VARCHAR(20) NULL,
    ADD COLUMN `amountInputs` JSON NULL;
