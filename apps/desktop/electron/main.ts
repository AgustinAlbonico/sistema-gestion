import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess, execSync } from 'child_process';
import log from 'electron-log';

// ============================================
// CONFIGURACIÓN DE LOGS
// ============================================

/**
 * Obtiene la ruta del archivo de logs y se asegura de que el directorio exista.
 * NOTA: Esta función se ejecuta ANTES de que app.whenReady() se complete,
 * por lo que no podemos usar app.getPath('userData'). Usamos rutas absolutas.
 */
function getLogPath(): string {
    let logPath: string;

    if (!app.isPackaged) {
        // En desarrollo: logs/main.log en la raíz del proyecto desktop
        logPath = path.join(__dirname, '../../logs/main.log');
    } else {
        // En producción: Construir la ruta manualmente porque app.getPath() 
        // no funciona antes del evento 'ready'
        // Windows: %APPDATA%/NexoPOS/logs/main.log
        // Linux: ~/.config/NexoPOS/logs/main.log
        // macOS: ~/Library/Application Support/NexoPOS/logs/main.log
        const appName = 'NexoPOS';
        let userDataDir: string;

        if (process.platform === 'win32') {
            userDataDir = path.join(process.env.APPDATA || '', appName);
        } else if (process.platform === 'darwin') {
            userDataDir = path.join(process.env.HOME || '', 'Library', 'Application Support', appName);
        } else {
            userDataDir = path.join(process.env.HOME || '', '.config', appName);
        }

        logPath = path.join(userDataDir, 'logs', 'main.log');
    }

    // Asegurar que el directorio de logs exista
    const logDir = path.dirname(logPath);
    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    } catch (err) {
        // Si falla la creación del directorio, loguear a stderr
        process.stderr.write(`[Electron] Error creando directorio de logs: ${err}\n`);
    }

    return logPath;
}

log.transports.file.level = 'info';
log.transports.console.level = 'info';
log.transports.file.resolvePathFn = getLogPath;

// Capturar errores no manejados
log.catchErrors();

// Redirigir console.log a electron-log para capturar todo
console.log = log.log;
console.error = log.error;
console.warn = log.warn;
console.info = log.info;

log.info('----------------------------------------------');
log.info('Iniciando NexoPOS Desktop...');
log.info('----------------------------------------------');

// ============================================
// CONFIGURACIÓN
// ============================================

const isDev = !app.isPackaged;

/** Ruta del icono de la aplicación */
// En dev: dist/electron -> dist -> desktop -> build/icon.ico
// En prod: dist/electron -> dist -> app -> build/icon.ico
const ICON_PATH = path.join(__dirname, '../../build/icon.ico');

// Configurar App User Model ID para que Windows agrupe correctamente la app y muestre el icono
if (process.platform === 'win32') {
    app.setAppUserModelId('com.nexopos.app');
}

/** Puerto del backend */
const BACKEND_PORT = 3000;

/**
 * Mata cualquier proceso que esté escuchando en un puerto específico (Windows)
 */
function killProcessOnPort(port: number): void {
    try {
        // Buscar el PID del proceso que usa el puerto
        const result = execSync(
            `netstat -ano | findstr :${port} | findstr LISTENING`,
            { encoding: 'utf-8', timeout: 5000 }
        );

        // Parsear el PID de la salida
        const lines = result.trim().split('\n');
        const pids: string[] = [];

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && /^\d+$/.test(pid) && pid !== '0' && !pids.includes(pid)) {
                pids.push(pid);
            }
        }

        // Matar cada proceso encontrado
        for (const pid of pids) {
            try {
                log.info(`[Electron] Matando proceso PID ${pid} en puerto ${port}`);
                execSync(`taskkill /F /PID ${pid} /T`, { timeout: 5000 });
            } catch (e) {
                // Ignorar errores si el proceso ya terminó
            }
        }
    } catch (e) {
        // No hay proceso en ese puerto, está bien
        log.info(`[Electron] No se encontró proceso en puerto ${port}`);
    }
}

