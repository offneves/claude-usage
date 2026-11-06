import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'token-usage',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

function turn(input: number, output: number, read = 0, write = 0) {
  return {
    answer: 'ok',
    durationMs: 10,
    isAborted: false,
    turnId: `t${input}`,
    reason: 'answer',
    usage: {
      model: 'claude-opus-5-5',
      input_tokens: input,
      output_tokens: output,
      cache_read_input_tokens: read,
      cache_creation_input_tokens: write,
    },
  } as const
}

test('turnos somam e a faixa mostra contexto, tokens, custo e limites', async ($, on) => {
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.turn.complete(turn(1000, 200, 50_000, 2000))
  await $.turn.complete(turn(500, 300))
  await $.session.measure({
    context: { tokens: 42_000, window: 200_000, percent: 21 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 23 }],
    cost: { usd: 0.8412 },
    changed: ['context', 'cost', 'rateLimits'],
  })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const text = async (re: RegExp) => (await ui.find({ type: 'Text', text: re }))?.text ?? ''
    expect(await text(/Contexto/)).toBeDefined()
    expect(await text(/42k - 200k/)).toContain('42k - 200k')
    expect(await text(/enviados/)).toContain('enviados 1.5k')
    expect(await text(/gerados/)).toContain('gerados 500')
    expect(await text(/re-cache 50k/)).toContain('re-cache 50k')
    expect(await text(/salvos no cache/)).toContain('2k')
    expect(await text(/custo/)).toContain('US$ 0.84')
    expect(await text(/Limite 5h/)).toBeDefined()
    expect(await text(/23%/)).not.toContain('usado')
    await ui.unmount()
  }
})

test('sem custo nem limites, esses trechos somem', async ($, on) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { tokens: 1000, window: 200_000, percent: 1 },
    rateLimits: [],
    changed: ['context'],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Contexto/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /custo|US\$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Limite/ })).toBeUndefined()
  await ui.unmount()
})

test('Ocultar e /usage-panel alternam a faixa', async ($, on) => {
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('command.register', () => ({ value: { command: 'usage-panel' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.complete(turn(100, 10))

  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'hide' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()

  const shown = await $.command.run({
    command: 'usage-panel',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
  expect(shown.text).toBe('Faixa de uso visível.')

  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /enviados 100/ })).toBeDefined()
  await ui.unmount()
})

test('faixa larga desenha barras e o tempo até o reset; estreita só números', async ($, on) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  const now = Date.UTC(2026, 10, 5, 12)
  on('clock.now', () => ({ value: now }))
  await $.session.measure({
    context: { tokens: 180_000, window: 200_000, percent: 90 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 50, resetsAt: new Date(now + 130 * 60_000).toISOString() },
    ],
    changed: ['context', 'rateLimits'],
  })

  const wideProps = { ...BAND.props, bodyColumns: 120 }
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: wideProps })
  const ctx = (await ui.find({ type: 'Text', text: /90%/ }))?.text ?? ''
  expect(ctx).toContain('[■■■■■■■■■□] 90%')
  const limit = (await ui.find({ type: 'Text', text: /2h 10min/ }))?.text ?? ''
  expect(limit).toContain('50% 2h 10min')
  expect(limit).not.toContain('renova')
  await ui.unmount()

  ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 40 } })
  const narrow = (await ui.find({ type: 'Text', text: /90%/ }))?.text ?? ''
  expect(narrow).not.toContain('■')
  expect(narrow).toContain('90%')
  await ui.unmount()
})

test('Sessão fica numa linha quando cabe e quebra só em terminal estreito', async ($, on) => {
  on('turn.complete', (_, e) => ({ text: e.answer, usage: e.usage }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.turn.complete(turn(12_300, 3100, 80_000, 5000))
  await $.session.measure({
    context: { tokens: 42_000, window: 200_000, percent: 21 },
    rateLimits: [],
    cost: { usd: 0.84 },
    changed: ['context', 'cost'],
  })

  let ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 140 } })
  expect((await ui.find({ type: 'Text', text: /enviados/ }))?.text).toContain('custo US$ 0.84')
  await ui.unmount()

  ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 80 } })
  expect((await ui.find({ type: 'Text', text: /enviados/ }))?.text).not.toContain('custo')
  expect((await ui.find({ type: 'Text', text: /custo/ }))?.text).toContain('re-cache 80k')
  await ui.unmount()
})

test('Contexto, 5h e semanal ficam lado a lado, nessa ordem, separados por bolinha, e empilham alinhados quando não cabem', async ($, on) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  const now = Date.UTC(2026, 10, 5, 12)
  on('clock.now', () => ({ value: now }))
  await $.session.measure({
    context: { tokens: 101_000, window: 1_000_000, percent: 10 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 23, resetsAt: new Date(now + 258 * 60_000).toISOString() },
      { kind: 'seven_day', percentUsed: 8, resetsAt: new Date(now + 6 * 86_400_000).toISOString() },
    ],
    changed: ['context', 'rateLimits'],
  })

  let ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 140 } })
  expect((await ui.find({ type: 'Text', text: /Contexto/ }))?.text).toBe(
    'Contexto  [■□□□□□□□□□] 10% 101k - 1M  •  Limite 5h  [■■□□□□□□□□] 23% 4h 18min  •  Limite semanal  [■□□□□□□□□□] 8% 6 dias',
  )
  await ui.unmount()

  ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 100 } })
  const col = async (re: RegExp, needle: string) => {
    const text = (await ui.find({ type: 'Text', text: re }))?.text ?? ''
    expect(text).not.toContain('•')
    return text.indexOf(needle)
  }
  expect(await col(/101k - 1M/, '10%')).toBe(await col(/4h 18min/, '23%'))
  expect(await col(/101k - 1M/, '101k')).toBe(await col(/6 dias/, '6 dias'))
  expect(await col(/4h 18min/, '4h 18min')).toBe(await col(/6 dias/, '6 dias'))
  await ui.unmount()
})
