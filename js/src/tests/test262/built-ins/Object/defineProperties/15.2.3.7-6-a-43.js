// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.7-6-a-43
description: >
    Object.defineProperties - both desc.value and P.value are null
    (8.12.9 step 6)
includes: [propertyHelper.js]
---*/


var obj = {};

var desc = {
  value: null
};
Object.defineProperty(obj, "foo", desc);

Object.defineProperties(obj, {
  foo: {
    value: null
  }
});

verifyProperty(obj, "foo", {
  value: null,
  writable: false,
  enumerable: false,
  configurable: false,
});

reportCompare(0, 0);
