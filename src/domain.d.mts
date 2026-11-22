export function splitCents(
  cents: number,
  ids: string[]
): Record<string, number>;
export function balances(
  profiles: any[],
  expenses: any[],
  transfers: any[]
): Record<string, number>;
export function settlements(
  balance: Record<string, number>
): { from: string; to: string; cents: number }[];
