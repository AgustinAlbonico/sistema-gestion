/**
 * Formulario profesional de Punto de Venta (POS)
 * Diseño moderno y optimizado para velocidad de uso
 */
import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    Plus,
    Loader2,
    User,
    Calendar,
    CreditCard,
    Banknote,
    Building,
    Smartphone,
    FileText,
    ShoppingCart,
    Receipt,
    X,
    Minus,
    Percent,
    CheckCircle2,
    UserPlus,
    Package,
    DollarSign,
    Clock,
    Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
} from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { ProductSearch } from '@/components/common/ProductSearch';
import { CustomerSearch } from '@/components/common/CustomerSearch';
import { customersApi } from '@/features/customers/api';
import { Customer } from '@/features/customers/types';
import { CustomerForm } from '@/features/customers/components/CustomerForm';
import { CustomerFormValues } from '@/features/customers/schemas/customer.schema';
import { createSaleSchema, CreateSaleFormValues } from '../schemas/sale.schema';
import { PaymentMethod, PaymentMethodLabels, CreateSaleDTO, CreateSalePaymentDTO, CreateSaleItemDTO, CreateSaleTaxDTO } from '../types';
import { PaymentMethodIcons } from '../constants';
import { getTodayLocal } from '@/lib/date-utils';
import { fiscalApi } from '@/features/configuration/api/fiscal.api';
import { IvaCondition } from '@/features/configuration/types/fiscal';
import { useTaxTypes, useCreateTaxType } from '@/features/configuration/api/tax-types.api';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { paymentMethodsApi } from '@/features/configuration/api/payment-methods.api';
import {
    useTaxSync,
    usePaymentAmountSync,
    useDiscountCalculation,
    useSurchargeCalculation,
    useTaxAmountCalculation,
    useOnAccountValidation,
    useMonotributistaCleanup,
    useFiscalConfigValidation,
} from '../hooks/useSaleFormEffects';

interface SaleFormProps {
    readonly onSubmit: (data: CreateSaleDTO) => void;
    readonly isLoading?: boolean;
}

/**
 * Formatea un número como moneda ARS
 */
function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(value);
}

