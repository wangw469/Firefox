// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

use inherent::inherent;

use glean::traits::Counter;

use super::CommonMetricData;

use crate::ipc::{need_ipc, with_ipc_payload};
#[cfg(test)]
use crate::private::MetricGetter;
use crate::private::{CounterMetric, MetricId};

use std::collections::HashMap;

/// A counter metric that knows it's a labeled counter's submetric.
///
/// It has special work to do when in a non-parent process.
/// When on the parent process, it dispatches calls to the normal CounterMetric.
#[derive(Clone)]
pub enum LabeledCounterMetric {
    Parent(CounterMetric),
    Child { id: MetricId, label: String },
}

impl LabeledCounterMetric {
    /// Create a new labeled counter submetric.
    pub fn new(id: MetricId, meta: CommonMetricData, label: String) -> Self {
        if need_ipc() {
            LabeledCounterMetric::Child { id, label }
        } else {
            LabeledCounterMetric::Parent(CounterMetric::new(id, meta))
        }
    }

    #[cfg(test)]
    pub(crate) fn metric_id(&self) -> MetricGetter {
        match self {
            LabeledCounterMetric::Parent(p) => p.metric_id(),
            LabeledCounterMetric::Child { id, .. } => (*id).into(),
        }
    }
}

#[inherent]
impl Counter for LabeledCounterMetric {
    /// Increase the counter by `amount`.
    ///
    /// ## Arguments
    ///
    /// * `amount` - The amount to increase by. Should be positive.
    ///
    /// ## Notes
    ///
    /// Logs an error if the `amount` is 0 or negative.
    pub fn add(&self, amount: i32) {
        match self {
            LabeledCounterMetric::Parent(p) => p.add(amount),
            LabeledCounterMetric::Child { id, label } => {
                #[cfg(feature = "with_gecko")]
                if gecko_profiler::can_accept_markers() {
                    gecko_profiler::add_marker(
                        "LabeledCounter::add",
                        super::profiler_utils::TelemetryProfilerCategory,
                        Default::default(),
                        super::profiler_utils::IntLikeMetricMarker::new(
                            (*id).into(),
                            Some(label.clone()),
                            amount,
                        ),
                    );
                }
                with_ipc_payload(move |payload| {
                    if let Some(map) = payload.labeled_counters.get_mut(id) {
                        if let Some(v) = map.get_mut(label) {
                            *v += amount;
                        } else {
                            map.insert(label.to_string(), amount);
                        }
                    } else {
                        let mut map = HashMap::new();
                        map.insert(label.to_string(), amount);
                        payload.labeled_counters.insert(*id, map);
                    }
                });
            }
        }
    }

    /// **Test-only API.**
    ///
    /// Get the currently stored value as an integer.
    /// This doesn't clear the stored value.
    ///
    /// ## Arguments
    ///
    /// * `ping_name` - the storage name to look into.
    ///
    /// ## Return value
    ///
    /// Returns the stored value or `None` if nothing stored.
    pub fn test_get_value<'a, S: Into<Option<&'a str>>>(&self, ping_name: S) -> Option<i32> {
        match self {
            LabeledCounterMetric::Parent(p) => p.test_get_value(ping_name),
            LabeledCounterMetric::Child { id, .. } => {
                panic!("Cannot get test value for {:?} in non-parent process!", id)
            }
        }
    }

    /// **Test-only API.**
    ///
    /// Gets the number of recorded errors for the given metric and error type.
    ///
    /// # Arguments
    ///
    /// * `error` - The type of error
    /// * `ping_name` - represents the optional name of the ping to retrieve the
    ///   metric for. Defaults to the first value in `send_in_pings`.
    ///
    /// # Returns
    ///
    /// The number of errors reported.
    pub fn test_get_num_recorded_errors(&self, error: glean::ErrorType) -> i32 {
        match self {
            LabeledCounterMetric::Parent(p) => p.test_get_num_recorded_errors(error),
            LabeledCounterMetric::Child { id, .. } => panic!(
                "Cannot get the number of recorded errors for {:?} in non-parent process!",
                id
            ),
        }
    }
}

#[cfg(test)]
mod test {
    use crate::{common_test::*, ipc, metrics};

    #[test]
    fn sets_labeled_counter_value_parent() {
        let _lock = lock_test();

        let metric = &metrics::test_only_ipc::a_labeled_counter;
        metric.get("a_label").add(1);

        assert_eq!(
            1,
            metric.get("a_label").test_get_value("test-ping").unwrap()
        );
    }

    #[test]
    fn sets_labeled_counter_value_child() {
        let _lock = lock_test();

        let label = "some_label";

        let parent_metric = &metrics::test_only_ipc::a_labeled_counter;
        parent_metric.get(label).add(3);

        {
            // scope for need_ipc RAII
            let _raii = ipc::test_set_need_ipc(true);

            // clear the per-process submetric cache,
            // or else we'll be given the parent-process child metric.
            {
                let mut map = crate::metrics::__glean_metric_maps::submetric_maps::COUNTER_MAP
                    .write()
                    .expect("Write lock for COUNTER_MAP was poisoned");
                map.clear();
            }

            let child_metric = parent_metric.get(label);

            let metric_id = child_metric
                .metric_id()
                .metric_id()
                .expect("Cannot perform IPC calls without a MetricId");

            child_metric.add(42);

            ipc::with_ipc_payload(move |payload| {
                assert_eq!(
                    42,
                    *payload
                        .labeled_counters
                        .get(&metric_id)
                        .unwrap()
                        .get(label)
                        .unwrap(),
                    "Stored the correct value in the ipc payload"
                );
            });

            // clear the per-process submetric cache again,
            // or else we'll be given the child-process child metric below.
            {
                let mut map = crate::metrics::__glean_metric_maps::submetric_maps::COUNTER_MAP
                    .write()
                    .expect("Write lock for COUNTER_MAP was poisoned");
                map.clear();
            }
        }

        assert!(
            false == ipc::need_ipc(),
            "RAII dropped, should not need ipc any more"
        );
        assert!(ipc::replay_from_buf(&ipc::take_buf().unwrap()).is_ok());

        assert_eq!(
            45,
            parent_metric
                .get(label)
                .test_get_value("test-ping")
                .unwrap(),
            "Values from the 'processes' should be summed"
        );
    }
}
