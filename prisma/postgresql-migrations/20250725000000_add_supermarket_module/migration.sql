-- CreateEnum
CREATE TYPE "SupermarketReceiptSource" AS ENUM ('NFCE_LINK', 'IMAGE', 'PDF', 'MANUAL');

-- CreateEnum
CREATE TYPE "SupermarketReceiptStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "SupermarketReceipt" (
    "id" TEXT NOT NULL,
    "source" "SupermarketReceiptSource" NOT NULL DEFAULT 'MANUAL',
    "status" "SupermarketReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "accessKey" VARCHAR(60),
    "storeName" VARCHAR(255),
    "storeCnpj" VARCHAR(20),
    "purchaseDate" TIMESTAMP,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" VARCHAR(1000),
    "rawText" TEXT,
    "errorMessage" VARCHAR(500),
    "remoteJid" VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "SupermarketReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupermarketReceiptItem" (
    "id" TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "category" VARCHAR(60) NOT NULL DEFAULT 'Outros',
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit" VARCHAR(20),
    "unitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "receiptId" TEXT NOT NULL,

    CONSTRAINT "SupermarketReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupermarketReceipt_accessKey_key" ON "SupermarketReceipt"("accessKey");

-- CreateIndex
CREATE INDEX "SupermarketReceipt_instanceId_idx" ON "SupermarketReceipt"("instanceId");

-- CreateIndex
CREATE INDEX "SupermarketReceipt_purchaseDate_idx" ON "SupermarketReceipt"("purchaseDate");

-- CreateIndex
CREATE INDEX "SupermarketReceiptItem_receiptId_idx" ON "SupermarketReceiptItem"("receiptId");

-- CreateIndex
CREATE INDEX "SupermarketReceiptItem_category_idx" ON "SupermarketReceiptItem"("category");

-- AddForeignKey
ALTER TABLE "SupermarketReceipt" ADD CONSTRAINT "SupermarketReceipt_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupermarketReceiptItem" ADD CONSTRAINT "SupermarketReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "SupermarketReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
