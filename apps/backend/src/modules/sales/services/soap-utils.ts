/**
 * Utilidades para construcción y parseo de mensajes SOAP para AFIP
 */
import * as xml2js from 'xml2js';

/**
 * Obtiene el offset de timezone de Argentina en formato ISO 8601
 * Argentina usa UTC-3 (America/Buenos_Aires) sin horario de verano desde 2009
 * Se calcula dinámicamente por seguridad ante posibles cambios futuros
 */
function getArgentinaTimezoneOffset(): string {
    // Crear una fecha en timezone de Argentina
    const argentinaFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Buenos_Aires',
        timeZoneName: 'shortOffset',
    });

    const parts = argentinaFormatter.formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');

    if (tzPart?.value) {
        // El formato es "GMT-3" o similar, convertir a "-03:00"
        const match = tzPart.value.match(/GMT([+-])(\d+)/);
        if (match) {
            const sign = match[1];
            const hours = match[2].padStart(2, '0');
            return `${sign}${hours}:00`;
        }
    }

    // Fallback: Argentina siempre es UTC-3
    return '-03:00';
}

/**
 * Construye un XML de Ticket de Requerimiento de Acceso (TRA)
 * para autenticación con WSAA
 */
export function createTRA(service: string = 'wsfe'): string {
    const now = new Date();
    const expiration = new Date(now.getTime() + 12 * 60 * 60 * 1000); // +12 horas

    // uniqueId: timestamp en segundos
    const uniqueId = Math.floor(now.getTime() / 1000);

    // Obtener timezone de Argentina dinámicamente
    const tzOffset = getArgentinaTimezoneOffset();

    // Formato ISO sin milisegundos usando hora local Argentina: YYYY-MM-DDTHH:mm:ss-03:00
    const formatDate = (date: Date): string => {
        // Formatear la fecha en timezone de Argentina
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });

        const parts = formatter.formatToParts(date);
        const get = (type: string) => parts.find(p => p.type === type)?.value || '00';

        const year = get('year');
        const month = get('month');
        const day = get('day');
        const hours = get('hour');
        const minutes = get('minute');
        const seconds = get('second');

        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${tzOffset}`;
    };

    const generationTime = formatDate(now);
    const expirationTime = formatDate(expiration);

    return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${generationTime}</generationTime>
    <expirationTime>${expirationTime}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;
}

/**
 * Construye un mensaje SOAP para llamar al LoginCms de WSAA
 * @param cms - TRA firmado en formato CMS (Base64)
 */
export function createLoginCmsRequest(cms: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Parsea la respuesta SOAP del LoginCms
 * Extrae token, sign y expirationTime
 */
export async function parseLoginCmsResponse(xmlResponse: string): Promise<{
    token: string;
    sign: string;
    expirationTime: Date;
}> {
    const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: true,
        tagNameProcessors: [xml2js.processors.stripPrefix] // Elimina prefijos de namespace
    });
    const result = await parser.parseStringPromise(xmlResponse);

    // Navegar por la estructura SOAP (sin prefijos de namespace)
    const envelope = result['Envelope'] || result['soapenv:Envelope'] || result['soap:Envelope'];
    if (!envelope) {
        console.error('[WSAA] Respuesta no tiene Envelope:', JSON.stringify(result).substring(0, 500));
        throw new Error('Respuesta WSAA inválida: no se encontró Envelope');
    }

    const body = envelope['Body'] || envelope['soapenv:Body'] || envelope['soap:Body'];
    if (!body) {
        console.error('[WSAA] Respuesta no tiene Body:', JSON.stringify(envelope).substring(0, 500));
        throw new Error('Respuesta WSAA inválida: no se encontró Body');
    }

    // Buscar loginCmsReturn en diferentes formatos
    const loginCmsResponse = body['loginCmsResponse'] || body['ns1:loginCmsResponse'];
    const loginCmsReturn = body['loginCmsReturn'] ||
        loginCmsResponse?.['loginCmsReturn'] ||
        loginCmsResponse?.['return'];

    if (!loginCmsReturn) {
        // Verificar si hay un fault
        const fault = body['Fault'] || body['soapenv:Fault'] || body['soap:Fault'];
        if (fault) {
            const faultString = fault['faultstring'] || fault['faultString'] || 'Error desconocido';
            throw new Error(`Error WSAA: ${faultString}`);
        }
        console.error('[WSAA] Respuesta sin loginCmsReturn:', JSON.stringify(body).substring(0, 500));
        throw new Error('Respuesta WSAA inválida: no se encontró loginCmsReturn');
    }

    // Parsear el XML interno de credentials
    const credentialsParser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: true
    });
    const credentials = await credentialsParser.parseStringPromise(loginCmsReturn);

    const loginTicketResponse = credentials.loginTicketResponse;
    if (!loginTicketResponse) {
        console.error('[WSAA] Respuesta sin loginTicketResponse:', JSON.stringify(credentials).substring(0, 500));
        throw new Error('Respuesta WSAA inválida: no se encontró loginTicketResponse');
    }

    const token = loginTicketResponse.credentials?.token;
    const sign = loginTicketResponse.credentials?.sign;
    const expirationTimeStr = loginTicketResponse.header?.expirationTime;

    if (!token || !sign || !expirationTimeStr) {
        console.error('[WSAA] Credenciales incompletas:', JSON.stringify(loginTicketResponse).substring(0, 500));
        throw new Error('Respuesta WSAA incompleta: faltan token, sign o expirationTime');
    }

    return {
        token,
        sign,
        expirationTime: new Date(expirationTimeStr),
    };
}

/**
 * Parsea un mensaje de error SOAP
 */
export async function parseSoapFault(xmlResponse: string): Promise<string> {
    try {
        const parser = new xml2js.Parser({
            explicitArray: false,
            ignoreAttrs: true,
            tagNameProcessors: [xml2js.processors.stripPrefix]
        });
        const result = await parser.parseStringPromise(xmlResponse);

        // Buscar Envelope con diferentes prefijos
        const envelope = result['Envelope'] || result['soapenv:Envelope'] || result['soap:Envelope'];
        if (!envelope) {
            console.error('[WSAA Fault] No se encontró Envelope:', xmlResponse.substring(0, 300));
            return 'Error al parsear respuesta SOAP: no se encontró Envelope';
        }

        const body = envelope['Body'] || envelope['soapenv:Body'] || envelope['soap:Body'];
        if (!body) {
            return 'Error al parsear respuesta SOAP: no se encontró Body';
        }

        const fault = body['Fault'] || body['soapenv:Fault'] || body['soap:Fault'];
        if (fault) {
            const faultString = fault['faultstring'] || fault['faultString'] || fault['detail'] || 'Error SOAP desconocido';
            return typeof faultString === 'string' ? faultString : JSON.stringify(faultString);
        }

        // Si no hay fault explícito, puede haber un error en el loginCmsResponse
        const loginCmsResponse = body['loginCmsResponse'] || body['ns1:loginCmsResponse'];
        if (loginCmsResponse?.['error']) {
            return loginCmsResponse['error'];
        }

        return 'No se encontró mensaje de error en la respuesta SOAP';
    } catch (error) {
        console.error('[WSAA Fault] Error al parsear:', error);
        return 'Error al parsear SOAP fault';
    }
}
