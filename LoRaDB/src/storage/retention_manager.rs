use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

/// Manages retention policies with JSON persistence
pub struct RetentionPolicyManager {
    policies: Arc<RwLock<RetentionPolicies>>,
    file_path: PathBuf,
}

/// Retention policies configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetentionPolicies {
    /// Global default retention period in days (None = keep forever)
    pub global_days: Option<u32>,
    /// Per-application retention policies
    pub applications: HashMap<String, RetentionPolicy>,
    /// How often to check and enforce retention (in hours)
    pub check_interval_hours: u64,
}

/// Retention policy for a specific application
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetentionPolicy {
    /// Retention period in days (None = "never" - keep forever)
    pub days: Option<u32>,
    /// When this policy was created
    pub created_at: DateTime<Utc>,
    /// When this policy was last updated
    pub updated_at: DateTime<Utc>,
}

impl Default for RetentionPolicies {
    fn default() -> Self {
        Self {
            global_days: None,
            applications: HashMap::new(),
            check_interval_hours: 24,
        }
    }
}

impl RetentionPolicyManager {
    /// Create a new retention policy manager
    pub async fn new(data_dir: &PathBuf) -> Result<Self> {
        let file_path = data_dir.join("retention_policies.json");

        // Try to load existing policies, or create default
        let policies = if file_path.exists() {
            match tokio::fs::read_to_string(&file_path).await {
                Ok(content) => {
                    match serde_json::from_str::<RetentionPolicies>(&content) {
                        Ok(policies) => {
                            info!("Loaded retention policies from {}", file_path.display());
                            policies
                        }
                        Err(e) => {
                            warn!("Failed to parse retention policies, using default: {}", e);
                            RetentionPolicies::default()
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to read retention policies file, using default: {}", e);
                    RetentionPolicies::default()
                }
            }
        } else {
            info!("No retention policies file found, using default (keep forever)");
            RetentionPolicies::default()
        };

        let manager = Self {
            policies: Arc::new(RwLock::new(policies)),
            file_path,
        };

        // Save initial state
        manager.save().await?;

        Ok(manager)
    }

    /// Initialize from environment variables (for backward compatibility)
    pub async fn from_env(
        data_dir: &PathBuf,
        retention_days: Option<u32>,
        retention_apps: HashMap<String, Option<u32>>,
        check_interval_hours: u64,
    ) -> Result<Self> {
        let file_path = data_dir.join("retention_policies.json");

        // If file exists, use it (API takes precedence over env vars)
        if file_path.exists() {
            info!("Retention policies file exists, using it (ignoring env vars)");
            return Self::new(data_dir).await;
        }

        // Otherwise, initialize from env vars
        info!("Initializing retention policies from environment variables");

        let now = Utc::now();
        let applications = retention_apps
            .into_iter()
            .map(|(app_id, days)| {
                (
                    app_id,
                    RetentionPolicy {
                        days,
                        created_at: now,
                        updated_at: now,
                    },
                )
            })
            .collect();

        let policies = RetentionPolicies {
            global_days: retention_days,
            applications,
            check_interval_hours,
        };

        let manager = Self {
            policies: Arc::new(RwLock::new(policies)),
            file_path,
        };

        // Save initial state
        manager.save().await?;

        Ok(manager)
    }

    /// Get current policies (for internal use by storage engine)
    pub async fn get_policies(&self) -> RetentionPolicies {
        self.policies.read().await.clone()
    }

    /// Get global retention policy
    pub async fn get_global(&self) -> Option<u32> {
        self.policies.read().await.global_days
    }

    /// Set global retention policy
    pub async fn set_global(&self, days: Option<u32>) -> Result<()> {
        {
            let mut policies = self.policies.write().await;
            policies.global_days = days;
        }
        self.save().await?;

        match days {
            Some(d) => info!("Updated global retention policy to {} days", d),
            None => info!("Updated global retention policy to 'never' (keep forever)"),
        }

        Ok(())
    }

    /// Get retention policy for a specific application
    pub async fn get_application(&self, app_id: &str) -> Option<RetentionPolicy> {
        self.policies.read().await.applications.get(app_id).cloned()
    }

    /// Set retention policy for a specific application
    pub async fn set_application(&self, app_id: String, days: Option<u32>) -> Result<()> {
        let now = Utc::now();

        {
            let mut policies = self.policies.write().await;

            if let Some(existing) = policies.applications.get_mut(&app_id) {
                existing.days = days;
                existing.updated_at = now;
            } else {
                policies.applications.insert(
                    app_id.clone(),
                    RetentionPolicy {
                        days,
                        created_at: now,
                        updated_at: now,
                    },
                );
            }
        }

        self.save().await?;

        match days {
            Some(d) => info!("Updated retention policy for '{}' to {} days", app_id, d),
            None => info!("Updated retention policy for '{}' to 'never' (keep forever)", app_id),
        }

        Ok(())
    }

    /// Remove application-specific retention policy (will fall back to global)
    pub async fn remove_application(&self, app_id: &str) -> Result<bool> {
        let removed = {
            let mut policies = self.policies.write().await;
            policies.applications.remove(app_id).is_some()
        };

        if removed {
            self.save().await?;
            info!("Removed retention policy for '{}' (will use global policy)", app_id);
        }

        Ok(removed)
    }

    /// List all application-specific policies
    pub async fn list_applications(&self) -> HashMap<String, RetentionPolicy> {
        self.policies.read().await.applications.clone()
    }

    /// Get check interval in hours
    pub async fn get_check_interval_hours(&self) -> u64 {
        self.policies.read().await.check_interval_hours
    }

    /// Set check interval in hours
    pub async fn set_check_interval_hours(&self, hours: u64) -> Result<()> {
        {
            let mut policies = self.policies.write().await;
            policies.check_interval_hours = hours;
        }
        self.save().await?;
        info!("Updated retention check interval to {} hours", hours);
        Ok(())
    }

    /// Save policies to disk
    async fn save(&self) -> Result<()> {
        let policies = self.policies.read().await;
        let json = serde_json::to_string_pretty(&*policies)?;

        tokio::fs::write(&self.file_path, json).await?;

        // Set strict permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            tokio::fs::set_permissions(&self.file_path, std::fs::Permissions::from_mode(0o600))
                .await?;
        }

        Ok(())
    }

    /// Convert to format expected by storage engine (for backward compatibility)
    pub async fn to_storage_config(&self) -> (Option<u32>, HashMap<String, Option<u32>>, u64) {
        let policies = self.policies.read().await;
        let retention_apps = policies
            .applications
            .iter()
            .map(|(k, v)| (k.clone(), v.days))
            .collect();

        (policies.global_days, retention_apps, policies.check_interval_hours)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_retention_manager_create() {
        let temp_dir = TempDir::new().unwrap();
        let manager = RetentionPolicyManager::new(&temp_dir.path().to_path_buf())
            .await
            .unwrap();

        let global = manager.get_global().await;
        assert_eq!(global, None);
    }

    #[tokio::test]
    async fn test_retention_manager_global_policy() {
        let temp_dir = TempDir::new().unwrap();
        let manager = RetentionPolicyManager::new(&temp_dir.path().to_path_buf())
            .await
            .unwrap();

        manager.set_global(Some(90)).await.unwrap();
        assert_eq!(manager.get_global().await, Some(90));

        manager.set_global(None).await.unwrap();
        assert_eq!(manager.get_global().await, None);
    }

    #[tokio::test]
    async fn test_retention_manager_app_policy() {
        let temp_dir = TempDir::new().unwrap();
        let manager = RetentionPolicyManager::new(&temp_dir.path().to_path_buf())
            .await
            .unwrap();

        manager.set_application("test-app".to_string(), Some(30))
            .await
            .unwrap();

        let policy = manager.get_application("test-app").await;
        assert!(policy.is_some());
        assert_eq!(policy.unwrap().days, Some(30));

        manager.remove_application("test-app").await.unwrap();
        assert!(manager.get_application("test-app").await.is_none());
    }

    #[tokio::test]
    async fn test_retention_manager_persistence() {
        let temp_dir = TempDir::new().unwrap();

        {
            let manager = RetentionPolicyManager::new(&temp_dir.path().to_path_buf())
                .await
                .unwrap();
            manager.set_global(Some(90)).await.unwrap();
            manager.set_application("test-app".to_string(), Some(30))
                .await
                .unwrap();
        }

        // Reload and verify
        let manager = RetentionPolicyManager::new(&temp_dir.path().to_path_buf())
            .await
            .unwrap();
        assert_eq!(manager.get_global().await, Some(90));

        let policy = manager.get_application("test-app").await;
        assert!(policy.is_some());
        assert_eq!(policy.unwrap().days, Some(30));
    }

    #[tokio::test]
    async fn test_retention_manager_from_env() {
        let temp_dir = TempDir::new().unwrap();

        let mut retention_apps = HashMap::new();
        retention_apps.insert("app1".to_string(), Some(30));
        retention_apps.insert("app2".to_string(), None); // never

        let manager = RetentionPolicyManager::from_env(
            &temp_dir.path().to_path_buf(),
            Some(90),
            retention_apps,
            24,
        )
        .await
        .unwrap();

        assert_eq!(manager.get_global().await, Some(90));

        let policy1 = manager.get_application("app1").await;
        assert_eq!(policy1.unwrap().days, Some(30));

        let policy2 = manager.get_application("app2").await;
        assert_eq!(policy2.unwrap().days, None);
    }
}
