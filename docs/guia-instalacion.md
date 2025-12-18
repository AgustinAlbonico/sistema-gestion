# Guía de Instalación - NexoPOS

Guía completa para instalar el sistema NexoPOS en equipos de clientes.

---

## Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────────────┐
│                         PC SERVIDOR                               │
│  ┌─────────────┐                                                  │
│  │ PostgreSQL  │ ◄─── Las terminales se conectan a esta BD       │
│  │   (BD)      │      Puerto: 5432                                │
│  └─────────────┘                                                  │
│                                                                    │
│  ┌─────────────┐                                                  │
│  │  NexoPOS    │      (Opcional - puede estar cerrada)            │
│  │   (App)     │                                                  │
│  └─────────────┘                                                  │
└──────────────────────────────────────────────────────────────────┘
        ▲                            ▲
        │ Conexión a BD              │ Conexión a BD
        │ (localhost:5432)           │ (IP_SERVIDOR:5432)
        │                            │
┌───────┴───────┐            ┌───────┴───────┐
│  PC SERVIDOR  │            │   PC CLIENTE  │
│   (NexoPOS)   │            │   (NexoPOS)   │
│ Backend local │            │ Backend local │
└───────────────┘            └───────────────┘
```

> **Ventaja**: Cada PC corre su propia instancia de NexoPOS. Solo necesitan que PostgreSQL esté corriendo en el servidor (no necesitan que la app esté abierta).

---

## 1. Instalación del Servidor (PC Principal)

### 1.1 Instalar PostgreSQL

1. **Descargar** desde [postgresql.org](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads) (versión 18).

2. **Ejecutar instalador**:
   - Componentes: solo necesita "PostgreSQL Server" y "Command Line Tools"
   - **Usuario**: `postgres`
   - **Contraseña**: definir una segura (ej: `NexoPOS2024!`)
   - **Puerto**: `5432` (dejar por defecto)
   - **Configuración regional**: `es-AR`

### 1.2 Crear Base de Datos

Abrir **PowerShell** y ejecutar:

```powershell
cd "C:\Program Files\PostgreSQL\18\bin"
.\createdb -U postgres nexopos
```

> Se pedirá la contraseña de PostgreSQL.

### 1.3 Configurar PostgreSQL para Conexiones Remotas

> [!IMPORTANT]  
> Este paso es **obligatorio** si habrá terminales cliente conectándose desde otras PCs.

#### Paso A: Modificar `postgresql.conf`

1. Abrir el archivo:
   ```
   C:\Program Files\PostgreSQL\18\data\postgresql.conf
   ```

2. Buscar la línea `listen_addresses` y cambiarla a:
   ```
   listen_addresses = '*'
   ```
   
   > Nota: Si la línea está comentada (empieza con `#`), quitar el `#`.

3. Guardar el archivo.

#### Paso B: Modificar `pg_hba.conf`

1. Abrir el archivo:
   ```
   C:\Program Files\PostgreSQL\18\data\pg_hba.conf
   ```

2. Agregar esta línea al final (antes de cualquier comentario):
   ```
   host    all    all    0.0.0.0/0 md5
   host    all    all    192.168.0.0/16    scram-sha-256
   ```
   
   > Esto permite conexiones desde cualquier IP que empiece con `192.168.x.x` (red local típica).

3. Guardar el archivo.

#### Paso C: Reiniciar PostgreSQL

Abrir **PowerShell como Administrador** y ejecutar:

```powershell
Restart-Service postgresql-x64-18
```

> Nota: El nombre del servicio puede variar según la versión. Usar `Get-Service *postgres*` para verificar.

### 1.4 Configurar Firewall de Windows

1. Abrir "**Firewall de Windows Defender con seguridad avanzada**"
2. Ir a "**Reglas de entrada**" → "**Nueva regla...**"
3. Configurar:
   - Tipo: **Puerto**
   - Protocolo: **TCP**
   - Puerto: **5432**
   - Acción: **Permitir la conexión**
   - Perfil: marcar todos (Dominio, Privado, Público)
   - Nombre: `PostgreSQL NexoPOS`

### 1.5 Instalar NexoPOS en el Servidor

1. Ejecutar `NexoPOS-Setup.exe`
2. Al abrir la app, aparecerá el **Asistente de Configuración**
3. Seleccionar "**PC Principal**" (o Modo Servidor)
4. Completar datos:
   - **Host**: `localhost`
   - **Puerto**: `5432`
   - **Base de datos**: `nexopos`
   - **Usuario**: `postgres`
   - **Contraseña**: (la que definiste)
5. Clic en "**Probar conexión**" y luego "**Guardar**"

La app creará las tablas automáticamente y estará lista para usar.

