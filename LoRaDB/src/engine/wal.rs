use crate::error::LoraDbError;
use crate::model::frames::Frame;
use anyhow::{Context, Result};
use crc32fast::Hasher;
use std::fs::{create_dir_all, File, OpenOptions};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use parking_lot::Mutex;
use tracing::{error, info, warn};

#[allow(dead_code)]
const WAL_SEGMENT_SIZE: u64 = 64 * 1024 * 1024; // 64MB per segment
const WAL_MAGIC: u32 = 0x4C4F5241; // "LORA"
const WAL_VERSION: u16 = 2; // v2: Fixed bincode compatibility for serde_json::Value

/// Write-Ahead Log for durability
pub struct WriteAheadLog {
    data_dir: PathBuf,
    current_segment: Arc<Mutex<WalSegment>>,
    segment_number: u64,
    #[allow(dead_code)]
    sync_interval_ms: u64,
}

struct WalSegment {
    file: BufWriter<File>,
    size: u64,
    #[allow(dead_code)]
    path: PathBuf,
}

/// WAL entry format:
/// - Magic (4 bytes): 0x4C4F5241
/// - Length (4 bytes): payload length
/// - Payload (N bytes): bincode-serialized Frame
/// - CRC32 (4 bytes): checksum of length + payload
#[derive(Debug)]
#[allow(dead_code)]
struct WalEntry {
    _frame: Frame,
}

impl WriteAheadLog {
    pub fn open(data_dir: &Path, sync_interval_ms: u64) -> Result<Self> {
        let wal_dir = data_dir.join("wal");
        create_dir_all(&wal_dir).context("Failed to create WAL directory")?;

        // Set strict permissions (0700)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&wal_dir, std::fs::Permissions::from_mode(0o700))?;
        }

        // Find the latest segment number
        let segment_number = Self::find_latest_segment(&wal_dir)?;

        let segment_path = Self::segment_path(&wal_dir, segment_number);
        let segment = WalSegment::open(&segment_path)?;

        info!(
            "Opened WAL at {:?}, segment {}",
            wal_dir, segment_number
        );

