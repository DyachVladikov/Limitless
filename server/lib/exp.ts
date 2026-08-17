type ProfileRow = Record<string, any>;

export function addExp(profile: ProfileRow, amount: number) {
  let currentExp = profile.current_exp + amount;
  let currentLevel = profile.current_level;
  let expToNextLevel = currentLevel * 100;

  while (currentExp >= expToNextLevel) {
    currentExp -= expToNextLevel;
    currentLevel += 1;
    expToNextLevel = currentLevel * 100;
  }

  return {
    expFields: {
      current_exp: currentExp,
      current_level: currentLevel,
      total_exp: profile.total_exp + amount,
    },
    leveledUp: currentLevel > profile.current_level,
  };
}

export function removeExp(profile: ProfileRow, amount: number) {
  return {
    current_exp: Math.max(0, profile.current_exp - amount),
    total_exp: Math.max(0, profile.total_exp - amount),
  };
}

export function touchStreak(profile: ProfileRow) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let streak = 1;
  if (profile.last_active_date === today) {
    streak = profile.streak;
  } else if (profile.last_active_date === yesterday) {
    streak = profile.streak + 1;
  }

  return { streak, last_active_date: today };
}
