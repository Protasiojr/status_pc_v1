-- CreateTable
CREATE TABLE `Admin` (
    `id` VARCHAR(32) NOT NULL DEFAULT 'singleton',
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Admin_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(30) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `adminId` VARCHAR(32) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Agent` (
    `id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `platform` VARCHAR(32) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `lastProbeAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Agent_tokenHash_key`(`tokenHash`),
    INDEX `Agent_lastSeenAt_idx`(`lastSeenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PairingCode` (
    `id` VARCHAR(30) NOT NULL,
    `codeHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PairingCode_codeHash_key`(`codeHash`),
    INDEX `PairingCode_expiresAt_usedAt_idx`(`expiresAt`, `usedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Device` (
    `id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(500) NULL,
    `color` CHAR(7) NOT NULL DEFAULT '#246BFD',
    `hostname` VARCHAR(191) NULL,
    `ip` VARCHAR(45) NULL,
    `port` INTEGER NULL,
    `mac` VARCHAR(17) NULL,
    `type` ENUM('PC', 'ROUTER', 'MODEM', 'MOBILE', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `os` VARCHAR(80) NULL,
    `osConfidence` VARCHAR(16) NULL,
    `typeConfidence` VARCHAR(16) NULL,
    `status` ENUM('online', 'offline', 'unknown') NOT NULL DEFAULT 'unknown',
    `missedProbes` INTEGER NOT NULL DEFAULT 0,
    `lastSeenAt` DATETIME(3) NULL,
    `broadcastAddress` VARCHAR(45) NULL,
    `wolEnabled` BOOLEAN NOT NULL DEFAULT false,
    `wolPort` INTEGER NOT NULL DEFAULT 9,
    `approved` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Device_mac_key`(`mac`),
    INDEX `Device_ip_idx`(`ip`),
    INDEX `Device_approved_status_idx`(`approved`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WakeCommand` (
    `id` VARCHAR(30) NOT NULL,
    `type` ENUM('DISCOVER', 'PING_DEVICES', 'WOL') NOT NULL,
    `status` ENUM('pending', 'claimed', 'success', 'failed') NOT NULL DEFAULT 'pending',
    `deviceId` VARCHAR(30) NULL,
    `agentId` VARCHAR(30) NULL,
    `payload` JSON NULL,
    `message` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `WakeCommand_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `WakeCommand_agentId_status_idx`(`agentId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WakeCommand` ADD CONSTRAINT `WakeCommand_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WakeCommand` ADD CONSTRAINT `WakeCommand_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
