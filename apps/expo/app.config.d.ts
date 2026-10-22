// Types for the pure helpers, so the node test in packages/shared-ui/test can import them (apps/expo has no vitest setup).
export type Variant = 'iap' | 'demo'
export interface IntentFilter { action?: string; data?: Record<string, unknown> | Record<string, unknown>[]; [k: string]: unknown }
export interface AppConfig {
  name?: string; scheme?: string; extra?: Record<string, unknown>; plugins?: (string | [string, unknown])[]
  android?: { package?: string; intentFilters?: IntentFilter[]; [k: string]: unknown }; [k: string]: unknown
}
export function variantOf(env: Record<string, string | undefined>): Variant
export function withScheme(intentFilters: IntentFilter[] | undefined, scheme: string): IntentFilter[]
export function resolveConfig(config: AppConfig, v: Variant): AppConfig
declare function appConfig(ctx: { config: AppConfig }): AppConfig
export default appConfig
