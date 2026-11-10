import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { TasksSheet } from '../components/TasksSheet';
import { TaskSheet } from '../components/TaskViews';
import { useMeQuery, useTasksQuery } from './queries';

interface TasksModal {
  /** Open the Add task window (from the tab bar, a todo link, an old Film Room link…). */
  open: () => void;
  /** Open one task's edit window (from a lineup row). */
  edit: (taskId: string) => void;
}

// Outside the provider (screens rendered alone in tests) these are no-ops.
const TasksModalContext = createContext<TasksModal>({ open: () => {}, edit: () => {} });

export function useTasksModal(): TasksModal {
  return useContext(TasksModalContext);
}

function EditTask({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const tasks = useTasksQuery();
  const me = useMeQuery();
  const task = tasks.data?.find((t) => t.id === taskId);
  return task ? <TaskSheet task={task} today={me.data?.today ?? null} onClose={onClose} /> : null;
}

/** Owns the Add task window and the edit window, so any screen can open them. */
export function TasksModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const value = useMemo(() => ({ open: () => setOpen(true), edit: (taskId: string) => setEditing(taskId) }), []);
  return (
    <TasksModalContext.Provider value={value}>
      {children}
      <TasksSheet open={isOpen} onClose={() => setOpen(false)} />
      {editing ? <EditTask taskId={editing} onClose={() => setEditing(null)} /> : null}
    </TasksModalContext.Provider>
  );
}
