import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const USAGE = {
  input_tokens: 1,
  output_tokens: 1,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

// Stands in for the engine beneath the mod; returns the effort each model
// request was finally sent with.
const engine = (on: On, classifierReply: string | null) => {
  const sent: (string | number | undefined)[] = []

  mock.store(on)
  on('command.register', () => ({ value: { command: 'auto-effort' } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('model.complete', () => ({
    value:
      classifierReply === null
        ? { isAnswered: false, reason: 'empty-reply', usage: USAGE }
        : { isAnswered: true, text: classifierReply, usage: USAGE },
  }))
  on('turn.step', async function* (_, e) {
    sent.push(e.effort)

    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: null,
    }
  })

  return sent
}

const step = { turnId: 't1', index: 0, model: 'opus', effort: 'medium', messageCount: 1 } as const

const submit = ($: Engine, text: string) =>
  $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

const command = ($: Engine, args: string) =>
  $.command.run({
    command: 'auto-effort',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

const runStep = async ($: Engine, extra = {}) => {
  for await (const _ of $.turn.step({ ...step, ...extra })) {
    // drain the stream
  }
}

test('picks the classifier level for the main loop', async ($, on) => {
  const sent = engine(on, 'xhigh')

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await submit($, 'Redesign the sync engine to avoid the race between writers')
  await runStep($)

  expect(sent).toEqual(['xhigh'])
})

test('leaves subagents alone', async ($, on) => {
  const sent = engine(on, 'low')

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await submit($, 'what time is it')
  await runStep($, { agentId: 'a1' })

  expect(sent).toEqual(['medium'])
})

test('off passes the normal effort through, and the choice is remembered', async ($, on) => {
  const sent = engine(on, 'low')

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const off = await command($, 'off')
  expect(off.text).toMatch(/off/)

  await submit($, 'hi')
  await runStep($)
  expect(sent).toEqual(['medium'])

  // A new session reads the saved choice: still off.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await submit($, 'hi again')
  await runStep($)
  expect(sent).toEqual(['medium', 'medium'])

  const on2 = await command($, '')
  expect(on2.text).toMatch(/is on/)
  await submit($, 'hello')
  await runStep($)
  expect(sent).toEqual(['medium', 'medium', 'low'])
})

test('falls back to a heuristic when the classifier gives nothing', async ($, on) => {
  const sent = engine(on, null)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await submit($, 'please refactor the payment module')
  await runStep($)

  expect(sent).toEqual(['high'])
})
