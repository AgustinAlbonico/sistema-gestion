# Dependencias del Instalador Electron

Este documento explica qué dependencias necesita el instalador de NexoPOS Desktop y cómo están configuradas para evitar errores de "Cannot find module".

## Problema

Cuando empaquetamos la aplicación con `electron-builder`, necesitamos incluir todas las dependencias que **NO** están bundleadas por Webpack. Esto incluye:

1. **Dependencias de Electron** (main process): `electron-updater`, `electron-log`, etc.
2. **Dependencias del Backend**: `express`, `pg` y todas sus subdependencias transitivas

## Arquitectura del Backend

### Ejecución del Backend

**En Producción**: El backend se ejecuta usando el **Node.js incluido en Electron** mediante `child_process.fork()`. Esto significa que:
- ✅ El usuario final NO necesita instalar Node.js
- ✅ El runtime es consistente (Node.js 25.x de Electron 30)
- ✅ No hay problemas de versiones de Node.js

**En Desarrollo**: El backend se ejecuta con `npx ts-node` del Node.js del sistema para hot-reload.

### Código Relevante

```typescript
// apps/desktop/electron/main.ts (línea ~460)
if (isDevMode) {
    // Desarrollo: usar ts-node del sistema
    backendProcess = spawn('npx', ['ts-node', '--transpile-only', mainFile], {...});
} else {
    // Producción: usar Node.js de Electron con fork()
    backendProcess = fork(mainFile, [], {
        execArgv: ['--no-deprecation'],
        ...
    });
}
```

## Solución Implementada

### 1. Dependencias de Electron (Main Process)

Las dependencias del main process de Electron se copian a `apps/desktop/node_modules/` usando el script `scripts/copy-deps.js`.

#### Lista de dependencias (17 total):

```javascript
const ELECTRON_DEPS = [
  // electron-updater y sus dependencias directas
  'electron-updater',
  'electron-log',
  'builder-util-runtime',
  'fs-extra',
  'graceful-fs',
  'universalify',
  'jsonfile',
  'lazy-val',
  'lodash.isequal',
  'lodash.escaperegexp', // Nueva dependencia de electron-updater 6.x
  'semver',
  'sax',
  'tiny-typed-emitter',
  // js-yaml y su dependencia (requerido por electron-updater 6.x)
  'js-yaml',
  'argparse',
  // debug y su dependencia (requerido por builder-util-runtime)
  'debug',
  'ms',
];
```

**Comando para copiar:**
```bash
node scripts/copy-deps.js
```

### 2. Dependencias del Backend (Express y PostgreSQL)

Las dependencias del backend se copian automáticamente por `electron-builder` usando la sección `extraResources` del archivo `electron-builder.yml`.

#### Lista de dependencias (80 total):

Se incluyen **TODAS** las dependencias transitivas de Express y PG para evitar errores de módulos faltantes.

**Dependencias principales:**
- `express` → 25 dependencias directas
- `pg` → 8 dependencias directas
- Subdependencias transitivas → 47 adicionales

**Dependencias críticas que causaban errores:**
- `array-flatten` (requerida por express)
- `side-channel-list`, `side-channel-map`, `side-channel-weakmap` (requeridas por qs → express)
- `call-bound`, `dunder-proto`, `get-proto`, `gopd` (requeridas por get-intrinsic)
- `es-define-property`, `es-object-atoms`, `math-intrinsics` (requeridas por es-errors)
- `negotiator` (requerida por accepts)
- `pg-int8` (requerida por pg)
- `split2`, `xtend` (requeridas por pg-protocol)

**Script para regenerar la lista:**
```bash
node scripts/copy-backend-deps.js
```

Este script:
1. Analiza recursivamente todas las dependencias de `express` y `pg`
2. Genera un archivo `backend-deps.txt` con la configuración para `electron-builder.yml`
3. Muestra el total de dependencias encontradas

## Configuración de electron-builder.yml

### Sección `files` (Dependencias de Electron)

