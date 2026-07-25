-- CreateTable
CREATE TABLE "SupermarketSetting" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "captureMedia" BOOLEAN NOT NULL DEFAULT true,
    "replyOnCapture" BOOLEAN NOT NULL DEFAULT true,
    "openaiCredsId" VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL,
    "instanceId" TEXT NOT NULL,

    CONSTRAINT "SupermarketSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupermarketSetting_instanceId_key" ON "SupermarketSetting"("instanceId");

-- AddForeignKey
ALTER TABLE "SupermarketSetting" ADD CONSTRAINT "SupermarketSetting_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
