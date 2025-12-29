/**
 * Entidad para registrar backups realizados
 */
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
} from 'typeorm';

export enum BackupStatus {
    COMPLETED = 'completed',
    FAILED = 'failed',
}

@Entity('backups')
export class Backup {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', length: 255 })
    filename!: string;

    @Column({ type: 'varchar', length: 500 })
    filePath!: string;

    @Column({ type: 'bigint', default: 0 })
    sizeBytes!: number;

    @Column({
        type: 'enum',
        enum: BackupStatus,
        default: BackupStatus.COMPLETED,
    })
    status!: BackupStatus;

    @Column({ type: 'varchar', length: 255, nullable: true })
    errorMessage?: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    createdByUsername?: string;

    @CreateDateColumn()
    createdAt!: Date;
}
