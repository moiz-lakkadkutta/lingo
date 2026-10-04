/** Nova's answer failed validation twice (initial call + one feedback retry). Re-exported from ./index. */
export class AiSchemaError extends Error {
  constructor(public readonly kind: 'gloss' | 'quiz', public readonly issues: string[], public readonly lastOutput: unknown) {
    super(`Nova ${kind} answer rejected twice: ${issues.join('; ')}`)
    this.name = 'AiSchemaError'
  }
}
