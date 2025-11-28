use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

/// Query AST representing the parsed query
#[derive(Debug, Clone, PartialEq)]
pub struct Query {
    pub select: SelectClause,
    pub from: FromClause,
    pub filter: Option<FilterClause>,
}

/// SELECT clause - what data to retrieve
#[derive(Debug, Clone, PartialEq)]
pub enum SelectClause {
    /// SELECT * - all frames
    All,
    /// SELECT uplink - only uplink frames
    Uplink,
    /// SELECT downlink - only downlink frames
    Downlink,
    /// SELECT join - only join request/accept frames
    Join,
    /// SELECT field1, field2, ... - specific fields
    Fields(Vec<String>),
}

/// FROM clause - which device to query
#[derive(Debug, Clone, PartialEq)]
pub struct FromClause {
    pub dev_eui: String,
}

/// WHERE clause - time range filtering
#[derive(Debug, Clone, PartialEq)]
pub enum FilterClause {
    /// BETWEEN start AND end
    Between {
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    },
    /// SINCE timestamp
    Since(DateTime<Utc>),
    /// LAST duration (e.g., "1h", "30m", "7d")
    Last(Duration),
}

impl Query {
    pub fn new(select: SelectClause, from: FromClause, filter: Option<FilterClause>) -> Self {
        Self {
            select,
            from,
            filter,
        }
    }

    /// Get the time range from the filter clause
    pub fn time_range(&self) -> (Option<DateTime<Utc>>, Option<DateTime<Utc>>) {
        match &self.filter {
            Some(FilterClause::Between { start, end }) => (Some(*start), Some(*end)),
            Some(FilterClause::Since(start)) => (Some(*start), None),
            Some(FilterClause::Last(duration)) => {
                let start = Utc::now() - *duration;
                (Some(start), None)
            }
            None => (None, None),
        }
    }
}

/// Query result wrapping frames with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub dev_eui: String,
    pub total_frames: usize,
    pub frames: Vec<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_query_creation() {
        let query = Query::new(
            SelectClause::All,
            FromClause {
                dev_eui: "0123456789ABCDEF".to_string(),
            },
            None,
        );

        assert_eq!(query.select, SelectClause::All);
        assert_eq!(query.from.dev_eui, "0123456789ABCDEF");
        assert!(query.filter.is_none());
    }

    #[test]
    fn test_time_range_between() {
        let start = Utc::now() - Duration::hours(1);
        let end = Utc::now();

        let query = Query::new(
            SelectClause::All,
            FromClause {
                dev_eui: "0123456789ABCDEF".to_string(),
            },
            Some(FilterClause::Between { start, end }),
        );

        let (range_start, range_end) = query.time_range();
        assert_eq!(range_start, Some(start));
        assert_eq!(range_end, Some(end));
    }

    #[test]
    fn test_time_range_since() {
        let start = Utc::now() - Duration::hours(2);

        let query = Query::new(
            SelectClause::All,
            FromClause {
                dev_eui: "0123456789ABCDEF".to_string(),
            },
            Some(FilterClause::Since(start)),
        );

        let (range_start, range_end) = query.time_range();
        assert_eq!(range_start, Some(start));
        assert!(range_end.is_none());
    }

    #[test]
    fn test_time_range_last() {
        let query = Query::new(
            SelectClause::All,
            FromClause {
                dev_eui: "0123456789ABCDEF".to_string(),
            },
            Some(FilterClause::Last(Duration::hours(1))),
        );

        let (range_start, range_end) = query.time_range();
        assert!(range_start.is_some());
        assert!(range_end.is_none());

        // Verify start is approximately 1 hour ago
        let diff = Utc::now() - range_start.unwrap();
        assert!(diff.num_minutes() >= 59 && diff.num_minutes() <= 61);
    }
}
