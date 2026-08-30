import assert from "node:assert";
import { isWorkday, addWorkdays, nextWorkday, countWorkdaysBetween, isFirstWorkdayOfMonth } from "../js/logic/workdays.js";

// 2026-01-02 = Friday, 01-03 = Saturday, 01-04 = Sunday, 01-05 = Monday
const FRIDAY = "2026-01-02";
const SATURDAY = "2026-01-03";
const SUNDAY = "2026-01-04";
const MONDAY = "2026-01-05";

assert.strictEqual(isWorkday(MONDAY), true);
assert.strictEqual(isWorkday(FRIDAY), true);
assert.strictEqual(isWorkday(SATURDAY), false);
assert.strictEqual(isWorkday(SUNDAY), false);
assert.strictEqual(isWorkday(MONDAY, new Set([MONDAY])), false);

assert.strictEqual(addWorkdays(FRIDAY, 1), MONDAY);
assert.strictEqual(addWorkdays(MONDAY, 0), MONDAY);
assert.strictEqual(addWorkdays("2026-01-30", 1), "2026-02-02");
assert.strictEqual(addWorkdays("2020-12-31", 2), "2021-01-04");

const tuesday = "2026-01-06";
const wednesday = "2026-01-07";
assert.strictEqual(addWorkdays(MONDAY, 1), tuesday);
assert.strictEqual(addWorkdays(MONDAY, 1, new Set([tuesday])), wednesday);

assert.strictEqual(nextWorkday(FRIDAY), MONDAY);

const end = addWorkdays(FRIDAY, 5);
assert.strictEqual(countWorkdaysBetween(FRIDAY, end), 5);
assert.strictEqual(countWorkdaysBetween(end, FRIDAY), -5);

// First workday of month checks
assert.strictEqual(isFirstWorkdayOfMonth("2026-01-01"), true); // Thursday
assert.strictEqual(isFirstWorkdayOfMonth("2026-01-02"), false);
assert.strictEqual(isFirstWorkdayOfMonth(MONDAY), false);
// 2026-08-01 is a Saturday -> first workday is 2026-08-03 (Monday)
assert.strictEqual(isFirstWorkdayOfMonth("2026-08-01"), false);
assert.strictEqual(isFirstWorkdayOfMonth("2026-08-03"), true);

console.log("test_workdays.js: all assertions passed");
