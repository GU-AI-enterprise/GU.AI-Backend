import { Request, Response, NextFunction } from 'express';

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function colorStatus(status: number): string {
  const c =
    status >= 500 ? COLORS.red :
    status >= 400 ? COLORS.yellow :
    status >= 300 ? COLORS.cyan :
    COLORS.green;
  return `${c}${status}${COLORS.reset}`;
}

function colorMethod(method: string): string {
  const c =
    method === 'GET'    ? COLORS.cyan :
    method === 'POST'   ? COLORS.green :
    method === 'PUT'    ? COLORS.yellow :
    method === 'PATCH'  ? COLORS.magenta :
    method === 'DELETE' ? COLORS.red :
    COLORS.white;
  return `${c}${method.padEnd(6)}${COLORS.reset}`;
}

// Redact sensitive fields before logging body
const REDACT_KEYS = new Set(['password', 'token', 'secret', 'access_token', 'refresh_token', 'api_key']);

function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '***' : v;
  }
  return out;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') return next();

  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const ms = Date.now() - start;
    const time = new Date().toTimeString().slice(0, 8);
    const status = res.statusCode;

    let line = `${COLORS.gray}[${time}]${COLORS.reset} ${colorMethod(method)} ${originalUrl} ${colorStatus(status)} ${COLORS.dim}${ms}ms${COLORS.reset}`;

    // Log request body for mutating routes (POST/PUT/PATCH), excluding file uploads
    if (['POST', 'PUT', 'PATCH'].includes(method) && req.body && !req.is('multipart/form-data')) {
      const safe = sanitizeBody(req.body as Record<string, unknown>);
      const snippet = JSON.stringify(safe);
      // Truncate long bodies
      line += `\n  ${COLORS.gray}body: ${snippet.length > 200 ? snippet.slice(0, 200) + '…' : snippet}${COLORS.reset}`;
    }

    // Highlight errors
    if (status >= 400) {
      console.warn(line);
    } else {
      console.log(line);
    }
  });

  next();
}
