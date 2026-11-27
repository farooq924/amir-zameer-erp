/* Runs e2e suites in alphabetical order so suites that create orders run after the
   dashboard zero-state checks (all suites share one test database). */
class AlphabeticalSequencer {
  sort(tests) {
    return [...tests].sort((a, b) => a.path.localeCompare(b.path));
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