/** Puerto del frontend en desarrollo */
const FRONTEND_DEV_PORT = 5173;

// ============================================
// VARIABLES GLOBALES
// ============================================

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendReady = false;

// ============================================
// FUNCIONES DEL BACKEND
// ============================================

/**
 * Parsea un archivo .env simple (clave=valor)
 * Implementación manual para evitar dependencia de 'dotenv' que falla en el build
 */
function parseEnvFile(filePath: string): Record<string, string> {
    const envVars: Record<string, string> = {};
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
            // Ignorar comentarios y líneas vacías
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('#')) continue;

            // Separar clave=valor (solo en el primer =)
            const separatorIndex = trimmedLine.indexOf('=');
            if (separatorIndex === -1) continue;

            const key = trimmedLine.substring(0, separatorIndex).trim();
            let value = trimmedLine.substring(separatorIndex + 1).trim();

            // Quitar comillas simples o dobles si existen
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            envVars[key] = value;
        }
    } catch (error) {
        log.error(`[Electron] Error al leer .env en ${filePath}:`, error);
    }
    return envVars;
}

/**
 * Carga variables de entorno desde un archivo .env externo (si existe)
 * Prioridad: 
 * 1. .env junto al ejecutable (producción)
 * 2. .env en raíz del proyecto (desarrollo)
 */
function loadExternalEnv(): Record<string, string> {
    const envVars: Record<string, string> = {};

    // Rutas posibles para el archivo .env
    const possiblePaths = [];

    if (isDev) {
        // En desarrollo: primero apps/desktop/.env, luego raíz del monorepo
        possiblePaths.push(path.join(__dirname, '../../.env')); // dist/electron -> dist -> desktop
        possiblePaths.push(path.join(__dirname, '../../../../.env')); // Raíz del monorepo
    } else {
        // En producción: junto al ejecutable (.exe)
        const exeDir = path.dirname(app.getPath('exe'));
        possiblePaths.push(path.join(exeDir, '.env'));

        // También buscar en resources (útil para debug)
        possiblePaths.push(path.join(process.resourcesPath, '.env'));
    }

    log.info(`[Electron] Buscando configuración externa en: ${JSON.stringify(possiblePaths)}`);

    for (const envPath of possiblePaths) {
        if (fs.existsSync(envPath)) {
            log.info(`[Electron] Cargando configuración desde: ${envPath}`);
            const parsed = parseEnvFile(envPath);
            Object.assign(envVars, parsed);
            log.info(`[Electron] Variables cargadas: ${Object.keys(parsed).join(', ')}`);
            break; // Cargar solo el primero que encuentre
        }
    }

    return envVars;
}

/**
 * Obtiene la ruta del directorio del backend
 */
function getBackendPath(): string {
    if (isDev) {
        // Desde dist/electron/ necesitamos ir a apps/backend/
        return path.join(__dirname, '../../../backend');
    }
    return path.join(process.resourcesPath, 'backend');
}

/**
 * Inicia el servidor backend NestJS
 */
