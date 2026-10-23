import type { EngineInterface, ModelEffort, Register } from 'claude-code'

// Picks a reasoning effort for each prompt with one cheap Haiku call, then
// sends every model request of that turn (main loop only) at that effort.
// `/auto-effort` toggles it; the on/off choice is kept across sessions.

const LEVELS: readonly ModelEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const ENABLED_KEY = 'enabled'

const RUBRIC = `You choose how hard an AI coding assistant should think about the user's next message.
Answer with exactly one word: low, medium, high, xhigh or max.

low: greetings, quick factual questions, yes/no answers, simple lookups, trivial one-line edits.
medium: routine tasks: explaining code, a small bug fix, a short script, editing one or two files.
high: multi-step work: implementing a feature, debugging an unclear cause, refactoring across files, research and comparison.
xhigh: hard problems: system design, subtle concurrency or security issues, large autonomous multi-file changes.
max: only for exceptionally hard reasoning that earlier attempts failed at, or that the user says is very hard.

If the message is a short follow-up that continues the previous task ("yes", "do it", "continue", "looks good, go ahead"), answer the previous level.`

export const isLevel = (value: string): value is ModelEffort =>
  (LEVELS as readonly string[]).includes(value)

// Used when the classifier call fails or answers something unexpected.
export const fallbackLevel = (
  text: string,
  previous: ModelEffort | undefined,
): ModelEffort => {
  const words = text.trim().split(/\s+/).filter(Boolean).length

  if (previous !== undefined && words <= 6) {
    return previous
  }

  if (/\b(architect|design|refactor|migrat|debug|race|deadlock|security)/i.test(text)) {
    return 'high'
  }

  return words <= 12 ? 'low' : 'medium'
}

export const parseLevel = (reply: string): ModelEffort | undefined => {
  const word = reply.trim().toLowerCase().match(/[a-z]+/)?.[0] ?? ''

  return isLevel(word) ? word : undefined
}

const pick = async (
  $: EngineInterface,
  text: string,
  previous: ModelEffort | undefined,
): Promise<ModelEffort> => {
  const reply = await $.model.complete({
    model: 'haiku',
    system: RUBRIC,
    prompt: `Previous level: ${previous ?? 'none'}\n\nUser message:\n<<<\n${text.slice(0, 4000)}\n>>>`,
    maxTokens: 5,
    effort: 'low',
    timeoutMs: 6000,
  })

  const level = reply.isAnswered ? parseLevel(reply.text) : undefined

  return level ?? fallbackLevel(text, previous)
}

function showStatus(
  $: EngineInterface,
  isEnabled: boolean,
  level: ModelEffort | undefined,
): void {
  $.ui.status(
    isEnabled ? `auto-effort: ${level ?? 'waiting for a prompt'}` : 'auto-effort: off',
  )
}

export const register: Register = on => {
  let isEnabled = true
  let level: ModelEffort | undefined

  on('session.start', async ($, e, next) => {
    isEnabled = (await $.store.get(ENABLED_KEY)) !== false
    await $.command.register({
      name: 'auto-effort',
      description: 'Toggle automatic effort selection (on, off, status)',
      argumentHint: '[on|off|status]',
      immediate: true,
    })
    showStatus($, isEnabled, level)

    return next(e)
  })

  on('command.run', { command: 'auto-effort' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'status') {
      return {
        text: isEnabled
          ? `Auto effort is on. Current level: ${level ?? 'none yet'}.`
          : 'Auto effort is off. Your normal /effort setting applies.',
      }
    }

    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /auto-effort [on|off|status]' }
    }

    isEnabled = arg === '' ? !isEnabled : arg === 'on'
    await $.store.set(ENABLED_KEY, isEnabled)
    showStatus($, isEnabled, level)

    return {
      text: isEnabled
        ? 'Auto effort is on. Each new prompt gets its own effort level.'
        : 'Auto effort is off. Your normal /effort setting applies again.',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    // Slash commands, hidden prompts and messages queued into a running
    // turn keep the current level.
    const isNewTask = e.command === undefined && e.isMeta !== true && e.turnId === undefined

    if (isEnabled && isNewTask && e.text.trim() !== '') {
      try {
        level = await pick($, e.text, level)
      } catch {
        level = fallbackLevel(e.text, level)
      }
      showStatus($, isEnabled, level)
    }

    return next(e)
  }).catch(($, e, next) => next(e)) // never block a prompt because picking failed

  on('turn.step', async function* ($, e, next) {
    // Subagents keep their own effort; a model without effort support has none.
    const shouldSet =
      isEnabled && level !== undefined && e.agentId === undefined && e.effort !== undefined

    return yield* next(shouldSet ? { ...e, effort: level } : e)
  })
}
