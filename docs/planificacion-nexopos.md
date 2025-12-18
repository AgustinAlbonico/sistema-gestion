# 🎯 NexoPOS - Estudio de Mercado y Planificación Completa

## 1. Análisis de Mercado POS Argentina 2024

### 1.1 Competidores Principales

| Sistema | Precio/mes | Fortalezas | Debilidades |
|---------|------------|------------|-------------|
| **Alegra** | $12k-40k | Cloud, soporte 24/7, reportes | Sin fidelización, básico |
| **Contabilium** | $15k-50k | Multi-sucursal, contabilidad | Interfaz anticuada |
| **Bamboo** | $8k-25k | Económico, offline | Limitado en integraciones |
| **POSBerry** | $10k-35k | Offline, CRM básico | Sin e-commerce |
| **Final POS** | $15k-40k | Restaurantes, turnos | Solo gastronomía |

### 1.2 Features Estándar del Mercado

Cualquier POS que se quiera vender **debe tener** estas funcionalidades como mínimo:

**HARDWARE:**
- ✅ Lector código de barras (USB/Bluetooth)
- ✅ Impresora térmica de tickets (58mm/80mm)
- ✅ Cajón de dinero (apertura automática)
- ✅ Pantalla táctil (opcional)

**SOFTWARE:**
- ✅ Escaneo por código de barras
- ✅ Búsqueda rápida de productos
- ✅ Múltiples métodos de pago
- ✅ Facturación electrónica AFIP
- ✅ Control de stock en tiempo real
- ✅ Apertura y cierre de caja
- ✅ Gestión de clientes
- ✅ Reportes de ventas
- ✅ Gestión de usuarios con permisos
- ✅ Backups automáticos

---

## 2. GAP Analysis: Estado Actual vs MVP

### ✅ LO QUE YA TENÉS (Implementado)

| Funcionalidad | Estado | Calidad |
|---------------|--------|---------|
| Login / Usuarios | ✅ | Buena |
| Ventas con multi-pago | ✅ | Muy buena |
| Facturación AFIP A, B, C | ✅ | Excelente |
| Productos con categorías | ✅ | Buena |
| Control de stock | ✅ | Buena |
| Clientes + Cuentas Corrientes | ✅ | Muy buena |
| Caja registradora | ✅ | Muy buena |
| Compras a proveedores | ✅ | Buena |
| Gastos e ingresos | ✅ | Buena |
| Reportes financieros | ✅ | Buena |
| Dashboard con KPIs | ✅ | Muy buena |
| Backups automáticos | ✅ | Buena |
| Auditoría | ✅ | Buena |
| App Desktop (Electron) | ✅ | Buena |

### ❌ LO QUE FALTA PARA MVP (Crítico)

| Funcionalidad | Prioridad | Esfuerzo | Descripción |
|---------------|-----------|----------|-------------|
| **Escaneo código barras** | 🔴 CRÍTICO | 2d | Detectar input de scanner, buscar producto automático |
| **Impresora térmica** | 🔴 CRÍTICO | 3d | ESC/POS, configuración, tickets personalizables |
| **Cajón de dinero** | 🔴 CRÍTICO | 1d | Apertura automática al cobrar (via impresora) |
| **Configuración de hardware** | 🔴 CRÍTICO | 2d | UI para seleccionar impresora/puerto |
| **Devoluciones** | 🔴 CRÍTICO | 3d | Flujo completo + Nota de Crédito AFIP |
| **Perfiles de negocio** | 🟡 ALTO | 2d | Feature flags por rubro |
| **Venta por peso** | 🟡 ALTO | 2d | Para dietéticas, carnicerías |
| **Atajos de teclado** | 🟡 ALTO | 1d | F1-F12 para operaciones rápidas |
| **Ticket personalizable** | 🟡 ALTO | 1d | Logo, mensaje, formatos |
| **Modo offline** | 🟡 ALTO | 3d | Cola de ventas sin conexión |

---

## 3. Detalle de Funcionalidades Faltantes

### 3.1 🔴 Escaneo de Código de Barras

**El problema actual:**
- El SaleForm busca productos por texto
- No detecta automáticamente el escaneo de un lector
- El usuario tiene que hacer click en el campo de búsqueda

**Cómo funciona un lector de código de barras:**
- Los lectores USB actúan como teclado
- Envían los caracteres del código muy rápido
- Terminan con un Enter (o carácter configurable)

**Solución técnica:**
```typescript
// Hook para detectar escaneo de código de barras
function useBarcodeScanner(onScan: (barcode: string) => void) {
  const [buffer, setBuffer] = useState('');
  const [lastKeyTime, setLastKeyTime] = useState(0);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      
      // Si pasó más de 100ms desde la última tecla, resetear
      if (now - lastKeyTime > 100) {
        setBuffer('');
      }
      
      setLastKeyTime(now);
      
      if (e.key === 'Enter' && buffer.length >= 8) {
        // Es un código de barras completo
        onScan(buffer);
        setBuffer('');
        e.preventDefault();
      } else if (e.key.length === 1) {
        setBuffer(prev => prev + e.key);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [buffer, lastKeyTime, onScan]);
}
```

