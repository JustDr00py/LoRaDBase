use crate::error::LoraDbError;
use crate::model::frames::Frame;
use crate::model::lorawan::DevEui;
use crate::query::dsl::{Query, QueryResult, SelectClause};
use crate::storage::StorageEngine;
use anyhow::Result;
use std::sync::Arc;

/// Maximum number of results returned by a single query
const MAX_QUERY_RESULTS: usize = 10_000;

/// Query executor that runs queries against the storage engine
pub struct QueryExecutor {
    storage: Arc<StorageEngine>,
}

impl QueryExecutor {
    pub fn new(storage: Arc<StorageEngine>) -> Self {
        Self { storage }
    }

    /// Execute a query and return results
    pub async fn execute(&self, query: &Query) -> Result<QueryResult> {
        // SECURITY: Enforce mandatory time filter to prevent unbounded queries
        if query.filter.is_none() {
            return Err(LoraDbError::QueryExecutionError(
                "Time filter is required for security. Use WHERE LAST, SINCE, or BETWEEN clause.".to_string()
            ).into());
        }

        // Parse DevEUI
        let dev_eui = DevEui::new(query.from.dev_eui.clone())
            .map_err(|e| LoraDbError::QueryExecutionError(e.to_string()))?;

        // Get time range
        let (start_time, end_time) = query.time_range();

        // Query storage engine
        let mut frames = self
            .storage
            .query(&dev_eui, start_time, end_time)
            .await?;

        // SECURITY: Limit result set to prevent memory exhaustion
        if frames.len() > MAX_QUERY_RESULTS {
            tracing::warn!(
                "Query returned {} frames, truncating to {}",
                frames.len(),
                MAX_QUERY_RESULTS
            );
            frames.truncate(MAX_QUERY_RESULTS);
        }

        // Apply SELECT clause filtering
        frames = self.filter_frames(frames, &query.select);

        // Convert frames to JSON
        let json_frames: Vec<serde_json::Value> = frames
            .iter()
            .map(|frame| {
                // Serialize frame to JSON
                let json = serde_json::to_value(frame).unwrap_or(serde_json::json!({}));

                // Unwrap enum variant for easier querying (e.g., {"Uplink": {...}} -> {...})
                let unwrapped_json = self.unwrap_frame_variant(json);

                // Unwrap stringified decoded_payload.object (handles old data and bincode format)
                let decoded_json = self.unwrap_decoded_payload(unwrapped_json);

                // Apply field projection if needed
                self.project_fields(decoded_json, &query.select)
            })
            .collect();

        Ok(QueryResult {
            dev_eui: query.from.dev_eui.clone(),
            total_frames: json_frames.len(),
            frames: json_frames,
        })
    }

    /// Filter frames based on SELECT clause
    fn filter_frames(&self, frames: Vec<Frame>, select: &SelectClause) -> Vec<Frame> {
        match select {
            SelectClause::All => frames,
            SelectClause::Uplink => frames
                .into_iter()
                .filter(|f| matches!(f, Frame::Uplink(_)))
                .collect(),
            SelectClause::Downlink => frames
                .into_iter()
                .filter(|f| matches!(f, Frame::Downlink(_)))
                .collect(),
            SelectClause::Join => frames
                .into_iter()
                .filter(|f| matches!(f, Frame::JoinRequest(_) | Frame::JoinAccept(_)))
                .collect(),
            SelectClause::Fields(_) => frames, // Field projection happens later
        }
    }

    /// Project specific fields from JSON with support for nested paths (dot notation)
    fn project_fields(&self, json: serde_json::Value, select: &SelectClause) -> serde_json::Value {
        if let SelectClause::Fields(fields) = select {
            let mut result = serde_json::Map::new();

            for field in fields {
                // Check if this is a nested path (contains dots)
                if field.contains('.') {
                    // Extract nested value
                    if let Some(value) = self.get_nested_field(&json, field) {
                        // For nested paths, use the full path as the key
                        result.insert(field.clone(), value.clone());
                    }
                } else {
                    // Top-level field access
                    if let serde_json::Value::Object(ref map) = json {
                        if let Some(value) = map.get(field) {
                            result.insert(field.clone(), value.clone());
                        }
                    }
                }
            }

            serde_json::Value::Object(result)
        } else {
            json
        }
    }

