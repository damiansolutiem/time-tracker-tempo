import {
  BarChart3,
  CalendarClock,
  Clock3,
  FolderKanban,
  History,
  ListTodo,
  Settings,
  Sparkles,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { HistoryPage } from '../features/history/HistoryPage';
import { GroupsPage } from '../features/groups/GroupsPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { ExportsPage } from '../features/reports/ExportsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { TaxonomyPage } from '../features/taxonomy/TaxonomyPage';
import { TimerPage } from '../features/timer/TimerPage';
import { CompactWorkCheckBanner } from '../features/work-check/CompactWorkCheckBanner';
import { WorkSchedulePage } from '../features/work-schedule/WorkSchedulePage';
import { useAppStore } from './useAppStore';
import { WorkdayReminderBanner } from '../features/workday/WorkdayReminderBanner';
import { localDateKey } from '../features/history/day';
import { isDevelopmentBuild, productName } from './buildFlavor';

type Page =
  | 'Timer'
  | 'Tasks'
  | 'Groups'
  | 'Taxonomy'
  | 'WorkSchedule'
  | 'History'
  | 'Reports'
  | 'Exports'
  | 'Settings';

type NavigationItem = { page: Page; label: string; icon: LucideIcon };
type NavigationGroup = { title?: string; items: NavigationItem[] };

const navigationGroups: NavigationGroup[] = [
  {
    title: 'Track',
    items: [
      { page: 'Timer', label: 'Timer', icon: Clock3 },
      { page: 'History', label: 'History', icon: History },
    ],
  },
  {
    title: 'Manage',
    items: [
      { page: 'Tasks', label: 'Tasks', icon: ListTodo },
      { page: 'Groups', label: 'Groups', icon: FolderKanban },
      { page: 'Taxonomy', label: 'Categories & tags', icon: Tags },
      { page: 'WorkSchedule', label: 'Work schedule', icon: CalendarClock },
    ],
  },
  {
    title: 'Review',
    items: [{ page: 'Reports', label: 'Reports', icon: BarChart3 }],
  },
];

function NavigationButton({
  item,
  active,
  onSelect,
}: {
  item: NavigationItem;
  active: boolean;
  onSelect: (page: Page) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.page)}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-primary-container text-primary-container-foreground' : 'text-surface-muted-foreground hover:bg-surface-muted hover:text-surface-foreground'}`}
    >
      <Icon size={18} strokeWidth={2} />
      {item.label}
    </button>
  );
}