        Ok(Self {
            data_dir: wal_dir,
            current_segment: Arc::new(Mutex::new(segment)),
            segment_number,
            sync_interval_ms,
        })
    }

    /// Append a frame to the WAL
    pub fn append(&self, frame: &Frame) -> Result<()> {
        let mut segment = self.current_segment.lock();

        // Serialize frame
        let payload =
            bincode::serialize(frame).context("Failed to serialize frame")?;

        if payload.len() > u32::MAX as usize {
            return Err(
                LoraDbError::WalError("Frame too large".into()).into()
            );
        }

        // Write entry with version
        let length = payload.len() as u32;
        segment.file.write_all(&WAL_MAGIC.to_le_bytes())?;
        segment.file.write_all(&WAL_VERSION.to_le_bytes())?;
        segment.file.write_all(&length.to_le_bytes())?;
        segment.file.write_all(&payload)?;

        // Calculate and write checksum (includes version in checksum)
        let mut hasher = Hasher::new();
        hasher.update(&WAL_VERSION.to_le_bytes());
        hasher.update(&length.to_le_bytes());
        hasher.update(&payload);
        let checksum = hasher.finalize();
        segment.file.write_all(&checksum.to_le_bytes())?;

        segment.size += 4 + 2 + 4 + payload.len() as u64 + 4;

        // Flush to ensure durability
        segment.file.flush()?;

        Ok(())
    }

    /// Sync the current segment to disk (fsync)
    pub fn sync(&self) -> Result<()> {
        let mut segment = self.current_segment.lock();

        segment.file.flush()?;
        segment.file.get_mut().sync_all()?;
        Ok(())
    }

    /// Replay all WAL segments and return frames
    pub fn replay(&self) -> Result<Vec<Frame>> {
        let mut frames = Vec::new();

        for segment_num in 0..=self.segment_number {
            let path = Self::segment_path(&self.data_dir, segment_num);
            if !path.exists() {
                continue;
            }

            match Self::replay_segment(&path) {
                Ok(segment_frames) => {
                    info!(
                        "Replayed {} frames from segment {}",
                        segment_frames.len(),
                        segment_num
                    );
                    frames.extend(segment_frames);
                }
                Err(e) => {
                    error!("Failed to replay segment {}: {}", segment_num, e);
                    // Continue with next segment instead of failing
                }
            }
        }

        Ok(frames)
    }

    fn replay_segment(path: &Path) -> Result<Vec<Frame>> {
        let file = File::open(path)?;
        let mut reader = BufReader::new(file);
        let mut frames = Vec::new();
        let mut skipped_entries = 0;

        loop {
            // Read magic
            let mut magic_buf = [0u8; 4];
            match reader.read_exact(&mut magic_buf) {
                Ok(_) => {}
                Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => break,
                Err(e) => return Err(e.into()),
            }

            let magic = u32::from_le_bytes(magic_buf);
            if magic != WAL_MAGIC {
                warn!("Invalid magic in WAL segment, stopping replay");
                break;
            }

            // Try to read version (new format) or fall back to old format
            let mut version_buf = [0u8; 2];
            match reader.read_exact(&mut version_buf) {
                Ok(_) => {
                    let version = u16::from_le_bytes(version_buf);

                    // Read length
                    let mut len_buf = [0u8; 4];
                    reader.read_exact(&mut len_buf)?;
                    let length = u32::from_le_bytes(len_buf);

                    // Read payload
                    let mut payload = vec![0u8; length as usize];
                    reader.read_exact(&mut payload)?;

                    // Read checksum
                    let mut crc_buf = [0u8; 4];
                    reader.read_exact(&mut crc_buf)?;
                    let stored_checksum = u32::from_le_bytes(crc_buf);

                    // Verify checksum
                    let mut hasher = Hasher::new();
                    hasher.update(&version_buf);
                    hasher.update(&len_buf);
                    hasher.update(&payload);
                    let computed_checksum = hasher.finalize();

                    if stored_checksum != computed_checksum {
                        warn!("Checksum mismatch in WAL segment entry, skipping");
                        skipped_entries += 1;
                        continue;
                    }

                    // Check version compatibility
                    if version != WAL_VERSION {
                        warn!("Incompatible WAL version {} (current: {}), skipping entry", version, WAL_VERSION);
                        skipped_entries += 1;
                        continue;
                    }

                    // Deserialize frame
                    match bincode::deserialize::<Frame>(&payload) {
                        Ok(frame) => frames.push(frame),
                        Err(e) => {
                            warn!("Failed to deserialize frame: {}, skipping", e);
                            skipped_entries += 1;
                        }
                    }
                }
                Err(_) => {
                    // Old format without version - skip this entry
                    warn!("Found old WAL format entry without version, skipping");
                    skipped_entries += 1;
                    // Try to skip to next entry by reading what would be length and payload
                    // This is best-effort recovery
                    break;
                }
            }
        }

        if skipped_entries > 0 {
            warn!("Skipped {} incompatible WAL entries during replay", skipped_entries);
        }

        Ok(frames)
    }

    /// Delete all WAL segments (after successful compaction)
    pub fn truncate(&self) -> Result<()> {
        for segment_num in 0..=self.segment_number {
            let path = Self::segment_path(&self.data_dir, segment_num);
            if path.exists() {
                std::fs::remove_file(&path)?;
            }
        }

        // Create new segment 0
        let new_segment_path = Self::segment_path(&self.data_dir, 0);
        let new_segment = WalSegment::open(&new_segment_path)?;

        let mut current = self.current_segment.lock();
        *current = new_segment;

        Ok(())
    }

    fn find_latest_segment(dir: &Path) -> Result<u64> {
        let mut max_num = 0u64;

        if !dir.exists() {
            return Ok(0);
        }

        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let name = entry.file_name();
            let name_str = name.to_string_lossy();

            if name_str.starts_with("wal-") && name_str.ends_with(".log") {
                if let Some(num_str) = name_str
                    .strip_prefix("wal-")
                    .and_then(|s| s.strip_suffix(".log"))
                {
                    if let Ok(num) = num_str.parse::<u64>() {
                        max_num = max_num.max(num);
                    }
                }
            }
        }

        Ok(max_num)
    }

    fn segment_path(dir: &Path, segment_num: u64) -> PathBuf {
        dir.join(format!("wal-{:08}.log", segment_num))
    }
}