**Cambios necesarios:**
1. Crear hook `useBarcodeScanner`
2. Integrar en `SaleForm.tsx`
3. Al escanear: buscar producto por barcode, agregar automáticamente
4. Feedback sonoro (beep) al escanear exitosamente
5. Mensaje de error si producto no encontrado

---

### 3.2 🔴 Impresora Térmica (ESC/POS)

**Cómo funciona:**
- Las impresoras térmicas usan el protocolo ESC/POS
- Se envían comandos binarios para formato, corte, etc.
- Conexión: USB, Ethernet, o Bluetooth

**Librería recomendada (ya investigada):**
```bash
npm install node-thermal-printer
```

**Implementación:**
```typescript
// backend/src/modules/printing/printing.service.ts
import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer';

@Injectable()
export class PrintingService {
  private printer: ThermalPrinter;
  
  async configurePrinter(config: PrinterConfig) {
    this.printer = new ThermalPrinter({
      type: PrinterTypes.EPSON, // o STAR, etc.
      interface: config.interface, // 'tcp://192.168.1.100' o '/dev/usb/lp0'
      width: config.paperWidth, // 42 (58mm) o 48 (80mm)
    });
  }
  
  async printReceipt(sale: Sale, businessInfo: BusinessInfo) {
    // Cabecera
    await this.printer.alignCenter();
    if (businessInfo.logo) {
      await this.printer.printImage(businessInfo.logo);
    }
    await this.printer.println(businessInfo.name);
    await this.printer.println(businessInfo.address);
    await this.printer.println(`CUIT: ${businessInfo.cuit}`);
    
    // Separador
    await this.printer.drawLine();
    
    // Items
    await this.printer.alignLeft();
    for (const item of sale.items) {
      await this.printer.println(`${item.quantity}x ${item.productName}`);
      await this.printer.alignRight();
      await this.printer.println(`$${item.total.toFixed(2)}`);
      await this.printer.alignLeft();
    }
    
    // Totales
    await this.printer.drawLine();
    await this.printer.alignRight();
    await this.printer.println(`TOTAL: $${sale.total.toFixed(2)}`);
    
    // Pie
    await this.printer.alignCenter();
    await this.printer.println(businessInfo.footerMessage || 'Gracias por su compra!');
    
    // QR si es factura fiscal
    if (sale.invoice?.qrData) {
      await this.printer.printQR(sale.invoice.qrData);
    }
    
    // Cortar papel
    await this.printer.cut();
    
    // Abrir cajón
    await this.printer.openCashDrawer();
    
    // Ejecutar
    await this.printer.execute();
  }
}
```

**Entidades nuevas:**
```typescript
// PrinterConfiguration
@Entity('printer_configurations')
export class PrinterConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column()
  name: string; // "Impresora Caja 1"
  
  @Column({ type: 'enum', enum: ['USB', 'NETWORK', 'BLUETOOTH'] })
  connectionType: string;
  
  @Column({ nullable: true })
  usbVendorId: string;
  
  @Column({ nullable: true })
  usbProductId: string;
  
  @Column({ nullable: true })
  networkAddress: string; // "192.168.1.100:9100"
  
  @Column({ type: 'enum', enum: ['EPSON', 'STAR', 'BIXOLON', 'GENERIC'] })
  printerBrand: string;
  
  @Column({ type: 'int', default: 80 })
  paperWidth: number; // 58 o 80 mm
  
  @Column({ type: 'boolean', default: true })
  isDefault: boolean;
  
  @Column({ type: 'boolean', default: true })
  autoPrint: boolean; // Imprimir automáticamente al vender
  
  @Column({ type: 'boolean', default: true })
  openCashDrawer: boolean;
}
```

---

### 3.3 🔴 Configuración de Hardware

**Pantalla de configuración:**
```
Configuración > Hardware
├── Impresoras
│   ├── Agregar impresora
│   ├── Test de impresión
│   ├── Seleccionar impresora por defecto
│   └── Configurar ancho de papel
├── Lectores de código
│   ├── Configurar prefijo/sufijo
│   ├── Configurar timeout
│   └── Test de escaneo
└── Cajón de dinero
    ├── Vincular a impresora
    └── Apertura automática (sí/no)
```

---

### 3.4 🔴 Devoluciones y Notas de Crédito

**Flujo:**
1. Buscar venta original (por número o escanear ticket)
2. Seleccionar productos a devolver
3. Ingresar motivo
4. Generar Nota de Crédito AFIP (si era fiscal)
5. Actualizar stock (reingresar productos)
6. Procesar reembolso (efectivo, crédito en CC)

