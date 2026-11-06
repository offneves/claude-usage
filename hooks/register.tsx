import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register, RenderElement, SessionUsage } from 'claude-code'

import type { Measure, Totals } from '../types'

const COMMAND = 'usage-panel'

const ZERO: Totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 }

const totals = atom({ plugin: 'token-usage', key: 'totals' } as const, ZERO, {
  shape: 'totals-1',
})
const measure = atom({ plugin: 'token-usage', key: 'measure' } as const, null, {
  shape: 'measure-1',
})
const isHidden = atom({ plugin: 'token-usage', key: 'isHidden' } as const, false)

const LIMIT_LABELS: Record<string, string> = {
  five_hour: 'Limite 5h',
  seven_day: 'Limite semanal',
  spend_limit: 'Limite de gasto',
}

/** Laranja forte das barras e da borda da faixa. */
const ORANGE: Color = '#FF6B00'

/** Percentual em branco (a cor de texto do tema), para contrastar com a barra. */
const PERCENT: Color = 'text'

/** Entre um item de uso e o próximo na mesma linha. */
const SEPARATOR = '  •  '

/** Colunas reservadas para o botão Ocultar. */
const HIDE_WIDTH = 10

const SESSION: Color = 'inactive'

/** 1234 -> "1.2k", 2_500_000 -> "2.5M". */
export function fmt(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`
  if (n >= 1_000) return `${trim(n / 1_000)}k`
  return String(Math.round(n))
}

function trim(x: number): string {
  return (x >= 100 ? x.toFixed(0) : x.toFixed(1)).replace(/\.0$/, '')
}

/** Tempo até o reset: "45 min", "2h 10min", "3 dias". */
export function untilReset(resetsAt: string | undefined, now: number): string | undefined {
  if (!resetsAt) return undefined
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  const min = Math.ceil(ms / 60_000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h}h ${min % 60}min` : `${h}h`
  const d = Math.round(h / 24)
  return d === 1 ? '1 dia' : `${d} dias`
}

function toMeasure(u: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>): Measure {
  return {
    contextTokens: u.context.tokens,
    contextWindow: u.context.window,
    contextPercent: u.context.percent,
    costUsd: u.cost?.usd,
    rateLimits: u.rateLimits.map(r => ({
      kind: r.kind,
      percentUsed: r.percentUsed,
      resetsAt: r.resetsAt,
    })),
  }
}

const warned = new Set<string>()