async function startBackend(): Promise<void> {
    return new Promise((resolve, reject) => {
        const backendDir = getBackendPath();

        // Cargar variables externas
        const externalEnv = loadExternalEnv();

        // En desarrollo usamos ts-node, en producción node
        const isDevMode = isDev;
        const mainFile = isDevMode
            ? path.join(backendDir, 'src/main.ts')
            : path.join(backendDir, 'dist/main.js');

        log.info(`[Electron] Iniciando backend desde: ${backendDir}`);
        log.info(`[Electron] mainFile: ${mainFile}`);
        log.info(`[Electron] mainFile existe: ${fs.existsSync(mainFile)}`);

        // Verificar que el archivo existe antes de continuar
        if (!fs.existsSync(mainFile)) {
            const error = new Error(`Backend main file not found: ${mainFile}`);
            log.error('[Electron] ERROR: ' + error.message);
            reject(error);
            return;
        }

        // En desarrollo: npx ts-node, en producción: node directamente
        let command: string;
        let args: string[];

        if (isDevMode) {
            command = 'npx';
            args = ['ts-node', '--transpile-only', mainFile];
        } else {
            // En producción, usar node del sistema
            command = 'node';
            args = [mainFile];
        }

        log.info(`[Electron] Comando: ${command} ${args.join(' ')}`);
        log.info(`[Electron] CWD: ${backendDir}`);

        // Variables de entorno para el backend
        const backendEnv = {
            ...process.env,
            ...externalEnv, // Sobreescribimos con las del archivo .env
            BACKEND_PORT: externalEnv.BACKEND_PORT || process.env.BACKEND_PORT || String(BACKEND_PORT),
            NODE_ENV: isDev ? 'development' : 'production',
            // Base de datos local (defaults si no están en .env)
            DATABASE_HOST: externalEnv.DATABASE_HOST || process.env.DATABASE_HOST || 'localhost',
            DATABASE_PORT: externalEnv.DATABASE_PORT || process.env.DATABASE_PORT || '5432',
            DATABASE_USER: externalEnv.DATABASE_USER || process.env.DATABASE_USER || 'postgres',
            DATABASE_PASSWORD: externalEnv.DATABASE_PASSWORD || process.env.DATABASE_PASSWORD || 'postgres',
            DATABASE_NAME: externalEnv.DATABASE_NAME || process.env.DATABASE_NAME || 'nexopos',
        };

        log.info('[Electron] Variables de entorno del backend: ' + JSON.stringify({
            DATABASE_HOST: backendEnv.DATABASE_HOST,
            DATABASE_PORT: backendEnv.DATABASE_PORT,
            DATABASE_NAME: backendEnv.DATABASE_NAME,
            DATABASE_USER: backendEnv.DATABASE_USER,
            BACKEND_PORT: backendEnv.BACKEND_PORT,
            NODE_ENV: backendEnv.NODE_ENV,
        }));

        try {
            backendProcess = spawn(command, args, {
                cwd: backendDir,
                env: backendEnv as NodeJS.ProcessEnv,
                shell: true,
                stdio: ['pipe', 'pipe', 'pipe'],
                // En Windows, necesitamos windowsHide para evitar ventanas de consola
                windowsHide: true,
            });

            log.info(`[Electron] Proceso backend iniciado con PID: ${backendProcess.pid}`);
        } catch (spawnError) {
            log.error('[Electron] Error al hacer spawn del backend: ' + spawnError);
            reject(spawnError);
            return;
        }

        // Capturar salida estándar
        backendProcess.stdout?.on('data', (data: Buffer) => {
            const output = data.toString();
            log.info(`[Backend] ${output.trim()}`);

            // Detectar cuando el backend está listo
            if (output.includes('listening on') || output.includes('Nest application successfully started')) {
                backendReady = true;
                log.info('[Electron] Backend listo!');
                resolve();
            }
        });

        // Capturar errores
        backendProcess.stderr?.on('data', (data: Buffer) => {
            log.error(`[Backend Error] ${data.toString().trim()}`);
        });

        // Manejar error de spawn
        backendProcess.on('error', (error: Error) => {
            log.error('[Electron] Error al iniciar backend: ' + error.message);
            reject(error);
        });

        // Manejar cierre del proceso
        backendProcess.on('exit', (code: number | null) => {
            log.info(`[Electron] Backend terminó con código: ${code}`);
            backendReady = false;
            backendProcess = null;
        });

        // Timeout de seguridad (30 segundos ahora, migraciones pueden tardar)
        setTimeout(() => {
            if (!backendReady) {
                log.warn('[Electron] Timeout esperando backend, continuando... (puede que las migraciones sigan corriendo)');
                resolve();
            }
        }, 30000);
    });
}

/**
 * Detiene el servidor backend
 */
