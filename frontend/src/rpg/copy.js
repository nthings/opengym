// The words of the RPG sheet, each written inside t() so scripts/check-source-strings.mjs finds
// them (a key handed over in a variable is invisible to it and would quietly stay English).
import { t } from '../lib/i18n.js'

export const titleCopy = () => ({
  Novice: t('Novice'), Apprentice: t('Apprentice'), Warrior: t('Warrior'), Champion: t('Champion'), Legend: t('Legend'),
})
export const attributeCopy = () => ({
  legs: t('Legs'), back: t('Back muscles'), chest: t('Chest'), shoulders: t('Shoulders'), arms: t('Arms'), core: t('Core'),
})
export const badgeCopy = () => ({
  'first-workout': t('First workout'),
  'workouts-10': t('{0} workouts', 10),
  'workouts-50': t('{0} workouts', 50),
  'workouts-100': t('{0} workouts', 100),
  'streak-4': t('{0} week streak', 4),
  'streak-12': t('{0} week streak', 12),
})

export const sourceCopy = () => ({
  consistency: t('Consistency'), performance: t('Performance'), streak: t('Streak'),
})
