use crate::config::StorageConfig;
use crate::engine::compaction::CompactionManager;
use crate::engine::memtable::Memtable;
use crate::engine::sstable::{SSTableReader, SSTableWriter};
use crate::engine::wal::WriteAheadLog;
use crate::error::LoraDbError;
use crate::model::device::DeviceRegistry;
use crate::model::frames::Frame;
use crate::model::lorawan::DevEui;
use anyhow::Result;
use chrono::{DateTime, Utc};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;
use parking_lot::RwLock;
use tracing::{debug, info, warn};

pub mod retention_manager;

use retention_manager::RetentionPolicyManager;

/// Storage engine that manages WAL, memtable, SSTables, and compaction
pub struct StorageEngine {
    data_dir: PathBuf,
    wal: Arc<RwLock<WriteAheadLog>>,
    memtable: Arc<RwLock<Memtable>>,
    sstables: Arc<RwLock<Vec<SSTableReader>>>,
    compaction_manager: Arc<RwLock<CompactionManager>>,
    device_registry: Arc<DeviceRegistry>,
    retention_manager: Arc<RetentionPolicyManager>,
    config: StorageConfig,
}

impl StorageEngine {
    /// Create a new storage engine
    pub async fn new(config: StorageConfig) -> Result<Self> {
        let data_dir = PathBuf::from(&config.data_dir);

        // Create data directory if it doesn't exist
        tokio::fs::create_dir_all(&data_dir).await?;

        // Set strict permissions on data directory
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            tokio::fs::set_permissions(&data_dir, std::fs::Permissions::from_mode(0o700))
                .await?;
        }

        // Initialize WAL
        let wal = WriteAheadLog::open(&data_dir, config.wal_sync_interval_ms)?;

        // Replay WAL to recover memtable
        info!("Replaying WAL to recover state...");
        let recovered_frames = wal.replay()?;
        info!("Recovered {} frames from WAL", recovered_frames.len());

        // Initialize memtable and populate with recovered frames
        let memtable = Memtable::new();
        for frame in recovered_frames {
            memtable.insert(frame).map_err(|e| LoraDbError::StorageError(e))?;
        }

        // Initialize compaction manager and open existing SSTables
        let mut compaction_manager =
            CompactionManager::new(data_dir.clone(), config.compaction_threshold);
        let sstables = compaction_manager.open_all_sstables()?;

        info!(
            "Opened {} existing SSTables, next ID: {}",
            sstables.len(),
            compaction_manager.next_sstable_id()
        );

        // Initialize device registry
        let device_registry = Arc::new(DeviceRegistry::new());

        // Rebuild device registry from existing data
        info!("Rebuilding device registry from stored data...");
        let mut device_count = 0;

        // Register devices from SSTables
        for sstable in &sstables {
            if let Ok(frames) = sstable.iter_all() {
                for frame in frames {
                    device_registry.register_or_update(
                        frame.dev_eui().clone(),
                        match &frame {
                            Frame::Uplink(f) => f.device_name.clone(),
                            Frame::Downlink(_) => None,
                            _ => None,
                        },
                        frame
                            .application_id()
                            .map(|id| id.as_str().to_string())
                            .unwrap_or_default(),
                    );
                    device_count += 1;
                }
            }
        }

        // Register devices from memtable (already recovered from WAL)
        for (_key, frame) in memtable.iter() {
            device_registry.register_or_update(
                frame.dev_eui().clone(),
                match &frame {
                    Frame::Uplink(f) => f.device_name.clone(),
                    Frame::Downlink(_) => None,
                    _ => None,
                },
                frame
                    .application_id()
                    .map(|id| id.as_str().to_string())
                    .unwrap_or_default(),
            );
        }

        info!(
            "Device registry rebuilt: {} unique devices from {} total frames",
            device_registry.device_count(),
            device_count
        );

