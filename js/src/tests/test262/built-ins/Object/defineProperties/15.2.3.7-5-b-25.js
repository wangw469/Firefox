// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.7-5-b-25
description: >
    Object.defineProperties - 'descObj' is a Date object which
    implements its own [[Get]] method to get 'enumerable' property
    (8.10.5 step 3.a)
---*/

var obj = {};
var descObj = new Date(0);
var accessed = false;

descObj.enumerable = true;

Object.defineProperties(obj, {
  prop: descObj
});
for (var property in obj) {
  if (property === "prop") {
    accessed = true;
  }
}

assert(accessed, 'accessed !== true');

reportCompare(0, 0);
