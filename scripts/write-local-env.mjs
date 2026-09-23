import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

function parseShellEnv(raw) {
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    let value = rawValue.trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value)
      } catch {
        value = value.slice(1, -1)
      }
    }
    env[key] = value
  }
  return env
}

function defaultDictionaryValue(value) {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    return parsed.default ?? Object.values(parsed)[0]
  } catch {
    return undefined
  }
}

const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const env = parseShellEnv(output)

const url = env.API_URL ?? env.SUPABASE_URL
const publishableKey =
  env.PUBLISHABLE_KEY ??
  env.SUPABASE_PUBLISHABLE_KEY ??
  defaultDictionaryValue(env.PUBLISHABLE_KEYS) ??
  defaultDictionaryValue(env.SUPABASE_PUBLISHABLE_KEYS) ??
  env.ANON_KEY ??
  env.SUPABASE_ANON_KEY

if (!url || !publishableKey) {
  throw new Error('Unable to resolve local Supabase URL/publishable key from `supabase status -o env`.')
}

writeFileSync(
  '.env.local',
  `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}\n`,
)

console.log('PASS wrote .env.local with the local public Supabase client configuration.')
