// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.7-6-a-220
description: >
    Object.defineProperties - 'O' is an Array, 'P' is an array index
    property that already exists on 'O' with [[Writable]] true, and
    the [[Writable]] field of 'desc' is false  (15.4.5.1 step 4.c)
includes: [propertyHelper.js]
---*/

var arr = [];

Object.defineProperty(arr, "0", {
  writable: true,
  configurable: true
});

Object.defineProperties(arr, {
  "0": {
    writable: false
  }
});

verifyProperty(arr, "0", {
  value: undefined,
  writable: false,
  enumerable: false,
  configurable: true,
});

reportCompare(0, 0);
