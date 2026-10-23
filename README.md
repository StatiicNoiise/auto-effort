# auto-effort

A Claude Code mod that picks the reasoning effort (low, medium, high, xhigh,
max) for each new prompt, so quick questions run fast and hard tasks get more
thinking, without you running `/effort` yourself.

## How it works

- When you send a prompt, one small Haiku call (low effort, about a second)
  reads it and picks a level. Short follow-ups like "yes, do it" keep the
  previous task's level.
- Every model request of that turn is sent at the chosen level. Subagents keep
  their own effort.
- The status line shows the current level, for example `auto-effort: high`.
- If the Haiku call fails, a simple rule based on the prompt's length and
  keywords picks the level instead. The prompt is never blocked.

## Turning it on and off

- `/auto-effort` toggles it.
- `/auto-effort on`, `/auto-effort off`, `/auto-effort status`.

It starts on. Your choice is saved and applies to new sessions too. While it
is off, your normal `/effort` setting applies.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install auto-effort --marketplace StatiicNoiise/auto-effort
```

Answer `y` to add the marketplace, then pick the user scope so it loads in
every new session.

From a shell:

```
claude plugin install auto-effort --marketplace StatiicNoiise/auto-effort
```

In the desktop app, where `/plugin` does not run: click + next to the prompt
box, then Plugins, Add marketplace with `StatiicNoiise/auto-effort`, then Add
plugin.

Then run `/auto-effort status` in a new session to check it is on. Cloud
sessions do not load installed plugins, so it works in local sessions only.
