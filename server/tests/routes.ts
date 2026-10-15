import type { GameAction } from '../core/game-request';
import { acknowledgeRankChange, getProfile, patchProfile } from '../controllers/profile';
import { openSession } from '../controllers/session';
import { getTodayTasks, setTaskCompleted } from '../controllers/tasks';
import { acknowledgeQuest, listQuests, setQuestProgress } from '../controllers/quests';
import { getFocusSummary, saveFocusSession } from '../controllers/focus';
import { createProgram, disableProgram, getProgram, listPrograms, replaceProgramExercises, updateProgram } from '../controllers/programs';
import { createExercise, disableExercise, getExercise, getExerciseHistory, listExercises, updateExercise } from '../controllers/exercises';
import { createWorkout, getWorkout, listWorkouts, updateWorkout } from '../controllers/workouts/controller';
import { createNutritionEntry, deleteNutritionEntry, getTodayNutrition, listDishes, updateNutritionEntry } from '../controllers/nutrition/controller';
import { archiveSubject, createSubject, getSubject, listSubjects, setSubjectClosed, updateSubject } from '../controllers/subjects';
import { setLabDone, setLabPassed } from '../controllers/labs';
import { listKnowledge } from '../controllers/knowledge';
import { archiveBook, createBook, getBook, listBooks, updateBook } from '../controllers/books';
import { drawCodingTask, getCurrentCoding, listCodingTasks, setCodingResult } from '../controllers/coding';
import { drawScenario, getCurrentScenario, saveScenarioAnswer, scoreScenario } from '../controllers/scenarios';
import { getPageMentor, listMentors, markMentorPopupSeen } from '../controllers/mentors';

export interface TestRoute {
  method: string;
  path: string;
  handle: GameAction;
  status: number;
  setup?: boolean;
}

export const testRoutes: TestRoute[] = [
  { method: 'GET', path: '/profile', handle: getProfile, status: 200 },
  { method: 'PATCH', path: '/profile', handle: patchProfile, status: 200 },
  { method: 'POST', path: '/profile/rank-change/seen', handle: acknowledgeRankChange, status: 200 },
  { method: 'POST', path: '/session/open', handle: openSession, status: 200 },
  { method: 'GET', path: '/tasks/today', handle: getTodayTasks, status: 200 },
  { method: 'PATCH', path: '/tasks/today/:id', handle: setTaskCompleted, status: 200 },
  { method: 'GET', path: '/quests', handle: listQuests, status: 200 },
  { method: 'PATCH', path: '/quests/:id/progress', handle: setQuestProgress, status: 200 },
  { method: 'POST', path: '/quests/:id/seen', handle: acknowledgeQuest, status: 200 },
  { method: 'GET', path: '/focus', handle: getFocusSummary, status: 200 },
  { method: 'POST', path: '/focus', handle: saveFocusSession, status: 201 },
  { method: 'GET', path: '/gym/programs', handle: listPrograms, status: 200 },
  { method: 'GET', path: '/gym/programs/:id', handle: getProgram, status: 200 },
  { method: 'POST', path: '/gym/programs', handle: createProgram, status: 201 },
  { method: 'PATCH', path: '/gym/programs/:id', handle: updateProgram, status: 200 },
  { method: 'DELETE', path: '/gym/programs/:id', handle: disableProgram, status: 200 },
  { method: 'PUT', path: '/gym/programs/:id/exercises', handle: replaceProgramExercises, status: 200 },
  { method: 'GET', path: '/gym/exercises', handle: listExercises, status: 200 },
  { method: 'GET', path: '/gym/exercises/:id', handle: getExercise, status: 200 },
  { method: 'GET', path: '/gym/exercises/:id/history', handle: getExerciseHistory, status: 200 },
  { method: 'POST', path: '/gym/exercises', handle: createExercise, status: 201 },
  { method: 'PATCH', path: '/gym/exercises/:id', handle: updateExercise, status: 200 },
  { method: 'DELETE', path: '/gym/exercises/:id', handle: disableExercise, status: 200 },
  { method: 'GET', path: '/workouts', handle: listWorkouts, status: 200 },
  { method: 'GET', path: '/workouts/:id', handle: getWorkout, status: 200 },
  { method: 'POST', path: '/workouts', handle: createWorkout, status: 201 },
  { method: 'PATCH', path: '/workouts/:id', handle: updateWorkout, status: 200 },
  { method: 'GET', path: '/dishes', handle: listDishes, status: 200 },
  { method: 'GET', path: '/nutrition/today', handle: getTodayNutrition, status: 200 },
  { method: 'POST', path: '/nutrition/entries', handle: createNutritionEntry, status: 201 },
  { method: 'PATCH', path: '/nutrition/entries/:id', handle: updateNutritionEntry, status: 200 },
  { method: 'DELETE', path: '/nutrition/entries/:id', handle: deleteNutritionEntry, status: 200 },
  { method: 'GET', path: '/subjects', handle: listSubjects, status: 200 },
  { method: 'GET', path: '/subjects/:id', handle: getSubject, status: 200 },
  { method: 'POST', path: '/subjects', handle: createSubject, status: 201 },
  { method: 'PATCH', path: '/subjects/:id', handle: updateSubject, status: 200 },
  { method: 'DELETE', path: '/subjects/:id', handle: archiveSubject, status: 200 },
  { method: 'PATCH', path: '/subjects/:id/closed', handle: setSubjectClosed, status: 200 },
  { method: 'PATCH', path: '/labs/:id/done', handle: setLabDone, status: 200 },
  { method: 'PATCH', path: '/labs/:id/passed', handle: setLabPassed, status: 200 },
  { method: 'GET', path: '/knowledge', handle: listKnowledge, status: 200 },
  { method: 'GET', path: '/books', handle: listBooks, status: 200 },
  { method: 'GET', path: '/books/:id', handle: getBook, status: 200 },
  { method: 'POST', path: '/books', handle: createBook, status: 201 },
  { method: 'PATCH', path: '/books/:id', handle: updateBook, status: 200 },
  { method: 'DELETE', path: '/books/:id', handle: archiveBook, status: 200 },
  { method: 'GET', path: '/coding/tasks', handle: listCodingTasks, status: 200 },
  { method: 'GET', path: '/coding/current', handle: getCurrentCoding, status: 200 },
  { method: 'POST', path: '/coding/next', handle: drawCodingTask, status: 200 },
  { method: 'PATCH', path: '/coding/:id/result', handle: setCodingResult, status: 200 },
  { method: 'GET', path: '/scenarios/current', handle: getCurrentScenario, status: 200 },
  { method: 'POST', path: '/scenarios/next', handle: drawScenario, status: 200 },
  { method: 'PATCH', path: '/scenarios/:id/answer', handle: saveScenarioAnswer, status: 200 },
  { method: 'PATCH', path: '/scenarios/:id/score', handle: scoreScenario, status: 200 },
  { method: 'GET', path: '/mentors', handle: listMentors, status: 200 },
  { method: 'GET', path: '/mentors/page', handle: getPageMentor, status: 200 },
  { method: 'POST', path: '/mentors/popup/seen', handle: markMentorPopupSeen, status: 200 },
  { method: 'POST', path: '/profile', handle: getProfile, status: 201, setup: true },
];
