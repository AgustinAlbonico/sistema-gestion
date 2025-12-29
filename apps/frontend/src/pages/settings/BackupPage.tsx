/**
 * Página de Backups
 * Gestión de copias de seguridad del sistema
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
    HardDrive,
    Database,
    Plus,
    Trash2,
    CheckCircle,
    XCircle,
    Loader2,
    ArrowLeft,
    FolderOpen,
    Usb,
    RefreshCw,
    ChevronUp,
    Folder,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { backupApi } from '@/features/backup/api/backup.api';
import { Backup, BackupStatus, DriveInfo, BrowseResponse } from '@/features/backup/types';

// Formatear bytes a tamaño legible
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Formatear fecha
function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// Icono de estado
function StatusIcon({ status }: Readonly<{ status: BackupStatus }>) {
    switch (status) {
        case BackupStatus.COMPLETED:
            return <CheckCircle className="h-5 w-5 text-green-500" />;
        case BackupStatus.FAILED:
            return <XCircle className="h-5 w-5 text-red-500" />;
        default:
            return null;
    }
}

export default function BackupPage() {
    const queryClient = useQueryClient();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [selectedOption, setSelectedOption] = useState<string>('default');
    const [customPath, setCustomPath] = useState<string>('');
    const [backupToDelete, setBackupToDelete] = useState<Backup | null>(null);

    // Estados para el explorador de carpetas
    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const [browserData, setBrowserData] = useState<BrowseResponse | null>(null);
    const [isLoadingBrowser, setIsLoadingBrowser] = useState(false);

    // Query para obtener backups
    const { data: backups = [], isLoading: isLoadingBackups } = useQuery({
        queryKey: ['backups'],
        queryFn: backupApi.getAll,
    });

    // Query para obtener unidades (solo cuando el diálogo está abierto)
    const { data: drivesData, isLoading: isLoadingDrives, refetch: refetchDrives } = useQuery({
        queryKey: ['backup-drives'],
        queryFn: backupApi.getDrives,
        enabled: isCreateDialogOpen,
    });

    // Mutation para crear backup
    const createBackupMutation = useMutation({
        mutationFn: backupApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['backups'] });
            queryClient.invalidateQueries({ queryKey: ['backup-status'] });
            toast.success('Backup creado exitosamente');
            setIsCreateDialogOpen(false);
            setSelectedOption('default');
            setCustomPath('');
        },
        onError: (error: Error) => {
            toast.error(`Error al crear backup: ${error.message}`);
        },
    });

    // Mutation para eliminar backup
    const deleteBackupMutation = useMutation({
        mutationFn: backupApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['backups'] });
            toast.success('Backup eliminado');
            setBackupToDelete(null);
        },
        onError: (error: Error) => {
            toast.error(`Error al eliminar: ${error.message}`);
        },
    });

    // Abrir diálogo de creación
    const handleOpenCreateDialog = () => {
        setSelectedOption('default');
        setCustomPath('');
        setIsCreateDialogOpen(true);
    };

    // Crear backup - determina la ruta según la opción seleccionada
    const handleCreateBackup = () => {
        let destinationPath: string | undefined;

        if (selectedOption === 'custom') {
            destinationPath = customPath.trim() || undefined;
        } else if (selectedOption !== 'default') {
            // Es una unidad de disco (ej: "D:\")
            destinationPath = selectedOption;
        }

        createBackupMutation.mutate({
            destinationPath,
            includeTimestamp: true,
        });
    };

    // Determinar si una unidad es extraíble (USB)
    const isRemovableDrive = (drive: DriveInfo): boolean => {
        return drive.type.toLowerCase().includes('removable') ||
            drive.type.toLowerCase().includes('extraíble');
    };

    // Abrir explorador de carpetas
    const handleOpenBrowser = async () => {
        setIsBrowserOpen(true);
        setIsLoadingBrowser(true);
        try {
            const data = await backupApi.browseDirectory();
            setBrowserData(data);
        } catch {
            toast.error('Error al cargar directorios');
        } finally {
            setIsLoadingBrowser(false);
        }
    };

    // Navegar a una carpeta
    const handleNavigateToFolder = async (folderPath: string) => {
        setIsLoadingBrowser(true);
        try {
            const data = await backupApi.browseDirectory(folderPath);
            setBrowserData(data);
        } catch {
            toast.error('Error al acceder a la carpeta');
        } finally {
            setIsLoadingBrowser(false);
        }
    };

    // Ir a carpeta padre
    const handleGoToParent = async () => {
        if (browserData?.parentPath) {
            await handleNavigateToFolder(browserData.parentPath);
        } else {
            // Volver a la raíz (lista de unidades)
            setIsLoadingBrowser(true);
            try {
                const data = await backupApi.browseDirectory();
                setBrowserData(data);
            } catch {
                toast.error('Error al cargar unidades');
            } finally {
                setIsLoadingBrowser(false);
            }
        }
    };

    // Seleccionar carpeta actual y cerrar explorador
    const handleSelectCurrentFolder = () => {
        if (browserData?.currentPath) {
            setCustomPath(browserData.currentPath);
            setSelectedOption('custom');
        }
        setIsBrowserOpen(false);
    };

    return (
        <div className="flex justify-center px-3 sm:px-4">
            <div className="w-full max-w-4xl space-y-4 sm:space-y-8 py-3 sm:py-4">
                {/* Header con gradiente - responsivo */}
                <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-background border p-4 sm:p-8">
                    <div className="absolute top-0 right-0 w-32 sm:w-64 h-32 sm:h-64 bg-cyan-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <div className="absolute bottom-0 left-0 w-16 sm:w-32 h-16 sm:h-32 bg-cyan-500/5 rounded-full translate-y-1/2 -translate-x-1/2" />

                    <div className="relative">
                        <Link
                            to="/settings"
                            className="inline-flex items-center text-xs sm:text-sm text-muted-foreground hover:text-foreground mb-3 sm:mb-4 transition-colors"
                        >
                            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                            Volver a Configuración
                        </Link>

                        {/* Layout responsivo: apilado en móvil, en fila en desktop */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <div className="h-10 w-10 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-cyan-500/15 flex items-center justify-center shadow-lg shadow-cyan-500/10 shrink-0">
                                    <Database className="h-5 w-5 sm:h-7 sm:w-7 text-cyan-600" />
                                </div>
                                <div>
                                    <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground">
                                        Backups
                                    </h1>
                                    <p className="text-xs sm:text-base text-muted-foreground mt-0.5 sm:mt-1">
                                        Copias de seguridad de la base de datos
                                    </p>
                                </div>
                            </div>

                            <Button onClick={handleOpenCreateDialog} className="shadow-lg w-full sm:w-auto">
                                <Plus className="h-4 w-4 mr-2" />
                                Crear Backup
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Lista de backups */}
                <div className="rounded-lg sm:rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="p-3 sm:p-5 border-b bg-gradient-to-r from-muted/50 to-muted/25">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold text-sm sm:text-lg flex items-center gap-1.5 sm:gap-2">
                                <HardDrive className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                                Backups Realizados
                            </h2>
                            <span className="text-xs sm:text-sm text-muted-foreground">
                                {backups.length} backup(s)
                            </span>
                        </div>
                    </div>

                    {isLoadingBackups ? (
                        <div className="flex items-center justify-center p-8 sm:p-12">
                            <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : backups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center">
                            <Database className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/50 mb-3 sm:mb-4" />
                            <p className="text-sm sm:text-base text-muted-foreground">
                                No hay backups registrados
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground/75 mt-1">
                                Creá tu primer backup para proteger tus datos
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {backups.map((backup) => (
                                <div
                                    key={backup.id}
                                    className="p-3 sm:p-4 hover:bg-muted/50 transition-colors"
                                >
                                    {/* Layout responsivo para cada backup */}
                                    <div className="flex items-start gap-2 sm:gap-4">
                                        <StatusIcon status={backup.status} />

                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                                <p className="font-medium text-sm sm:text-base truncate max-w-full">
                                                    {backup.filename}
                                                </p>
                                                {backup.status === BackupStatus.COMPLETED && (
                                                    <span className="text-[10px] sm:text-xs text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 sm:px-2 py-0.5 rounded">
                                                        Completado
                                                    </span>
                                                )}
                                                {backup.status === BackupStatus.FAILED && (
                                                    <span className="text-[10px] sm:text-xs text-red-600 bg-red-100 dark:bg-red-900/30 px-1.5 sm:px-2 py-0.5 rounded">
                                                        Fallido
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs sm:text-sm text-muted-foreground truncate mt-0.5 sm:mt-1">
                                                <FolderOpen className="h-3 w-3 inline mr-1" />
                                                {backup.filePath}
                                            </p>
                                            {backup.errorMessage && (
                                                <p className="text-xs sm:text-sm text-red-500 mt-1">
                                                    Error: {backup.errorMessage}
                                                </p>
                                            )}
                                            {/* Info adicional en móvil - mostrar debajo */}
                                            <div className="flex items-center gap-3 mt-2 sm:hidden text-xs text-muted-foreground">
                                                <span className="font-medium text-foreground">{formatBytes(Number(backup.sizeBytes))}</span>
                                                <span>{formatDate(backup.createdAt)}</span>
                                                {backup.createdByUsername && (
                                                    <span>por {backup.createdByUsername}</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Info en desktop */}
                                        <div className="hidden sm:block text-right text-sm shrink-0">
                                            <p className="font-medium">
                                                {formatBytes(Number(backup.sizeBytes))}
                                            </p>
                                            <p className="text-muted-foreground text-xs">
                                                {formatDate(backup.createdAt)}
                                            </p>
                                            {backup.createdByUsername && (
                                                <p className="text-muted-foreground text-xs">
                                                    por {backup.createdByUsername}
                                                </p>
                                            )}
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-red-600 shrink-0 h-8 w-8 sm:h-10 sm:w-10"
                                            onClick={() => setBackupToDelete(backup)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Diálogo de creación de backup */}
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    {/* Ancho responsivo: 95% en móvil, max-w-xl en desktop */}
                    <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-xl p-0 overflow-hidden max-h-[85vh] sm:max-h-[90vh] flex flex-col">
                        {/* Header con gradiente - responsivo */}
                        <div className="relative bg-gradient-to-br from-cyan-500 via-cyan-600 to-blue-600 px-4 sm:px-6 py-4 sm:py-5 text-white flex-shrink-0">
                            <div className="absolute top-0 right-0 w-20 sm:w-32 h-20 sm:h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                            <div className="absolute bottom-0 left-0 w-12 sm:w-20 h-12 sm:h-20 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

                            <div className="relative flex items-center gap-3 sm:gap-4">
                                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg flex-shrink-0">
                                    <Database className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                                </div>
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white">
                                        Crear Backup
                                    </DialogTitle>
                                    <DialogDescription className="text-cyan-100 text-xs sm:text-sm">
                                        Seleccioná dónde guardar la copia de seguridad
                                    </DialogDescription>
                                </div>
                            </div>
                        </div>

                        {/* Contenido scrolleable */}
                        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
                            {/* Header de sección con botón de refresh */}
                            <div className="flex items-center justify-between mb-3 sm:mb-4">
                                <Label className="text-xs sm:text-sm font-semibold text-foreground">Destino del backup</Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => refetchDrives()}
                                    disabled={isLoadingDrives}
                                    className="text-muted-foreground hover:text-foreground h-7 w-7 sm:h-8 sm:w-8 p-0"
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${isLoadingDrives ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>

                            {isLoadingDrives ? (
                                <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
                                    <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-cyan-500 mb-2 sm:mb-3" />
                                    <p className="text-xs sm:text-sm text-muted-foreground">Cargando unidades...</p>
                                </div>
                            ) : (
                                <RadioGroup
                                    value={selectedOption}
                                    onValueChange={setSelectedOption}
                                    className="space-y-2"
                                >
                                    {/* Opción por defecto */}
                                    <label
                                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all
                                            ${selectedOption === 'default'
                                                ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30'
                                                : 'border-transparent bg-muted/50 hover:bg-muted'}`}
                                    >
                                        <RadioGroupItem value="default" id="default-path" />
                                        <div className="h-9 w-9 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                                            <FolderOpen className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm">Carpeta por defecto</div>
                                            <div className="text-xs text-muted-foreground truncate" title={drivesData?.defaultPath}>
                                                {drivesData?.defaultPath}
                                            </div>
                                        </div>
                                        {selectedOption === 'default' && (
                                            <CheckCircle className="h-5 w-5 text-cyan-500 flex-shrink-0" />
                                        )}
                                    </label>

                                    {/* Unidades disponibles */}
                                    {drivesData?.drives.map((drive) => (
                                        <label
                                            key={drive.letter}
                                            className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all
                                                ${selectedOption === drive.letter + '\\'
                                                    ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30'
                                                    : 'border-transparent bg-muted/50 hover:bg-muted'}`}
                                        >
                                            <RadioGroupItem value={drive.letter + '\\'} id={drive.letter} />
                                            <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isRemovableDrive(drive) ? 'bg-green-500/15' : 'bg-gray-500/15'
                                                }`}>
                                                {isRemovableDrive(drive) ? (
                                                    <Usb className="h-4 w-4 text-green-600" />
                                                ) : (
                                                    <HardDrive className="h-4 w-4 text-gray-600" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-sm">{drive.label || 'Disco Local'}</span>
                                                    <span className="text-xs text-muted-foreground">({drive.letter}:)</span>
                                                    {isRemovableDrive(drive) && (
                                                        <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">
                                                            USB
                                                        </span>
                                                    )}
                                                </div>
                                                {drive.freeSpace > 0 && (
                                                    <div className="mt-1.5">
                                                        <div className="flex justify-between text-[11px] text-muted-foreground mb-0.5">
                                                            <span>{formatBytes(drive.freeSpace)} libres</span>
                                                            <span>{formatBytes(drive.totalSpace)} total</span>
                                                        </div>
                                                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                                                                style={{ width: `${Math.max(5, ((drive.totalSpace - drive.freeSpace) / drive.totalSpace) * 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {selectedOption === drive.letter + '\\' && (
                                                <CheckCircle className="h-5 w-5 text-cyan-500 flex-shrink-0" />
                                            )}
                                        </label>
                                    ))}

                                    {/* Opción de ruta personalizada */}
                                    <label
                                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all
                                            ${selectedOption === 'custom'
                                                ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30'
                                                : 'border-transparent bg-muted/50 hover:bg-muted'}`}
                                    >
                                        <RadioGroupItem value="custom" id="custom-path" />
                                        <div className="h-9 w-9 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                                            <Folder className="h-4 w-4 text-orange-600" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium text-sm">Ruta personalizada</div>
                                            <div className="text-xs text-muted-foreground">Elegí una ubicación específica</div>
                                        </div>
                                        {selectedOption === 'custom' && (
                                            <CheckCircle className="h-5 w-5 text-cyan-500 flex-shrink-0" />
                                        )}
                                    </label>

                                    {/* Campo de texto para ruta personalizada */}
                                    {selectedOption === 'custom' && (
                                        <div className="ml-3 p-3 rounded-lg bg-muted/30 border border-dashed border-muted-foreground/30">
                                            <Input
                                                placeholder="Ej: D:\MisBackups"
                                                value={customPath}
                                                onChange={(e) => setCustomPath(e.target.value)}
                                                className="bg-background text-sm"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleOpenBrowser}
                                                className="mt-2 gap-2 text-xs"
                                            >
                                                <FolderOpen className="h-3.5 w-3.5" />
                                                Examinar carpetas
                                            </Button>
                                        </div>
                                    )}
                                </RadioGroup>
                            )}
                        </div>

                        {/* Footer fijo - responsivo */}
                        <div className="flex-shrink-0 px-3 sm:px-5 py-3 sm:py-4 border-t bg-muted/30 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setIsCreateDialogOpen(false)}
                                className="w-full sm:w-auto"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleCreateBackup}
                                disabled={createBackupMutation.isPending}
                                className="w-full sm:w-auto bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700"
                            >
                                {createBackupMutation.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Creando...
                                    </>
                                ) : (
                                    <>
                                        <Database className="h-4 w-4 mr-2" />
                                        Crear Backup
                                    </>
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Diálogo de confirmación de eliminación */}
                <AlertDialog
                    open={!!backupToDelete}
                    onOpenChange={(open) => !open && setBackupToDelete(null)}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar backup?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta acción eliminará el registro y el archivo de backup
                                <strong className="block mt-2">
                                    {backupToDelete?.filename}
                                </strong>
                                Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => backupToDelete && deleteBackupMutation.mutate(backupToDelete.id)}
                            >
                                {deleteBackupMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    'Eliminar'
                                )}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Diálogo del explorador de carpetas */}
                <Dialog open={isBrowserOpen} onOpenChange={setIsBrowserOpen}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Folder className="h-5 w-5 text-orange-500" />
                                Seleccionar Carpeta
                            </DialogTitle>
                            <DialogDescription>
                                {browserData?.currentPath || 'Seleccioná una unidad o carpeta'}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-2">
                            {/* Botón para ir arriba */}
                            {browserData?.currentPath && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleGoToParent}
                                    disabled={isLoadingBrowser}
                                    className="mb-2 w-full justify-start"
                                >
                                    <ChevronUp className="h-4 w-4 mr-2" />
                                    Subir un nivel
                                </Button>
                            )}

                            {/* Lista de carpetas */}
                            <div className="max-h-72 overflow-y-auto border rounded-lg">
                                {isLoadingBrowser ? (
                                    <div className="flex items-center justify-center p-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : browserData?.directories.length === 0 ? (
                                    <div className="p-4 text-center text-muted-foreground text-sm">
                                        No hay subcarpetas
                                    </div>
                                ) : (
                                    <div className="divide-y">
                                        {browserData?.directories.map((dir) => (
                                            <button
                                                key={dir.path}
                                                type="button"
                                                className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                                                onClick={() => handleNavigateToFolder(dir.path)}
                                            >
                                                <Folder className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                                                <span className="truncate">{dir.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setIsBrowserOpen(false)}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSelectCurrentFolder}
                                disabled={!browserData?.currentPath}
                            >
                                <FolderOpen className="h-4 w-4 mr-2" />
                                Usar esta carpeta
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