function Sidebar({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  return (
    <aside className="flex h-full min-h-0 w-60 shrink-0 flex-col overflow-hidden border-r bg-surface">
      <header className="flex shrink-0 items-center gap-3 px-6 pt-5 pb-6">
        <div
          className={`grid size-9 place-items-center rounded-xl text-primary-foreground shadow-sm ${isDevelopmentBuild ? 'bg-info' : 'bg-primary'}`}
        >
          <Clock3 size={20} strokeWidth={2.4} />
        </div>
        <div>
          <div className="text-[15px] font-semibold tracking-tight">{productName}</div>
          <div className="text-xs text-surface-muted-foreground">Local time tracker</div>
        </div>
      </header>
      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4"
        aria-label="Main navigation"
      >
        {navigationGroups.map((group, index) => (
          <div key={group.title ?? index} className={index === 0 ? '' : 'mt-5'}>
            {group.title ? (
              <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-surface-muted-foreground/65">
                {group.title}
              </div>
            ) : null}
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavigationButton
                  key={item.page}
                  item={item}
                  active={page === item.page}
                  onSelect={setPage}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <footer className="shrink-0 border-t bg-surface p-3">
        <NavigationButton
          item={{ page: 'Settings', label: 'Settings', icon: Settings }}
          active={page === 'Settings' || page === 'Exports'}
          onSelect={setPage}
        />
        <div className="mt-3 rounded-xl border bg-card p-3.5 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Sparkles size={15} className="text-primary" />
            {isDevelopmentBuild ? 'Development build' : 'Local-first'}
          </div>
          <p className="m-0 text-xs leading-5 text-surface-muted-foreground">
            {isDevelopmentBuild
              ? 'Uses a separate app identity and database from Tempo.'
              : 'Production data stays local on this Mac.'}
          </p>
        </div>
      </footer>
    </aside>
  );
}

export function App() {
  const [page, setPage] = useState<Page>('Timer');
  const contentRef = useRef<HTMLElement>(null);
  const { snapshot, actions } = useAppStore();

  useEffect(() => {
    contentRef.current?.focus();
  }, [page]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <Sidebar page={page === 'Exports' ? 'Settings' : page} setPage={setPage} />
      <main
        id="main-content"
        ref={contentRef}
        tabIndex={-1}
        aria-label={`${page === 'Taxonomy' ? 'Categories and tags' : page} page`}
        className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain outline-none"
      >
        <WorkdayReminderBanner
          reminder={snapshot.workdayReminder}
          settings={snapshot.workdayReminderSettings}
          actions={actions}
          onReview={() => {
            void actions.loadHistory(localDateKey());
            setPage('History');
          }}
        />
        {snapshot.workCheck.status === 'pending' && snapshot.timer.running ? (
          <CompactWorkCheckBanner
            running={snapshot.timer.running}
            workCheck={snapshot.workCheck}
            settings={snapshot.workCheckSettings}
            tasks={snapshot.tasks}
            groups={snapshot.groups}
            actions={actions}
          />
        ) : null}
        {snapshot.status === 'loading' ? (
          <div
            role="status"
            className="grid min-h-full place-items-center text-sm text-surface-muted-foreground"
          >
            Opening local database…
          </div>
        ) : snapshot.status === 'error' ? (
          <div className="mx-auto max-w-xl p-12">
            <h1 className="text-2xl font-semibold">Tempo could not start</h1>
            <p role="alert" className="rounded-lg bg-danger-container p-4 text-sm text-danger">
              {snapshot.error}
            </p>
          </div>
        ) : page === 'Timer' ? (
          <TimerPage
            running={snapshot.timer.running}
            tasks={snapshot.tasks}
            recentTasks={snapshot.recentTasks}
            groups={[...snapshot.groups, ...snapshot.archivedGroups]}
            recentEntries={snapshot.recentEntries}
            activeTaskCount={snapshot.tasks.length}
            todayTotalMs={snapshot.todayTotalMs}
            currentTaskTotalMs={snapshot.currentTaskTotalMs}
            totalCapturedAt={snapshot.totalCapturedAt}
            workSchedule={snapshot.workSchedule}
            workScheduleRevisions={snapshot.workScheduleRevisions}
            workScheduleOverrides={snapshot.workScheduleOverrides}
            workdayDate={snapshot.workdayDate}
            workdayEntries={snapshot.workdayEntries}
            workdayClassifications={snapshot.workdayClassifications}
            runningClassification={snapshot.classificationTimer.running}
            trayTimeMode={
              snapshot.timer.running &&
              snapshot.trayTimeModeOverride?.entryId === snapshot.timer.running.id
                ? snapshot.trayTimeModeOverride.mode
                : snapshot.trayTimeModeDefault
            }
            actions={actions}
            onViewTasks={() => setPage('Tasks')}
            onViewSettings={() => setPage('Settings')}
          />
        ) : page === 'Tasks' ? (
          <TasksPage
            tasks={snapshot.tasks}
            archivedTasks={snapshot.archivedTasks}
            groups={[...snapshot.groups, ...snapshot.archivedGroups]}
            categories={[...snapshot.categories, ...snapshot.archivedCategories]}
            tags={[...snapshot.tags, ...snapshot.archivedTags]}
            runningTaskId={snapshot.timer.running?.taskId ?? null}
            actions={actions}
          />
        ) : page === 'Groups' ? (
          <GroupsPage
            groups={snapshot.groups}
            archivedGroups={snapshot.archivedGroups}
            tasks={snapshot.tasks}
            actions={actions}
          />
        ) : page === 'Taxonomy' ? (
          <TaxonomyPage
            categories={snapshot.categories}
            archivedCategories={snapshot.archivedCategories}
            tags={snapshot.tags}
            archivedTags={snapshot.archivedTags}
            actions={actions}
          />
        ) : page === 'WorkSchedule' ? (
          <WorkSchedulePage
            schedule={snapshot.workSchedule}
            revisions={snapshot.workScheduleRevisions}
            overrides={snapshot.workScheduleOverrides}
            overrideEvents={snapshot.workScheduleOverrideEvents}
            actions={actions}
          />
        ) : page === 'History' ? (
          <HistoryPage
            date={snapshot.historyDate}
            entries={snapshot.historyEntries}
            classifications={snapshot.historyClassifications}
            finalizedPeriods={snapshot.finalizedReportPeriods}
            workSchedule={snapshot.workSchedule}
            workScheduleRevisions={snapshot.workScheduleRevisions}
            workScheduleOverrides={snapshot.workScheduleOverrides}
            groups={[...snapshot.groups, ...snapshot.archivedGroups]}
            categories={[...snapshot.categories, ...snapshot.archivedCategories]}
            tags={[...snapshot.tags, ...snapshot.archivedTags]}
            status={snapshot.historyStatus}
            error={snapshot.historyError}
            tasks={[...snapshot.tasks, ...snapshot.archivedTasks].sort((first, second) =>
              first.title.localeCompare(second.title),
            )}
            actions={actions}
          />
        ) : page === 'Reports' ? (
          <ReportsPage
            range={snapshot.reportRange}
            entries={snapshot.reportEntries}
            classifications={snapshot.reportClassifications}
            finalizedPeriods={snapshot.finalizedReportPeriods}
            workSchedule={snapshot.workSchedule}
            workScheduleRevisions={snapshot.workScheduleRevisions}
            workScheduleOverrides={snapshot.workScheduleOverrides}
            status={snapshot.reportStatus}
            error={snapshot.reportError}
            exportColumns={snapshot.reportExportColumns}
            actions={actions}
            onConfigureExports={() => setPage('Exports')}
          />
        ) : page === 'Exports' ? (
          <ExportsPage
            columns={snapshot.reportExportColumns}
            actions={actions}
            onBack={() => setPage('Settings')}
          />
        ) : page === 'Settings' ? (
          <SettingsPage
            settings={snapshot.workCheckSettings}
            reminderSettings={snapshot.workdayReminderSettings}
            trayTimeModeDefault={snapshot.trayTimeModeDefault}
            actions={actions}
            onConfigureExports={() => setPage('Exports')}
          />
        ) : null}
      </main>
    </div>
  );
}
