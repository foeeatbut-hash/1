-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "password" TEXT NOT NULL DEFAULT 'password',
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ENGINEER_VENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validUntil" TIMESTAMP(3),
    "permissions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "customer" TEXT NOT NULL DEFAULT '',
    "contractor" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "info" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructorDoc" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Без названия',
    "kind" TEXT NOT NULL DEFAULT 'DOC',
    "scope" TEXT NOT NULL DEFAULT 'SHARED',
    "ownerId" TEXT,
    "named" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "workbook" TEXT NOT NULL DEFAULT '',
    "bindings" TEXT NOT NULL DEFAULT '[]',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstructorDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructorDocVersion" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "workbook" TEXT NOT NULL DEFAULT '',
    "bindings" TEXT NOT NULL DEFAULT '[]',
    "comment" TEXT NOT NULL DEFAULT '',
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstructorDocVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocRegister" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'ВДР',
    "vendor" TEXT NOT NULL DEFAULT '',
    "contractor" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "poNumber" TEXT NOT NULL DEFAULT '',
    "standardId" TEXT,
    "ownerProjectNo" TEXT NOT NULL DEFAULT '',
    "contractorProjectNo" TEXT NOT NULL DEFAULT '',
    "materialRequisition" TEXT NOT NULL DEFAULT '',
    "equipmentTitle" TEXT NOT NULL DEFAULT '',
    "contractorDocNo" TEXT NOT NULL DEFAULT '',
    "ownerDocNo" TEXT NOT NULL DEFAULT '',
    "vendorDocNo" TEXT NOT NULL DEFAULT '',
    "revision" TEXT NOT NULL DEFAULT 'A',
    "revisions" TEXT NOT NULL DEFAULT '[]',
    "preparedBy" TEXT NOT NULL DEFAULT '',
    "checkedBy" TEXT NOT NULL DEFAULT '',
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "columnsConfig" TEXT NOT NULL DEFAULT '[]',
    "managerId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocRegisterItem" (
    "id" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractorNo" TEXT NOT NULL DEFAULT '',
    "ownerNo" TEXT NOT NULL DEFAULT '',
    "vendorNo" TEXT NOT NULL DEFAULT '',
    "titleEn" TEXT NOT NULL DEFAULT '',
    "titleRu" TEXT NOT NULL DEFAULT '',
    "vdrCode" TEXT NOT NULL DEFAULT '',
    "revision" TEXT NOT NULL DEFAULT 'A',
    "issueDate" TIMESTAMP(3),
    "reasonForIssue" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT '',
    "equipmentTags" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "docId" TEXT,
    "fileNodeId" TEXT,
    "assigneeId" TEXT,
    "remarks" TEXT NOT NULL DEFAULT '',
    "reviewCode" TEXT NOT NULL DEFAULT '',
    "dueDate" TIMESTAMP(3),
    "extra" TEXT NOT NULL DEFAULT '{}',
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocRegisterItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocStandard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Стандарт',
    "config" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocRegisterItemRevision" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL DEFAULT '',
    "place" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocRegisterItemRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dictionary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictionaryItem" (
    "id" TEXT NOT NULL,
    "dictionaryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "DictionaryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "schemaJson" TEXT NOT NULL,

    CONSTRAINT "TagTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'SHARED',
    "ownerId" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileNode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT 'FILE',
    "department" TEXT,
    "statusCode" TEXT NOT NULL DEFAULT 'D',
    "revision" TEXT NOT NULL DEFAULT '1',
    "scope" TEXT NOT NULL DEFAULT 'SHARED',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT,
    "refId" TEXT,
    "folderId" TEXT,

    CONSTRAINT "FileNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "brand" TEXT,
    "department" TEXT,
    "wbs" TEXT,
    "fluid" TEXT,
    "projectId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentSystem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'AHU',
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Monoblock" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Monoblock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentElement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "monoblockId" TEXT NOT NULL,
    "specs" TEXT,
    "equipType" TEXT NOT NULL DEFAULT 'ПРОЧЕЕ',
    "overrides" TEXT,
    "paramConflicts" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "hasConflict" BOOLEAN NOT NULL DEFAULT false,
    "conflictType" TEXT,
    "conflictLog" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ComponentElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentHistory" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oldSpecs" TEXT,
    "newSpecs" TEXT,
    "changeType" TEXT NOT NULL,

    CONSTRAINT "EquipmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNote" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Новая заметка',
    "content" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200',
    "equipmentId" TEXT,
    "groupName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemChangeLog" (
    "id" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userSymbol" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetRoute" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PROJECT',
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'indigo',
    "ownerId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT,
    "chatGroupId" TEXT,
    "linkedElementId" TEXT,
    "linkedProjectId" TEXT,
    "replyToId" TEXT,
    "editedAt" TIMESTAMP(3),
    "reactions" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "forwardedFrom" TEXT,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUpdate" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changelog" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'СИСТЕМА',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "targetRoute" TEXT NOT NULL DEFAULT '',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_FileMainTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FileMainTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_FileAdditionalTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FileAdditionalTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ComponentElementToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ComponentElementToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_GroupMembers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GroupMembers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_symbol_key" ON "User"("symbol");

-- CreateIndex
CREATE INDEX "ConstructorDoc_projectId_kind_idx" ON "ConstructorDoc"("projectId", "kind");

-- CreateIndex
CREATE INDEX "ConstructorDocVersion_docId_version_idx" ON "ConstructorDocVersion"("docId", "version");

-- CreateIndex
CREATE INDEX "DocRegister_projectId_idx" ON "DocRegister"("projectId");

-- CreateIndex
CREATE INDEX "DocRegisterItem_registerId_idx" ON "DocRegisterItem"("registerId");

-- CreateIndex
CREATE INDEX "DocRegisterItem_projectId_status_idx" ON "DocRegisterItem"("projectId", "status");

-- CreateIndex
CREATE INDEX "DocRegisterItemRevision_itemId_idx" ON "DocRegisterItemRevision"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "TagTemplate_projectId_key" ON "TagTemplate"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_userId_key" ON "AppSetting"("key", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AppUpdate_version_key" ON "AppUpdate"("version");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "_FileMainTags_B_index" ON "_FileMainTags"("B");

-- CreateIndex
CREATE INDEX "_FileAdditionalTags_B_index" ON "_FileAdditionalTags"("B");

-- CreateIndex
CREATE INDEX "_ComponentElementToTag_B_index" ON "_ComponentElementToTag"("B");

-- CreateIndex
CREATE INDEX "_GroupMembers_B_index" ON "_GroupMembers"("B");

-- AddForeignKey
ALTER TABLE "ConstructorDoc" ADD CONSTRAINT "ConstructorDoc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructorDocVersion" ADD CONSTRAINT "ConstructorDocVersion_docId_fkey" FOREIGN KEY ("docId") REFERENCES "ConstructorDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocRegisterItem" ADD CONSTRAINT "DocRegisterItem_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "DocRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dictionary" ADD CONSTRAINT "Dictionary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictionaryItem" ADD CONSTRAINT "DictionaryItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DictionaryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictionaryItem" ADD CONSTRAINT "DictionaryItem_dictionaryId_fkey" FOREIGN KEY ("dictionaryId") REFERENCES "Dictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagTemplate" ADD CONSTRAINT "TagTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileNode" ADD CONSTRAINT "FileNode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileNode" ADD CONSTRAINT "FileNode_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileNode" ADD CONSTRAINT "FileNode_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentSystem" ADD CONSTRAINT "EquipmentSystem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Monoblock" ADD CONSTRAINT "Monoblock_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "EquipmentSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentElement" ADD CONSTRAINT "ComponentElement_monoblockId_fkey" FOREIGN KEY ("monoblockId") REFERENCES "Monoblock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentHistory" ADD CONSTRAINT "EquipmentHistory_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ComponentElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatGroup" ADD CONSTRAINT "ChatGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatGroupId_fkey" FOREIGN KEY ("chatGroupId") REFERENCES "ChatGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_linkedElementId_fkey" FOREIGN KEY ("linkedElementId") REFERENCES "ComponentElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FileMainTags" ADD CONSTRAINT "_FileMainTags_A_fkey" FOREIGN KEY ("A") REFERENCES "FileNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FileMainTags" ADD CONSTRAINT "_FileMainTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FileAdditionalTags" ADD CONSTRAINT "_FileAdditionalTags_A_fkey" FOREIGN KEY ("A") REFERENCES "FileNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FileAdditionalTags" ADD CONSTRAINT "_FileAdditionalTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ComponentElementToTag" ADD CONSTRAINT "_ComponentElementToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "ComponentElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ComponentElementToTag" ADD CONSTRAINT "_ComponentElementToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupMembers" ADD CONSTRAINT "_GroupMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "ChatGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupMembers" ADD CONSTRAINT "_GroupMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
