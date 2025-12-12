use crate::error::LoraDbError;
use crate::query::dsl::{FilterClause, FromClause, Query, SelectClause};
use anyhow::Result;
use chrono::{DateTime, Duration, Utc};

/// Maximum number of fields in a SELECT clause
const MAX_SELECT_FIELDS: usize = 100;

/// Parse a query string into a Query AST
///
/// Grammar:
/// ```text
/// Query     := SELECT SelectClause FROM FromClause [ WHERE FilterClause ] [ LIMIT integer ]
/// SelectClause := * | uplink | downlink | join | Fields
/// FromClause := device 'DevEUI'
/// FilterClause := BETWEEN 'timestamp' AND 'timestamp'
///              | SINCE 'timestamp'
///              | LAST 'duration'
/// ```
pub struct QueryParser;

impl QueryParser {
    pub fn new() -> Self {
        Self
    }

    pub fn parse(&self, input: &str) -> Result<Query> {
        let mut tokens = Tokenizer::new(input).tokenize()?;

        // Parse SELECT clause
        self.expect_keyword(&mut tokens, "SELECT")?;
        let select = self.parse_select(&mut tokens)?;

        // Parse FROM clause
        self.expect_keyword(&mut tokens, "FROM")?;
        let from = self.parse_from(&mut tokens)?;

        // Parse optional WHERE clause
        let filter = if self.peek_keyword(&tokens, "WHERE") {
            self.expect_keyword(&mut tokens, "WHERE")?;
            Some(self.parse_filter(&mut tokens)?)
        } else {
            None
        };

        // Parse optional LIMIT clause
        let limit = if self.peek_keyword(&tokens, "LIMIT") {
            self.expect_keyword(&mut tokens, "LIMIT")?;
            Some(self.parse_limit(&mut tokens)?)
        } else {
            None
        };

        // Ensure we consumed all tokens
        if !tokens.is_empty() {
            return Err(LoraDbError::QueryParseError(format!(
                "Unexpected tokens at end of query: {:?}",
                tokens
            ))
            .into());
        }

        Ok(Query::new(select, from, filter, limit))
    }

    fn parse_select(&self, tokens: &mut Vec<Token>) -> Result<SelectClause> {
        if tokens.is_empty() {
            return Err(
                LoraDbError::QueryParseError("Expected SELECT clause".to_string()).into(),
            );
        }

        let token = tokens.remove(0);
        match token {
            Token::Asterisk => Ok(SelectClause::All),
            Token::Identifier(ref s) if s.eq_ignore_ascii_case("uplink") => {
                Ok(SelectClause::Uplink)
            }
            Token::Identifier(ref s) if s.eq_ignore_ascii_case("downlink") => {
                Ok(SelectClause::Downlink)
            }
            Token::Identifier(ref s) if s.eq_ignore_ascii_case("join") => Ok(SelectClause::Join),
            Token::Identifier(field) => {
                // Parse comma-separated field list
                let mut fields = vec![field];
                while tokens.first() == Some(&Token::Comma) {
                    tokens.remove(0); // consume comma
                    if let Some(Token::Identifier(field)) = tokens.first() {
                        fields.push(field.clone());
                        tokens.remove(0);
                    } else {
                        return Err(LoraDbError::QueryParseError(
                            "Expected field name after comma".to_string(),
                        )
                        .into());
                    }
                }

                // SECURITY: Enforce maximum field count to prevent memory exhaustion
                if fields.len() > MAX_SELECT_FIELDS {
                    return Err(LoraDbError::QueryParseError(
                        format!("Too many fields in SELECT clause (max: {}, got: {})", MAX_SELECT_FIELDS, fields.len())
                    ).into());
                }

                Ok(SelectClause::Fields(fields))
            }
            _ => Err(LoraDbError::QueryParseError(format!(
                "Invalid SELECT clause: {:?}",
                token
            ))
            .into()),
        }
    }

    fn parse_from(&self, tokens: &mut Vec<Token>) -> Result<FromClause> {
        self.expect_keyword(tokens, "device")?;

        if let Some(Token::String(dev_eui)) = tokens.first() {
            let dev_eui = dev_eui.clone();
            tokens.remove(0);
            Ok(FromClause { dev_eui })
        } else {
            Err(LoraDbError::QueryParseError(
                "Expected device EUI string after 'device'".to_string(),
            )
            .into())
        }
    }

