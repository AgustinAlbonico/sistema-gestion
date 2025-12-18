import { useState } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { ProductList } from '@/features/products/components/ProductList';
import { ProductForm } from '@/features/products/components/ProductForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Tags, Percent, Pencil, Trash2, Package } from 'lucide-react';
import { FormDialog } from '@/components/ui/form-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi, categoriesApi } from '@/features/products/api/products.api';
import { toast } from 'sonner';
import { Product, Category, CreateCategoryDTO } from '@/features/products/types';
import { ProductFormValues } from '@/features/products/schemas/product.schema';
import { NumericInput } from '@/components/ui/numeric-input';

/**
 * Página de Productos - Gestión completa de productos y stock
 */
export default function ProductsPage() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [isCategoryOpen, setIsCategoryOpen] = useState(false);

    // Estado para crear/editar categorías
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryMargin, setNewCategoryMargin] = useState<number | undefined>(undefined);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [editCategoryName, setEditCategoryName] = useState('');
    const [editCategoryMargin, setEditCategoryMargin] = useState<number | undefined>(undefined);

    const queryClient = useQueryClient();
    const confirm = useConfirm();

    // Query para categorías
    const { data: categories } = useQuery({
        queryKey: ['categories'],
        queryFn: () => categoriesApi.getAll(),
    });

    const createMutation = useMutation({
        mutationFn: productsApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            toast.success('Producto creado');
            setIsCreateOpen(false);
        },
        onError: () => {
            toast.error('Error al crear producto');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: ProductFormValues }) =>
            productsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            toast.success('Producto actualizado');
            setEditingProduct(null);
        },
        onError: () => {
            toast.error('Error al actualizar producto');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: productsApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            toast.success('Producto eliminado');
        },
        onError: () => {
            toast.error('Error al eliminar producto');
        },
    });

    const createCategoryMutation = useMutation({
        mutationFn: categoriesApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            toast.success('Categoría creada');
            setNewCategoryName('');
            setNewCategoryMargin(undefined);
        },
        onError: () => {
            toast.error('Error al crear categoría');
        },
    });

    const updateCategoryMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<CreateCategoryDTO> }) =>
            categoriesApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            toast.success('Categoría actualizada');
            setEditingCategory(null);
        },
        onError: () => {
            toast.error('Error al actualizar categoría');
        },
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: categoriesApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            toast.success('Categoría eliminada');
        },
        onError: () => {
            toast.error('Error al eliminar categoría');
        },
    });

    const handleCreate = (data: ProductFormValues) => {
        createMutation.mutate(data);
    };

    const handleUpdate = (data: ProductFormValues) => {
        if (editingProduct) {
            updateMutation.mutate({ id: editingProduct.id, data });
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = await confirm({
            title: 'Eliminar producto',
            description: '¿Estás seguro de eliminar este producto?',
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
        createCategoryMutation.mutate({
            name: newCategoryName.trim(),
            profitMargin: newCategoryMargin ?? null,
        });
    };

    const handleUpdateCategory = () => {
        if (!editingCategory) return;
        if (!editCategoryName.trim()) {
            toast.error('Ingresá un nombre para la categoría');
            return;
        }
        updateCategoryMutation.mutate({
            id: editingCategory.id,
            data: {
                name: editCategoryName.trim(),
                profitMargin: editCategoryMargin ?? null,
            },
        });
    };

    const startEditCategory = (category: Category) => {
        setEditingCategory(category);
        setEditCategoryName(category.name);
        setEditCategoryMargin(category.profitMargin ?? undefined);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Productos</h1>
                    <p className="text-muted-foreground">
                        Cargá productos con nombre, costo y stock
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
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Categorías de Productos</DialogTitle>
                                <DialogDescription>
                                    Organizá tus productos por categorías. Podés asignar un % de ganancia a cada categoría.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                {/* Lista de categorías existentes */}
                                <div className="space-y-3">
                                    <Label>Categorías actuales</Label>
                                    {categories && categories.length > 0 ? (
                                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                            {categories.map((cat) => (
                                                <div
                                                    key={cat.id}
                                                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-4 h-4 rounded-full"
                                                            style={{ backgroundColor: cat.color || '#6b7280' }}
                                                        />
                                                        <div>
                                                            <p className="font-medium">{cat.name}</p>
                                                            {cat.profitMargin !== null && cat.profitMargin !== undefined ? (
                                                                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                                                    <Percent className="h-3 w-3" />
                                                                    {cat.profitMargin}% de ganancia
                                                                </p>
                                                            ) : (
                                                                <p className="text-xs text-muted-foreground">
                                                                    Usa margen general
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => startEditCategory(cat)}
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-destructive hover:text-destructive"
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
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground p-4 border rounded-lg text-center">
                                            No hay categorías creadas
                                        </p>
                                    )}
                                </div>

                                {/* Crear nueva categoría */}
                                <div className="space-y-3 pt-4 border-t">
                                    <Label>Nueva categoría</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label htmlFor="categoryName" className="text-xs text-muted-foreground">Nombre</Label>
                                            <Input
                                                id="categoryName"
                                                placeholder="Ej: Bebidas"
                                                value={newCategoryName}
                                                onChange={(e) => setNewCategoryName(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="categoryMargin" className="text-xs text-muted-foreground">% Ganancia (opcional)</Label>
                                            <div className="flex gap-2">
                                                <NumericInput
                                                    id="categoryMargin"
                                                    placeholder="Ej: 30"
                                                    value={newCategoryMargin ?? ''}
                                                    onChange={(e) => setNewCategoryMargin(e.target.value === '' ? undefined : Number.parseFloat(e.target.value) || 0)}
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
                                    <p className="text-xs text-muted-foreground">
                                        Si no asignás un % de ganancia, los productos usarán el margen general del sistema.
                                    </p>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Diálogo para editar categoría */}
                    <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
                        <DialogContent className="sm:max-w-[400px]">
                            <DialogHeader>
                                <DialogTitle>Editar Categoría</DialogTitle>
                                <DialogDescription>
                                    Modificá el nombre y % de ganancia de la categoría
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="editCategoryName">Nombre</Label>
                                    <Input
                                        id="editCategoryName"
                                        value={editCategoryName}
                                        onChange={(e) => setEditCategoryName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="editCategoryMargin">% de Ganancia</Label>
                                    <div className="flex items-center gap-2">
                                        <NumericInput
                                            id="editCategoryMargin"
                                            placeholder="Ej: 30 (dejar vacío para usar margen general)"
                                            value={editCategoryMargin ?? ''}
                                            onChange={(e) => setEditCategoryMargin(e.target.value === '' ? undefined : Number.parseFloat(e.target.value) || 0)}
                                        />
                                        <span className="text-muted-foreground">%</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Dejar vacío para que los productos usen el margen general del sistema.
                                        Al cambiar este valor, los precios de los productos de esta categoría se recalcularán.
                                    </p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setEditingCategory(null)}>
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleUpdateCategory}
                                    disabled={updateCategoryMutation.isPending}
                                >
                                    {updateCategoryMutation.isPending ? 'Guardando...' : 'Guardar'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Botón Nuevo Producto */}
                    <Button onClick={() => setIsCreateOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nuevo Producto
                    </Button>
                </div>
            </div>

            <div className="bg-card rounded-lg border shadow-sm p-6">
                <ProductList
                    onEdit={setEditingProduct}
                    onDelete={handleDelete}
                />
            </div>

            {/* Modal de creación premium */}
            <FormDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                title="Nuevo Producto"
                description="El precio se calcula automático según la configuración o categoría"
                icon={Package}
                variant="success"
                maxWidth="md"
            >
                <ProductForm
                    onSubmit={handleCreate}
                    isLoading={createMutation.isPending}
                />
            </FormDialog>

            {/* Modal de edición premium */}
            <FormDialog
                open={!!editingProduct}
                onOpenChange={(open) => !open && setEditingProduct(null)}
                title="Editar Producto"
                description="Modificá el costo o stock del producto"
                icon={Package}
                variant="success"
                maxWidth="md"
            >
                {editingProduct ? (
                    <ProductForm
                        initialData={{
                            name: editingProduct.name,
                            description: editingProduct.description,
                            cost: editingProduct.cost,
                            stock: editingProduct.stock,
                            categoryId: editingProduct.categoryId || null,
                            isActive: editingProduct.isActive,
                            useCustomMargin: editingProduct.useCustomMargin ?? false,
                            customProfitMargin: editingProduct.useCustomMargin ? editingProduct.profitMargin : undefined,
                        }}
                        onSubmit={handleUpdate}
                        isLoading={updateMutation.isPending}
                        isEditing
                    />
                ) : null}
            </FormDialog>
        </div>
    );
}

