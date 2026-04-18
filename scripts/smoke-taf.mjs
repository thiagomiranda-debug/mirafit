// Run: node --experimental-strip-types scripts/smoke-taf.mjs

import {
  calculateTafScore,
  formatRunTime,
  parseTimeInput,
  scoreRunTime,
  secondsToReachScore,
} from "../src/lib/tafData.ts";

let failures = 0;

function assertEq(actual, expected, label) {
  const ok =
    actual === expected ||
    (typeof actual === "number" &&
      typeof expected === "number" &&
      Math.abs(actual - expected) < 0.001);

  const status = ok ? "OK" : "FAIL";
  console.log(`[${status}] ${label} - got ${actual}, expected ${expected}`);
  if (!ok) failures += 1;
}

console.log("--- parseTimeInput ---");
assertEq(parseTimeInput("1:20.50"), 80.5, "parse mm:ss.cc");
assertEq(parseTimeInput("8:45"), 525, "parse mm:ss");
assertEq(parseTimeInput("45.30"), 45.3, "parse ss.cc");
assertEq(parseTimeInput("45"), 45, "parse ss");
assertEq(parseTimeInput("1:60"), null, "reject seconds >= 60");
assertEq(parseTimeInput("abc"), null, "reject garbage");
assertEq(parseTimeInput(""), null, "reject empty");

console.log("\n--- formatRunTime ---");
assertEq(formatRunTime(72.5, "run_300m"), "1:12.50", "format 300m");
assertEq(formatRunTime(525, "run_1600m"), "08:45", "format 1600m");
assertEq(formatRunTime(0, "run_300m"), "0:00.00", "format zero 300m");

console.log("\n--- calculateTafScore (reps) ---");
assertEq(calculateTafScore(24, 24, 5), 50, "flexao 24 reps = 50 pts");
assertEq(calculateTafScore(34, 24, 5), 100, "flexao 34 reps = 100 pts");
assertEq(calculateTafScore(14, 24, 5), 0, "flexao 14 reps = 0 pts");

console.log("\n--- scoreRunTime monotonicity ---");
const times = [60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120];
let lastScore = 101;
for (const time of times) {
  const score = scoreRunTime(time, "masculino", "under_30", "run_300m");
  const monotone = score <= lastScore;
  console.log(
    `  300m ${time}s (masc <=30) -> ${score} pts ${
      monotone ? "OK" : "FAIL (nao monotonic)"
    }`
  );
  if (!monotone) failures += 1;
  lastScore = score;
}

console.log("\n--- scoreRunTime endpoints ---");
assertEq(
  scoreRunTime(10, "masculino", "under_30", "run_300m"),
  100,
  "10s 300m masc <=30 = 100 pts"
);
assertEq(
  scoreRunTime(999, "masculino", "under_30", "run_300m"),
  0,
  "999s 300m masc <=30 = 0 pts"
);

console.log("\n--- secondsToReachScore ---");
const fastTime = 30;
assertEq(
  secondsToReachScore(fastTime, 100, "masculino", "under_30", "run_300m"),
  0,
  "ja 100 pts -> 0s para reduzir"
);

console.log(`\n${failures === 0 ? "ALL OK" : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
