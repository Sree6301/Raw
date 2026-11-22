import { calculateDuplexPages } from '../shared/src/types.js';

function runDuplexTests() {
  console.log('--- RUNNING DUPLEX MATHEMATICAL ENGINE TESTS ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  // Test 1: Even page count N = 6
  // Expected: N' = 6, blankPageAppended = false, firstSide = [1, 3, 5], secondSide = [6, 4, 2]
  const res6 = calculateDuplexPages(6);
  assert(res6.normalizedTotal === 6, 'N=6 normalized total is 6');
  assert(res6.blankPageAppended === false, 'N=6 no blank page appended');
  assert(JSON.stringify(res6.firstSidePages) === JSON.stringify([1, 3, 5]), 'N=6 first side is [1, 3, 5]');
  assert(JSON.stringify(res6.secondSidePages) === JSON.stringify([6, 4, 2]), 'N=6 second side is [6, 4, 2] descending');

  // Test 2: Odd page count N = 5
  // Expected: N' = 6, blankPageAppended = true, firstSide = [1, 3, 5], secondSide = [6, 4, 2]
  const res5 = calculateDuplexPages(5);
  assert(res5.normalizedTotal === 6, 'N=5 normalized total is 6 (N+1)');
  assert(res5.blankPageAppended === true, 'N=5 blank page appended');
  assert(JSON.stringify(res5.firstSidePages) === JSON.stringify([1, 3, 5]), 'N=5 first side is [1, 3, 5]');
  assert(JSON.stringify(res5.secondSidePages) === JSON.stringify([6, 4, 2]), 'N=5 second side is [6, 4, 2]');

  // Test 3: Single page N = 1
  // Expected: N' = 2, blankPageAppended = true, firstSide = [1], secondSide = [2]
  const res1 = calculateDuplexPages(1);
  assert(res1.normalizedTotal === 2, 'N=1 normalized total is 2');
  assert(res1.blankPageAppended === true, 'N=1 blank page appended');
  assert(JSON.stringify(res1.firstSidePages) === JSON.stringify([1]), 'N=1 first side is [1]');
  assert(JSON.stringify(res1.secondSidePages) === JSON.stringify([2]), 'N=1 second side is [2]');

  // Test 4: Two pages N = 2
  // Expected: N' = 2, blankPageAppended = false, firstSide = [1], secondSide = [2]
  const res2 = calculateDuplexPages(2);
  assert(res2.normalizedTotal === 2, 'N=2 normalized total is 2');
  assert(res2.blankPageAppended === false, 'N=2 no blank page appended');
  assert(JSON.stringify(res2.firstSidePages) === JSON.stringify([1]), 'N=2 first side is [1]');
  assert(JSON.stringify(res2.secondSidePages) === JSON.stringify([2]), 'N=2 second side is [2]');

  // Test 5: Seven pages N = 7
  // Expected: N' = 8, blankPageAppended = true, firstSide = [1, 3, 5, 7], secondSide = [8, 6, 4, 2]
  const res7 = calculateDuplexPages(7);
  assert(res7.normalizedTotal === 8, 'N=7 normalized total is 8');
  assert(res7.blankPageAppended === true, 'N=7 blank page appended');
  assert(JSON.stringify(res7.firstSidePages) === JSON.stringify([1, 3, 5, 7]), 'N=7 first side is [1, 3, 5, 7]');
  assert(JSON.stringify(res7.secondSidePages) === JSON.stringify([8, 6, 4, 2]), 'N=7 second side is [8, 6, 4, 2]');

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runDuplexTests();
