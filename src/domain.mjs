export function splitCents(cents, ids) {
  const people = [...new Set(ids)].sort();
  if (!Number.isSafeInteger(cents) || cents <= 0 || !people.length)
    throw new Error("Importo o partecipanti non validi");
  return Object.fromEntries(
    people.map((id, i) => [
      id,
      Math.floor(cents / people.length) + (i < cents % people.length ? 1 : 0),
    ])
  );
}
export function balances(profiles, expenses, transfers) {
  const result = Object.fromEntries(profiles.map((p) => [p.owner, 0]));
  for (const e of expenses) {
    result[e.owner] = (result[e.owner] || 0) + e.payload.cents;
    for (const [id, cents] of Object.entries(
      splitCents(e.payload.cents, e.payload.people)
    ))
      result[id] = (result[id] || 0) - cents;
  }
  for (const t of transfers.filter((t) => t.payload.confirmed)) {
    result[t.payload.from] = (result[t.payload.from] || 0) + t.payload.cents;
    result[t.payload.to] = (result[t.payload.to] || 0) - t.payload.cents;
  }
  return result;
}
export function settlements(balance) {
  const debtors = Object.entries(balance)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, cents: -v }));
  const creditors = Object.entries(balance)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, cents: v }));
  const result = [];
  for (const d of debtors)
    for (const c of creditors) {
      const cents = Math.min(d.cents, c.cents);
      if (cents) {
        result.push({ from: d.id, to: c.id, cents });
        d.cents -= cents;
        c.cents -= cents;
      }
    }
  return result;
}
