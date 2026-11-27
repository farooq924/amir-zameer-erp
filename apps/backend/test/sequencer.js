/* Runs e2e suites in alphabetical order so suites that create orders run after the
   dashboard zero-state checks (all suites share one test database). The demo-data suite runs last. */
class AlphabeticalSequencer {
  sort(tests) {
    // The demo-data suite runs last: it checks that removing the demo leaves the other suites' records untouched.
    const rank = (t) => (t.path.includes('demo-data') ? 1 : 0);
    return [...tests].sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
  }
  allFailedTests(tests) {
    return tests;
  }
  cacheResults() {}
  shard(tests) {
    return tests;
  }
}
module.exports = AlphabeticalSequencer;