    /// Get a nested field using dot notation (e.g., "decoded_payload.object.co2")
    fn get_nested_field<'a>(&self, json: &'a serde_json::Value, path: &str) -> Option<&'a serde_json::Value> {
        let mut current = json;
        for segment in path.split('.') {
            current = current.get(segment)?;
        }
        Some(current)
    }

    /// Unwrap Frame enum variant to make querying easier
    /// Converts {"Uplink": {...}} to {...} while preserving the frame type as a field
    fn unwrap_frame_variant(&self, json: serde_json::Value) -> serde_json::Value {
        if let serde_json::Value::Object(map) = json {
            // Frame enum has exactly one key (the variant name)
            if map.len() == 1 {
                if let Some((variant_name, variant_value)) = map.iter().next() {
                    if let serde_json::Value::Object(mut inner_map) = variant_value.clone() {
                        // Add frame_type field to indicate which variant this was
                        inner_map.insert("frame_type".to_string(), serde_json::json!(variant_name));
                        return serde_json::Value::Object(inner_map);
                    }
                }
            }
            serde_json::Value::Object(map)
        } else {
            json
        }
    }

    /// Unwrap stringified decoded_payload.object fields
    /// This handles both old double-encoded data and the bincode serialization format
    fn unwrap_decoded_payload(&self, mut json: serde_json::Value) -> serde_json::Value {
        if let serde_json::Value::Object(ref mut map) = json {
            // Check if this frame has a decoded_payload field
            if let Some(decoded_payload) = map.get_mut("decoded_payload") {
                if let serde_json::Value::Object(ref mut dp_map) = decoded_payload {
                    // Check if object field is a string (double-encoded)
                    if let Some(serde_json::Value::String(object_str)) = dp_map.get("object") {
                        // Try to parse the string as JSON
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(object_str) {
                            tracing::debug!("Unwrapping stringified decoded_payload.object for query");
                            dp_map.insert("object".to_string(), parsed);
                        }
                    }
                }
            }
        }
        json
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use super::*;
    use crate::config::StorageConfig;
    use crate::model::frames::UplinkFrame;
    use crate::model::lorawan::*;
    use crate::query::dsl::{FilterClause, FromClause};
    use chrono::{Duration, Utc};
    use tempfile::TempDir;

    fn create_test_config(data_dir: &std::path::Path) -> StorageConfig {
        StorageConfig {
            data_dir: data_dir.to_path_buf(),
            wal_sync_interval_ms: 1000,
            memtable_size_mb: 1,
            memtable_flush_interval_secs: 300,
            compaction_threshold: 3,
            enable_encryption: false,
            encryption_key: None,
            retention_days: None,
            retention_apps: HashMap::new(),
            retention_check_interval_hours: 24,
        }
    }

    fn create_test_uplink(dev_eui: &str, timestamp: chrono::DateTime<Utc>) -> Frame {
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
    async fn test_execute_query_all() {
        let temp_dir = TempDir::new().unwrap();
        let config = create_test_config(temp_dir.path());
        let storage = Arc::new(StorageEngine::new(config).await.unwrap());
        let executor = QueryExecutor::new(storage.clone());

        // Write some test frames
        let dev_eui_str = "0123456789ABCDEF";
        let now = Utc::now();
        for i in 0..3 {
            let frame = create_test_uplink(dev_eui_str, now + Duration::seconds(i));
            storage.write(frame).await.unwrap();
        }

        // Execute query with time filter (now required)
        let query = Query::new(
            SelectClause::All,
            FromClause {
                dev_eui: dev_eui_str.to_string(),
            },
            Some(FilterClause::Last(Duration::hours(1))),
        );

        let result = executor.execute(&query).await.unwrap();
        assert_eq!(result.total_frames, 3);
        assert_eq!(result.dev_eui, dev_eui_str);
    }

    #[tokio::test]
    async fn test_execute_query_with_time_filter() {
        let temp_dir = TempDir::new().unwrap();
        let config = create_test_config(temp_dir.path());
        let storage = Arc::new(StorageEngine::new(config).await.unwrap());
        let executor = QueryExecutor::new(storage.clone());

        // Write frames at different times
        let dev_eui_str = "0123456789ABCDEF";
        let base_time = Utc::now() - Duration::hours(2);

        for i in 0..5 {
            let frame = create_test_uplink(dev_eui_str, base_time + Duration::minutes(i * 30));
            storage.write(frame).await.unwrap();
        }

        // Query for last 1 hour (should get 2-3 frames)
        let query = Query::new(
            SelectClause::All,
            FromClause {
                dev_eui: dev_eui_str.to_string(),
            },
            Some(FilterClause::Last(Duration::hours(1))),
        );

        let result = executor.execute(&query).await.unwrap();
        assert!(result.total_frames >= 2);
    }

    #[tokio::test]
    async fn test_execute_query_uplink_only() {
        let temp_dir = TempDir::new().unwrap();
        let config = create_test_config(temp_dir.path());
        let storage = Arc::new(StorageEngine::new(config).await.unwrap());
        let executor = QueryExecutor::new(storage.clone());

        // Write uplink frames
        let dev_eui_str = "0123456789ABCDEF";
        let now = Utc::now();
        for i in 0..3 {
            let frame = create_test_uplink(dev_eui_str, now + Duration::seconds(i));
            storage.write(frame).await.unwrap();
        }

        // Execute query for uplink only with time filter
        let query = Query::new(
            SelectClause::Uplink,
            FromClause {
                dev_eui: dev_eui_str.to_string(),
            },
            Some(FilterClause::Last(Duration::hours(1))),
        );

        let result = executor.execute(&query).await.unwrap();
        assert_eq!(result.total_frames, 3);
    }

    #[tokio::test]
    async fn test_execute_query_nonexistent_device() {
        let temp_dir = TempDir::new().unwrap();
        let config = create_test_config(temp_dir.path());
        let storage = Arc::new(StorageEngine::new(config).await.unwrap());
        let executor = QueryExecutor::new(storage);

        // Query for device that doesn't exist (with time filter)
        let query = Query::new(
            SelectClause::All,
            FromClause {
                dev_eui: "FEDCBA9876543210".to_string(),
            },
            Some(FilterClause::Last(Duration::hours(1))),
        );

        let result = executor.execute(&query).await.unwrap();
        assert_eq!(result.total_frames, 0);
    }

    #[tokio::test]
    async fn test_execute_query_with_nested_fields() {
        use crate::model::decoded::DecodedPayload;
        use serde_json::json;

        let temp_dir = TempDir::new().unwrap();
        let config = create_test_config(temp_dir.path());
        let storage = Arc::new(StorageEngine::new(config).await.unwrap());
        let executor = QueryExecutor::new(storage.clone());

        // Create uplink with decoded payload containing measurements
        let dev_eui_str = "0123456789ABCDEF";
        let decoded = DecodedPayload::from_json(json!({
            "co2": 450,
            "TempC_SHT": 22.5,
            "humidity": 65.0,
            "sensor": {
                "voltage": 3.7,
                "status": "ok"
            }
        }));

        let frame = Frame::Uplink(UplinkFrame {
            dev_eui: DevEui::new(dev_eui_str.to_string()).unwrap(),
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
            decoded_payload: Some(decoded),
            raw_payload: None,
        });

        storage.write(frame).await.unwrap();

        // Query with nested field paths (now simplified without "Uplink" prefix)
        let query = Query::new(
            SelectClause::Fields(vec![
                "decoded_payload.object.co2".to_string(),
                "decoded_payload.object.TempC_SHT".to_string(),
                "decoded_payload.object.sensor.voltage".to_string(),
            ]),
            FromClause {
                dev_eui: dev_eui_str.to_string(),
            },
            Some(FilterClause::Last(Duration::hours(1))),
        );

        let result = executor.execute(&query).await.unwrap();
        assert_eq!(result.total_frames, 1);

        // Verify the projected fields
        let frame_json = &result.frames[0];
        assert_eq!(frame_json["decoded_payload.object.co2"], json!(450));
        assert_eq!(frame_json["decoded_payload.object.TempC_SHT"], json!(22.5));
        assert_eq!(frame_json["decoded_payload.object.sensor.voltage"], json!(3.7));

        // Verify other fields are not included
        assert!(frame_json.get("f_port").is_none());
        assert!(frame_json.get("decoded_payload.object.humidity").is_none());
    }

    #[tokio::test]
    async fn test_execute_query_mixed_top_level_and_nested_fields() {
        use crate::model::decoded::DecodedPayload;
        use serde_json::json;

        let temp_dir = TempDir::new().unwrap();
        let config = create_test_config(temp_dir.path());
        let storage = Arc::new(StorageEngine::new(config).await.unwrap());
        let executor = QueryExecutor::new(storage.clone());

        let dev_eui_str = "0123456789ABCDEF";
        let decoded = DecodedPayload::from_json(json!({
            "temperature": 25.0,
        }));

        let frame = Frame::Uplink(UplinkFrame {
            dev_eui: DevEui::new(dev_eui_str.to_string()).unwrap(),
            application_id: ApplicationId::new("test-app".to_string()),
            device_name: Some("sensor-1".to_string()),
            received_at: Utc::now(),
            f_port: 2,
            f_cnt: 100,
            confirmed: false,
            adr: true,
            dr: DataRate::new_lora(125000, 7),
            frequency: 868100000,
            rx_info: vec![],
            decoded_payload: Some(decoded),
            raw_payload: None,
        });

        storage.write(frame).await.unwrap();

        // Query mixing top-level and nested fields
        let query = Query::new(
            SelectClause::Fields(vec![
                "f_port".to_string(),
                "f_cnt".to_string(),
                "decoded_payload.object.temperature".to_string(),
            ]),
            FromClause {
                dev_eui: dev_eui_str.to_string(),
            },
            Some(FilterClause::Last(Duration::hours(1))),
        );

        let result = executor.execute(&query).await.unwrap();
        assert_eq!(result.total_frames, 1);

        let frame_json = &result.frames[0];
        assert_eq!(frame_json["f_port"], json!(2));
        assert_eq!(frame_json["f_cnt"], json!(100));
        assert_eq!(frame_json["decoded_payload.object.temperature"], json!(25.0));

        // Verify device_name is excluded
        assert!(frame_json.get("device_name").is_none());
    }

    #[test]
    fn test_get_nested_field() {
        use serde_json::json;

        let storage = Arc::new(
            tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(async {
                    let temp_dir = TempDir::new().unwrap();
                    let config = create_test_config(temp_dir.path());
                    StorageEngine::new(config).await.unwrap()
                })
        );
        let executor = QueryExecutor::new(storage);

        let json = json!({
            "level1": {
                "level2": {
                    "level3": "deep_value"
                },
                "value": 42
            },
            "top": "top_value"
        });

        // Test deeply nested path
        assert_eq!(
            executor.get_nested_field(&json, "level1.level2.level3"),
            Some(&json!("deep_value"))
        );

        // Test two-level path
        assert_eq!(
            executor.get_nested_field(&json, "level1.value"),
            Some(&json!(42))
        );

        // Test top-level path
        assert_eq!(
            executor.get_nested_field(&json, "top"),
            Some(&json!("top_value"))
        );

        // Test non-existent path
        assert_eq!(
            executor.get_nested_field(&json, "level1.nonexistent"),
            None
        );
    }

    #[tokio::test]
    async fn test_unwrap_double_encoded_payload() {
        use crate::model::decoded::DecodedPayload;
        use serde_json::json;

        let temp_dir = TempDir::new().unwrap();
        let config = create_test_config(temp_dir.path());
        let storage = Arc::new(StorageEngine::new(config).await.unwrap());
        let executor = QueryExecutor::new(storage.clone());

        // Create uplink with double-encoded JSON string (simulating old data)
        let dev_eui_str = "a84041c7a1881438";
        let double_encoded_str = r#"{"BatV":3.071,"Bat_status":3.0,"TempC_SHT":14.96}"#;
        let decoded = DecodedPayload::from_json(json!(double_encoded_str));

        let frame = Frame::Uplink(UplinkFrame {
            dev_eui: DevEui::new(dev_eui_str.to_string()).unwrap(),
            application_id: ApplicationId::new("test-app".to_string()),
            device_name: Some("test-device".to_string()),
            received_at: Utc::now(),
            f_port: 2,
            f_cnt: 4186,
            confirmed: false,
            adr: true,
            dr: DataRate::new_lora(125000, 3),
            frequency: 904700000,
            rx_info: vec![],
            decoded_payload: Some(decoded),
            raw_payload: Some("y/8F2AJdAX//f/8=".to_string()),
        });

        storage.write(frame).await.unwrap();

        // Query for specific nested field
        let query = Query::new(
            SelectClause::Fields(vec![
                "decoded_payload.object.BatV".to_string(),
                "decoded_payload.object.Bat_status".to_string(),
                "decoded_payload.object.TempC_SHT".to_string(),
            ]),
            FromClause {
                dev_eui: dev_eui_str.to_string(),
            },
            Some(FilterClause::Last(Duration::hours(1))),
        );

        let result = executor.execute(&query).await.unwrap();
        assert_eq!(result.total_frames, 1);

        // Verify the unwrapped fields are accessible
        let frame_json = &result.frames[0];
        assert_eq!(frame_json["decoded_payload.object.BatV"], json!(3.071));
        assert_eq!(frame_json["decoded_payload.object.Bat_status"], json!(3.0));
        assert_eq!(frame_json["decoded_payload.object.TempC_SHT"], json!(14.96));
    }
}
