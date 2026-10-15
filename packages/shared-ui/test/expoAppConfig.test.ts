// apps/expo has no vitest setup, so its app.json is checked here (as withAmazonIap.test.ts does for the config plugin).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tokens } from '../src/theme/tokens'

const app = JSON.parse(readFileSync(resolve(__dirname, '../../../apps/expo/app.json'), 'utf8')) as {
  expo: { backgroundColor?: string; splash?: { backgroundColor?: string }; android: { backgroundColor?: string } }
}

describe('apps/expo app.json (QA #3)', () => {
  it('splash and root backgrounds are the ground token, so start-up never flashes white', () => {
    expect(app.expo.splash?.backgroundColor).toBe(tokens.color.ground)
    expect(app.expo.backgroundColor).toBe(tokens.color.ground)
    expect(app.expo.android.backgroundColor).toBe(tokens.color.ground)
  })
})