```yaml
files:
  - dist/electron/**/*
  - dist/renderer/**/*
  - dist/scripts/**/*
  - build/**/*
  - package.json
  # Dependencias de Electron (copiadas por scripts/copy-deps.js)
  - node_modules/electron-updater/**/*
  - node_modules/electron-log/**/*
  - node_modules/builder-util-runtime/**/*
  # ... (17 dependencias en total)
  - node_modules/js-yaml/**/*
  - node_modules/argparse/**/*
  - node_modules/debug/**/*
  - node_modules/ms/**/*
```

### Sección `extraResources` (Dependencias del Backend)

```yaml
extraResources:
  # Backend bundleado con webpack
  - from: ../backend/dist-bundle
    to: backend/dist
    filter:
      - "**/*"
      - "!**/*.map"
  
  # Dependencias de runtime del backend (80 total)
  - from: ../../node_modules/express
    to: backend/node_modules/express
  - from: ../../node_modules/pg
    to: backend/node_modules/pg
  # ... (80 dependencias en total)
  - from: ../../node_modules/xtend
    to: backend/node_modules/xtend
```

## Proceso de Build

### Paso 1: Compilar Frontend y Backend

```bash
npm run build:frontend --workspace=@sistema/frontend
npm run build:bundle --workspace=@sistema/backend
```

### Paso 2: Compilar Electron

```bash
npm run build:electron --workspace=@sistema/desktop
```

### Paso 3: Copiar Dependencias de Electron

```bash
cd apps/desktop
node scripts/copy-deps.js
```

### Paso 4: Empaquetar con electron-builder

```bash
npx electron-builder --win --config electron-builder.yml
```

**O ejecutar todo junto:**
```bash
cd apps/desktop
npm run build
```

## Scripts Auxiliares

### `scripts/copy-deps.js`
Copia las 17 dependencias de Electron al directorio `apps/desktop/node_modules/`.

### `scripts/copy-backend-deps.js`
Analiza recursivamente las dependencias de Express y PG y genera la lista completa para `electron-builder.yml`.

**Cuándo usarlo:**
- Si actualizás la versión de Express o PG
- Si agregás una nueva dependencia al backend que NO se bundlea con Webpack
- Si aparece un error "Cannot find module" en el instalador

**Cómo usarlo:**
```bash
cd apps/desktop
node scripts/copy-backend-deps.js
# Copia el contenido de backend-deps.txt a electron-builder.yml
```

## Tamaño del Instalador

- **Backend bundleado**: ~11 MB
- **Dependencias de Electron**: ~5 MB
- **Dependencias del Backend**: ~8 MB
- **Frontend**: ~3 MB
- **Node.js runtime**: Incluido en Electron (~0 MB adicional)
- **Total aproximado**: ~30-35 MB (comprimido con NSIS)

## Requisitos de Sistema

### Usuario Final (Producción)

| Componente | ¿Necesita instalación separada? | Incluido en instalador |
|------------|----------------------------------|------------------------|
| PostgreSQL 14+ | ✅ SÍ | ❌ No |
| Node.js | ❌ NO | ✅ Sí (en Electron) |
| NexoPOS Desktop | ❌ NO (es el instalador) | ✅ Sí |

**El usuario final solo necesita instalar PostgreSQL.**

### Desarrollo

| Componente | ¿Necesita instalación? |
|------------|----------------------|
| PostgreSQL 14+ | ✅ SÍ |
| Node.js 18.x/20.x | ✅ SÍ (para compilar) |
| Git | ✅ SÍ (para clonar repo) |

## Troubleshooting

### Error: "Cannot find module 'XXX'"

**Causa:** Falta una dependencia en el instalador.

**Solución:**

1. **Si es una dependencia de Electron:**
   - Agregar a `ELECTRON_DEPS` en `scripts/copy-deps.js`
   - Agregar a la sección `files` en `electron-builder.yml`
   - Ejecutar `node scripts/copy-deps.js`

2. **Si es una dependencia del Backend:**
   - Ejecutar `node scripts/copy-backend-deps.js`
   - Copiar la salida al `electron-builder.yml` en la sección `extraResources`
   - Reconstruir el instalador