function stopBackend(): void {
    log.info('[Electron] Deteniendo backend...');

    // 1. Matar el proceso del backend si existe
    if (backendProcess && backendProcess.pid) {
        log.info(`[Electron] Matando proceso backend PID: ${backendProcess.pid}`);
        try {
            if (process.platform === 'win32') {
                execSync(`taskkill /F /PID ${backendProcess.pid} /T`, { timeout: 5000 });
            } else {
                backendProcess.kill('SIGTERM');
            }
        } catch (e) {
            log.warn('[Electron] Error al matar proceso backend (puede que ya haya terminado)');
        }
        backendProcess = null;
        backendReady = false;
    }

    // 2. Como respaldo, matar cualquier proceso en el puerto del backend (solo Windows)
    if (process.platform === 'win32') {
        log.info(`[Electron] Verificando procesos en puerto ${BACKEND_PORT}...`);
        killProcessOnPort(BACKEND_PORT);
    }

    log.info('[Electron] Backend detenido');
}

// ============================================
// FUNCIONES DE LA VENTANA
// ============================================

/**
 * Crea la ventana principal de la aplicación
 */
function createWindow(apiUrl?: string): void {
    mainWindow = new BrowserWindow({
        // Iniciar en pantalla completa
        fullscreen: true,

        // Configuración de respaldo si fullscreen falla
        width: 1920,
        height: 1080,
        minWidth: 1024,
        minHeight: 768,

        // Icono de la aplicación
        icon: ICON_PATH,

        // Preferencias web
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            // Pasar API URL como argumento al proceso renderer
            additionalArguments: apiUrl ? [`--api-url=${apiUrl}`] : [],
        },

        // Sin barra de menú
        autoHideMenuBar: true,

        // Mostrar cuando esté lista
        show: false,

        // Fondo mientras carga
        backgroundColor: '#1a1a2e',
    });

    // Maximizar la ventana además de fullscreen
    mainWindow.maximize();

    // URL a cargar
    const frontendUrl = isDev
        ? `http://localhost:${FRONTEND_DEV_PORT}`
        : `file://${path.join(__dirname, '../renderer/index.html')}`;

    log.info(`[Electron] Cargando frontend desde: ${frontendUrl}`);
    mainWindow.loadURL(frontendUrl);

    // Mostrar ventana cuando esté lista
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        mainWindow?.focus();

        // Asegurar pantalla completa
        if (!mainWindow?.isFullScreen()) {
            mainWindow?.setFullScreen(true);
        }
    });

    // Abrir DevTools en producción solo si se especifica via .env o flag de debug
    if (process.env.DEBUG_TOOLS === 'true') {
        mainWindow.webContents.openDevTools();
    }

    // Permitir salir de pantalla completa con F11 o Escape
    // Evento para atajos de teclado globales (cancelado para evitar conflictos)
    /*
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11' || (input.key === 'Escape' && mainWindow?.isFullScreen())) {
            mainWindow?.setFullScreen(!mainWindow.isFullScreen());
        }
    });
    */

    // Manejar cierre de ventana
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

/**
 * Muestra pantalla de carga mientras inicia el backend
 */