function warnOnce($: EngineInterface, key: string, text: string) {
  if (warned.has(key)) return
  warned.add(key)
  $.ui.toast(text)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Mostra/oculta a faixa de uso de tokens',
    })
    const result = await next(e)
    try {
      const usage = await $.session.usage()
      await update($, measure, () => toMeasure(usage))
    } catch {
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const usage = e.usage ?? result.usage
    if (usage) {
      await update($, totals, t => ({
        input: t.input + usage.input_tokens,
        output: t.output + usage.output_tokens,
        cacheRead: t.cacheRead + usage.cache_read_input_tokens,
        cacheWrite: t.cacheWrite + usage.cache_creation_input_tokens,
        turns: t.turns + 1,
      }))
    }

    return result
  })

  on('session.measure', async ($, e, next) => {
    const m = toMeasure(e)
    await update($, measure, () => m)

    if ((m.contextPercent ?? 0) >= 85) {
      warnOnce($, 'ctx85', `Contexto em ${m.contextPercent}% da janela`)
    }
    for (const r of m.rateLimits) {
      if (r.percentUsed >= 90) {
        const label = LIMIT_LABELS[r.kind] ?? r.kind
        warnOnce($, `limit90:${r.kind}`, `Limite ${label} em ${r.percentUsed}%`)
      }
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const hidden = await update($, isHidden, h => !h)

    return { text: hidden ? 'Faixa de uso oculta.' : 'Faixa de uso visível.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const t = await read($, totals)
    const m = await read($, measure)
    if (t.turns === 0 && (m === null || m.contextTokens === undefined)) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const showBars = e.props.bodyColumns >= 50
    const now = m?.rateLimits.some(r => r.resetsAt) ? await $.clock.now() : 0

    const bar = (pct: number, cells: number) => {
      const filled = Math.min(cells, Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * cells)))
      return (
        <Text>
          <Text color="subtle">[</Text>
          <Text color={ORANGE}>{'■'.repeat(filled)}</Text>
          <Text color="subtle">{'□'.repeat(cells - filled)}</Text>
          <Text color="subtle">]</Text>{' '}
        </Text>
      )
    }

    const LABEL = 16
    const hide = (
      <Box key="hide-box" flexShrink={0}>
        <Button key="hide" label="Ocultar" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )

    type Usage = { key: string; label: string; pct: number; detail?: string }
    const usage: Usage[] = []
    if (m && m.contextTokens !== undefined) {
      usage.push({
        key: 'context',
        label: 'Contexto',
        pct: m.contextPercent ?? 0,
        detail: `${fmt(m.contextTokens)} - ${fmt(m.contextWindow)}`,
      })
    }
    for (const r of m?.rateLimits ?? []) {
      usage.push({
        key: `limit:${r.kind}`,
        label: LIMIT_LABELS[r.kind] ?? r.kind,
        pct: r.percentUsed,
        detail: untilReset(r.resetsAt, now),
      })
    }

    /** Barra, percentual e detalhe; `aligned` completa o percentual para os detalhes ficarem em coluna. */
    const value = (u: Usage, aligned: boolean) => {
      const pctText = `${Math.round(u.pct)}%`
      return (
        <Text>
          {showBars ? bar(u.pct, 10) : null}
          <Text color={PERCENT} weight="bold">{aligned && u.detail ? pctText.padEnd(4) : pctText}</Text>
          {u.detail ? <Text color="subtle">{' '}{u.detail}</Text> : null}
        </Text>
      )
    }
    const compactWidth = (u: Usage) =>
      u.label.length + 2 + (showBars ? 13 : 0) + `${Math.round(u.pct)}%`.length + (u.detail ? u.detail.length + 1 : 0)

    const rows: RenderElement[] = []
    const oneLine =
      usage.reduce((w, u, i) => w + compactWidth(u) + (i > 0 ? SEPARATOR.length : 0), 0) <=
      e.props.bodyColumns - 4 - HIDE_WIDTH

    if (usage.length > 0 && oneLine) {
      // Cabem todos: lado a lado, separados por uma bolinha.
      rows.push(
        <Box key="usage" flexDirection="row">
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">
              {usage.flatMap((u, i) => [
                ...(i > 0 ? [<Text key={`sep${i}`} color="subtle">{SEPARATOR}</Text>] : []),
                <Text key={u.key}>
                  <Text weight="bold">{u.label}</Text>{'  '}
                  {value(u, false)}
                </Text>,
              ])}
            </Text>
          </Box>
          {hide}
        </Box>,
      )
    } else {
      // Não cabem: um por linha, em colunas alinhadas.
      usage.forEach((u, i) => {
        rows.push(
          <Box key={u.key} flexDirection="row">
            <Box width={LABEL} flexShrink={0}>
              <Text weight="bold">{u.label}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">{value(u, true)}</Text>
            </Box>
            {i === 0 ? hide : null}
          </Box>,
        )
      })
    }

    const tokens: string[] = []
    const rest: string[] = []
    if (t.turns > 0) {
      tokens.push(`enviados ${fmt(t.input)}`, `gerados ${fmt(t.output)}`)
      if (t.cacheRead + t.cacheWrite > 0) {
        rest.push(`re-cache ${fmt(t.cacheRead)}`, `salvos no cache ${fmt(t.cacheWrite)}`)
      }
    }
    if (m?.costUsd !== undefined) rest.push(`custo US$ ${m.costUsd.toFixed(2)}`)
    const room = e.props.bodyColumns - 4 - LABEL
    const all = [...tokens, ...rest]
    const lines =
      all.join(' · ').length <= room ? [all] : [tokens, rest].filter(l => l.length > 0)
    if (all.length > 0) {
      if (rows.length > 0) rows.push(<Box key="gap" height={1} />)
      rows.push(
        <Box key="spent" flexDirection="row">
          <Box width={LABEL} flexShrink={0}>
            <Text color={SESSION}>Sessão</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            {lines.map((l, i) => (
              <Text key={`l${i}`} color={SESSION} wrap="truncate-end">
                {l.join(' · ')}
              </Text>
            ))}
          </Box>
          {usage.length === 0 ? hide : null}
        </Box>,
      )
    }

    return (
      <Box
        flexDirection="column"
        width={e.props.bodyColumns}
        borderStyle="round"
        borderColor={ORANGE}
        paddingX={1}
      >
        {rows}
      </Box>
    )
  })
}
