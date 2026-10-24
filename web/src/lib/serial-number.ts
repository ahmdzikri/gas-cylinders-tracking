export const SERIAL_PREFIX = "CYL-"
export const SERIAL_DIGIT_COUNT = 6
const NON_DIGIT = /\D/g
const PREFIX_LIKE = /^\s*cyl/i

export function extractSerialDigits(input: string): string {
  return input.replace(NON_DIGIT, "").slice(0, SERIAL_DIGIT_COUNT)
}

export function toSerialValue(input: string): string {
  const digits = extractSerialDigits(input)
  return digits ? `${SERIAL_PREFIX}${digits}` : ""
}

export function hasSerialPrefix(text: string): boolean {
  return PREFIX_LIKE.test(text)
}