export function SaleForm({ onSubmit, isLoading }: SaleFormProps) {
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
    const [initialCustomerName, setInitialCustomerName] = useState('');
    const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENTAGE'>('PERCENTAGE');
    const [discountPercentage, setDiscountPercentage] = useState<number | string>(0);
    const [surchargeType, setSurchargeType] = useState<'FIXED' | 'PERCENTAGE'>('PERCENTAGE');
    const [surchargePercentage, setSurchargePercentage] = useState<number | string>(0);
    const [showNotes, setShowNotes] = useState(false);
    const [ivaPercentage, setIvaPercentage] = useState<number>(21); // IVA por defecto 21%

    const queryClient = useQueryClient();

    // Obtener métodos de pago (necesario para mapear códigos a IDs en el submit)
    const { data: paymentMethods } = useQuery({
        queryKey: ['payment-methods'],
        queryFn: paymentMethodsApi.getAll,
    });

    // Obtener configuración fiscal
    const { data: fiscalConfig } = useQuery({
        queryKey: ['fiscal-config'],
        queryFn: fiscalApi.getConfiguration,
    });

    const { data: taxTypes } = useTaxTypes();
    const createTaxMutation = useCreateTaxType();
    const [isCreateTaxOpen, setIsCreateTaxOpen] = useState(false);
    const [newTaxName, setNewTaxName] = useState('');
    const [newTaxPercentage, setNewTaxPercentage] = useState('');
    const [pendingTaxIndex, setPendingTaxIndex] = useState<number | null>(null);

    const isMonotributista = fiscalConfig?.ivaCondition === IvaCondition.RESPONSABLE_MONOTRIBUTO;

    const form = useForm<CreateSaleFormValues>({
        resolver: zodResolver(createSaleSchema),
        defaultValues: {
            customerId: undefined,
            customerName: '',
            saleDate: getTodayLocal(),
            discount: 0,
            surcharge: 0,
            tax: 0,
            isOnAccount: false,
            generateInvoice: false,
            notes: '',
            items: [],
            taxes: [],
            payments: [{ paymentMethod: PaymentMethod.CASH, amount: 0 }],
        },
    });

    const {
        fields: itemFields,
        append: appendItem,
        remove: removeItem,
    } = useFieldArray({
        control: form.control,
        name: 'items',
    });

    const {
        fields: paymentFields,
        append: appendPayment,
        remove: removePayment,
    } = useFieldArray({
        control: form.control,
        name: 'payments',
    });

    const {
        fields: taxFields,
        append: appendTax,
        remove: removeTax,
    } = useFieldArray({
        control: form.control,
        name: 'taxes',
    });

    // Observar valores del formulario
    const items = form.watch('items');
    const payments = form.watch('payments');
    const taxes = form.watch('taxes');
    const discount = form.watch('discount') || 0;
    const surcharge = form.watch('surcharge') || 0;
    const isOnAccount = form.watch('isOnAccount');
    const customerId = form.watch('customerId');
    const generateInvoice = form.watch('generateInvoice');

    // Calcular totales
    const subtotal = items.reduce((sum, item) => {
        const itemSubtotal = (item.quantity || 0) * (item.unitPrice || 0);
        return sum + itemSubtotal - (item.discount || 0);
    }, 0);

    // Calcular impuestos desde la lista de impuestos
    const totalTaxAmount = taxes?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

    // === EFECTOS EXTRAÍDOS A HOOKS PARA REDUCIR COMPLEJIDAD ===
    // Sincronizar campo tax con total de impuestos
    useTaxSync(form, totalTaxAmount);

    const total = subtotal + totalTaxAmount - discount + surcharge;

    const totalPayments = payments?.reduce(
        (sum, payment) => sum + (payment.amount || 0),
        0
    ) || 0;

    const pendingAmount = total - totalPayments;

    // Actualizar monto del primer pago cuando cambia el total
    usePaymentAmountSync(form, total, isOnAccount, payments?.length);

    // Recalcular descuento si es porcentual
    useDiscountCalculation(form, subtotal, discountType, discountPercentage, discount);

    // Recalcular recargo si es porcentual
    useSurchargeCalculation(form, subtotal, surchargeType, surchargePercentage, surcharge);

    // Recalcular montos de impuestos cuando cambia el subtotal
    useTaxAmountCalculation(form, subtotal, taxes);

    // Si se deselecciona cuenta corriente, limpiar cliente si no hay cliente seleccionado
    useOnAccountValidation(form, customerId, isOnAccount);

    // Si es monotributista, limpiar impuestos
    useMonotributistaCleanup(form, isMonotributista);

    // Si AFIP no está configurado, asegurar que generateInvoice sea false
    useFiscalConfigValidation(form, fiscalConfig?.isConfigured);

    const handleCustomerSelect = (customerId: string, customer: Customer) => {
        form.setValue('customerId', customerId);
        form.setValue('customerName', `${customer.firstName} ${customer.lastName}`);
        setSelectedCustomer(customer);
    };

    const handleCustomerClear = () => {
        form.setValue('customerId', undefined);
        form.setValue('customerName', '');
        form.setValue('isOnAccount', false);
        setSelectedCustomer(null);
    };

    // Mutación para crear cliente
    const createCustomerMutation = useMutation({
        mutationFn: customersApi.create,
        onSuccess: (newCustomer) => {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            toast.success('Cliente creado exitosamente');
            setCreateCustomerOpen(false);
            handleCustomerSelect(newCustomer.id, newCustomer);
            setInitialCustomerName('');
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Error al crear cliente');
        },
    });

    const handleCreateTax = async () => {
        if (!newTaxName || !newTaxPercentage) return;

        try {
            const newTax = await createTaxMutation.mutateAsync({
                name: newTaxName,
                percentage: Number.parseFloat(newTaxPercentage),
            });

            if (pendingTaxIndex !== null) {
                form.setValue(`taxes.${pendingTaxIndex}.name`, newTax.name);
                form.setValue(`taxes.${pendingTaxIndex}.percentage`, newTax.percentage || 0);
                const amount = (subtotal * (newTax.percentage || 0)) / 100;
                form.setValue(`taxes.${pendingTaxIndex}.amount`, Number(amount.toFixed(2)));
            } else {
                appendTax({ name: newTax.name, percentage: newTax.percentage || 0, amount: 0 });
            }

            setIsCreateTaxOpen(false);
            setNewTaxName('');
            setNewTaxPercentage('');
            setPendingTaxIndex(null);
            toast.success('Impuesto creado exitosamente');
        } catch (error) {
            toast.error('Error al crear el impuesto');
        }
    };

    const handleCreateCustomer = (data: CustomerFormValues) => {
        const cleanData = {
            ...data,
            documentType: data.documentType || undefined,
        };
        createCustomerMutation.mutate(cleanData as any);
    };

    const handleOpenCreateCustomer = () => {
        setCreateCustomerOpen(true);
    };

    const handleSubmit = (data: CreateSaleFormValues) => {
        // Validar que hay productos
        if (data.items.length === 0) {
            toast.error('Agregá al menos un producto');
            return;
        }

        // Validar que los pagos cubran el total si no es cuenta corriente
        if (!data.isOnAccount) {
            const totalPaid = data.payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
            if (Math.abs(totalPaid - total) > 0.01) {
                form.setError('payments', {
                    message: `El total de pagos debe ser igual a ${formatCurrency(total)}`,
                });
                return;
            }
        }

        // Validar cuenta corriente solo con cliente
        if (data.isOnAccount && !data.customerId) {
            form.setError('isOnAccount', {
                message: 'Debe seleccionar un cliente para venta en cuenta corriente',
            });
            return;
        }

        // Transformar pagos para incluir paymentMethodId
        // Si es cuenta corriente, no enviar pagos
        let paymentsWithIds: CreateSalePaymentDTO[] | undefined = undefined;
        if (!data.isOnAccount && data.payments) {
            paymentsWithIds = data.payments.map((payment) => {
                const method = paymentMethods?.find((pm) => pm.code === payment.paymentMethod);
                if (!method) {
                    toast.error(`Error: Método de pago ${payment.paymentMethod} no encontrado`);
                    throw new Error(`Payment method not found: ${payment.paymentMethod}`);
                }

                const { paymentMethod, ...rest } = payment;
                return {
                    ...rest,
                    paymentMethodId: method.id,
                };
            });
        }

        const itemsForApi: CreateSaleItemDTO[] = data.items.map(({ stock: _stock, productName: _productName, ...item }) => item);
        const taxesForApi: CreateSaleTaxDTO[] | undefined = data.taxes ? data.taxes.map((t) => ({ ...t })) : undefined;

        // Solo enviar ivaPercentage cuando es RI→RI (Factura A)
        const shouldIncludeIva = fiscalConfig?.ivaCondition === IvaCondition.RESPONSABLE_INSCRIPTO &&
            selectedCustomer?.ivaCondition === IvaCondition.RESPONSABLE_INSCRIPTO;

        const payload: CreateSaleDTO = {
            ...data,
            items: itemsForApi,
            taxes: taxesForApi,
            payments: data.isOnAccount ? undefined : paymentsWithIds,
            ivaPercentage: shouldIncludeIva ? ivaPercentage : undefined,
        };

        onSubmit(payload);
    };

    const handleProductSelect = (productId: string, product: any) => {
        // Verificar si el producto ya está en la lista
        const existingIndex = items.findIndex(item => item.productId === productId);

        if (existingIndex >= 0) {
            // Incrementar cantidad
            const currentQty = items[existingIndex].quantity || 1;
            const maxStock = items[existingIndex].stock;

            if (maxStock !== undefined && currentQty >= maxStock) {
                toast.error(`Stock máximo alcanzado: ${maxStock}`);
                return;
            }

            form.setValue(`items.${existingIndex}.quantity`, currentQty + 1);
            toast.success(`${product.name} x${currentQty + 1}`);
        } else {
            // Agregar nuevo producto
            appendItem({
                productId: productId,
                productName: product.name,
                quantity: 1,
                unitPrice: product.price,
                discount: 0,
                discountPercent: 0,
                stock: product.stock,
            });
            toast.success(`${product.name} agregado`);
        }
    };

    const updateQuantity = (index: number, delta: number) => {
        const currentQty = items[index]?.quantity || 1;
        const newQty = currentQty + delta;
        const maxStock = items[index]?.stock;

        if (newQty < 1) {
            removeItem(index);
            return;
        }

        if (maxStock !== undefined && newQty > maxStock) {
            toast.error(`Stock máximo: ${maxStock}`);
            return;
        }

        form.setValue(`items.${index}.quantity`, newQty);
    };

    return (
        <div className="h-full">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit, (errors) => {
                    console.log('Form validation errors:', errors);
                    const firstError = Object.values(errors)[0];
                    if (firstError && 'message' in firstError) {
                        toast.error(firstError.message as string);
                    } else {
                        toast.error('Por favor verificá los campos del formulario');
                    }
                })} className="h-full">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">

                        {/* COLUMNA IZQUIERDA: Búsqueda y Productos */}
                        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">

                            {/* Barra superior: Cliente + Fecha + Facturación */}
                            <div className="bg-card border rounded-xl p-4">
                                <div className="flex flex-wrap items-center gap-4">
                                    {/* Cliente */}
                                    <div className="flex-1 min-w-[200px]">
                                        <FormField
                                            control={form.control}
                                            name="customerId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <User className="h-4 w-4 text-muted-foreground" />
                                                        <FormLabel className="text-xs font-medium text-muted-foreground">
                                                            Cliente
                                                        </FormLabel>
                                                    </div>
                                                    <FormControl>
                                                        <CustomerSearch
                                                            value={field.value}
                                                            onSelect={handleCustomerSelect}
                                                            onClear={handleCustomerClear}
                                                            placeholder="Consumidor Final"
                                                            allowCreate
                                                            onCreateClick={handleOpenCreateCustomer}
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Fecha */}
                                    <div className="w-40">
                                        <FormField
                                            control={form.control}
                                            name="saleDate"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                                        <FormLabel className="text-xs font-medium text-muted-foreground">
                                                            Fecha
                                                        </FormLabel>
                                                    </div>
                                                    <FormControl>
                                                        <Input
                                                            type="date"
                                                            {...field}
                                                            className="h-10"
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Toggle Factura Fiscal */}
                                    <div className="flex items-center gap-3 pl-4 border-l">
                                        <FormField
                                            control={form.control}
                                            name="generateInvoice"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <div className="flex items-center gap-2">
                                                        <FormControl>
                                                            <Checkbox
                                                                checked={field.value}
                                                                onCheckedChange={field.onChange}
                                                                disabled={!fiscalConfig?.isConfigured}
                                                                className="h-5 w-5"
                                                            />
                                                        </FormControl>
                                                        <div className="flex flex-col">
                                                            <FormLabel className="text-sm font-medium cursor-pointer">
                                                                Factura Fiscal
                                                            </FormLabel>
                                                            {fiscalConfig?.isConfigured ? null : (
                                                                <span className="text-[10px] text-amber-600">
                                                                    AFIP no configurado
                                                                </span>
                                                            )}
                                                        </div>
                                                        {field.value ? (
                                                            <Badge className="bg-blue-500 text-white text-[10px] ml-1">
                                                                AFIP
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>

                                {/* Info del cliente seleccionado */}
                                {selectedCustomer ? (
                                    <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs text-muted-foreground">
                                        {selectedCustomer.documentNumber ? (
                                            <span className="flex items-center gap-1">
                                                <FileText className="h-3 w-3" />
                                                {selectedCustomer.documentType}: {selectedCustomer.documentNumber}
                                            </span>
                                        ) : null}
                                        {selectedCustomer.email ? (
                                            <span>{selectedCustomer.email}</span>
                                        ) : null}
                                        {selectedCustomer.phone ? (
                                            <span>{selectedCustomer.phone}</span>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            {/* Búsqueda de productos - PROMINENTE */}
                            <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-2 border-primary/20 rounded-xl p-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <Package className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">Agregar Productos</h3>
                                        <p className="text-xs text-muted-foreground">
                                            Buscá por nombre, código o SKU
                                        </p>
                                    </div>
                                </div>
                                <ProductSearch
                                    onSelect={handleProductSelect}
                                    placeholder="Escribí para buscar productos..."
                                    showStock
                                    showSKU
                                    limit={20}
                                    className="h-12 text-lg"
                                    excludeIds={items.map(item => item.productId).filter(id => id !== '')}
                                    excludeOutOfStock
                                />
                            </div>

                            {/* Lista de productos */}
                            <div className="flex-1 bg-card border rounded-xl overflow-hidden flex flex-col">
                                <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium text-sm">
                                            Productos ({items.length})
                                        </span>
                                    </div>
                                    {items.length > 0 ? (
                                        <span className="text-xs text-muted-foreground">
                                            Subtotal: {formatCurrency(subtotal)}
                                        </span>
                                    ) : null}
                                </div>

                                <div className="flex-1 overflow-auto p-2">
                                    {items.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-12">
                                            <Package className="h-12 w-12 mb-3 opacity-20" />
                                            <p className="text-sm">No hay productos agregados</p>
                                            <p className="text-xs mt-1">Usá el buscador de arriba para agregar</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {itemFields.map((field, index) => {
                                                const item = items[index];
                                                const itemTotal = (item?.quantity || 0) * (item?.unitPrice || 0) - (item?.discount || 0);

                                                return (
                                                    <div
                                                        key={field.id}
                                                        className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors group"
                                                    >
                                                        {/* Info del producto */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium truncate">
                                                                {item?.productName || 'Producto sin nombre'}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                                                <span>{formatCurrency(item?.unitPrice || 0)} c/u</span>
                                                                {item?.stock === undefined ? null : (
                                                                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                                                                        Stock: {item.stock}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Controles de cantidad */}
                                                        <div className="flex items-center gap-1 bg-background rounded-lg border p-1">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8"
                                                                onClick={() => updateQuantity(index, -1)}
                                                            >
                                                                <Minus className="h-3 w-3" />
                                                            </Button>
                                                            <FormField
                                                                control={form.control}
                                                                name={`items.${index}.quantity`}
                                                                render={({ field }) => (
                                                                    <NumericInput
                                                                        allowDecimals={false}
                                                                        className="h-8 w-14 text-center border-0 bg-transparent"
                                                                        value={field.value}
                                                                        onFocus={(e) => e.target.select()}
                                                                        onChange={(e) => {
                                                                            const val = Number.parseInt(e.target.value) || 1;
                                                                            const maxStock = item?.stock;
                                                                            if (maxStock !== undefined && val > maxStock) {
                                                                                toast.error(`Stock máximo: ${maxStock}`);
                                                                                field.onChange(maxStock);
                                                                                return;
                                                                            }
                                                                            field.onChange(val);
                                                                        }}
                                                                    />
                                                                )}
                                                            />
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8"
                                                                onClick={() => updateQuantity(index, 1)}
                                                            >
                                                                <Plus className="h-3 w-3" />
                                                            </Button>
                                                        </div>

                                                        {/* Total del item */}
                                                        <div className="w-24 text-right">
                                                            <span className="font-semibold">
                                                                {formatCurrency(itemTotal)}
                                                            </span>
                                                        </div>

                                                        {/* Eliminar */}
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                            onClick={() => removeItem(index)}
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Notas (colapsable) */}
                                <div className="border-t">
                                    <button
                                        type="button"
                                        onClick={() => setShowNotes(!showNotes)}
                                        className="w-full p-2 text-xs text-muted-foreground hover:bg-muted/50 flex items-center justify-center gap-1"
                                    >
                                        <FileText className="h-3 w-3" />
                                        {showNotes ? 'Ocultar notas' : 'Agregar notas'}
                                    </button>
                                    {showNotes ? (
                                        <div className="p-3 pt-0">
                                            <FormField
                                                control={form.control}
                                                name="notes"
                                                render={({ field }) => (
                                                    <Textarea
                                                        placeholder="Observaciones de la venta..."
                                                        className="resize-none text-sm"
                                                        rows={2}
                                                        {...field}
                                                    />
                                                )}
                                            />
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        {/* COLUMNA DERECHA: Totales y Pagos */}
                        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">

                            {/* Panel de Totales */}
                            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-5 shadow-xl">
                                <div className="space-y-3">
                                    {/* Subtotal */}
                                    <div className="flex justify-between text-sm opacity-80">
                                        <span>Subtotal</span>
                                        <span>{formatCurrency(subtotal)}</span>
                                    </div>

                                    {/* Descuento */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm opacity-80">Descuento</span>
                                            <Select
                                                value={discountType}
                                                onValueChange={(val: 'FIXED' | 'PERCENTAGE') => {
                                                    setDiscountType(val);
                                                    if (val === 'PERCENTAGE' && subtotal > 0) {
                                                        setDiscountPercentage(Number(((discount / subtotal) * 100).toFixed(2)));
                                                    }
                                                }}
                                            >
                                                <SelectTrigger className="h-7 w-14 bg-white/10 border-white/20 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="PERCENTAGE">%</SelectItem>
                                                    <SelectItem value="FIXED">$</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {discountType === 'PERCENTAGE' ? (
                                                <NumericInput
                                                    className="h-8 w-20 text-right bg-white/10 border-white/20 text-white"
                                                    value={discountPercentage}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => setDiscountPercentage(e.target.value === '' ? '' : Number.parseFloat(e.target.value) || '')}
                                                />
                                            ) : (
                                                <FormField
                                                    control={form.control}
                                                    name="discount"
                                                    render={({ field }) => (
                                                        <NumericInput
                                                            className="h-8 w-20 text-right bg-white/10 border-white/20 text-white"
                                                            value={field.value}
                                                            onFocus={(e) => e.target.select()}
                                                            onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number.parseFloat(e.target.value) || 0)}
                                                        />
                                                    )}
                                                />
                                            )}
                                            {discount > 0 ? (
                                                <span className="text-red-400 text-sm">
                                                    -{formatCurrency(discount)}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* Recargo */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm opacity-80">Recargo</span>
                                            <Select
                                                value={surchargeType}
                                                onValueChange={(val: 'FIXED' | 'PERCENTAGE') => {
                                                    setSurchargeType(val);
                                                    if (val === 'PERCENTAGE' && subtotal > 0) {
                                                        setSurchargePercentage(Number(((surcharge / subtotal) * 100).toFixed(2)));
                                                    }
                                                }}
                                            >
                                                <SelectTrigger className="h-7 w-14 bg-white/10 border-white/20 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="PERCENTAGE">%</SelectItem>
                                                    <SelectItem value="FIXED">$</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {surchargeType === 'PERCENTAGE' ? (
                                                <NumericInput
                                                    className="h-8 w-20 text-right bg-white/10 border-white/20 text-white"
                                                    value={surchargePercentage}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => setSurchargePercentage(e.target.value === '' ? '' : Number.parseFloat(e.target.value) || '')}
                                                />
                                            ) : (
                                                <FormField
                                                    control={form.control}
                                                    name="surcharge"
                                                    render={({ field }) => (
                                                        <NumericInput
                                                            className="h-8 w-20 text-right bg-white/10 border-white/20 text-white"
                                                            value={field.value}
                                                            onFocus={(e) => e.target.select()}
                                                            onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number.parseFloat(e.target.value) || 0)}
                                                        />
                                                    )}
                                                />
                                            )}
                                            {surcharge > 0 ? (
                                                <span className="text-green-400 text-sm">
                                                    +{formatCurrency(surcharge)}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* Impuestos */}
                                    {isMonotributista ? null : (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm opacity-80">Impuestos</span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs text-white/70 hover:text-white hover:bg-white/10"
                                                    onClick={() => appendTax({ name: 'IVA', percentage: 21, amount: 0 })}
                                                >
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    Agregar
                                                </Button>
                                            </div>
                                            {taxFields.map((field, index) => (
                                                <div key={field.id} className="flex items-center gap-2 pl-4">
                                                    <Select
                                                        onValueChange={(val) => {
                                                            if (val === 'create_new') {
                                                                setPendingTaxIndex(index);
                                                                setIsCreateTaxOpen(true);
                                                            } else {
                                                                const selectedTax = taxTypes?.find((t) => t.name === val);
                                                                form.setValue(`taxes.${index}.name`, val);
                                                                if (selectedTax?.percentage) {
                                                                    form.setValue(`taxes.${index}.percentage`, selectedTax.percentage);
                                                                    const amount = (subtotal * selectedTax.percentage) / 100;
                                                                    form.setValue(`taxes.${index}.amount`, Number(amount.toFixed(2)));
                                                                }
                                                            }
                                                        }}
                                                        value={taxTypes?.some(t => t.name === taxes?.[index]?.name) ? taxes?.[index]?.name : undefined}
                                                    >
                                                        <SelectTrigger className="h-7 flex-1 bg-white/10 border-white/20 text-xs">
                                                            <SelectValue placeholder="Seleccionar" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {taxTypes?.map((tax) => (
                                                                <SelectItem key={tax.id} value={tax.name} className="text-xs">
                                                                    {tax.name} ({tax.percentage}%)
                                                                </SelectItem>
                                                            ))}
                                                            <SelectItem value="create_new" className="text-xs font-medium text-primary">
                                                                <Plus className="h-3 w-3 mr-1 inline" />
                                                                Crear nuevo...
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <span className="text-sm w-20 text-right">
                                                        {formatCurrency(taxes?.[index]?.amount || 0)}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-white/50 hover:text-white hover:bg-white/10"
                                                        onClick={() => removeTax(index)}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {isMonotributista && totalTaxAmount === 0 ? (
                                        <div className="text-xs opacity-50 text-center py-1">
                                            Sin impuestos (Monotributista)
                                        </div>
                                    ) : null}

                                    <Separator className="bg-white/20" />

                                    {/* TOTAL */}
                                    <div className="flex justify-between items-center pt-2">
                                        <span className="text-lg font-medium">TOTAL</span>
                                        <span className="text-4xl font-bold tracking-tight">
                                            {formatCurrency(total)}
                                        </span>
                                    </div>

                                    {/* Desglose IVA para Factura A (RI → RI) */}
                                    {fiscalConfig?.ivaCondition === IvaCondition.RESPONSABLE_INSCRIPTO &&
                                        selectedCustomer?.ivaCondition === IvaCondition.RESPONSABLE_INSCRIPTO &&
                                        total > 0 ? (() => {
                                            const ivaDivisor = 1 + ivaPercentage / 100;
                                            const netoGravado = Math.round((total / ivaDivisor) * 100) / 100;
                                            const ivaAmount = Math.round((total - netoGravado) * 100) / 100;
                                            return (
                                                <div className="mt-4 pt-4 border-t border-white/20">
                                                    <div className="flex items-center justify-between gap-2 mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30 text-[10px]">
                                                                Factura A
                                                            </Badge>
                                                            <span className="text-xs opacity-60">Desglose IVA</span>
                                                        </div>
                                                        <Select
                                                            value={String(ivaPercentage)}
                                                            onValueChange={(val) => setIvaPercentage(Number(val))}
                                                        >
                                                            <SelectTrigger className="h-7 w-20 bg-white/10 border-white/20 text-xs">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="21">21%</SelectItem>
                                                                <SelectItem value="10.5">10.5%</SelectItem>
                                                                <SelectItem value="27">27%</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1 text-sm">
                                                        <div className="flex justify-between opacity-70">
                                                            <span>Neto Gravado</span>
                                                            <span>{formatCurrency(netoGravado)}</span>
                                                        </div>
                                                        <div className="flex justify-between opacity-70">
                                                            <span>IVA {ivaPercentage}%</span>
                                                            <span>{formatCurrency(ivaAmount)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })() : null}
                                </div>
                            </div>

                            {/* Cuenta Corriente */}
                            <FormField
                                control={form.control}
                                name="isOnAccount"
                                render={({ field }) => (
                                    <FormItem>
                                        <div
                                            className={cn(
                                                "bg-card border rounded-xl p-4 cursor-pointer transition-all hover:border-amber-300",
                                                field.value && "border-amber-500 bg-amber-50/50",
                                                !customerId && "opacity-60 cursor-not-allowed"
                                            )}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!customerId) {
                                                    toast.error('Seleccioná un cliente primero');
                                                    return;
                                                }
                                                field.onChange(!field.value);
                                            }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "p-2 rounded-lg",
                                                        field.value ? "bg-amber-100 text-amber-600" : "bg-muted"
                                                    )}>
                                                        <Clock className="h-4 w-4" />
                                                    </div>
                                                    <div>
                                                        <Label className="font-medium cursor-pointer">Cuenta Corriente</Label>
                                                        <p className="text-xs text-muted-foreground">
                                                            {customerId ? 'Registrar como pendiente de pago' : 'Seleccioná un cliente primero'}
                                                        </p>
                                                    </div>
                                                </div>
                                                {/* Envolvemos el checkbox en un div que detiene la propagación */}
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value}
                                                            onCheckedChange={(checked) => {
                                                                if (checked && !customerId) {
                                                                    toast.error('Seleccioná un cliente primero');
                                                                    return;
                                                                }
                                                                field.onChange(checked);
                                                            }}
                                                            disabled={!customerId}
                                                            className="h-5 w-5"
                                                        />
                                                    </FormControl>
                                                </div>
                                            </div>
                                        </div>
                                    </FormItem>
                                )}
                            />

                            {/* Métodos de Pago */}
                            {isOnAccount ? null : (
                                <div className="bg-card border rounded-xl p-4 flex-1 flex flex-col">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium text-sm">Forma de Pago</span>
                                        </div>
                                    </div>

                                    {/* Lista de pagos */}
                                    <div className="space-y-2 flex-1">
                                        {paymentFields.map((field, index) => (
                                            <div
                                                key={field.id}
                                                className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg"
                                            >
                                                <FormField
                                                    control={form.control}
                                                    name={`payments.${index}.paymentMethod`}
                                                    render={({ field }) => (
                                                        <Select
                                                            onValueChange={field.onChange}
                                                            value={field.value}
                                                        >
                                                            <SelectTrigger className="h-9 flex-1">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {Object.values(PaymentMethod).map((method) => (
                                                                    <SelectItem key={method} value={method}>
                                                                        <div className="flex items-center gap-2">
                                                                            {PaymentMethodIcons[method]}
                                                                            {PaymentMethodLabels[method]}
                                                                        </div>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name={`payments.${index}.amount`}
                                                    render={({ field }) => (
                                                        <NumericInput
                                                            className="h-9 w-28 text-right font-medium"
                                                            value={field.value}
                                                            onFocus={(e) => e.target.select()}
                                                            onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number.parseFloat(e.target.value) || 0)}
                                                        />
                                                    )}
                                                />
                                                {paymentFields.length > 1 ? (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 text-destructive"
                                                        onClick={() => removePayment(index)}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                ) : null}
                                            </div>
                                        ))}

                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="w-full"
                                            onClick={() => appendPayment({
                                                paymentMethod: PaymentMethod.CASH,
                                                amount: pendingAmount > 0 ? pendingAmount : 0,
                                            })}
                                        >
                                            <Plus className="h-3 w-3 mr-1" />
                                            Agregar método de pago
                                        </Button>
                                    </div>

                                    {/* Resumen de pagos */}
                                    <div className="mt-4 pt-3 border-t space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Total a pagar</span>
                                            <span>{formatCurrency(total)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Pagado</span>
                                            <span>{formatCurrency(totalPayments)}</span>
                                        </div>
                                        <div className={cn(
                                            "flex justify-between font-bold pt-1",
                                            Math.abs(pendingAmount) < 0.01
                                                ? "text-emerald-600"
                                                : pendingAmount > 0
                                                    ? "text-amber-600"
                                                    : "text-emerald-600"
                                        )}>
                                            <span>{pendingAmount > 0 ? 'Pendiente' : 'Vuelto'}</span>
                                            <span>{formatCurrency(Math.abs(pendingAmount))}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Botón de cobrar */}
                            <Button
                                type="submit"
                                disabled={isLoading || items.length === 0 || total <= 0}
                                size="lg"
                                className={cn(
                                    "w-full h-16 text-xl font-bold shadow-lg transition-all",
                                    isOnAccount
                                        ? "bg-amber-500 hover:bg-amber-600"
                                        : "bg-emerald-500 hover:bg-emerald-600",
                                    (items.length === 0 || total <= 0) && "opacity-50"
                                )}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                                        Procesando...
                                    </>
                                ) : isOnAccount ? (
                                    <>
                                        <Clock className="mr-2 h-6 w-6" />
                                        Registrar en Cuenta
                                    </>
                                ) : (
                                    <>
                                        <Zap className="mr-2 h-6 w-6" />
                                        Cobrar {formatCurrency(total)}
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </form>
            </Form>

            {/* Diálogo para crear cliente */}
            <Dialog open={createCustomerOpen} onOpenChange={setCreateCustomerOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5" />
                            Crear Cliente Nuevo
                        </DialogTitle>
                        <DialogDescription>
                            Completá los datos del cliente. Se seleccionará automáticamente después de crearlo.
                        </DialogDescription>
                    </DialogHeader>
                    <CustomerForm
                        initialData={{
                            firstName: initialCustomerName.split(' ')[0] || '',
                            lastName: initialCustomerName.split(' ').slice(1).join(' ') || '',
                            isActive: true,
                        }}
                        onSubmit={handleCreateCustomer}
                        isLoading={createCustomerMutation.isPending}
                    />
                </DialogContent>
            </Dialog>

            {/* Diálogo para crear impuesto */}
            <Dialog open={isCreateTaxOpen} onOpenChange={setIsCreateTaxOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Crear Nuevo Impuesto</DialogTitle>
                        <DialogDescription>
                            Agregá un nuevo tipo de impuesto al sistema.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                Nombre
                            </Label>
                            <Input
                                id="name"
                                value={newTaxName}
                                onChange={(e) => setNewTaxName(e.target.value)}
                                className="col-span-3"
                                placeholder="Ej: Impuesto Interno"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="percentage" className="text-right">
                                Porcentaje
                            </Label>
                            <div className="col-span-3 relative">
                                <NumericInput
                                    id="percentage"
                                    value={newTaxPercentage}
                                    onChange={(e) => setNewTaxPercentage(e.target.value)}
                                    className="pr-8"
                                    placeholder="0"
                                />
                                <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateTaxOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleCreateTax} disabled={createTaxMutation.isPending || !newTaxName || !newTaxPercentage}>
                            {createTaxMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Crear Impuesto
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
