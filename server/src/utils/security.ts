import type { NextFunction, Request, Response } from 'express';

/**
 * Limitador de requisições em memória (janela deslizante por chave).
 * Suficiente para uma instância única; com várias instâncias, troque por Redis.
 */
export function rateLimit(opts: { max: number; windowMs: number; key?: (req: Request) => string; message?: string }) {
  const hits = new Map<string, number[]>();
  // Limpeza periódica para o mapa não crescer indefinidamente.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, list] of hits) {
      const recent = list.filter((t) => now - t < opts.windowMs);
      if (recent.length) hits.set(k, recent);
      else hits.delete(k);
    }
  }, opts.windowMs);
  timer.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = opts.key ? opts.key(req) : (req.ip ?? 'unknown');
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
    if (recent.length >= opts.max) {
      const retryAfter = Math.ceil((opts.windowMs - (now - recent[0])) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: opts.message ?? 'Muitas solicitações em pouco tempo. Tente novamente em alguns minutos.' });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

/**
 * Cabeçalhos de segurança (equivalente enxuto ao helmet).
 * A CSP permite só recursos do próprio domínio e as fontes do Google.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  // O widget.js precisa poder ser carregado por sistemas de outros domínios.
  if (req.path === '/widget.js') {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return next();
  }
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  );
  next();
}
