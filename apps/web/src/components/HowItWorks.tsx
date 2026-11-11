import { THEME_TERMS } from '@7gs/rules';
import { activeTheme, vocab } from '../vocab';
import { InstallSteps } from './InstallHint';
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

/** Why the game exists and how it works in six steps: plain task words first, the sport's name second. */
export function HowItWorksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const must = vocab.term.required.toLowerCase();
  const target = vocab.terms.threshold.toLowerCase();
  const points = vocab.term.points.toLowerCase();
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
      <p className="lede">
        A task list you play like a {THEME_TERMS[activeTheme()].name.toLowerCase()} season. Every day is a game, every week is a best-of-7 series, and the goal is to win
        the season.
      </p>
      <aside className="howto__why">
        <h3>Why it works this way</h3>
        <p>
          Nobody is perfect. We set ourselves up to fail with long lists, then punish ourselves for not finishing them. 7-Game
          Series helps you set reasonable goals and see the value in what you did get done, even on a day that wasn’t everything
          you hoped for.
        </p>
        <p>
          You don’t have to win every day. Win 4 of 7 and you win the week. Plan the week ahead, protect your must-do’s, and add
          more to your plate if you want to. You just can’t take things off once the week has started.
        </p>
      </aside>
      <ol className="howto">
        <li>
          <h3>Add your tasks</h3>
          <p>
            Tap <strong>+ {vocab.tabs.addTask}</strong> at the bottom of any screen. Each task is worth 1 run unless you make it
            worth more. You can put it straight into today or a later day.
          </p>
        </li>
        <li>
          <h3>Plan your week</h3>
          <p>
            <strong>Team → {vocab.flavor.management} → Default Lineups</strong> is what each weekday starts with, every week. A
            new week copies these when it opens.
          </p>
          <p>
            <strong>Team → {vocab.flavor.management} → This Week</strong> is the actual week: seven days, each with its own
            lineup. Changes there are for that day only. Next week opens there on Friday.
          </p>
        </li>
        <li>
          <h3>Win the day</h3>
          <p>
            Check off tasks to score {points}. You get the W when you reach that day’s <strong>{target}</strong> and finish every{' '}
            <strong>{must}</strong> (a task you’ve marked as required). The day ends at midnight.
          </p>
        </li>
        <li className="howto__key">
          <h3>Once the week starts: add, don’t remove</h3>
          <p>
            The week starts with your first check-off (or first pitch time) of the week. From then on you can’t remove tasks, drop
            a {must} or lower {target}.
          </p>
          <p>
            You <strong>can still add tasks</strong> to today or any later day, with + {vocab.tabs.addTask} or from the lineups:
          </p>
          <ul>
            <li>
              <strong>{vocab.pinchHit.action}</strong> puts it in the lineup, and {target} goes up by its {points}. Added to
              today, it’s a {must} (a “{vocab.terms.pinchHitter.toLowerCase()}”). Added to a later day, you choose whether it’s a {must}.
            </li>
            <li>
              <strong>{vocab.week.addToBench}</strong> makes it an optional extra. It can sub in for a task that isn’t a {must}.
            </li>
          </ul>
        </li>
        <li>
          <h3>Win the week</h3>
          <p>Seven days, seven games. Win four and you take the series. A rough day or three doesn’t sink the week.</p>
        </li>
        <li>
          <h3>Win the season</h3>
          <p>
            A season is a quarter of the year: 12 weeks, then a <strong>{vocab.term.offseason}</strong> to look back and reset.
            That’s four seasons a year. Set a <strong>{vocab.terms.winGoal.toLowerCase()}</strong> you can really hit, and
            every win counts toward it.
          </p>
          <p>
            New here? Your season starts on Monday. If you’d rather not wait, choose <strong>{vocab.headStart.action}</strong>{' '}
            on the Today screen: the days left this week count toward your record.
          </p>
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
      <h3 className="howto__sub">Put it on your Home Screen</h3>
      <p>
        On a phone, add 7-Game Series to your Home Screen. It opens full screen like any other app and stays signed in. On
        iPhone, it’s also the only way to get reminders.
      </p>
      <p className="howto__platform">iPhone (Safari)</p>
      <InstallSteps platform="ios" />
      <p className="howto__platform">Android (Chrome)</p>
      <InstallSteps platform="android" />
      <p className="fine">
        On a computer, Chrome and Edge show an install button in the address bar. The Home Screen app keeps its own sign-in, so
        sign in there once with the 6-digit code from your email.
      </p>
      <p className="fine">Open this any time with the ? button at the top of the screen.</p>
    </Sheet>
  );
}
