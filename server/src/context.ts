import { z } from 'zod';

/**
 * Contexto técnico enviado pelo widget incorporado no sistema do cliente.
 * Vem de fora (navegador do usuário final), então tudo é validado e truncado.
 */
// Textos longos são truncados (não rejeitados): um erro com stack trace enorme não pode impedir o chamado.
const str = (max: number) => z.string().max(50_000).transform((s) => s.trim().slice(0, max));

export const TicketContextSchema = z
  .object({
    source: z.enum(['widget', 'portal']).default('widget'),
    trigger: z.enum(['manual', 'error']).default('manual'),
    app: z.object({ name: str(80).optional(), version: str(30).optional() }).partial().optional(),
    page: z.object({ url: str(500).optional(), path: str(300).optional(), title: str(200).optional() }).partial().optional(),
    user: z
      .object({ id: str(80).optional(), name: str(120).optional(), email: str(160).optional(), company: str(120).optional(), plan: str(40).optional() })
      .partial()
      .optional(),
    browser: z
      .object({ userAgent: str(400).optional(), language: str(20).optional(), screen: str(30).optional(), timezone: str(60).optional() })
      .partial()
      .optional(),
    errors: z
      .array(
        z.object({
          type: z.enum(['js', 'http', 'promise']),
          message: str(500),
          at: str(40).optional(),
          url: str(300).optional(),
          method: str(10).optional(),
          status: z.number().int().optional(),
        }),
      )
      .max(10)
      .optional(),
    breadcrumbs: z
      .array(z.object({ type: z.enum(['nav', 'click', 'http', 'error']), label: str(200), at: str(40).optional() }))
      .max(20)
      .optional(),
  })
  .strip();

export type TicketContext = z.infer<typeof TicketContextSchema>;

/** Resumo em texto do contexto, usado pela IA (motor local e Claude). */
export function describeContext(ctx: TicketContext | null | undefined): string | null {
  if (!ctx) return null;
  const parts: string[] = [];
  if (ctx.app?.name) parts.push(`Sistema: ${ctx.app.name}${ctx.app.version ? ` v${ctx.app.version}` : ''}`);
  if (ctx.page?.path || ctx.page?.title) parts.push(`Tela: ${ctx.page.title ?? ''} (${ctx.page.path ?? ctx.page.url ?? ''})`);
  if (ctx.trigger === 'error') parts.push('Chamado aberto a partir de um erro detectado automaticamente');
  for (const e of ctx.errors ?? []) {
    parts.push(e.type === 'http' ? `Erro HTTP ${e.status ?? ''} em ${e.method ?? ''} ${e.url ?? ''}: ${e.message}` : `Erro ${e.type}: ${e.message}`);
  }
  return parts.length ? parts.join('\n') : null;
}

/** Assinatura curta do erro principal (ex.: "POST /api/boletos → 500"), usada nos insights. */
export function errorSignature(ctx: TicketContext | null | undefined): string | null {
  const e = ctx?.errors?.[0];
  if (!e) return null;
  if (e.type === 'http') {
    let path = e.url ?? '';
    try {
      path = new URL(path, 'http://x').pathname;
    } catch {
      /* mantém a URL original */
    }
    return `${e.method ?? 'GET'} ${path} → ${e.status ?? 'erro'}`;
  }
  return e.message.slice(0, 80);
}