**Entidades:**
```typescript
@Entity('returns')
export class Return {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column()
  returnNumber: string; // DEV-0001
  
  @ManyToOne(() => Sale)
  originalSale: Sale;
  
  @Column({ type: 'date' })
  returnDate: Date;
  
  @Column({ type: 'text' })
  reason: string;
  
  @OneToMany(() => ReturnItem, item => item.return)
  items: ReturnItem[];
  
  @Column({ type: 'decimal' })
  totalRefund: number;
  
  @Column({ type: 'enum', enum: ['CASH', 'CREDIT_NOTE', 'ACCOUNT'] })
  refundMethod: string;
  
  @ManyToOne(() => Invoice, { nullable: true })
  creditNote: Invoice; // NC AFIP asociada
}
```

---

### 3.5 🟡 Atajos de Teclado

**Esenciales para velocidad:**

| Atajo | Acción |
|-------|--------|
| `F1` | Nueva venta |
| `F2` | Buscar producto |
| `F3` | Buscar cliente |
| `F4` | Aplicar descuento |
| `F5` | Cambiar método de pago |
| `F7` | Anular último item |
| `F8` | Cancelar venta |
| `F10` | Cobrar (finalizar venta) |
| `F12` | Abrir cajón |
| `Esc` | Cancelar/Cerrar modal |
| `Enter` | Confirmar acción |

**Implementación:**
```typescript
// Hook global de atajos
function useHotkeys(keyMap: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      if (keyMap[key]) {
        e.preventDefault();
        keyMap[key]();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keyMap]);
}
```

---

## 4. Roadmap Actualizado

### 📍 MVP v1.0 - "Vendible" (4-5 semanas)

**Semana 1-2: Hardware**
- [ ] Hook `useBarcodeScanner`
- [ ] Integración lector en SaleForm
- [ ] Servicio de impresión ESC/POS
- [ ] Entidad `PrinterConfiguration`
- [ ] UI de configuración de impresora
- [ ] Test de impresión

**Semana 3: Core faltante**
- [ ] Devoluciones + Nota de Crédito AFIP
- [ ] Atajos de teclado globales
- [ ] Ticket personalizable (logo, mensaje)

**Semana 4: Multi-vertical**
- [ ] Perfiles de negocio (feature flags)
- [ ] Venta por peso (productos fraccionados)
- [ ] Wizard de configuración inicial

**Semana 5: Polish**
- [ ] Tests con hardware real
- [ ] Documentación usuario
- [ ] Fix de bugs encontrados
- [ ] Cliente piloto

---

### 📍 v1.1 - "Profesional" (+4 semanas)

- [ ] Modo offline (cola de ventas)
- [ ] Cuotas y financiación
- [ ] Control de vencimientos
- [ ] Listas de precios múltiples
- [ ] Etiquetas de precio (impresión)
- [ ] Retiros parciales de caja

---

### 📍 v2.0 - "Enterprise" (+6 semanas)

- [ ] Multi-sucursal
- [ ] Programa de fidelización
- [ ] Integración e-commerce
- [ ] App móvil para dueño
- [ ] Predicción de demanda

---

## 5. Hardware Recomendado para Venta

### Kit Básico (~$150.000)
- Impresora térmica 80mm USB (Epson TM-T20II o similar): $80.000
- Lector código barras USB (Honeywell/Zebra): $40.000
- Cajón de dinero 4 billetes/8 monedas: $30.000

### Kit Completo (~$350.000)
- Todo lo anterior +
- Tablet 10" con soporte: $150.000
- Lector inalámbrico Bluetooth: $50.000

---

## 6. Modelo de Negocio Sugerido

### Precios Mensuales

| Plan | Precio | Incluye |
|------|--------|---------|
| **Starter** | $15.000 | 1 sucursal, 2 usuarios, AFIP |
| **Pro** | $30.000 | 1 sucursal, 5 usuarios, + fidelización |
| **Business** | $50.000 | 3 sucursales, 10 usuarios, + e-commerce |
| **Enterprise** | Consultar | Ilimitado, API, soporte premium |

### Ingresos Adicionales

- Setup/Instalación: $30.000-50.000
- Hardware (reventa): Margen 15-25%
- Capacitación presencial: $20.000
- Integraciones custom: $10.000/hora
- Soporte premium: $10.000/mes

---

## 7. Conclusión

El sistema tiene una **base muy sólida** (facturación AFIP, ventas, inventario), pero le faltan **funcionalidades críticas de hardware** para poder venderse:

1. **Escaneo de código de barras** - Sin esto no es usable en comercios
2. **Impresión de tickets** - Obligatorio para cualquier POS
3. **Apertura de cajón** - Esperado por cualquier comerciante

Con **4-5 semanas de desarrollo enfocado** se puede tener un MVP realmente vendible.

La ventaja competitiva estará en:
- Multi-vertical (un software para todos los rubros)
- AFIP nativo (no como add-on)
- Desktop offline (no depende de internet)
- Precio competitivo vs Alegra/Contabilium