### 1.6 Obtener IP del Servidor

En **PowerShell** del servidor, ejecutar:

```powershell
ipconfig
```

Buscar la línea "**Dirección IPv4**" (ej: `192.168.1.100`). Anotar esta IP para las terminales cliente.

---

## 2. Instalación de Terminales Cliente

> [!NOTE]  
> Los clientes **NO necesitan** instalar PostgreSQL. Solo instalan NexoPOS y se conectan a la BD del servidor.

### 2.1 Verificar Conectividad

Antes de instalar, verificar que la PC cliente puede "ver" al servidor.

Abrir **PowerShell** y ejecutar:

```powershell
Test-NetConnection -ComputerName 192.168.1.100 -Port 5432
```

> Reemplazar `192.168.1.100` con la IP real del servidor.

Resultado esperado: `TcpTestSucceeded : True`

Si falla:
- Verificar que ambas PCs están en la misma red
- Verificar el firewall del servidor (paso 1.4)
- Verificar que PostgreSQL acepta conexiones remotas (pasos 1.3)

### 2.2 Instalar NexoPOS

1. Ejecutar `NexoPOS-Setup.exe` en la PC cliente
2. Al abrir, aparecerá el **Asistente de Configuración**
3. Seleccionar "**Terminal Adicional**" (o Modo Cliente)
4. Completar datos:
   - **Host**: `192.168.1.100` (IP del servidor)
   - **Puerto**: `5432`
   - **Base de datos**: `nexopos`
   - **Usuario**: `postgres`
   - **Contraseña**: (la misma del servidor)
5. Clic en "**Probar conexión**" y luego "**Guardar**"

La app se conectará a la BD remota y estará lista para usar.

---

## 3. Solución de Problemas

### Error: "Connection refused" o "No se puede conectar"

1. **Verificar que PostgreSQL está corriendo** en el servidor:
   ```powershell
   Get-Service *postgres*
   ```
   Estado debe ser "Running".

2. **Verificar firewall** del servidor (puerto 5432 abierto).

3. **Verificar `pg_hba.conf`** - la IP del cliente debe estar permitida.

4. **Verificar `postgresql.conf`** - `listen_addresses = '*'`.

### Error: "Identificación fallida / Password authentication failed"

- La contraseña de PostgreSQL es incorrecta.
- El usuario no es `postgres` o se escribió mal.

### Error: "La base de datos no existe"

- No se ejecutó el comando `createdb`.
- El nombre de la BD es distinto (verificar mayúsculas/minúsculas).

### La terminal cliente no sincroniza datos

- Verificar que apunta a la misma BD que el servidor.
- Refrescar la página/pantalla para ver cambios recientes.

---

## 4. Gestión Remota

### Baja del Servicio (bloquear acceso)

Si necesitás deshabilitar el sistema remotamente:

1. Conectarte a la PC servidor (VPN, AnyDesk, TeamViewer, etc.)
2. Abrir PowerShell y ejecutar:
   ```powershell
   cd "C:\Program Files\PostgreSQL\18\bin"
   .\psql -U postgres -d nexopos -c "UPDATE system_configuration SET \"sistemaHabilitado\" = false, \"mensajeDeshabilitado\" = 'Servicio suspendido - Contacte a soporte';"
   ```

Para reactivar:
```powershell
.\psql -U postgres -d nexopos -c "UPDATE system_configuration SET \"sistemaHabilitado\" = true;"
```

### Backup de la Base de Datos

```powershell
cd "C:\Program Files\PostgreSQL\18\bin"
.\pg_dump -U postgres -F c -f "C:\Backups\nexopos_backup.dump" nexopos
```

> Crear la carpeta `C:\Backups` previamente.

---

## 5. Checklist de Instalación

### PC Servidor
- [ ] PostgreSQL instalado
- [ ] Base de datos `nexopos` creada
- [ ] `postgresql.conf` → `listen_addresses = '*'`
- [ ] `pg_hba.conf` → regla para red local agregada
- [ ] Servicio PostgreSQL reiniciado
- [ ] Firewall → puerto 5432 abierto
- [ ] NexoPOS instalado y configurado
- [ ] IP del servidor anotada

### PC Cliente (cada terminal)
- [ ] Conectividad verificada con `Test-NetConnection`
- [ ] NexoPOS instalado
- [ ] Configurado con IP del servidor y credenciales de BD

---

## 6. Datos de Acceso por Defecto

| Campo | Valor |
|-------|-------|
| **Usuario inicial** | `admin` |
| **Contraseña inicial** | `Admin123` |

> [!WARNING]  
> Cambiar la contraseña del usuario `admin` después del primer inicio de sesión.
