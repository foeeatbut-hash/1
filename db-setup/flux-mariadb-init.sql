-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL DEFAULT 'password',
    `name` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'ENGINEER_VENT',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `validUntil` DATETIME(3) NULL,
    `permissions` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_symbol_key`(`symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL DEFAULT '',
    `customer` VARCHAR(191) NOT NULL DEFAULT '',
    `contractor` VARCHAR(191) NOT NULL DEFAULT '',
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `info` VARCHAR(191) NOT NULL DEFAULT '',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConstructorDoc` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT 'Без названия',
    `kind` VARCHAR(191) NOT NULL DEFAULT 'DOC',
    `scope` VARCHAR(191) NOT NULL DEFAULT 'SHARED',
    `ownerId` VARCHAR(191) NULL,
    `named` BOOLEAN NOT NULL DEFAULT false,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `workbook` LONGTEXT NOT NULL DEFAULT '',
    `bindings` TEXT NOT NULL DEFAULT '[]',
    `settings` TEXT NOT NULL DEFAULT '{}',
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ConstructorDoc_projectId_kind_idx`(`projectId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConstructorDocVersion` (
    `id` VARCHAR(191) NOT NULL,
    `docId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `workbook` LONGTEXT NOT NULL DEFAULT '',
    `bindings` TEXT NOT NULL DEFAULT '[]',
    `comment` VARCHAR(191) NOT NULL DEFAULT '',
    `authorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ConstructorDocVersion_docId_version_idx`(`docId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocRegister` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT 'ВДР',
    `vendor` VARCHAR(191) NOT NULL DEFAULT '',
    `contractor` VARCHAR(191) NOT NULL DEFAULT '',
    `owner` VARCHAR(191) NOT NULL DEFAULT '',
    `poNumber` VARCHAR(191) NOT NULL DEFAULT '',
    `standardId` VARCHAR(191) NULL,
    `ownerProjectNo` VARCHAR(191) NOT NULL DEFAULT '',
    `contractorProjectNo` VARCHAR(191) NOT NULL DEFAULT '',
    `materialRequisition` VARCHAR(191) NOT NULL DEFAULT '',
    `equipmentTitle` VARCHAR(191) NOT NULL DEFAULT '',
    `contractorDocNo` VARCHAR(191) NOT NULL DEFAULT '',
    `ownerDocNo` VARCHAR(191) NOT NULL DEFAULT '',
    `vendorDocNo` VARCHAR(191) NOT NULL DEFAULT '',
    `revision` VARCHAR(191) NOT NULL DEFAULT 'A',
    `revisions` TEXT NOT NULL DEFAULT '[]',
    `preparedBy` VARCHAR(191) NOT NULL DEFAULT '',
    `checkedBy` VARCHAR(191) NOT NULL DEFAULT '',
    `approvedBy` VARCHAR(191) NOT NULL DEFAULT '',
    `columnsConfig` LONGTEXT NOT NULL DEFAULT '[]',
    `managerId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DocRegister_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocRegisterItem` (
    `id` VARCHAR(191) NOT NULL,
    `registerId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `contractorNo` VARCHAR(191) NOT NULL DEFAULT '',
    `ownerNo` VARCHAR(191) NOT NULL DEFAULT '',
    `vendorNo` VARCHAR(191) NOT NULL DEFAULT '',
    `titleEn` TEXT NOT NULL DEFAULT '',
    `titleRu` TEXT NOT NULL DEFAULT '',
    `vdrCode` VARCHAR(191) NOT NULL DEFAULT '',
    `revision` VARCHAR(191) NOT NULL DEFAULT 'A',
    `issueDate` DATETIME(3) NULL,
    `reasonForIssue` VARCHAR(191) NOT NULL DEFAULT '',
    `language` VARCHAR(191) NOT NULL DEFAULT '',
    `equipmentTags` TEXT NOT NULL DEFAULT '[]',
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `docId` VARCHAR(191) NULL,
    `fileNodeId` VARCHAR(191) NULL,
    `assigneeId` VARCHAR(191) NULL,
    `remarks` TEXT NOT NULL DEFAULT '',
    `reviewCode` VARCHAR(191) NOT NULL DEFAULT '',
    `dueDate` DATETIME(3) NULL,
    `extra` LONGTEXT NOT NULL DEFAULT '{}',
    `meta` TEXT NOT NULL DEFAULT '{}',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DocRegisterItem_registerId_idx`(`registerId`),
    INDEX `DocRegisterItem_projectId_status_idx`(`projectId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocStandard` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT 'Стандарт',
    `config` LONGTEXT NOT NULL DEFAULT '{}',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocRegisterItemRevision` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `revision` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reason` VARCHAR(191) NOT NULL DEFAULT '',
    `place` VARCHAR(191) NOT NULL DEFAULT '',
    `description` TEXT NOT NULL DEFAULT '',
    `authorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DocRegisterItemRevision_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Dictionary` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DictionaryItem` (
    `id` VARCHAR(191) NOT NULL,
    `dictionaryId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `nameRu` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TagTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `schemaJson` LONGTEXT NOT NULL,

    UNIQUE INDEX `TagTemplate_projectId_key`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Folder` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL DEFAULT 'SHARED',
    `ownerId` VARCHAR(191) NULL,
    `system` BOOLEAN NOT NULL DEFAULT false,
    `parentId` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FileNode` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `filePath` TEXT NOT NULL,
    `size` INTEGER NOT NULL DEFAULT 0,
    `type` VARCHAR(191) NOT NULL DEFAULT 'FILE',
    `department` VARCHAR(191) NULL,
    `statusCode` VARCHAR(191) NOT NULL DEFAULT 'D',
    `revision` VARCHAR(191) NOT NULL DEFAULT '1',
    `scope` VARCHAR(191) NOT NULL DEFAULT 'SHARED',
    `ownerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `content` LONGTEXT NULL,
    `refId` VARCHAR(191) NULL,
    `folderId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Equipment` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tag` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `wbs` VARCHAR(191) NULL,
    `fluid` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NULL,
    `metadata` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EquipmentSystem` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'AHU',
    `fileName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Monoblock` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `systemId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComponentElement` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(191) NOT NULL,
    `monoblockId` VARCHAR(191) NOT NULL,
    `specs` LONGTEXT NULL,
    `equipType` VARCHAR(191) NOT NULL DEFAULT 'ПРОЧЕЕ',
    `overrides` LONGTEXT NULL,
    `paramConflicts` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(191) NOT NULL DEFAULT 'OK',
    `hasConflict` BOOLEAN NOT NULL DEFAULT false,
    `conflictType` VARCHAR(191) NULL,
    `conflictLog` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EquipmentHistory` (
    `id` VARCHAR(191) NOT NULL,
    `elementId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `oldSpecs` LONGTEXT NULL,
    `newSpecs` LONGTEXT NULL,
    `changeType` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserNote` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL DEFAULT 'Новая заметка',
    `content` LONGTEXT NOT NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200',
    `equipmentId` VARCHAR(191) NULL,
    `groupName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemChangeLog` (
    `id` VARCHAR(191) NOT NULL,
    `userName` VARCHAR(191) NOT NULL,
    `userSymbol` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `targetRoute` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatGroup` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'PROJECT',
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `color` VARCHAR(191) NOT NULL DEFAULT 'indigo',
    `ownerId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `senderId` VARCHAR(191) NOT NULL,
    `receiverId` VARCHAR(191) NULL,
    `chatGroupId` VARCHAR(191) NULL,
    `linkedElementId` VARCHAR(191) NULL,
    `linkedProjectId` VARCHAR(191) NULL,
    `replyToId` VARCHAR(191) NULL,
    `editedAt` DATETIME(3) NULL,
    `reactions` TEXT NULL,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `forwardedFrom` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `filePath` TEXT NOT NULL,
    `fileSize` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppSetting` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `value` LONGTEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AppSetting_key_userId_key`(`key`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppUpdate` (
    `id` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `changelog` TEXT NOT NULL,
    `fileUrl` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AppUpdate_version_key`(`version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'СИСТЕМА',
    `title` TEXT NOT NULL,
    `body` TEXT NOT NULL DEFAULT '',
    `targetRoute` TEXT NOT NULL DEFAULT '',
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_isRead_idx`(`userId`, `isRead`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_FileMainTags` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_FileMainTags_AB_unique`(`A`, `B`),
    INDEX `_FileMainTags_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_FileAdditionalTags` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_FileAdditionalTags_AB_unique`(`A`, `B`),
    INDEX `_FileAdditionalTags_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_ComponentElementToTag` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_ComponentElementToTag_AB_unique`(`A`, `B`),
    INDEX `_ComponentElementToTag_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_GroupMembers` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_GroupMembers_AB_unique`(`A`, `B`),
    INDEX `_GroupMembers_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ConstructorDoc` ADD CONSTRAINT `ConstructorDoc_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConstructorDocVersion` ADD CONSTRAINT `ConstructorDocVersion_docId_fkey` FOREIGN KEY (`docId`) REFERENCES `ConstructorDoc`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocRegisterItem` ADD CONSTRAINT `DocRegisterItem_registerId_fkey` FOREIGN KEY (`registerId`) REFERENCES `DocRegister`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dictionary` ADD CONSTRAINT `Dictionary_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DictionaryItem` ADD CONSTRAINT `DictionaryItem_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `DictionaryItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DictionaryItem` ADD CONSTRAINT `DictionaryItem_dictionaryId_fkey` FOREIGN KEY (`dictionaryId`) REFERENCES `Dictionary`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TagTemplate` ADD CONSTRAINT `TagTemplate_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Folder` ADD CONSTRAINT `Folder_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Folder` ADD CONSTRAINT `Folder_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Folder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FileNode` ADD CONSTRAINT `FileNode_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FileNode` ADD CONSTRAINT `FileNode_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FileNode` ADD CONSTRAINT `FileNode_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `Folder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tag` ADD CONSTRAINT `Tag_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tag` ADD CONSTRAINT `Tag_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentSystem` ADD CONSTRAINT `EquipmentSystem_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Monoblock` ADD CONSTRAINT `Monoblock_systemId_fkey` FOREIGN KEY (`systemId`) REFERENCES `EquipmentSystem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComponentElement` ADD CONSTRAINT `ComponentElement_monoblockId_fkey` FOREIGN KEY (`monoblockId`) REFERENCES `Monoblock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentHistory` ADD CONSTRAINT `EquipmentHistory_elementId_fkey` FOREIGN KEY (`elementId`) REFERENCES `ComponentElement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatGroup` ADD CONSTRAINT `ChatGroup_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_receiverId_fkey` FOREIGN KEY (`receiverId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_chatGroupId_fkey` FOREIGN KEY (`chatGroupId`) REFERENCES `ChatGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_linkedElementId_fkey` FOREIGN KEY (`linkedElementId`) REFERENCES `ComponentElement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_linkedProjectId_fkey` FOREIGN KEY (`linkedProjectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_replyToId_fkey` FOREIGN KEY (`replyToId`) REFERENCES `ChatMessage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatAttachment` ADD CONSTRAINT `ChatAttachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `ChatMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_FileMainTags` ADD CONSTRAINT `_FileMainTags_A_fkey` FOREIGN KEY (`A`) REFERENCES `FileNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_FileMainTags` ADD CONSTRAINT `_FileMainTags_B_fkey` FOREIGN KEY (`B`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_FileAdditionalTags` ADD CONSTRAINT `_FileAdditionalTags_A_fkey` FOREIGN KEY (`A`) REFERENCES `FileNode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_FileAdditionalTags` ADD CONSTRAINT `_FileAdditionalTags_B_fkey` FOREIGN KEY (`B`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ComponentElementToTag` ADD CONSTRAINT `_ComponentElementToTag_A_fkey` FOREIGN KEY (`A`) REFERENCES `ComponentElement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ComponentElementToTag` ADD CONSTRAINT `_ComponentElementToTag_B_fkey` FOREIGN KEY (`B`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_GroupMembers` ADD CONSTRAINT `_GroupMembers_A_fkey` FOREIGN KEY (`A`) REFERENCES `ChatGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_GroupMembers` ADD CONSTRAINT `_GroupMembers_B_fkey` FOREIGN KEY (`B`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
