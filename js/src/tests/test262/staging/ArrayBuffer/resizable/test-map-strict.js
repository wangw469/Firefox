// |reftest| shell-option(--enable-arraybuffer-resizable) skip-if(!ArrayBuffer.prototype.resize||!xulRuntime.shell) -- resizable-arraybuffer is not enabled unconditionally, requires shell-options
'use strict';
// Copyright 2021 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-arraybuffer-length
description: >
  Automatically ported from TestMap test
  in V8's mjsunit test typedarray-resizablearraybuffer.js
includes: [compareArray.js]
features: [resizable-arraybuffer]
flags: [onlyStrict]
---*/

class MyUint8Array extends Uint8Array {
}

class MyFloat32Array extends Float32Array {
}

class MyBigInt64Array extends BigInt64Array {
}

const builtinCtors = [
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
  Uint8ClampedArray,
  BigUint64Array,
  BigInt64Array
];

const ctors = [
  ...builtinCtors,
  MyUint8Array,
  MyFloat32Array,
  MyBigInt64Array
];

function CreateResizableArrayBuffer(byteLength, maxByteLength) {
  return new ArrayBuffer(byteLength, { maxByteLength: maxByteLength });
}

function WriteToTypedArray(array, index, value) {
  if (array instanceof BigInt64Array || array instanceof BigUint64Array) {
    array[index] = BigInt(value);
  } else {
    array[index] = value;
  }
}

function Convert(item) {
  if (typeof item == 'bigint') {
    return Number(item);
  }
  return item;
}

function ToNumbers(array) {
  let result = [];
  for (let item of array) {
    result.push(Convert(item));
  }
  return result;
}

const TypedArrayMapHelper = (ta, ...rest) => {
  return ta.map(...rest);
};

const ArrayMapHelper = (ta, ...rest) => {
  return Array.prototype.map.call(ta, ...rest);
};

function TestMap(mapHelper, oobThrows) {
  for (let ctor of ctors) {
    const rab = CreateResizableArrayBuffer(4 * ctor.BYTES_PER_ELEMENT, 8 * ctor.BYTES_PER_ELEMENT);
    const fixedLength = new ctor(rab, 0, 4);
    const fixedLengthWithOffset = new ctor(rab, 2 * ctor.BYTES_PER_ELEMENT, 2);
    const lengthTracking = new ctor(rab, 0);
    const lengthTrackingWithOffset = new ctor(rab, 2 * ctor.BYTES_PER_ELEMENT);

    // Write some data into the array.
    const taWrite = new ctor(rab);
    for (let i = 0; i < taWrite.length; ++i) {
      WriteToTypedArray(taWrite, i, 2 * i);
    }

    // Orig. array: [0, 2, 4, 6]
    //              [0, 2, 4, 6] << fixedLength
    //                    [4, 6] << fixedLengthWithOffset
    //              [0, 2, 4, 6, ...] << lengthTracking
    //                    [4, 6, ...] << lengthTrackingWithOffset

    function Helper(array) {
      const values = [];
      function GatherValues(n, ix) {
        assert.sameValue(ix, values.length);
        values.push(n);
        if (typeof n == 'bigint') {
          return n + 1n;
        }
        return n + 1;
      }
      const newValues = mapHelper(array, GatherValues);
      for (let i = 0; i < values.length; ++i) {
        if (typeof values[i] == 'bigint') {
          assert.sameValue(values[i] + 1n, newValues[i]);
        } else {
          assert.sameValue(values[i] + 1, newValues[i]);
        }
      }
      return ToNumbers(values);
    }
    assert.compareArray(Helper(fixedLength), [
      0,
      2,
      4,
      6
    ]);
    assert.compareArray(Helper(fixedLengthWithOffset), [
      4,
      6
    ]);
    assert.compareArray(Helper(lengthTracking), [
      0,
      2,
      4,
      6
    ]);
    assert.compareArray(Helper(lengthTrackingWithOffset), [
      4,
      6
    ]);

    // Shrink so that fixed length TAs go out of bounds.
    rab.resize(3 * ctor.BYTES_PER_ELEMENT);

    // Orig. array: [0, 2, 4]
    //              [0, 2, 4, ...] << lengthTracking
    //                    [4, ...] << lengthTrackingWithOffset

    if (oobThrows) {
      assert.throws(TypeError, () => {
        Helper(fixedLength);
      });
      assert.throws(TypeError, () => {
        Helper(fixedLengthWithOffset);
      });
    } else {
      assert.compareArray(Helper(fixedLength), []);
      assert.compareArray(Helper(fixedLengthWithOffset), []);
    }
    assert.compareArray(Helper(lengthTracking), [
      0,
      2,
      4
    ]);
    assert.compareArray(Helper(lengthTrackingWithOffset), [4]);

    // Shrink so that the TAs with offset go out of bounds.
    rab.resize(1 * ctor.BYTES_PER_ELEMENT);
    if (oobThrows) {
      assert.throws(TypeError, () => {
        Helper(fixedLength);
      });
      assert.throws(TypeError, () => {
        Helper(fixedLengthWithOffset);
      });
      assert.throws(TypeError, () => {
        Helper(lengthTrackingWithOffset);
      });
    } else {
      assert.compareArray(Helper(fixedLength), []);
      assert.compareArray(Helper(fixedLengthWithOffset), []);
      assert.compareArray(Helper(lengthTrackingWithOffset), []);
    }
    assert.compareArray(Helper(lengthTracking), [0]);

    // Shrink to zero.
    rab.resize(0);
    if (oobThrows) {
      assert.throws(TypeError, () => {
        Helper(fixedLength);
      });
      assert.throws(TypeError, () => {
        Helper(fixedLengthWithOffset);
      });
      assert.throws(TypeError, () => {
        Helper(lengthTrackingWithOffset);
      });
    } else {
      assert.compareArray(Helper(fixedLength), []);
      assert.compareArray(Helper(fixedLengthWithOffset), []);
      assert.compareArray(Helper(lengthTrackingWithOffset), []);
    }
    assert.compareArray(Helper(lengthTracking), []);

    // Grow so that all TAs are back in-bounds.
    rab.resize(6 * ctor.BYTES_PER_ELEMENT);
    for (let i = 0; i < 6; ++i) {
      WriteToTypedArray(taWrite, i, 2 * i);
    }

    // Orig. array: [0, 2, 4, 6, 8, 10]
    //              [0, 2, 4, 6] << fixedLength
    //                    [4, 6] << fixedLengthWithOffset
    //              [0, 2, 4, 6, 8, 10, ...] << lengthTracking
    //                    [4, 6, 8, 10, ...] << lengthTrackingWithOffset

    assert.compareArray(Helper(fixedLength), [
      0,
      2,
      4,
      6
    ]);
    assert.compareArray(Helper(fixedLengthWithOffset), [
      4,
      6
    ]);
    assert.compareArray(Helper(lengthTracking), [
      0,
      2,
      4,
      6,
      8,
      10
    ]);
    assert.compareArray(Helper(lengthTrackingWithOffset), [
      4,
      6,
      8,
      10
    ]);
  }
}

TestMap(TypedArrayMapHelper, true);
TestMap(ArrayMapHelper, false);

reportCompare(0, 0);
