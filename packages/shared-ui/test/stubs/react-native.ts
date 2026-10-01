// Node stand-in for react-native in vitest (the real package ships Flow source Node cannot load).
// Covers only what shared-ui logic (Platform in platformCaps) and the kit's module scope touch.
export const Platform = { OS: 'web' as string, select: <T>(o: { default?: T; web?: T }) => o.web ?? o.default }
export const StyleSheet = { create: <T>(s: T) => s, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1, flatten: <T>(s: T) => s }
export const View = 'View'
export const Text = 'Text'
export default { Platform, StyleSheet, View, Text }
