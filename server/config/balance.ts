/** Immutable versions: never edit an existing version after deploying it. */
const initial = {
  version: '2026-10-10-v1',
  focusXpPerMinute: '0.20',
  focusDailySeconds: 7200,
  loginRewards: ['1.00', '2.00', '3.00', '4.00', '5.00', '6.00', '7.00'],
  study: {
    labDone: { xp: '20.00', stats: {} },
    labPassed: { xp: '30.00', stats: {} },
    subjectClosed: { xp: '100.00', stats: {} },
  },
  ranks: [
    { rank: 'E', xp: 0 }, { rank: 'D', xp: 500 }, { rank: 'C', xp: 1500 },
    { rank: 'B', xp: 3500 }, { rank: 'A', xp: 7000 }, { rank: 'S', xp: 12000 },
    { rank: 'S+', xp: 20000 }, { rank: 'SS', xp: 35000 }, { rank: 'SSS', xp: 60000 },
  ],
  xpPerLevel: 100,
  statStages: [0, 100, 1000, 5000],
  nutrition: { tolerancePercent: 15, severeDeviationPercent: 35, rewardXp: '10.00', penaltyXp: '5.00' },
  mentors: { popupChance: 0.2, ownSectionChance: 0.8, popupCooldownMinutes: 15 },
};
export type Balance = typeof initial;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export const BALANCE: Balance = freeze(initial);
const versions: Record<string, Balance> = { [BALANCE.version]: BALANCE };
export function balanceFor(version: string): Balance {
  const balance = versions[version];
  if (!balance) throw new Error(`Unsupported saved balance version: ${version}`);
  return balance;
}
export const STAT_KEYS = ['intelligence', 'strength', 'rationality', 'ego', 'discipline', 'energy'] as const;