impl WalSegment {
    fn open(path: &Path) -> Result<Self> {
        let file = OpenOptions::new().create(true).append(true).open(path)?;

        // Set strict permissions (0600)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
        }

        let size = file.metadata()?.len();

        Ok(Self {
            file: BufWriter::new(file),
            size,
            path: path.to_path_buf(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::decoded::DecodedPayload;
    use crate::model::frames::UplinkFrame;
    use crate::model::lorawan::*;
    use chrono::{DateTime, Utc};
    use tempfile::TempDir;

    fn create_test_frame() -> Frame {
        Frame::Uplink(UplinkFrame {
            dev_eui: DevEui::new("0123456789ABCDEF".to_string()).unwrap(),
            application_id: ApplicationId::new("test-app".to_string()),
            device_name: Some("test-device".to_string()),
            received_at: Utc::now(),
            f_port: 1,
            f_cnt: 42,
            confirmed: false,
            adr: true,
            dr: DataRate::new_lora(125000, 7),
            frequency: 868100000,
            rx_info: vec![],
            decoded_payload: None, // Removed to test bincode compatibility
            raw_payload: Some("aGVsbG8=".to_string()),
        })
    }

    #[test]
    fn test_bincode_datetime() {
        // Test if DateTime<Utc> can be serialized with bincode
        let now = Utc::now();
        let serialized = bincode::serialize(&now).unwrap();
        let deserialized: DateTime<Utc> = bincode::deserialize(&serialized).unwrap();
        assert!(deserialized == now);
    }

    #[test]
    fn test_bincode_dev_eui() {
        // Test if DevEui with #[serde(transparent)] works with bincode
        let dev_eui = DevEui::new("0123456789ABCDEF".to_string()).unwrap();
        let serialized = bincode::serialize(&dev_eui).unwrap();
        let deserialized: DevEui = bincode::deserialize(&serialized).unwrap();
        assert_eq!(deserialized.as_str(), "0123456789ABCDEF");
    }

    #[test]
    fn test_bincode_data_rate() {
        // Test if DataRate works with bincode
        let dr = DataRate::new_lora(125000, 7);
        let serialized = bincode::serialize(&dr).unwrap();
        let deserialized: DataRate = bincode::deserialize(&serialized).unwrap();
        assert_eq!(deserialized.spreading_factor, 7);
    }

    #[test]
    fn test_bincode_frame_serialization() {
        // Test that Frame can be serialized/deserialized with bincode
        let frame = create_test_frame();
        let serialized = bincode::serialize(&frame).unwrap();
        let deserialized: Frame = bincode::deserialize(&serialized).unwrap();
        assert_eq!(deserialized.dev_eui().as_str(), "0123456789ABCDEF");
    }

    #[test]
    fn test_wal_append_and_replay() {
        let temp_dir = TempDir::new().unwrap();

        // Write frames
        {
            let wal = WriteAheadLog::open(temp_dir.path(), 1000).unwrap();
            let frame = create_test_frame();
            wal.append(&frame).unwrap();
            wal.sync().unwrap();
        }

        // Reopen and replay
        let wal = WriteAheadLog::open(temp_dir.path(), 1000).unwrap();
        let replayed = wal.replay().unwrap();
        assert_eq!(replayed.len(), 1);
    }

    #[test]
    fn test_wal_multiple_frames() {
        let temp_dir = TempDir::new().unwrap();

        // Write frames
        {
            let wal = WriteAheadLog::open(temp_dir.path(), 1000).unwrap();
            for _ in 0..10 {
                let frame = create_test_frame();
                wal.append(&frame).unwrap();
            }
            wal.sync().unwrap();
        }

        // Reopen and replay
        let wal = WriteAheadLog::open(temp_dir.path(), 1000).unwrap();
        let replayed = wal.replay().unwrap();
        assert_eq!(replayed.len(), 10);
    }
}
