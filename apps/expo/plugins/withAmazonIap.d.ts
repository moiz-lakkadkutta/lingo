// Types for the pure helpers, so the node test in packages/shared-ui/test can import them (apps/expo has no vitest setup).
/** expo/config-plugins PropertiesItem (gradle.properties entries). */
export type PropertiesItem = { type: 'comment'; value: string } | { type: 'empty' } | { type: 'property'; key: string; value: string }
export function setStoreProperty(props: PropertiesItem[]): PropertiesItem[]
export function pemTarget(projectRoot: string): string
export function pemSource(projectRoot: string): string
declare function withAmazonIap<T>(config: T): T
export default withAmazonIap