### Error: "node: command not found" o "npm: command not found"

**En Producción (usuario final):**

**Causa:** Error en el código - el sistema intenta usar Node.js del sistema en lugar del de Electron.

**Solución:** Verificar que `main.ts` use `fork()` en producción:
```typescript
if (!isDevMode) {
    backendProcess = fork(mainFile, [], {...});
}
```

**En Desarrollo:**

**Causa:** Node.js no está instalado en el sistema.

**Solución:** Instalar Node.js 18.x o 20.x LTS desde [nodejs.org](https://nodejs.org)

### Verificar qué se incluyó en el instalador

```bash
# Desempaquetar el instalador (sin instalar)
cd apps/desktop/release/win-unpacked

# Verificar dependencias de Electron
ls resources/app.asar.unpacked/node_modules

# Verificar dependencias del Backend
ls resources/backend/node_modules
```

## Notas Importantes

1. **Node.js está incluido**: El runtime de Node.js (v25.x) está incluido en Electron, por lo que el usuario final NO necesita instalarlo.

2. **fork() vs spawn()**: En producción usamos `fork()` en lugar de `spawn('node', ...)` para aprovechar el Node.js de Electron.

3. **No usar webpack para Express/PG**: Estas librerías tienen dependencias nativas y dinámicas que no se pueden bundlear correctamente.

4. **Mantener electron-builder.yml actualizado**: Si cambian las dependencias, regenerar con `copy-backend-deps.js`.

5. **Versiones críticas**:
   - `electron@30.0.0` → Incluye Node.js 25.x
   - `electron-updater@6.6.2` → Requiere `js-yaml`, `lodash.escaperegexp`
   - `express@4.22.1` → Requiere 25 dependencias directas + transitivas
   - `pg@8.16.3` → Requiere 8 dependencias directas + transitivas

6. **ASAR y unpacking**: Las dependencias de Electron están en `app.asar`, los módulos nativos (como `.node`) se desempaquetan automáticamente.

## Historial de Errores Resueltos

| Fecha | Error | Módulo Faltante | Solución |
|-------|-------|-----------------|----------|
| 2024-12-22 | `Cannot find module 'electron-updater'` | electron-updater | Agregar a files en electron-builder.yml |
| 2024-12-22 | `Cannot find module 'js-yaml'` | js-yaml | Dependencia de electron-updater 6.x |
| 2024-12-22 | `Cannot find module 'array-flatten'` | array-flatten | Dependencia de express |
| 2024-12-22 | `Cannot find module 'side-channel-list'` | side-channel-list | Dependencia de qs (usado por express) |
| 2024-12-22 | Usuario necesita instalar Node.js | - | Cambiar a `fork()` para usar Node.js de Electron |

## Arquitectura de Ejecución

```
┌─────────────────────────────────────────┐
│         NexoPOS.exe                     │
│  (Electron 30 + Node.js 25.x incluido)  │
└─────────────────────────────────────────┘
              │
              ├─── Main Process (Electron)
              │    │
              │    ├─── electron/main.ts
              │    │    │
              │    │    └─── fork() ──────────┐
              │    │                           │
              │    └─── Auto-updater           │
              │         PDF Generator          │
              │                                 ▼
              │                    ┌─────────────────────────┐
              │                    │  Backend (NestJS)       │
              │                    │  Ejecutado con Node.js  │
              │                    │  de Electron (fork)     │
              │                    └─────────────────────────┘
              │                                 │
              │                                 ▼
              │                    ┌─────────────────────────┐
              │                    │  PostgreSQL             │
              │                    │  (instalación separada) │
              │                    └─────────────────────────┘
              │
              └─── Renderer Process
                   │
                   └─── React Frontend
```

## Última Actualización

**Fecha:** 22 de diciembre de 2024  
**Versión de NexoPOS:** 1.0.4  
**Total de dependencias incluidas:** 97 (17 Electron + 80 Backend)  
**Node.js requerido para usuario final:** ❌ NO (incluido en Electron)
