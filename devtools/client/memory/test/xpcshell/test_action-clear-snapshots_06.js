/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test that clearSnapshots disables diffing when deleting snapshots

const {
  takeSnapshotAndCensus,
  clearSnapshots,
} = require("resource://devtools/client/memory/actions/snapshot.js");
const {
  actions,
  treeMapState,
} = require("resource://devtools/client/memory/constants.js");
const {
  toggleDiffing,
  selectSnapshotForDiffingAndRefresh,
} = require("resource://devtools/client/memory/actions/diffing.js");

add_task(async function () {
  const front = new StubbedMemoryFront();
  const heapWorker = new HeapAnalysesClient();
  await front.attach();
  const store = Store();
  const { getState, dispatch } = store;

  ok(true, "create 2 snapshots with a saved census");
  dispatch(takeSnapshotAndCensus(front, heapWorker));
  dispatch(takeSnapshotAndCensus(front, heapWorker));
  await waitUntilCensusState(store, snapshot => snapshot.treeMap, [
    treeMapState.SAVED,
    treeMapState.SAVED,
  ]);
  ok(true, "snapshots created with a saved census");

  dispatch(toggleDiffing());
  dispatch(
    selectSnapshotForDiffingAndRefresh(heapWorker, getState().snapshots[0])
  );
  dispatch(
    selectSnapshotForDiffingAndRefresh(heapWorker, getState().snapshots[1])
  );

  ok(getState().diffing, "We should be in diffing view");

  await waitForDispatch(store, actions.TAKE_CENSUS_DIFF_END);
  ok(true, "Received TAKE_CENSUS_DIFF_END action");

  ok(true, "Dispatch clearSnapshots action");
  const deleteEvents = Promise.all([
    waitForDispatch(store, actions.DELETE_SNAPSHOTS_START),
    waitForDispatch(store, actions.DELETE_SNAPSHOTS_END),
  ]);
  dispatch(clearSnapshots(heapWorker));
  await deleteEvents;
  ok(true, "received delete snapshots events");

  Assert.strictEqual(
    getState().snapshots.length,
    0,
    "Snapshots array should be empty"
  );
  ok(!getState().diffing, "We should no longer be diffing");

  heapWorker.destroy();
  await front.detach();
});