        // Initialize retention policy manager from environment variables
        let retention_manager = RetentionPolicyManager::from_env(
            &data_dir,
            config.retention_days,
            config.retention_apps.clone(),
            config.retention_check_interval_hours,
        )
        .await?;

        Ok(Self {
            data_dir,
            wal: Arc::new(RwLock::new(wal)),
            memtable: Arc::new(RwLock::new(memtable)),
            sstables: Arc::new(RwLock::new(sstables)),
            compaction_manager: Arc::new(RwLock::new(compaction_manager)),
            device_registry,
            retention_manager: Arc::new(retention_manager),
            config,
        })
    }

    /// Write a frame to the storage engine
    pub async fn write(&self, frame: Frame) -> Result<()> {
        // Register device
        self.device_registry.register_or_update(
            frame.dev_eui().clone(),
            match &frame {
                Frame::Uplink(f) => f.device_name.clone(),
                Frame::Status(f) => f.device_name.clone(),
                Frame::Downlink(_) => None,
                _ => None,
            },
            frame
                .application_id()
                .map(|id| id.as_str().to_string())
                .unwrap_or_default(),
        );

        // Append to WAL first (for durability)
        {
            let wal = self.wal.read();
            wal.append(&frame)?;
        }

        // Insert into memtable
        {
            let memtable = self.memtable.read();
            memtable.insert(frame).map_err(|e| LoraDbError::StorageError(e))?;
        }

        // Check if memtable should be flushed
        let should_flush = {
            let memtable = self.memtable.read();
            memtable.should_flush(self.config.memtable_size_mb)
        };

        if should_flush {
            debug!("Memtable flush triggered");
            self.flush_memtable().await?;
        }

        Ok(())
    }

    /// Flush memtable to SSTable
    async fn flush_memtable(&self) -> Result<()> {
        info!("Flushing memtable to SSTable");

        // Get next SSTable ID
        let sstable_id = {
            let mut compaction = self.compaction_manager.write();
            compaction.allocate_sstable_id()
        };

        // Create new SSTable writer
        let mut writer = SSTableWriter::new(sstable_id, &self.data_dir);

        // Copy all entries from memtable to SSTable
        let entries: Vec<_> = {
            let memtable = self.memtable.read();
            memtable.iter().collect()
        };

        for (key, frame) in entries {
            writer.add(key, frame)?;
        }

        let metadata = writer.finish()?;
        info!(
            "Created SSTable {} with {} entries",
            sstable_id, metadata.num_entries
        );

        // Open the new SSTable and add to list
        let sstable_path = self.data_dir.join(format!("sstable-{:08}.sst", sstable_id));
        let reader = SSTableReader::open(sstable_path)?;

        {
            let mut sstables = self.sstables.write();
            sstables.push(reader);
        }

        // Clear memtable
        {
            let memtable = self.memtable.write();
            memtable.clear();
        }

        // Truncate WAL (frames are now in SSTable)
        {
            let wal = self.wal.read();
            wal.truncate()?;
        }

        // Check if compaction should be triggered
        let should_compact = {
            let sstables = self.sstables.read();
            let compaction = self.compaction_manager.read();
            compaction.should_compact(sstables.len())
        };

        if should_compact {
            info!("Compaction triggered");
            self.compact().await?;
        }

        Ok(())
    }

    /// Compact SSTables
    async fn compact(&self) -> Result<()> {
        info!("Starting compaction");

        // Collect SSTable paths (to reopen them in compaction)
        let sstable_paths: Vec<_> = {
            let sstables = self.sstables.read();
            sstables.iter().map(|s| s.path().to_path_buf()).collect()
        };

        // Reopen SSTables for compaction
        let old_sstables: Result<Vec<_>> = sstable_paths
            .into_iter()
            .map(SSTableReader::open)
            .collect();
        let old_sstables = old_sstables?;

        // Perform compaction
        let (new_metadata, old_paths) = {
            let mut compaction = self.compaction_manager.write();
            compaction.compact(old_sstables)?
        };

        // Open new SSTable
        let new_sstable_path = self
            .data_dir
            .join(format!("sstable-{:08}.sst", new_metadata.id));
        let new_reader = SSTableReader::open(new_sstable_path)?;

        // Replace SSTables list with just the new one
        {
            let mut sstables = self.sstables.write();
            *sstables = vec![new_reader];
        }

        // Delete old SSTables
        {
            let compaction = self.compaction_manager.read();
            compaction.delete_old_sstables(old_paths)?;
        }

        info!("Compaction complete");

        Ok(())
    }

    /// Query frames for a device in a time range
    pub async fn query(
        &self,
        dev_eui: &DevEui,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
    ) -> Result<Vec<Frame>> {
        let mut results = Vec::new();

        // Query memtable
        {
            let memtable = self.memtable.read();
            let memtable_results = memtable.scan_device_range(dev_eui, start_time, end_time);
            results.extend(memtable_results);
        }

        // Query SSTables
        {
            let sstables = self.sstables.read();
            for sstable in sstables.iter() {
                let sstable_results = sstable.scan(dev_eui, start_time, end_time)?;
                results.extend(sstable_results);
            }
        }

        // Sort by timestamp (memtable and SSTables might have different orders)
        results.sort_by_key(|f| f.timestamp());

        debug!(
            "Query returned {} frames for device {}",
            results.len(),
            dev_eui.as_str()
        );

        Ok(results)
    }

    /// Get device registry
    pub fn device_registry(&self) -> &Arc<DeviceRegistry> {
        &self.device_registry
    }

    /// Get retention policy manager
    pub fn retention_manager(&self) -> &Arc<RetentionPolicyManager> {
        &self.retention_manager
    }

    /// Start background processing of frames from MQTT
    pub async fn start_frame_processor(
        self: Arc<Self>,
        mut frame_rx: mpsc::Receiver<Frame>,
    ) {
        info!("Starting frame processor");

        while let Some(frame) = frame_rx.recv().await {
            let dev_eui = frame.dev_eui().as_str().to_string();
            match self.write(frame).await {
                Ok(_) => {
                    info!("Successfully stored frame for device {}", dev_eui);
                }
                Err(e) => {
                    warn!("Failed to write frame for device {}: {}", dev_eui, e);
                }
            }
        }

        warn!("Frame processor stopped");
    }

    /// Start periodic memtable flush task
    /// Returns a JoinHandle that can be aborted on shutdown
    pub fn start_periodic_flush(self: Arc<Self>) -> tokio::task::JoinHandle<()> {
        let flush_interval_secs = self.config.memtable_flush_interval_secs;

        info!(
            "Starting periodic memtable flush (interval: {} seconds)",
            flush_interval_secs
        );

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(
                tokio::time::Duration::from_secs(flush_interval_secs)
            );
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                interval.tick().await;

                // Check if memtable has data
                let has_data = {
                    let memtable = self.memtable.read();
                    !memtable.is_empty()
                };

                if has_data {
                    info!("Periodic memtable flush starting");
                    if let Err(e) = self.flush_memtable().await {
                        warn!("Periodic flush failed: {}", e);
                    } else {
                        info!("Periodic memtable flush completed");
                    }
                } else {
                    debug!("Skipping periodic flush (memtable is empty)");
                }
            }
        })
    }

    /// Enforce retention policy by deleting data older than configured retention period
    /// Supports both global and per-application retention policies
    pub async fn enforce_retention(&self) -> Result<()> {
        // Get current policies from manager
        let policies = self.retention_manager.get_policies().await;

        // Check if any retention policy is configured
        if policies.global_days.is_none() && policies.applications.is_empty() {
            debug!("No retention policy configured, skipping");
            return Ok(());
        }

        info!("Enforcing retention policies (global + per-application)");

        // Find SSTables that should be deleted based on retention policies
        let sstables_to_delete: Vec<(u64, String)> = {
            let sstables = self.sstables.read();
            let mut to_delete = Vec::new();

            for sstable in sstables.iter() {
                // Get the SSTable's max timestamp
                let max_time = match sstable.max_timestamp() {
                    Some(time) => time,
                    None => {
                        warn!("SSTable {} has no max timestamp, skipping retention check", sstable.id());
                        continue;
                    }
                };

                // Get all application IDs in this SSTable
                let app_ids = match sstable.application_ids() {
                    Ok(ids) => ids,
                    Err(e) => {
                        warn!("Failed to get application IDs for SSTable {}: {}", sstable.id(), e);
                        continue;
                    }
                };

                // Determine the SHORTEST retention period for this SSTable
                // We can only delete if ALL applications in the SSTable are past retention
                let mut shortest_retention: Option<u32> = None;
                let mut policy_source = String::new();

                for app_id in &app_ids {
                    // Check for per-application policy first
                    let retention_days = if let Some(policy) = policies.applications.get(app_id) {
                        match policy.days {
                            Some(days) => {
                                policy_source = format!("app:{}", app_id);
                                Some(days)
                            },
                            None => {
                                // "never" - keep forever for this app
                                shortest_retention = None;
                                break;  // Can't delete if any app is "never"
                            }
                        }
                    } else {
                        // Fall back to global default
                        policy_source = "global".to_string();
                        policies.global_days
                    };

                    // Track the shortest retention period
                    if let Some(days) = retention_days {
                        shortest_retention = Some(match shortest_retention {
                            Some(current) => current.max(days),  // Use longest to be safe
                            None => days,
                        });
                    }
                }

                // Check if SSTable should be deleted based on shortest retention
                if let Some(retention_days) = shortest_retention {
                    let cutoff_time = Utc::now() - chrono::Duration::days(retention_days as i64);
                    if max_time < cutoff_time {
                        to_delete.push((sstable.id(), policy_source));
                    }
                }
            }

            to_delete
        };

        if sstables_to_delete.is_empty() {
            debug!("No SSTables to delete for retention policy");
            return Ok(());
        }

        info!(
            "Deleting {} SSTable(s) to enforce retention policy",
            sstables_to_delete.len()
        );

        // Delete the old SSTables
        for (sstable_id, policy_source) in sstables_to_delete {
            // Remove from in-memory list
            {
                let mut sstables = self.sstables.write();
                sstables.retain(|s| s.id() != sstable_id);
            }

            // Delete the file
            let sstable_path = self.data_dir.join(format!("sstable-{:08}.sst", sstable_id));
            match tokio::fs::remove_file(&sstable_path).await {
                Ok(_) => info!("Deleted SSTable {} (retention policy: {})", sstable_id, policy_source),
                Err(e) => warn!("Failed to delete SSTable {}: {}", sstable_id, e),
            }
        }

        Ok(())
    }

    /// Start periodic retention policy enforcement task
    /// Returns a JoinHandle that can be aborted on shutdown
    pub fn start_retention_enforcement(self: Arc<Self>) -> tokio::task::JoinHandle<()> {
        info!("Starting retention enforcement background task");

        tokio::spawn(async move {
            // Get initial check interval from retention manager
            let check_interval_hours = self.retention_manager.get_check_interval_hours().await;

            let mut interval = tokio::time::interval(
                tokio::time::Duration::from_secs(check_interval_hours * 3600)
            );
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                interval.tick().await;

                info!("Running retention policy enforcement");
                if let Err(e) = self.enforce_retention().await {
                    warn!("Retention enforcement failed: {}", e);
                } else {
                    info!("Retention enforcement completed");
                }
            }
        })
    }

    /// Delete all data for a specific device
    pub async fn delete_device(&self, dev_eui: &DevEui) -> Result<usize> {
        info!("Deleting all data for device {}", dev_eui.as_str());

        let mut total_deleted = 0;

        // 1. Delete from memtable
        {
            let memtable = self.memtable.read();
            let deleted = memtable.delete_device(dev_eui);
            info!("Deleted {} frames from memtable", deleted);
            total_deleted += deleted;
        }

        // 2. Rewrite SSTables without this device's data
        let sstables_to_process = {
            let sstables = self.sstables.read();
            sstables.iter().map(|s| s.path().to_path_buf()).collect::<Vec<_>>()
        };

        if !sstables_to_process.is_empty() {
            info!("Rewriting {} SSTables to remove device data", sstables_to_process.len());

            // Reopen SSTables for reading
            let old_sstables: Result<Vec<_>> = sstables_to_process
                .iter()
                .map(|path| SSTableReader::open(path.clone()))
                .collect();
            let old_sstables = old_sstables?;

            // Create new SSTables without the deleted device
            let mut new_sstables = Vec::new();
            let mut old_paths = Vec::new();

            for sstable in old_sstables {
                let old_path = sstable.path().to_path_buf();
                old_paths.push(old_path);

                // Read all frames except those for the deleted device
                let frames: Vec<_> = sstable
                    .iter_all()?
                    .into_iter()
                    .filter(|frame| {
                        let is_deleted_device = frame.dev_eui() == dev_eui;
                        if is_deleted_device {
                            total_deleted += 1;
                        }
                        !is_deleted_device
                    })
                    .collect();

                // Only create new SSTable if there are remaining frames
                if !frames.is_empty() {
                    let new_id = {
                        let mut compaction = self.compaction_manager.write();
                        compaction.allocate_sstable_id()
                    };

                    let mut writer = SSTableWriter::new(new_id, &self.data_dir);

                    // Sort frames by key and write to new SSTable
                    let mut keyed_frames: Vec<_> = frames
                        .into_iter()
                        .enumerate()
                        .map(|(seq, frame)| {
                            let key = crate::engine::memtable::MemtableKey::new(
                                frame.dev_eui(),
                                frame.timestamp(),
                                seq as u64,
                            );
                            (key, frame)
                        })
                        .collect();

                    keyed_frames.sort_by(|a, b| a.0.cmp(&b.0));

                    for (key, frame) in keyed_frames {
                        writer.add(key, frame)?;
                    }

                    let metadata = writer.finish()?;
                    info!("Created new SSTable {} with {} entries", metadata.id, metadata.num_entries);

                    let new_path = self.data_dir.join(format!("sstable-{:08}.sst", metadata.id));
                    new_sstables.push(SSTableReader::open(new_path)?);
                } else {
                    info!("SSTable had only deleted device's data, not creating new SSTable");
                }
            }

            // Replace SSTables list with new ones
            {
                let mut sstables = self.sstables.write();
                *sstables = new_sstables;
            }

            // Delete old SSTable files
            for path in old_paths {
                match tokio::fs::remove_file(&path).await {
                    Ok(_) => debug!("Deleted old SSTable: {:?}", path),
                    Err(e) => warn!("Failed to delete old SSTable {:?}: {}", path, e),
                }
            }
        }

        // 3. Remove device from registry
        self.device_registry.remove_device(&dev_eui.as_str().to_string());
        info!("Removed device from registry");

        info!(
            "Deleted total of {} frames for device {}",
            total_deleted,
            dev_eui.as_str()
        );

        Ok(total_deleted)
    }

    /// Gracefully shut down storage engine by flushing memtable to SSTable
    pub async fn shutdown(&self) -> Result<()> {
        info!("Shutting down storage engine");

        // Check if memtable has any data to flush
        let has_data = {
            let memtable = self.memtable.read();
            !memtable.is_empty()
        };

        if has_data {
            info!("Flushing memtable before shutdown");
            self.flush_memtable().await?;
        }

        // Sync WAL to ensure all data is written
        {
            let wal = self.wal.read();
            wal.sync()?;
        }

        info!("Storage engine shutdown complete");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::frames::UplinkFrame;
    use crate::model::lorawan::*;
    use std::collections::HashMap;
    use tempfile::TempDir;

    fn create_test_config(data_dir: &std::path::Path) -> StorageConfig {
        StorageConfig {
            data_dir: data_dir.to_path_buf(),
            wal_sync_interval_ms: 1000,
            memtable_size_mb: 1, // Small for testing
            memtable_flush_interval_secs: 300,
            compaction_threshold: 3,
            enable_encryption: false,
            encryption_key: None,
            retention_days: None,
            retention_apps: HashMap::new(),
            retention_check_interval_hours: 24,
        }
    }

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
            decoded_payload: None,
            raw_payload: Some("aGVsbG8=".to_string()),
        })
    }

    #[tokio::test]
    async fn test_storage_engine_write_and_query() {
        let temp_dir = TempDir::new().unwrap();
        let config = create_test_config(temp_dir.path());
        let engine = StorageEngine::new(config).await.unwrap();

        let dev_eui = DevEui::new("0123456789ABCDEF".to_string()).unwrap();
        let now = Utc::now();

        // Write a frame
        let frame = create_test_frame("0123456789ABCDEF", now);
        engine.write(frame).await.unwrap();

        // Query it back
        let results = engine.query(&dev_eui, None, None).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].dev_eui(), &dev_eui);
    }

    #[tokio::test]
    async fn test_storage_engine_recovery() {
        let temp_dir = TempDir::new().unwrap();
        let config = create_test_config(temp_dir.path());

        let dev_eui = DevEui::new("0123456789ABCDEF".to_string()).unwrap();
        let now = Utc::now();

        // Write frames and close
        {
            let engine = StorageEngine::new(config.clone()).await.unwrap();
            for i in 0..3 {
                let frame = create_test_frame(
                    "0123456789ABCDEF",
                    now + chrono::Duration::seconds(i),
                );
                engine.write(frame).await.unwrap();
            }
        }

        // Reopen and verify recovery
        let engine = StorageEngine::new(config).await.unwrap();
        let results = engine.query(&dev_eui, None, None).await.unwrap();
        assert_eq!(results.len(), 3);
    }

    #[tokio::test]
    async fn test_device_registry_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let config = create_test_config(temp_dir.path());

        let dev_eui1 = "0123456789ABCDEF";
        let dev_eui2 = "FEDCBA9876543210";
        let now = Utc::now();

        // Write frames for multiple devices, then shutdown with flush
        {
            let engine = StorageEngine::new(config.clone()).await.unwrap();

            // Write frames for device 1
            for i in 0..2 {
                let frame = create_test_frame(dev_eui1, now + chrono::Duration::seconds(i));
                engine.write(frame).await.unwrap();
            }

            // Write frames for device 2
            for i in 0..2 {
                let frame = create_test_frame(dev_eui2, now + chrono::Duration::seconds(i));
                engine.write(frame).await.unwrap();
            }

            // Verify device registry has both devices
            assert_eq!(engine.device_registry().device_count(), 2);

            // Gracefully shutdown (flush memtable to SSTable)
            engine.shutdown().await.unwrap();
        }

        // Reopen and verify device registry is rebuilt from SSTables
        let engine = StorageEngine::new(config).await.unwrap();

        // Device registry should have both devices
        assert_eq!(engine.device_registry().device_count(), 2);

        // Verify we can get device info
        let device1 = engine.device_registry()
            .get(&DevEui::new(dev_eui1.to_string()).unwrap());
        assert!(device1.is_some());
        assert_eq!(device1.unwrap().device_name, Some("test-device".to_string()));

        let device2 = engine.device_registry()
            .get(&DevEui::new(dev_eui2.to_string()).unwrap());
        assert!(device2.is_some());
    }
}