function showLoadingScreen(): BrowserWindow {
    const loadingWindow = new BrowserWindow({
        width: 400,
        height: 300,
        icon: ICON_PATH,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // HTML de la pantalla de carga
    const loadingHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          font-family: 'Segoe UI', sans-serif;
          color: white;
          border-radius: 16px;
        }
        .container {
          text-align: center;
        }
        .spinner {
          width: 50px;
          height: 50px;
          border: 4px solid rgba(255,255,255,0.3);
          border-top-color: #4f46e5;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { font-size: 14px; opacity: 0.7; }
        .log-msg { font-size: 10px; opacity: 0.5; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="spinner"></div>
        <h1>NexoPOS</h1>
        <p>Iniciando aplicación...</p>
        <div class="log-msg" id="log-msg">Cargando servicios...</div>
      </div>
    </body>
    </html>
  `;

    loadingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`);
    loadingWindow.center();

    return loadingWindow;
}

// ============================================
// AUTO-ACTUALIZACIÓN
// ============================================

function setupAutoUpdater(): void {
    // Configurar logger de auto-updater
    autoUpdater.logger = log;

    // Solo en producción
    if (isDev) {
        log.info('[Electron] Auto-updater desactivado en desarrollo');
        return;
    }

    log.info('[Electron] Configurando auto-updater...');

    // Eventos del actualizador (configurar ANTES de checkForUpdates)
    autoUpdater.on('checking-for-update', () => {
        log.info('[AutoUpdater] Buscando actualizaciones...');
    });

    autoUpdater.on('update-available', (info) => {
        log.info(`[AutoUpdater] Actualización disponible: ${info.version}`);
        dialog.showMessageBox({
            type: 'info',
            title: 'Actualización disponible',
            message: `Hay una nueva versión (${info.version}) disponible. Se descargará automáticamente.`,
            buttons: ['OK'],
        });
    });

    autoUpdater.on('update-not-available', () => {
        log.info('[AutoUpdater] No hay actualizaciones disponibles');
    });

    autoUpdater.on('download-progress', (progress) => {
        log.info(`[AutoUpdater] Descargando: ${Math.round(progress.percent)}%`);
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info(`[AutoUpdater] Actualización descargada: ${info.version}`);
        dialog
            .showMessageBox({
                type: 'info',
                title: 'Actualización lista',
                message: `La versión ${info.version} se ha descargado. ¿Reiniciar ahora para aplicarla?`,
                buttons: ['Reiniciar ahora', 'Más tarde'],
                defaultId: 0,
            })
            .then((result) => {
                if (result.response === 0) {
                    autoUpdater.quitAndInstall(false, true);
                }
            });
    });

    autoUpdater.on('error', (error) => {
        // Ignorar el error de "No published versions" - es normal cuando no hay releases
        if (error?.message?.includes('No published versions')) {
            log.info('[AutoUpdater] No hay versiones publicadas en GitHub todavía');
            return;
        }
        log.error('[AutoUpdater] Error:', error);
    });

    // Verificar actualizaciones al iniciar (con manejo de errores para promesa)
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        // Ignorar errores de "No published versions" - es normal cuando no hay releases
        if (err?.message?.includes('No published versions')) {
            log.info('[AutoUpdater] No hay versiones publicadas en GitHub todavía');
            return;
        }
        log.error('[AutoUpdater] Error al buscar actualizaciones:', err);
    });
}

// ============================================
// IPC HANDLERS
// ============================================

function setupIpcHandlers(): void {
    // Obtener versión de la app
    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });

    // Verificar si el backend está listo
    ipcMain.handle('is-backend-ready', () => {
        return backendReady;
    });

    // Obtener información del sistema
    ipcMain.handle('get-system-info', () => {
        return {
            platform: process.platform,
            arch: process.arch,
            version: app.getVersion(),
            isDev,
            logsPath: log.transports.file.getFile().path
        };
    });

    // Control de ventana
    ipcMain.on('toggle-fullscreen', () => {
        if (mainWindow) {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
    });

    ipcMain.on('minimize-window', () => {
        mainWindow?.minimize();
    });

    ipcMain.on('close-window', () => {
        mainWindow?.close();
    });
}

// ============================================
// CICLO DE VIDA DE LA APLICACIÓN
// ============================================

