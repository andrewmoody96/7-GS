import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { TasksSheet } from '../components/TasksSheet';

interface TasksModal {
  /** Open the Add task window (from the tab bar, a todo link, an old Film Room link…). */
  open: () => void;
}

// Outside the provider (screens rendered alone in tests) opening is a no-op.
const TasksModalContext = createContext<TasksModal>({ open: () => {} });

export function useTasksModal(): TasksModal {
  return useContext(TasksModalContext);
}

/** Owns the one Add task window, so any screen can open it. */
export function TasksModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <TasksModalContext.Provider value={value}>
      {children}
      <TasksSheet open={isOpen} onClose={() => setOpen(false)} />
    </TasksModalContext.Provider>
  );
}
