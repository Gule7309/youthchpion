/** Preserve the numeric sign: colour alone must not communicate direction. */
export function changeClass(value: number) {
  return `annual-change annual-change--${value < 0 ? 'down' : value > 0 ? 'up' : 'flat'}`
}
export function ChangeText({ text }: { text: string }) {
  return <>{text.split(/([+-]?\d+(?:\.\d+)?%)/g).map((part, i) =>
    /^[+-]?\d+(?:\.\d+)?%$/.test(part)
      ? <strong className={changeClass(Number.parseFloat(part))} key={i}>{part}</strong>
      : part)}</>
}
