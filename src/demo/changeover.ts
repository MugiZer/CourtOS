export function timeCallDue(endsAt: number | null, now: number, lastCalledAt: number | null) {
  return endsAt !== null && endsAt !== lastCalledAt && now >= endsAt - 10_000 && now < endsAt;
}
