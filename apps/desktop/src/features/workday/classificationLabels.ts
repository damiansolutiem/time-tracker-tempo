import type { WorkdayClassificationCategory } from '@time-tracker/domain';

export const classificationLabels: Record<WorkdayClassificationCategory, string> = {
  break: 'Break',
  personal_away: 'Personal / away',
  distraction: 'Distraction',
  ignored: 'Ignore from schedule',
};

export const classificationDescriptions: Record<WorkdayClassificationCategory, string> = {
  break: 'An additional break inside planned work. It remains non-worked time.',
  personal_away: 'Personal or away time that remains non-worked but is not a distraction.',
  distraction:
    'Time you explicitly identify as distracting; Tempo never assigns this automatically.',
  ignored: 'A schedule exception removed from the expected time for this day.',
};
