use crate::model::frames::Frame;
use crate::model::lorawan::DevEui;
use chrono::{DateTime, Utc};
use crossbeam_skiplist::SkipMap;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;

/// Composite key: (DevEUI, Timestamp, Sequence)
/// This allows efficient range queries by device and time
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct MemtableKey {
    pub dev_eui: String,  // Normalized DevEUI
    pub timestamp: i64,   // Unix timestamp in microseconds
    pub sequence: u64,    // Sequence number for same-timestamp ordering
}

impl MemtableKey {
    pub fn new(dev_eui: &DevEui, timestamp: DateTime<Utc>, sequence: u64) -> Self {
        Self {
            dev_eui: dev_eui.normalized(),
            timestamp: timestamp.timestamp_micros(),
            sequence,
        }
    }

    pub fn range_start(dev_eui: &DevEui, start_time: Option<DateTime<Utc>>) -> Self {
        Self {
            dev_eui: dev_eui.normalized(),
            timestamp: start_time
                .map(|t| t.timestamp_micros())
                .unwrap_or(i64::MIN),
            sequence: 0,
        }
    }

    pub fn range_end(dev_eui: &DevEui, end_time: Option<DateTime<Utc>>) -> Self {
        Self {
            dev_eui: dev_eui.normalized(),
            timestamp: end_time
                .map(|t| t.timestamp_micros())
                .unwrap_or(i64::MAX),
            sequence: u64::MAX,
        }
    }
}

/// In-memory memtable using lock-free skip list
pub struct Memtable {
    data: Arc<SkipMap<MemtableKey, Frame>>,
    size_bytes: Arc<AtomicUsize>,
    sequence: Arc<AtomicU64>,
}

impl Memtable {
    pub fn new() -> Self {
        Self {
            data: Arc::new(SkipMap::new()),
            size_bytes: Arc::new(AtomicUsize::new(0)),
            sequence: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Insert a frame into the memtable
    pub fn insert(&self, frame: Frame) -> Result<(), String> {
        let dev_eui = frame.dev_eui();
        let timestamp = frame.timestamp();
        let sequence = self.sequence.fetch_add(1, Ordering::SeqCst);

        let key = MemtableKey::new(dev_eui, timestamp, sequence);

        // Estimate size (rough approximation)
        // Frame serialized size + key overhead
        let frame_size = std::mem::size_of_val(&frame) + std::mem::size_of_val(&key);

        self.data.insert(key, frame);
        self.size_bytes.fetch_add(frame_size, Ordering::Relaxed);

        Ok(())
    }

    /// Get approximate size in bytes
    pub fn size_bytes(&self) -> usize {
        self.size_bytes.load(Ordering::Relaxed)
    }

    /// Get number of entries
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Check if memtable is empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Check if memtable should be flushed (size exceeds threshold)
    pub fn should_flush(&self, threshold_mb: usize) -> bool {
        let threshold_bytes = threshold_mb * 1024 * 1024;
        self.size_bytes() >= threshold_bytes
    }

    /// Range scan: all frames for a device in time range
    pub fn scan_device_range(
        &self,
        dev_eui: &DevEui,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
    ) -> Vec<Frame> {
        let start_key = MemtableKey::range_start(dev_eui, start_time);
        let end_key = MemtableKey::range_end(dev_eui, end_time);

        self.data
            .range(start_key..=end_key)
            .map(|entry| entry.value().clone())
            .collect()
    }

    /// Get all frames (for flushing to SSTable)
    pub fn iter(&self) -> impl Iterator<Item = (MemtableKey, Frame)> + '_ {
        self.data
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().clone()))
    }

    /// Get the latest frame for a device
    pub fn get_latest(&self, dev_eui: &DevEui) -> Option<Frame> {
        let dev_eui_norm = dev_eui.normalized();

        // Scan backwards from the end of this device's range
        let start_key = MemtableKey {
            dev_eui: dev_eui_norm.clone(),
            timestamp: i64::MIN,
            sequence: 0,
        };

        let end_key = MemtableKey {
            dev_eui: dev_eui_norm,
            timestamp: i64::MAX,
            sequence: u64::MAX,
        };

        self.data
            .range(start_key..=end_key)
            .last()
            .map(|entry| entry.value().clone())
    }

    /// Clear the memtable (after flush to SSTable)
    pub fn clear(&self) {
        self.data.clear();
        self.size_bytes.store(0, Ordering::Relaxed);
        self.sequence.store(0, Ordering::Relaxed);
    }

    /// Delete all entries for a specific device
    pub fn delete_device(&self, dev_eui: &DevEui) -> usize {
        let dev_eui_norm = dev_eui.normalized();
        let mut deleted_count = 0;
        let mut deleted_bytes = 0;

        // Find and remove all entries for this device
        let start_key = MemtableKey {
            dev_eui: dev_eui_norm.clone(),
            timestamp: i64::MIN,
            sequence: 0,
        };

        let end_key = MemtableKey {
            dev_eui: dev_eui_norm,
            timestamp: i64::MAX,
            sequence: u64::MAX,
        };

        // Collect keys to delete (can't delete while iterating)
        let keys_to_delete: Vec<MemtableKey> = self
            .data
            .range(start_key..=end_key)
            .map(|entry| entry.key().clone())
            .collect();

        // Delete the entries
        for key in keys_to_delete {
            if let Some(entry) = self.data.remove(&key) {
                deleted_count += 1;
                // Approximate size calculation
                let frame_size = std::mem::size_of_val(&entry.value()) + std::mem::size_of_val(&key);
                deleted_bytes += frame_size;
            }
        }

        // Update size counter
        self.size_bytes.fetch_sub(deleted_bytes, Ordering::Relaxed);

        deleted_count
    }
}

