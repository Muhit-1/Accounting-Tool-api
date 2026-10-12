-- AlterTable
ALTER TABLE `businesses` ADD COLUMN `orderPrefix` VARCHAR(10) NULL;

-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `orderId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `orderDate` DATETIME(3) NOT NULL,
    `customerName` VARCHAR(120) NOT NULL,
    `customerPhone` VARCHAR(30) NULL,
    `customerEmail` VARCHAR(254) NULL,
    `customerAddress` TEXT NULL,
    `items` TEXT NULL,
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `deliveryCharge` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(14, 2) NOT NULL,
    `paymentMethod` VARCHAR(60) NULL,
    `status` ENUM('NEW', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED') NOT NULL DEFAULT 'NEW',
    `postingRule` ENUM('MONEY_IN', 'DEDUCT_FROM_FUND') NOT NULL DEFAULT 'MONEY_IN',
    `deliveryDate` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_businessId_number_key`(`businessId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `transactions_orderId_key` ON `transactions`(`orderId`);

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_businessId_fkey` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

