// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2021 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-get-temporal.zoneddatetime.prototype.millisecond
description: Throw a TypeError if the receiver is invalid
features: [Symbol, Temporal]
---*/

const millisecond = Object.getOwnPropertyDescriptor(Temporal.ZonedDateTime.prototype, "millisecond").get;

assert.sameValue(typeof millisecond, "function");

assert.throws(TypeError, () => millisecond.call(undefined), "undefined");
assert.throws(TypeError, () => millisecond.call(null), "null");
assert.throws(TypeError, () => millisecond.call(true), "true");
assert.throws(TypeError, () => millisecond.call(""), "empty string");
assert.throws(TypeError, () => millisecond.call(Symbol()), "symbol");
assert.throws(TypeError, () => millisecond.call(1), "1");
assert.throws(TypeError, () => millisecond.call({}), "plain object");
assert.throws(TypeError, () => millisecond.call(Temporal.ZonedDateTime), "Temporal.ZonedDateTime");
assert.throws(TypeError, () => millisecond.call(Temporal.ZonedDateTime.prototype), "Temporal.ZonedDateTime.prototype");

reportCompare(0, 0);
