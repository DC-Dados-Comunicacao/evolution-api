-- CreateTable
CREATE TABLE `SupermarketReceipt` (
    `id` VARCHAR(191) NOT NULL,
    `source` ENUM('NFCE_LINK', 'IMAGE', 'PDF', 'MANUAL') NOT NULL DEFAULT 'MANUAL',
    `status` ENUM('PENDING', 'PROCESSED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `accessKey` VARCHAR(60) NULL,
    `storeName` VARCHAR(255) NULL,
    `storeCnpj` VARCHAR(20) NULL,
    `purchaseDate` TIMESTAMP NULL,
    `totalAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `itemCount` INTEGER NOT NULL DEFAULT 0,
    `sourceUrl` VARCHAR(1000) NULL,
    `rawText` TEXT NULL,
    `errorMessage` VARCHAR(500) NULL,
    `remoteJid` VARCHAR(100) NULL,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` TIMESTAMP NOT NULL,
    `instanceId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `SupermarketReceipt_accessKey_key`(`accessKey`),
    INDEX `SupermarketReceipt_instanceId_idx`(`instanceId`),
    INDEX `SupermarketReceipt_purchaseDate_idx`(`purchaseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupermarketReceiptItem` (
    `id` VARCHAR(191) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `category` VARCHAR(60) NOT NULL DEFAULT 'Outros',
    `quantity` DECIMAL(12, 3) NOT NULL DEFAULT 1,
    `unit` VARCHAR(20) NULL,
    `unitPrice` DECIMAL(12, 4) NOT NULL DEFAULT 0,
    `totalPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `createdAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `receiptId` VARCHAR(191) NOT NULL,

    INDEX `SupermarketReceiptItem_receiptId_idx`(`receiptId`),
    INDEX `SupermarketReceiptItem_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SupermarketReceipt` ADD CONSTRAINT `SupermarketReceipt_instanceId_fkey` FOREIGN KEY (`instanceId`) REFERENCES `Instance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupermarketReceiptItem` ADD CONSTRAINT `SupermarketReceiptItem_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `SupermarketReceipt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
