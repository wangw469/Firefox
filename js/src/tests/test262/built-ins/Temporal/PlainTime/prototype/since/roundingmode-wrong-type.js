// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2021 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.plaintime.prototype.since
description: Type conversions for roundingMode option
includes: [compareArray.js, temporalHelpers.js]
features: [Temporal]
---*/

const earlier = new Temporal.PlainTime(12, 34, 56, 0, 0, 0);
const later = new Temporal.PlainTime(13, 35, 57, 123, 987, 500);
TemporalHelpers.checkStringOptionWrongType("roundingMode", "trunc",
  (roundingMode) => later.since(earlier, { smallestUnit: "microsecond", roundingMode }),
  (result, descr) => TemporalHelpers.assertDuration(result, 0, 0, 0, 0, 1, 1, 1, 123, 987, 0, descr),
);

reportCompare(0, 0);