    fn parse_filter(&self, tokens: &mut Vec<Token>) -> Result<FilterClause> {
        if tokens.is_empty() {
            return Err(
                LoraDbError::QueryParseError("Expected filter clause".to_string()).into(),
            );
        }

        let token = tokens.remove(0);
        match token {
            Token::Identifier(ref s) if s.eq_ignore_ascii_case("BETWEEN") => {
                self.parse_between(tokens)
            }
            Token::Identifier(ref s) if s.eq_ignore_ascii_case("SINCE") => self.parse_since(tokens),
            Token::Identifier(ref s) if s.eq_ignore_ascii_case("LAST") => self.parse_last(tokens),
            _ => Err(LoraDbError::QueryParseError(format!(
                "Invalid filter clause: {:?}",
                token
            ))
            .into()),
        }
    }

    fn parse_between(&self, tokens: &mut Vec<Token>) -> Result<FilterClause> {
        let start = self.expect_timestamp(tokens)?;
        self.expect_keyword(tokens, "AND")?;
        let end = self.expect_timestamp(tokens)?;

        Ok(FilterClause::Between { start, end })
    }

    fn parse_since(&self, tokens: &mut Vec<Token>) -> Result<FilterClause> {
        let start = self.expect_timestamp(tokens)?;
        Ok(FilterClause::Since(start))
    }

    fn parse_last(&self, tokens: &mut Vec<Token>) -> Result<FilterClause> {
        let duration = self.expect_duration(tokens)?;
        Ok(FilterClause::Last(duration))
    }

    fn parse_limit(&self, tokens: &mut Vec<Token>) -> Result<usize> {
        if let Some(Token::Integer(limit)) = tokens.first() {
            let limit = *limit;
            tokens.remove(0);

            // Validation: LIMIT must be > 0
            if limit == 0 {
                return Err(LoraDbError::QueryParseError(
                    "LIMIT must be greater than 0".to_string()
                )
                .into());
            }

            // Warning: LIMIT > MAX_QUERY_RESULTS will be capped
            const MAX_QUERY_RESULTS: usize = 10_000;
            if limit > MAX_QUERY_RESULTS {
                tracing::warn!(
                    "LIMIT {} exceeds maximum {}; will be capped at maximum",
                    limit,
                    MAX_QUERY_RESULTS
                );
            }

            Ok(limit)
        } else {
            Err(LoraDbError::QueryParseError(
                "Expected integer after LIMIT keyword".to_string()
            )
            .into())
        }
    }

    fn expect_timestamp(&self, tokens: &mut Vec<Token>) -> Result<DateTime<Utc>> {
        if let Some(Token::String(ts_str)) = tokens.first() {
            let ts_str = ts_str.clone();
            tokens.remove(0);

            DateTime::parse_from_rfc3339(&ts_str)
                .map(|dt| dt.with_timezone(&Utc))
                .map_err(|e| {
                    LoraDbError::QueryParseError(format!("Invalid timestamp '{}': {}", ts_str, e))
                        .into()
                })
        } else {
            Err(LoraDbError::QueryParseError("Expected timestamp string".to_string()).into())
        }
    }

    fn expect_duration(&self, tokens: &mut Vec<Token>) -> Result<Duration> {
        if let Some(Token::String(dur_str)) = tokens.first() {
            let dur_str = dur_str.clone();
            tokens.remove(0);

            parse_duration(&dur_str)
        } else {
            Err(LoraDbError::QueryParseError("Expected duration string".to_string()).into())
        }
    }

    fn expect_keyword(&self, tokens: &mut Vec<Token>, keyword: &str) -> Result<()> {
        if let Some(Token::Identifier(ref s)) = tokens.first() {
            if s.eq_ignore_ascii_case(keyword) {
                tokens.remove(0);
                return Ok(());
            }
        }

        Err(LoraDbError::QueryParseError(format!("Expected keyword '{}'", keyword)).into())
    }

    fn peek_keyword(&self, tokens: &[Token], keyword: &str) -> bool {
        if let Some(Token::Identifier(ref s)) = tokens.first() {
            s.eq_ignore_ascii_case(keyword)
        } else {
            false
        }
    }
}

