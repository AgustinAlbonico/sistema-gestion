// Archivo que exporta todas las migraciones para uso con webpack bundle
// TypeORM necesita referencias explícitas en lugar de patrones glob cuando se bundlea

import { MigrationInterface } from 'typeorm';
import { InitialSchema1734450000000 } from './migrations/1734450000000-InitialSchema';

export const migrations: (new () => MigrationInterface)[] = [
    InitialSchema1734450000000,
];
