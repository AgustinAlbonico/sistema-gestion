/**
 * Página de Ventas (POS)
 * Gestión completa de ventas con punto de venta integrado
 */
import { useState, useMemo, useCallback } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Filter, ShoppingCart, RotateCcw } from 'lucide-react';
import { useShortcutAction } from '@/hooks/useKeyboardShortcuts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    SaleForm,
    SaleList,
    SaleDetail,
    SaleStatsCards,
    SaleConfirmationModal,
} from '@/features/sales/components';
import { salesApi } from '@/features/sales/api/sales.api';
import {
    Sale,
    SaleFilters,
    SaleStatus,
    SaleStatusLabels,
    InvoiceFilterStatus,
    InvoiceFilterStatusLabels,
} from '@/features/sales/types';
import { CreateSaleDTO } from '@/features/sales/types';
import {
    getCurrentMonthRange,
    getTodayRange,
    getCurrentWeekRange,
    formatDateForDisplay,
} from '@/lib/date-utils';
import { useOpenCashRegister } from '@/features/cash-register/hooks';
import { UnclosedCashAlertDialog } from '@/features/cash-register/components/UnclosedCashAlertDialog';

/**
 * Página principal de gestión de ventas
 */
export default function SalesPage() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [viewingSale, setViewingSale] = useState<Sale | null>(null);
    const [confirmedSale, setConfirmedSale] = useState<Sale | null>(null);
    // Estado para controlar si el usuario decidió continuar a pesar de la alerta de caja
    const [dismissedCashAlert, setDismissedCashAlert] = useState(false);

    // Inicializar filtros con el mes actual por defecto
    const defaultMonthRange = useMemo(() => getCurrentMonthRange(), []);
    const [filters, setFilters] = useState<SaleFilters>({
        startDate: defaultMonthRange.startDate,
        endDate: defaultMonthRange.endDate,
    });

    const queryClient = useQueryClient();
    const confirm = useConfirm();

    // Estado de la caja actual (si hay caja abierta hoy)
    const { data: openRegister } = useOpenCashRegister();

    // Callback para abrir modal de nueva venta (usado por botón y atajo F1)
    const openCreateModal = useCallback(() => {
        if (!openRegister) {
            toast.error('La caja de hoy está cerrada. Abrí la caja para registrar ventas.');
            return;
        }
        setIsCreateOpen(true);
    }, [openRegister]);

    // Atajo de teclado F1 para nueva venta
    useShortcutAction('NEW_SALE', openCreateModal);

    // Mutaciones
    const createMutation = useMutation({
        mutationFn: salesApi.create,
        onSuccess: (newSale) => {
            queryClient.invalidateQueries({ queryKey: ['sales'] });
            queryClient.invalidateQueries({ queryKey: ['sale-stats'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            // Invalidar cuentas corrientes si es venta a cuenta
            if (newSale.isOnAccount) {
                queryClient.invalidateQueries({ queryKey: ['customer-accounts'] });
                queryClient.invalidateQueries({ queryKey: ['accounts-stats'] });
            }
            toast.success('Venta registrada exitosamente');
            setIsCreateOpen(false);
            // Mostrar modal de confirmación con la venta creada
            setConfirmedSale(newSale);
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Error al registrar venta');
        },
    });

    const cancelMutation = useMutation({
        mutationFn: salesApi.cancel,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales'] });
            queryClient.invalidateQueries({ queryKey: ['sale-stats'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            toast.success('Venta cancelada');
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Error al cancelar venta');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: salesApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales'] });
            queryClient.invalidateQueries({ queryKey: ['sale-stats'] });
            toast.success('Venta eliminada');
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Error al eliminar venta');
        },
    });

    // Handlers
    const handleCreate = (data: CreateSaleDTO) => {
        createMutation.mutate(data);
    };

    const handleView = (sale: Sale) => {
        setViewingSale(sale);
    };

    const handleCancel = async (id: string) => {
        const confirmed = await confirm({
            title: 'Cancelar venta',
            description: '¿Cancelar esta venta? Si ya se actualizó el inventario, se revertirá.',
            variant: 'warning',
            confirmLabel: 'Cancelar venta',
        });
        if (confirmed) {
            cancelMutation.mutate(id);
        }
    };

    const handlePay = (sale: Sale) => {
        // Por ahora solo mostrar mensaje
        toast.info('Funcionalidad de pago pendiente en próxima versión');
    };

    const handleDelete = async (id: string) => {
        const confirmed = await confirm({
            title: 'Eliminar venta',
            description: '¿Eliminar esta venta? Esta acción no se puede deshacer.',
            variant: 'danger',
            confirmLabel: 'Eliminar',
        });
        if (confirmed) {
            deleteMutation.mutate(id);
        }
    };

    const handleFilterChange = (
        key: keyof SaleFilters,
        value: string | undefined
    ) => {
        setFilters((prev) => ({
            ...prev,
            [key]: value === '' ? undefined : value,
        }));
    };

    // Funciones para detectar qué filtro está activo
    const isTodayActive = () => {
        const todayRange = getTodayRange();
        return (
            filters.startDate === todayRange.startDate &&
            filters.endDate === todayRange.endDate
        );
    };

    const isCurrentWeekActive = () => {
        const weekRange = getCurrentWeekRange();
        return (
            filters.startDate === weekRange.startDate &&
            filters.endDate === weekRange.endDate
        );
    };

    const isCurrentMonthActive = () => {
        const monthRange = getCurrentMonthRange();
        return (
            filters.startDate === monthRange.startDate &&
            filters.endDate === monthRange.endDate
        );
    };

    const isAllDatesActive = () => {
        return !filters.startDate && !filters.endDate;
    };

    // Funciones para filtros rápidos
    const setTodayFilter = () => {
        const todayRange = getTodayRange();
        setFilters({
            ...filters,
            startDate: todayRange.startDate,
            endDate: todayRange.endDate,
        });
    };

    const setCurrentMonthFilter = () => {
        const range = getCurrentMonthRange();
        setFilters({
            ...filters,
            startDate: range.startDate,
            endDate: range.endDate,
        });
    };

    const setCurrentWeekFilter = () => {
        const weekRange = getCurrentWeekRange();
        setFilters({
            ...filters,
            startDate: weekRange.startDate,
            endDate: weekRange.endDate,
        });
    };

    const clearDateFilters = () => {
        setFilters({
            ...filters,
            startDate: undefined,
            endDate: undefined,
        });
    };

    /**
     * Formatea el rango de fechas para mostrar en la UI
     */
    const getDateRangeText = (): string => {
        if (!filters.startDate && !filters.endDate) {
            return 'Mostrando todas las ventas';
        }

        const todayRange = getTodayRange();
        const weekRange = getCurrentWeekRange();
        const monthRange = getCurrentMonthRange();

        if (
            filters.startDate === todayRange.startDate &&
            filters.endDate === todayRange.endDate
        ) {
            return `Mostrando ventas de hoy (${formatDateForDisplay(filters.startDate)})`;
        }

        if (
            filters.startDate === weekRange.startDate &&
            filters.endDate === weekRange.endDate
        ) {
            return `Mostrando ventas de esta semana (${formatDateForDisplay(filters.startDate)} - ${formatDateForDisplay(filters.endDate)})`;
        }

        if (
            filters.startDate === monthRange.startDate &&
            filters.endDate === monthRange.endDate
        ) {
            return `Mostrando ventas del mes actual (${formatDateForDisplay(filters.startDate)} - ${formatDateForDisplay(filters.endDate)})`;
        }

        if (filters.startDate && filters.endDate) {
            if (filters.startDate === filters.endDate) {
                return `Mostrando ventas del ${formatDateForDisplay(filters.startDate)}`;
            }
            return `Mostrando ventas del ${formatDateForDisplay(filters.startDate)} al ${formatDateForDisplay(filters.endDate)}`;
        }

        if (filters.startDate && !filters.endDate) {
            return `Mostrando ventas desde el ${formatDateForDisplay(filters.startDate)}`;
        }

        if (!filters.startDate && filters.endDate) {
            return `Mostrando ventas hasta el ${formatDateForDisplay(filters.endDate)}`;
        }

        return 'Mostrando todas las ventas';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        Ventas
                    </h1>
                    <p className="text-muted-foreground">
                        Punto de venta y registro de ventas
                    </p>
                </div>
                <div>
                    <Button
                        size="lg"
                        className="shadow-lg"
                        onClick={openCreateModal}
                    >
                        <Plus className="mr-2 h-5 w-5" />
                        Nueva Venta
                    </Button>

                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogContent className="max-w-[98vw] w-full h-[95vh] overflow-hidden p-0 gap-0">
                            <DialogHeader className="px-6 py-4 border-b bg-muted/30">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <DialogTitle className="flex items-center gap-2 text-xl">
                                            <ShoppingCart className="h-5 w-5" />
                                            Nueva Venta
                                        </DialogTitle>
                                        <DialogDescription className="mt-1">
                                            El stock se actualizará automáticamente al confirmar
                                        </DialogDescription>
                                    </div>
                                </div>
                            </DialogHeader>
                            <div className="flex-1 overflow-auto p-6">
                                <SaleForm
                                    onSubmit={handleCreate}
                                    isLoading={createMutation.isPending}
                                />
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Indicador de rango de fechas */}
            <div className="bg-muted/50 border rounded-lg px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                    {getDateRangeText()}
                </p>
            </div>

            {/* Estadísticas */}
            <SaleStatsCards
                startDate={filters.startDate}
                endDate={filters.endDate}
            />

            {/* Filtros */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Filtros
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Filtros rápidos de fecha */}
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant={isTodayActive() ? 'default' : 'outline'}
                                size="sm"
                                onClick={setTodayFilter}
                            >
                                Hoy
                            </Button>
                            <Button
                                variant={isCurrentWeekActive() ? 'default' : 'outline'}
                                size="sm"
                                onClick={setCurrentWeekFilter}
                            >
                                Esta Semana
                            </Button>
                            <Button
                                variant={isCurrentMonthActive() ? 'default' : 'outline'}
                                size="sm"
                                onClick={setCurrentMonthFilter}
                            >
                                Mes Actual
                            </Button>
                            <Button
                                variant={isAllDatesActive() ? 'default' : 'ghost'}
                                size="sm"
                                onClick={clearDateFilters}
                            >
                                Todas las Fechas
                            </Button>
                        </div>

                        {/* Filtros detallados */}
                        <div className="flex flex-wrap items-end gap-4">
                            {/* Búsqueda */}
                            <div className="w-56">
                                <Label className="text-xs text-muted-foreground">Buscar</Label>
                                <Input
                                    placeholder="Nº, cliente..."
                                    value={filters.search ?? ''}
                                    onChange={(e) =>
                                        handleFilterChange('search', e.target.value)
                                    }
                                />
                            </div>

                            {/* Estado */}
                            <div className="w-36">
                                <Label className="text-xs text-muted-foreground">Estado</Label>
                                <Select
                                    value={filters.status ?? '__all__'}
                                    onValueChange={(v) =>
                                        handleFilterChange(
                                            'status',
                                            v === '__all__' ? undefined : v
                                        )
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todos" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">Todos</SelectItem>
                                        {Object.values(SaleStatus).map((status) => (
                                            <SelectItem key={status} value={status}>
                                                {SaleStatusLabels[status]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Facturación */}
                            <div className="w-36">
                                <Label className="text-xs text-muted-foreground">Facturación</Label>
                                <Select
                                    value={filters.invoiceStatus ?? '__all__'}
                                    onValueChange={(v) =>
                                        handleFilterChange(
                                            'invoiceStatus',
                                            v === '__all__' ? undefined : v
                                        )
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todas" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">Todas</SelectItem>
                                        {Object.values(InvoiceFilterStatus).map((status) => (
                                            <SelectItem key={status} value={status}>
                                                {InvoiceFilterStatusLabels[status]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Fecha desde */}
                            <div className="w-36">
                                <Label className="text-xs text-muted-foreground">Desde</Label>
                                <Input
                                    type="date"
                                    value={filters.startDate ?? ''}
                                    onChange={(e) =>
                                        handleFilterChange('startDate', e.target.value)
                                    }
                                />
                            </div>

                            {/* Fecha hasta */}
                            <div className="w-36">
                                <Label className="text-xs text-muted-foreground">Hasta</Label>
                                <Input
                                    type="date"
                                    value={filters.endDate ?? ''}
                                    onChange={(e) =>
                                        handleFilterChange('endDate', e.target.value)
                                    }
                                />
                            </div>

                            {/* Limpiar filtros */}
                            {Object.values(filters).some((v) => v !== undefined) && (
                                <Button
                                    variant="outline"
                                    className="border-dashed hover:border-destructive hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    onClick={() => {
                                        const range = getCurrentMonthRange();
                                        setFilters({
                                            startDate: range.startDate,
                                            endDate: range.endDate,
                                        });
                                    }}
                                >
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                    Restablecer
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Lista de ventas */}
            <Card>
                <CardHeader>
                    <CardTitle>Listado de Ventas</CardTitle>
                </CardHeader>
                <CardContent>
                    <SaleList
                        filters={filters}
                        onView={handleView}
                        onDelete={handleDelete}
                        onCancel={handleCancel}
                        onPay={handlePay}
                    />
                </CardContent>
            </Card>

            {/* Dialog de detalle */}
            {viewingSale && (
                <SaleDetail
                    sale={viewingSale}
                    open={!!viewingSale}
                    onClose={() => setViewingSale(null)}
                />
            )}

            {/* Modal de confirmación de venta */}
            <SaleConfirmationModal
                sale={confirmedSale}
                open={!!confirmedSale}
                onClose={() => setConfirmedSale(null)}
            />

            {/* Alerta de caja del día anterior sin cerrar */}
            {!dismissedCashAlert && (
                <UnclosedCashAlertDialog
                    onContinue={() => setDismissedCashAlert(true)}
                />
            )}
        </div>
    );
}