impl Default for QueryParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse duration strings like "1h", "30m", "7d", "2w"
fn parse_duration(s: &str) -> Result<Duration> {
    let s = s.trim();
    if s.is_empty() {
        return Err(LoraDbError::QueryParseError("Empty duration string".to_string()).into());
    }

    let (num_str, unit) = if s.ends_with("ms") {
        (&s[..s.len() - 2], "ms")
    } else {
        let num_len = s.len() - 1;
        (&s[..num_len], &s[num_len..])
    };

    let num: i64 = num_str
        .parse()
        .map_err(|_| LoraDbError::QueryParseError(format!("Invalid number in duration: {}", s)))?;

    match unit {
        "s" => Ok(Duration::seconds(num)),
        "m" => Ok(Duration::minutes(num)),
        "h" => Ok(Duration::hours(num)),
        "d" => Ok(Duration::days(num)),
        "w" => Ok(Duration::weeks(num)),
        "ms" => Ok(Duration::milliseconds(num)),
        _ => Err(LoraDbError::QueryParseError(format!("Invalid duration unit: {}", unit)).into()),
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Identifier(String),
    String(String),
    Integer(usize),
    Asterisk,
    Comma,
}

struct Tokenizer {
    input: String,
}

impl Tokenizer {
    fn new(input: &str) -> Self {
        Self {
            input: input.to_string(),
        }
    }

    fn tokenize(&mut self) -> Result<Vec<Token>> {
        let mut tokens = Vec::new();
        let mut chars = self.input.chars().peekable();

        while let Some(&ch) = chars.peek() {
            match ch {
                ' ' | '\t' | '\n' | '\r' => {
                    chars.next();
                }
                '*' => {
                    chars.next();
                    tokens.push(Token::Asterisk);
                }
                ',' => {
                    chars.next();
                    tokens.push(Token::Comma);
                }
                '\'' | '"' => {
                    let quote = chars.next().unwrap();
                    let mut string = String::new();
                    while let Some(&ch) = chars.peek() {
                        if ch == quote {
                            chars.next();
                            break;
                        }
                        string.push(chars.next().unwrap());
                    }
                    tokens.push(Token::String(string));
                }
                _ if ch.is_numeric() => {
                    // Parse pure numeric sequence as integer
                    let mut number = String::new();
                    while let Some(&ch) = chars.peek() {
                        if ch.is_numeric() {
                            number.push(chars.next().unwrap());
                        } else {
                            break;
                        }
                    }
                    let value = number.parse::<usize>()
                        .map_err(|_| LoraDbError::QueryParseError(
                            format!("Invalid integer: {}", number)
                        ))?;
                    tokens.push(Token::Integer(value));
                }
                _ if ch.is_alphanumeric() || ch == '_' => {
                    // Alphanumeric identifiers (preserves "1h", "field1", etc.)
                    let mut identifier = String::new();
                    while let Some(&ch) = chars.peek() {
                        if ch.is_alphanumeric() || ch == '_' || ch == '.' {
                            identifier.push(chars.next().unwrap());
                        } else {
                            break;
                        }
                    }
                    tokens.push(Token::Identifier(identifier));
                }
                _ => {
                    return Err(LoraDbError::QueryParseError(format!(
                        "Unexpected character: '{}'",
                        ch
                    ))
                    .into());
                }
            }
        }

        Ok(tokens)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_select_all() {
        let parser = QueryParser::new();
        let query = parser
            .parse("SELECT * FROM device '0123456789ABCDEF'")
            .unwrap();

        assert_eq!(query.select, SelectClause::All);
        assert_eq!(query.from.dev_eui, "0123456789ABCDEF");
        assert!(query.filter.is_none());
    }

    #[test]
    fn test_parse_select_uplink() {
        let parser = QueryParser::new();
        let query = parser
            .parse("SELECT uplink FROM device '0123456789ABCDEF'")
            .unwrap();

        assert_eq!(query.select, SelectClause::Uplink);
    }

    #[test]
    fn test_parse_select_fields() {
        let parser = QueryParser::new();
        let query = parser
            .parse("SELECT f_port, f_cnt, rssi FROM device '0123456789ABCDEF'")
            .unwrap();

        match query.select {
            SelectClause::Fields(fields) => {
                assert_eq!(fields, vec!["f_port", "f_cnt", "rssi"]);
            }
            _ => panic!("Expected Fields select clause"),
        }
    }

    #[test]
    fn test_parse_where_last() {
        let parser = QueryParser::new();
        let query = parser
            .parse("SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h'")
            .unwrap();

        match query.filter {
            Some(FilterClause::Last(duration)) => {
                assert_eq!(duration.num_hours(), 1);
            }
            _ => panic!("Expected Last filter clause"),
        }
    }

    #[test]
    fn test_parse_where_since() {
        let parser = QueryParser::new();
        let query = parser
            .parse("SELECT * FROM device '0123456789ABCDEF' WHERE SINCE '2025-01-01T00:00:00Z'")
            .unwrap();

        match query.filter {
            Some(FilterClause::Since(_)) => {}
            _ => panic!("Expected Since filter clause"),
        }
    }

    #[test]
    fn test_parse_where_between() {
        let parser = QueryParser::new();
        let query = parser
            .parse(
                "SELECT * FROM device '0123456789ABCDEF' WHERE BETWEEN '2025-01-01T00:00:00Z' AND '2025-01-02T00:00:00Z'",
            )
            .unwrap();

        match query.filter {
            Some(FilterClause::Between { .. }) => {}
            _ => panic!("Expected Between filter clause"),
        }
    }

    #[test]
    fn test_parse_duration() {
        assert_eq!(parse_duration("1s").unwrap(), Duration::seconds(1));
        assert_eq!(parse_duration("30m").unwrap(), Duration::minutes(30));
        assert_eq!(parse_duration("1h").unwrap(), Duration::hours(1));
        assert_eq!(parse_duration("7d").unwrap(), Duration::days(7));
        assert_eq!(parse_duration("2w").unwrap(), Duration::weeks(2));
        assert_eq!(parse_duration("500ms").unwrap(), Duration::milliseconds(500));
    }

    #[test]
    fn test_tokenizer() {
        let mut tokenizer = Tokenizer::new("SELECT * FROM device '0123456789ABCDEF'");
        let tokens = tokenizer.tokenize().unwrap();

        assert_eq!(tokens.len(), 5);
        assert_eq!(tokens[0], Token::Identifier("SELECT".to_string()));
        assert_eq!(tokens[1], Token::Asterisk);
        assert_eq!(tokens[2], Token::Identifier("FROM".to_string()));
        assert_eq!(tokens[3], Token::Identifier("device".to_string()));
        assert_eq!(tokens[4], Token::String("0123456789ABCDEF".to_string()));
    }

    #[test]
    fn test_parse_nested_field_paths() {
        let parser = QueryParser::new();
        let query = parser
            .parse("SELECT decoded_payload.object.TempC_SHT FROM device 'a84041c7a1881438' WHERE LAST '1h'")
            .unwrap();

        match query.select {
            SelectClause::Fields(fields) => {
                assert_eq!(fields.len(), 1);
                assert_eq!(fields[0], "decoded_payload.object.TempC_SHT");
            }
            _ => panic!("Expected Fields select clause"),
        }
    }

    #[test]
    fn test_parse_multiple_nested_fields() {
        let parser = QueryParser::new();
        let query = parser
            .parse("SELECT decoded_payload.object.co2, decoded_payload.object.TempC_SHT, f_port FROM device 'a84041c7a1881438'")
            .unwrap();

        match query.select {
            SelectClause::Fields(fields) => {
                assert_eq!(fields.len(), 3);
                assert_eq!(fields[0], "decoded_payload.object.co2");
                assert_eq!(fields[1], "decoded_payload.object.TempC_SHT");
                assert_eq!(fields[2], "f_port");
            }
            _ => panic!("Expected Fields select clause"),
        }
    }

    #[test]
    fn test_tokenize_integer() {
        let mut tokenizer = Tokenizer::new("LIMIT 100");
        let tokens = tokenizer.tokenize().unwrap();

        assert_eq!(tokens.len(), 2);
        assert_eq!(tokens[0], Token::Identifier("LIMIT".to_string()));
        assert_eq!(tokens[1], Token::Integer(100));
    }

    #[test]
    fn test_tokenize_duration_vs_integer() {
        // "1h" should be Identifier (duration, starts with digit but has alpha)
        let mut tokenizer = Tokenizer::new("'1h'");
        let tokens = tokenizer.tokenize().unwrap();
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0], Token::String("1h".to_string()));

        // "100" should be Integer
        let mut tokenizer = Tokenizer::new("100");
        let tokens = tokenizer.tokenize().unwrap();
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0], Token::Integer(100));
    }

    #[test]
    fn test_parse_limit() {
        let parser = QueryParser::new();
        let query = parser
            .parse("SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h' LIMIT 100")
            .unwrap();

        assert_eq!(query.limit, Some(100));
    }

    #[test]
    fn test_parse_limit_zero_error() {
        let parser = QueryParser::new();
        let result = parser
            .parse("SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h' LIMIT 0");

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("greater than 0"));
    }

    #[test]
    fn test_parse_limit_no_where() {
        // LIMIT without WHERE should parse successfully
        let parser = QueryParser::new();
        let query = parser
            .parse("SELECT * FROM device '0123456789ABCDEF' LIMIT 10")
            .unwrap();

        assert_eq!(query.limit, Some(10));
        assert!(query.filter.is_none());
    }
}
