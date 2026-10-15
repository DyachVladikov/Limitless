import type { Row } from '../../core/types';

export function scenarioView(scenario: Row | undefined): Row | null {
  if (!scenario) {
    return null;
  }

  // До подтверждения ответа эталон не попадает даже во вложенный снимок.
  let content: Row | null = null;
  if (scenario.assigned_content) {
    content = {
      title: scenario.assigned_content.title,
      prompt: scenario.assigned_content.prompt,
      rewardXp: scenario.assigned_content.rewardXp,
    };
    if (scenario.answer_submitted_at) {
      content.referenceAnswer = scenario.assigned_content.referenceAnswer;
    }
  }

  return {
    id: scenario.id,
    attempt_id: scenario.attempt_id,
    issued_at: scenario.issued_at,
    next_available_on: scenario.next_available_on,
    version: scenario.version,
    assigned_content: content,
    user_answer: scenario.user_answer,
    answer_submitted_at: scenario.answer_submitted_at,
    self_score: scenario.self_score,
    completed_at: scenario.completed_at,
    awarded_xp: scenario.awarded_xp,
  };
}
