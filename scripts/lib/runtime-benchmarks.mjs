const DEFAULT_RUNTIME_BENCH_SCENARIOS = Object.freeze([
  { name: 'small', profile: 'small' },
  { name: 'medium', profile: 'medium' },
  { name: 'large', profile: 'large' },
  { name: 'wide-cardinality', profile: 'wideCardinality' },
  { name: 'historical-heavy', profile: 'historicalHeavy' },
]);

export function buildRuntimeBenchScenarios(selectedNames = []) {
  if (!selectedNames.length) {
    return [...DEFAULT_RUNTIME_BENCH_SCENARIOS];
  }
  const selected = new Set(selectedNames.map((value) => value.toLowerCase()));
  return DEFAULT_RUNTIME_BENCH_SCENARIOS.filter(
    (scenario) => selected.has(scenario.name) || selected.has(scenario.profile.toLowerCase())
  );
}

export function listRuntimeBenchScenarioNames() {
  return DEFAULT_RUNTIME_BENCH_SCENARIOS.map((scenario) => scenario.name);
}

export async function runBenchScenarios({ scenarios, warmup, runs, runScenario }) {
  const allRuns = [];
  for (const scenario of scenarios) {
    for (let index = 0; index < warmup; index += 1) {
      await runScenario(scenario);
    }
    for (let index = 0; index < runs; index += 1) {
      allRuns.push(...(await runScenario(scenario)));
    }
  }
  return allRuns;
}
