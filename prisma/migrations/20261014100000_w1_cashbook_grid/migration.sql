-- AlterTable
ALTER TABLE `categories` ADD COLUMN `systemKey` VARCHAR(30) NULL;

-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `importBatchId` VARCHAR(64) NULL;

-- CreateIndex
CREATE INDEX `transactions_businessId_importBatchId_idx` ON `transactions`(`businessId`, `importBatchId`);

-- Mark the categories the order feature already created as system ones, and
-- give the income one its final name ("Orders (auto)").
UPDATE `categories` SET `systemKey` = 'ORDERS_IN', `name` = 'Orders (auto)' WHERE `name` = 'Orders (delivered)' AND `type` = 'INCOME';
UPDATE `categories` SET `systemKey` = 'ORDERS_OUT' WHERE `name` = 'Orders paid from fund' AND `type` = 'EXPENSE';
