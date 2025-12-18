/**
 * Página de Ingresos
 * Gestión completa de ingresos por servicios con estadísticas y categorías
 */
import { useState, useMemo, useCallback } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Tags, RefreshCw, Wallet } from 'lucide-react';
import { useShortcutAction } from '@/hooks/useKeyboardShortcuts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormDialog } from '@/components/ui/form-dialog';
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
    IncomeList,
    IncomeForm,
    IncomeStatsCards,
    IncomeCategoryBreakdown,
} from '@/features/incomes/components';
import {
    incomesApi,
    incomeCategoriesApi,
} from '@/features/incomes/api/incomes.api';
import { Income, IncomeFilters } from '@/features/incomes/types';
import { IncomeFormValues } from '@/features/incomes/schemas/income.schema';
import {
    getCurrentMonthRange,
    getTodayRange,
    getCurrentWeekRange,
    formatDateForDisplay,
} from '@/lib/date-utils';
import { useOpenCashRegister } from '@/features/cash-register/hooks';
import { UnclosedCashAlertDialog } from '@/features/cash-register/components/UnclosedCashAlertDialog';

/**
 * Página principal de gestión de ingresos
 */
export default function IncomesPage() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingIncome, setEditingIncome] = useState<Income | null>(null);
    const [isCategoryOpen, setIsCategoryOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [dismissedCashAlert, setDismissedCashAlert] = useState(false);

    // Inicializar filtros con el mes actual por defecto
    const defaultMonthRange = useMemo(() => getCurrentMonthRange(), []);
    const [filters, setFilters] = useState<IncomeFilters>({
        startDate: defaultMonthRange.startDate,
        endDate: defaultMonthRange.endDate,
    });

    const queryClient = useQueryClient();
    const confirm = useConfirm();

    // Estado de la caja actual
    const { data: openRegister } = useOpenCashRegister();

    // Callback para abrir modal de nuevo ingreso (usado por botón y atajo F4)
    const openCreateModal = useCallback(() => {
        if (!openRegister) {
            toast.error('La caja de hoy está cerrada. Abrí la caja para registrar ingresos.');
            return;
        }
        setIsCreateOpen(true);
    }, [openRegister]);

    // Atajo de teclado F4 para nuevo ingreso
    useShortcutAction('NEW_INCOME', openCreateModal);

    // Query para categorías
    const { data: categories } = useQuery({
        queryKey: ['income-categories'],
        queryFn: incomeCategoriesApi.getAll,
    });

    // Mutaciones
    const createMutation = useMutation({
        mutationFn: incomesApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['incomes'] });
            queryClient.invalidateQueries({ queryKey: ['income-stats'] });
            queryClient.invalidateQueries({ queryKey: ['cash-register', 'current'] });
            toast.success('Ingreso registrado');
            setIsCreateOpen(false);
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al registrar ingreso');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: IncomeFormValues }) =>
            incomesApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['incomes'] });
            queryClient.invalidateQueries({ queryKey: ['income-stats'] });
            toast.success('Ingreso actualizado');
            setEditingIncome(null);
        },
        onError: () => {
            toast.error('Error al actualizar ingreso');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: incomesApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['incomes'] });
            queryClient.invalidateQueries({ queryKey: ['income-stats'] });
            toast.success('Ingreso eliminado');
        },
        onError: () => {
            toast.error('Error al eliminar ingreso');
        },
    });

    const createCategoryMutation = useMutation({
        mutationFn: incomeCategoriesApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['income-categories'] });
            toast.success('Categoría creada');
            setNewCategoryName('');
        },
        onError: () => {
            toast.error('Error al crear categoría');
        },
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: incomeCategoriesApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['income-categories'] });
            toast.success('Categoría eliminada');
        },
        onError: () => {
            toast.error('Error al eliminar categoría');
        },
    });

    const seedCategoriesMutation = useMutation({
        mutationFn: incomeCategoriesApi.seed,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['income-categories'] });
            toast.success(`${data.created} categorías inicializadas`);
        },
        onError: () => {
            toast.error('Error al inicializar categorías');
        },
    });

    // Handlers
    const handleCreate = (data: IncomeFormValues) => {
        createMutation.mutate(data);
    };

    const handleUpdate = (data: IncomeFormValues) => {
        if (editingIncome) {
            updateMutation.mutate({ id: editingIncome.id, data });
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = await confirm({
            title: 'Eliminar ingreso',
            description: '¿Estás seguro de eliminar este ingreso?',
            variant: 'danger',
            confirmLabel: 'Eliminar',
        });
        if (confirmed) {
            deleteMutation.mutate(id);
        }
    };

    const handleCreateCategory = () => {
        if (!newCategoryName.trim()) {
            toast.error('Ingresá un nombre para la categoría');
            return;
        }
        createCategoryMutation.mutate({ name: newCategoryName.trim() });
    };

    const handleFilterChange = (key: keyof IncomeFilters, value: string | boolean | undefined) => {
        setFilters((prev) => ({
            ...prev,
            [key]: value === '' ? undefined : value,
        }));
    };

    // Funciones para detectar qué filtro está activo
    const isTodayActive = () => {
        const todayRange = getTodayRange();
        return filters.startDate === todayRange.startDate &&
            filters.endDate === todayRange.endDate;
    };

    const isCurrentWeekActive = () => {
        const weekRange = getCurrentWeekRange();
        return filters.startDate === weekRange.startDate &&
            filters.endDate === weekRange.endDate;
    };

    const isCurrentMonthActive = () => {
        const monthRange = getCurrentMonthRange();
        return filters.startDate === monthRange.startDate &&
            filters.endDate === monthRange.endDate;
    };

    const isAllDatesActive = () => {
        return !filters.startDate && !filters.endDate;
    };

    // Funciones para filtros rápidos
    const setTodayFilter = () => {
        const todayRange = getTodayRange();
        setFilters({ ...filters, startDate: todayRange.startDate, endDate: todayRange.endDate });
    };

    const setCurrentMonthFilter = () => {
        const range = getCurrentMonthRange();
        setFilters({ ...filters, startDate: range.startDate, endDate: range.endDate });
    };

    const setCurrentWeekFilter = () => {
        const weekRange = getCurrentWeekRange();
        setFilters({ ...filters, startDate: weekRange.startDate, endDate: weekRange.endDate });
    };

    const clearDateFilters = () => {
        setFilters({ ...filters, startDate: undefined, endDate: undefined });
    };

    const getDateRangeText = (): string => {
        if (!filters.startDate && !filters.endDate) {
            return 'Mostrando todos los ingresos';
        }

        const todayRange = getTodayRange();
        const weekRange = getCurrentWeekRange();
        const monthRange = getCurrentMonthRange();

        if (filters.startDate === todayRange.startDate && filters.endDate === todayRange.endDate) {
            return `Mostrando ingresos de hoy (${formatDateForDisplay(filters.startDate)})`;
        }

        if (filters.startDate === weekRange.startDate && filters.endDate === weekRange.endDate) {
            return `Mostrando ingresos de esta semana (${formatDateForDisplay(filters.startDate)} - ${formatDateForDisplay(filters.endDate)})`;
        }

        if (filters.startDate === monthRange.startDate && filters.endDate === monthRange.endDate) {
            return `Mostrando ingresos del mes actual (${formatDateForDisplay(filters.startDate)} - ${formatDateForDisplay(filters.endDate)})`;
        }

        if (filters.startDate && filters.endDate) {
            if (filters.startDate === filters.endDate) {
                return `Mostrando ingresos del ${formatDateForDisplay(filters.startDate)}`;
            }
            return `Mostrando ingresos del ${formatDateForDisplay(filters.startDate)} al ${formatDateForDisplay(filters.endDate)}`;
        }

        if (filters.startDate && !filters.endDate) {
            return `Mostrando ingresos desde el ${formatDateForDisplay(filters.startDate)}`;
        }

        if (!filters.startDate && filters.endDate) {
            return `Mostrando ingresos hasta el ${formatDateForDisplay(filters.endDate)}`;
        }

        return 'Mostrando todos los ingresos';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Ingresos</h1>
                    <p className="text-muted-foreground">
                        Registra ingresos por servicios y otros conceptos
                    </p>
                </div>
                <div className="flex gap-2">
                    {/* Botón Categorías */}
                    <Dialog open={isCategoryOpen} onOpenChange={setIsCategoryOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline">
                                <Tags className="mr-2 h-4 w-4" />
                                Categorías
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[450px]">
                            <DialogHeader>
                                <DialogTitle>Categorías de Ingresos</DialogTitle>
                                <DialogDescription>
                                    Organiza tus ingresos por categorías
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                {/* Inicializar categorías por defecto */}
                                {(!categories || categories.length === 0) && (
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => seedCategoriesMutation.mutate()}
                                        disabled={seedCategoriesMutation.isPending}
                                    >
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Inicializar Categorías por Defecto
                                    </Button>
                                )}

                                {/* Lista de categorías */}
                                <div className="space-y-2">
                                    <Label>Categorías actuales</Label>
                                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                                        {categories && categories.length > 0 ? (
                                            categories.map((cat) => (
                                                <Badge
                                                    key={cat.id}
                                                    variant="secondary"
                                                    className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground flex items-center gap-1"
                                                    onClick={async () => {
                                                        const confirmed = await confirm({
                                                            title: 'Eliminar categoría',
                                                            description: `¿Estás seguro de eliminar "${cat.name}"?`,
                                                            variant: 'danger',
                                                            confirmLabel: 'Eliminar',
                                                        });
                                                        if (confirmed) {
                                                            deleteCategoryMutation.mutate(cat.id);
                                                        }
                                                    }}
                                                    title="Click para eliminar"
                                                >
                                                    {cat.name}
                                                    <span className="ml-1">×</span>
                                                </Badge>
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                No hay categorías creadas
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Crear nueva categoría */}
                                <div className="space-y-3 pt-4 border-t">
                                    <Label>Nueva categoría</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Ej: Servicios Profesionales"
                                            value={newCategoryName}
                                            onChange={(e) => setNewCategoryName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleCreateCategory();
                                            }}
                                        />
                                        <Button
                                            onClick={handleCreateCategory}
                                            disabled={createCategoryMutation.isPending}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Botón Nuevo Ingreso */}
                    <div>
                        <Button onClick={openCreateModal}>
                            <Plus className="mr-2 h-4 w-4" />
                            Nuevo Ingreso
                        </Button>

                        <FormDialog
                            open={isCreateOpen}
                            onOpenChange={setIsCreateOpen}
                            title="Registrar Ingreso"
                            description="Completa los datos del servicio o ingreso"
                            icon={Wallet}
                            variant="success"
                            maxWidth="md"
                        >
                            <IncomeForm
                                onSubmit={handleCreate}
                                isLoading={createMutation.isPending}
                            />
                        </FormDialog>
                    </div>
                </div>
            </div>

            {/* Indicador de rango de fechas */}
            <div className="bg-muted/50 border rounded-lg px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                    {getDateRangeText()}
                </p>
            </div>

            {/* Estadísticas */}
            <IncomeStatsCards
                startDate={filters.startDate}
                endDate={filters.endDate}
            />

            {/* Filtros */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Filtros</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Filtros rápidos de fecha */}
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant={isTodayActive() ? "default" : "outline"}
                                size="sm"
                                onClick={setTodayFilter}
                            >
                                Hoy
                            </Button>
                            <Button
                                variant={isCurrentWeekActive() ? "default" : "outline"}
                                size="sm"
                                onClick={setCurrentWeekFilter}
                            >
                                Esta Semana
                            </Button>
                            <Button
                                variant={isCurrentMonthActive() ? "default" : "outline"}
                                size="sm"
                                onClick={setCurrentMonthFilter}
                            >
                                Mes Actual
                            </Button>
                            <Button
                                variant={isAllDatesActive() ? "default" : "ghost"}
                                size="sm"
                                onClick={clearDateFilters}
                            >
                                Todas las Fechas
                            </Button>
                        </div>

                        {/* Filtros detallados */}
                        <div className="flex flex-wrap gap-4">
                            {/* Categoría */}
                            <div className="w-48">
                                <Label className="text-xs text-muted-foreground">Categoría</Label>
                                <Select
                                    value={filters.categoryId ?? '__all__'}
                                    onValueChange={(v) => handleFilterChange('categoryId', v === '__all__' ? undefined : v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todas" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">Todas</SelectItem>
                                        {categories?.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Fecha desde */}
                            <div className="w-40">
                                <Label className="text-xs text-muted-foreground">Desde</Label>
                                <Input
                                    type="date"
                                    value={filters.startDate ?? ''}
                                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                                />
                            </div>

                            {/* Fecha hasta */}
                            <div className="w-40">
                                <Label className="text-xs text-muted-foreground">Hasta</Label>
                                <Input
                                    type="date"
                                    value={filters.endDate ?? ''}
                                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                                />
                            </div>

                            {/* Estado */}
                            <div className="w-32">
                                <Label className="text-xs text-muted-foreground">Estado</Label>
                                <Select
                                    value={filters.isPaid === undefined ? '__all__' : String(filters.isPaid)}
                                    onValueChange={(v) =>
                                        handleFilterChange('isPaid', v === '__all__' ? undefined : v === 'true')
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todos" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">Todos</SelectItem>
                                        <SelectItem value="true">Cobrados</SelectItem>
                                        <SelectItem value="false">Pendientes</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Limpiar todos los filtros */}
                            {Object.values(filters).some((v) => v !== undefined) && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="self-end"
                                    onClick={() => {
                                        const range = getCurrentMonthRange();
                                        setFilters({
                                            startDate: range.startDate,
                                            endDate: range.endDate,
                                        });
                                    }}
                                >
                                    Restablecer
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Contenido principal: Lista + Desglose */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Lista de ingresos */}
                <div className="lg:col-span-3">
                    <Card>
                        <CardHeader>
                            <CardTitle>Listado de Ingresos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <IncomeList
                                filters={filters}
                                onEdit={setEditingIncome}
                                onDelete={handleDelete}
                            />
                        </CardContent>
                    </Card>
                </div>

                {/* Desglose por categoría */}
                <div className="lg:col-span-1">
                    <IncomeCategoryBreakdown
                        startDate={filters.startDate}
                        endDate={filters.endDate}
                    />
                </div>
            </div>

            {/* Dialog para editar - Premium */}
            <FormDialog
                open={!!editingIncome}
                onOpenChange={(open) => !open && setEditingIncome(null)}
                title="Editar Ingreso"
                description="Modifica los datos del ingreso"
                icon={Wallet}
                variant="success"
                maxWidth="md"
            >
                {editingIncome ? (
                    <IncomeForm
                        initialData={{
                            description: editingIncome.description,
                            amount: editingIncome.amount,
                            incomeDate: editingIncome.incomeDate.split('T')[0],
                            categoryId: editingIncome.categoryId ?? undefined,
                            customerId: editingIncome.customerId ?? undefined,
                            customerName: editingIncome.customerName ?? '',
                            isOnAccount: editingIncome.isOnAccount,
                            paymentMethodId: editingIncome.paymentMethodId ?? undefined,
                            receiptNumber: editingIncome.receiptNumber ?? '',
                            isPaid: editingIncome.isPaid,
                            notes: editingIncome.notes ?? '',
                        }}
                        onSubmit={handleUpdate}
                        isLoading={updateMutation.isPending}
                        isEditing
                    />
                ) : null}
            </FormDialog>

            {/* Alerta de caja del día anterior sin cerrar */}
            {!dismissedCashAlert && (
                <UnclosedCashAlertDialog
                    onContinue={() => setDismissedCashAlert(true)}
                />
            )}
        </div>
    );
}