app.whenReady().then(async () => {
    log.info('[Electron] Aplicación lista, iniciando...');
    log.info(`[Electron] Modo: ${isDev ? 'DESARROLLO' : 'PRODUCCIÓN'}`);
    log.info(`[Electron] app.isPackaged: ${app.isPackaged}`);
    log.info(`[Electron] __dirname: ${__dirname}`);
    log.info(`[Electron] app.getPath('exe'): ${app.getPath('exe')}`);
    log.info(`[Electron] process.resourcesPath: ${process.resourcesPath}`);

    // Limpiar puertos ocupados antes de iniciar (solo en Windows)
    // NOTA: En desarrollo, NO limpiar el puerto del frontend porque ya fue iniciado por dev.ts
    if (process.platform === 'win32') {
        log.info('[Electron] Verificando y liberando puertos...');
        killProcessOnPort(BACKEND_PORT);

        // Solo limpiar el puerto del frontend en producción
        if (!isDev) {
            killProcessOnPort(FRONTEND_DEV_PORT);
        }
    }

    // Mostrar pantalla de carga
    const loadingScreen = showLoadingScreen();

    try {
        // Configurar IPC handlers
        setupIpcHandlers();

        // 1. Cargar configuración
        const envVars = loadExternalEnv();
        log.info('[Electron] Variables de entorno cargadas: ' + Object.keys(envVars).join(', '));

        // 2. Determinar Modo
        const mode = envVars.MODE || process.env.MODE || 'SERVER';
        const isClientMode = mode === 'CLIENT';
        log.info(`[Electron] Modo detectado: ${mode}, isClientMode: ${isClientMode}`);

        // 3. Verificar si hay configuración válida
        const hasDbConfig = envVars.DATABASE_HOST || process.env.DATABASE_HOST;
        const hasClientConfig = isClientMode && (envVars.BACKEND_URL || process.env.BACKEND_URL);
        log.info(`[Electron] hasDbConfig: ${!!hasDbConfig}, hasClientConfig: ${!!hasClientConfig}`);

        // Si es Server y no tiene DB, o es Client y no tiene URL -> Wizard
        const needsWizard = isClientMode ? !hasClientConfig : !hasDbConfig;
        log.info(`[Electron] needsWizard: ${needsWizard}`);

        // Si necesitamos configuración, abrir el wizard
        if (needsWizard) {
            log.info('[Electron] No se encontró configuración válida. Abriendo Setup Wizard...');
            loadingScreen.close();

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { createSetupWizard } = require('./setup-wizard');

            createSetupWizard(async () => {
                log.info('[Electron] Setup completado. Reiniciando secuencia de inicio...');
                app.relaunch();
                app.exit(0);
            });
            return;
        }

        // 4. Iniciar el backend (SOLO SI ES MODO SERVIDOR)
        if (!isClientMode) {
            log.info('[Electron] Iniciando backend LOCAL...');
            await startBackend();
            log.info('[Electron] Backend iniciado');

            // Pequeña pausa para asegurar que el backend está completamente listo
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            log.info('[Electron] Modo CLIENTE detectado. Saltando inicio de backend local.');
        }

        // Cerrar pantalla de carga
        loadingScreen.close();

        // 5. Determinar API URL
        const apiUrl = isClientMode
            ? (envVars.BACKEND_URL || process.env.BACKEND_URL)
            : `http://localhost:${BACKEND_PORT}`;

        log.info(`[Electron] API URL configurada: ${apiUrl}`);

        // 6. Crear la ventana principal (pasando API URL)
        createWindow(apiUrl);

        // Configurar auto-actualización
        setupAutoUpdater();

    } catch (error) {
        log.error('[Electron] Error al iniciar:', error);
        loadingScreen.close();

        dialog.showErrorBox(
            'Error al iniciar NexoPOS',
            `No se pudo iniciar la aplicación.\n\nError: ${error}\n\nVerisificá los logs: ${log.transports.file.getFile().path}`
        );

        app.quit();
    }
});

// Cuando todas las ventanas se cierran
app.on('window-all-closed', () => {
    log.info('[Electron] Todas las ventanas cerradas');
    stopBackend();

    // En macOS las apps suelen quedarse abiertas
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Cuando la app se activa (macOS)
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Antes de cerrar la app
app.on('before-quit', () => {
    log.info('[Electron] Cerrando aplicación...');
    stopBackend();
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
    log.error('[Electron] Error no capturado:', error);
});
