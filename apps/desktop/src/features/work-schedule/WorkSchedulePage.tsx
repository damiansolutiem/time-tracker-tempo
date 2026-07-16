import type {
  WeeklyWorkSchedule,
  WorkScheduleOverride,
  WorkScheduleOverrideEvent,
  WorkScheduleRevision,
} from '@time-tracker/domain';
import type { appStore } from '../../app/store';
import { WorkScheduleEditor } from './WorkScheduleEditor';

type Props = {
  schedule: WeeklyWorkSchedule;
  revisions: WorkScheduleRevision[];
  overrides: WorkScheduleOverride[];
  overrideEvents: WorkScheduleOverrideEvent[];
  actions: typeof appStore;
};

export function WorkSchedulePage({
  schedule,
  revisions,
  overrides,
  overrideEvents,
  actions,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-6xl px-10 py-9">
      <h1 className="m-0 text-3xl font-semibold tracking-tight">Work schedule</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-surface-muted-foreground">
        Describe the hours you normally plan to work, then add exceptions for particular dates. This
        is a planning guide: tracked task time still counts as work outside these hours.
      </p>
      <WorkScheduleEditor
        schedule={schedule}
        revisions={revisions}
        overrides={overrides}
        overrideEvents={overrideEvents}
        onSave={(nextSchedule, effectiveFrom, reason) =>
          actions.updateWorkSchedule(nextSchedule, effectiveFrom, reason)
        }
        onSetOverride={(date, name, blocks) => actions.setWorkScheduleOverride(date, name, blocks)}
        onRemoveOverride={(date) => actions.removeWorkScheduleOverride(date)}
      />
    </div>
  );
}