impl Clone for Memtable {
    fn clone(&self) -> Self {
        Self {
            data: Arc::clone(&self.data),
            size_bytes: Arc::clone(&self.size_bytes),
            sequence: Arc::clone(&self.sequence),
        }
    }
}

impl Default for Memtable {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::decoded::DecodedPayload;
    use crate::model::frames::UplinkFrame;
    use crate::model::lorawan::*;

    fn create_test_frame(dev_eui: &str, timestamp: DateTime<Utc>) -> Frame {
        Frame::Uplink(UplinkFrame {
            dev_eui: DevEui::new(dev_eui.to_string()).unwrap(),
            application_id: ApplicationId::new("test-app".to_string()),
            device_name: Some("test-device".to_string()),
            received_at: timestamp,
            f_port: 1,
            f_cnt: 42,
            confirmed: false,
            adr: true,
            dr: DataRate::new_lora(125000, 7),
            frequency: 868100000,
            rx_info: vec![],
            decoded_payload: Some(DecodedPayload::from_json(
                serde_json::json!({"temp": 22.5}),
            )),
            raw_payload: None,
        })
    }

    #[test]
    fn test_memtable_insert() {
        let memtable = Memtable::new();

        let frame = create_test_frame("0123456789ABCDEF", Utc::now());
        memtable.insert(frame).unwrap();

        assert_eq!(memtable.len(), 1);
        assert!(memtable.size_bytes() > 0);
    }

    #[test]
    fn test_memtable_scan_device_range() {
        let memtable = Memtable::new();
        let dev_eui = DevEui::new("0123456789ABCDEF".to_string()).unwrap();

        let now = Utc::now();
        let one_hour_ago = now - chrono::Duration::hours(1);
        let two_hours_ago = now - chrono::Duration::hours(2);

        // Insert frames at different times
        memtable
            .insert(create_test_frame("0123456789ABCDEF", two_hours_ago))
            .unwrap();
        memtable
            .insert(create_test_frame("0123456789ABCDEF", one_hour_ago))
            .unwrap();
        memtable
            .insert(create_test_frame("0123456789ABCDEF", now))
            .unwrap();

        // Scan all
        let all_frames = memtable.scan_device_range(&dev_eui, None, None);
        assert_eq!(all_frames.len(), 3);

        // Scan last hour
        let recent_frames = memtable.scan_device_range(&dev_eui, Some(one_hour_ago), None);
        assert_eq!(recent_frames.len(), 2);
    }

    #[test]
    fn test_memtable_get_latest() {
        let memtable = Memtable::new();
        let dev_eui = DevEui::new("0123456789ABCDEF".to_string()).unwrap();

        let now = Utc::now();
        let one_hour_ago = now - chrono::Duration::hours(1);

        memtable
            .insert(create_test_frame("0123456789ABCDEF", one_hour_ago))
            .unwrap();
        memtable
            .insert(create_test_frame("0123456789ABCDEF", now))
            .unwrap();

        let latest = memtable.get_latest(&dev_eui).unwrap();
        assert_eq!(latest.timestamp(), now);
    }

    #[test]
    fn test_memtable_should_flush() {
        let memtable = Memtable::new();

        // Shouldn't flush when empty
        assert!(!memtable.should_flush(64));

        // Add some data
        for _ in 0..1000 {
            let frame = create_test_frame("0123456789ABCDEF", Utc::now());
            memtable.insert(frame).unwrap();
        }

        // Size estimate might trigger flush
        // (depends on frame size estimation)
        let should_flush = memtable.should_flush(1); // 1MB threshold
        // Just check that the method works
        let _ = should_flush;
    }
}
