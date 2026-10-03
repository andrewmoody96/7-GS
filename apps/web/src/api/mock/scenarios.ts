// Kept separate from the mock backend so the app shell can list scenarios without
// pulling the whole mock into the main bundle.

export const SCENARIOS = ['midseason', 'rally', 'doubleheader', 'preseason', 'offseason'] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

export function isScenario(value: string): value is ScenarioName {
  return (SCENARIOS as readonly string[]).includes(value);
}
