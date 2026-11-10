import { Link } from 'react-router-dom';
import { vocab } from '../vocab';
import { Sheet } from './Sheet';

const SEEN_KEY = '7gs.howItWorksSeen';

/** Whether this device has already been shown the guide (storage can be unavailable). */
export function hasSeenHowItWorks(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markHowItWorksSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Private mode: the guide may show again next visit, which is harmless.
  }
}

/** The game in five steps: plain task words first, the baseball name second. */
export function HowItWorksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const must = vocab.term.required.toLowerCase();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      kicker={vocab.app.name}
      title="How it works"
      footer={
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Got it
          </button>
        </div>
      }
    >
      <p className="lede">A task list you play like a baseball season. Every day is a game. Every week is a best-of-7 series.</p>
      <ol className="howto">
        <li>
          <h3>Add your tasks</h3>
          <p>
            Habits and to-dos go in <Link to="/film-room?tab=tasks" onClick={onClose}>Film Room → {vocab.terms.roster}</Link>. Each
            task is worth 1 run unless you make it worth more.
          </p>
        </li>
        <li>
          <h3>Plan your week</h3>
          <p>
            The <strong>Rotation</strong> is your default plan for each weekday. It fills in future weeks.
          </p>
          <p>
            The <strong>{vocab.week.title}</strong> is the actual week: seven days, each with its own lineup of tasks. Change
            this week there. Next week’s card opens on Friday.
          </p>
        </li>
        <li>
          <h3>Win the day</h3>
          <p>
            Check off tasks to score runs. You get the W when you reach that day’s <strong>runs to win</strong> and finish every{' '}
            <strong>{must}</strong> (a task you’ve marked as required). The day ends at midnight.
          </p>
        </li>
        <li className="howto__key">
          <h3>Once the week starts: add, don’t remove</h3>
          <p>
            The week starts with your first check-off (or first pitch time) of the week. From then on you can’t remove tasks, drop
            a {must} or lower runs to win.
          </p>
          <p>
            You <strong>can still add tasks</strong> to today or any later day, from Today or the {vocab.week.title}:
          </p>
          <ul>
            <li>
              <strong>{vocab.pinchHit.action}</strong> puts it in the lineup as a {must} (a “pinch hitter”). Runs to win goes up
              by its runs.
            </li>
            <li>
              <strong>{vocab.week.addToBench}</strong> makes it an optional extra. It can sub in for a task that isn’t a {must}.
            </li>
          </ul>
        </li>
        <li>
          <h3>Win the week</h3>
          <p>Seven days, seven games. Win four and you take the series. Series add up to your season record.</p>
        </li>
      </ol>
      <h3 className="howto__sub">When life happens</h3>
      <ul className="howto__tools">
        <li>
          <strong>{vocab.term.postponed}</strong>: you know a day is gone. Move it to another day that week.
        </li>
        <li>
          <strong>{vocab.suspension.action}</strong>: something came up mid-day. Finish it later in the week.
        </li>
        <li>
          <strong>{vocab.term.paused}</strong>: one task is impossible for a while. Pause it without taking losses.
        </li>
        <li>
          <strong>{vocab.term.comebackToken}</strong>: a chance to flip a loss into a win the next morning.
        </li>
      </ul>
      <p className="fine">Open this any time with the ? button at the top of the screen.</p>
    </Sheet>
  );
}
