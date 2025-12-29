/**
 * Tipos para el módulo de Backup
 */

export interface Backup {
    id: string;
    filename: string;
    filePath: string;
    sizeBytes: number;
    status: BackupStatus;
    errorMessage?: string;
    createdByUsername?: string;
    createdAt: string;
}

export enum BackupStatus {
    COMPLETED = 'completed',
    FAILED = 'failed',
}

export interface DriveInfo {
    letter: string;
    label: string;
    type: string;
    freeSpace: number;
    totalSpace: number;
}

export interface DrivesResponse {
    drives: DriveInfo[];
    defaultPath: string;
}

export interface CreateBackupDto {
    destinationPath?: string;
    includeTimestamp?: boolean;
}

export interface DirectoryEntry {
    name: string;
    path: string;
}

export interface BrowseResponse {
    currentPath: string;
    parentPath: string | null;
    directories: DirectoryEntry[];
}

export interface BackupStatusResponse {
    hasBackupThisMonth: boolean;
    lastBackupDate: string | null;
    lastBackupMonth: string | null;
    needsBackup: boolean;
}


