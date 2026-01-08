use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

/// Bloom filter for probabilistic membership testing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BloomFilter {
    bits: Vec<bool>,
    num_hash_functions: usize,
    num_bits: usize,
}

impl BloomFilter {
    /// Create a new Bloom filter
    ///
    /// # Arguments
    /// * `expected_elements` - Expected number of elements
    /// * `false_positive_rate` - Desired false positive rate (e.g., 0.01 for 1%)
    pub fn new(expected_elements: usize, false_positive_rate: f64) -> Self {
        let num_bits = Self::optimal_num_bits(expected_elements, false_positive_rate);
        let num_hash_functions =
            Self::optimal_num_hash_functions(expected_elements, num_bits);

        Self {
            bits: vec![false; num_bits],
            num_hash_functions,
            num_bits,
        }
    }

    /// Calculate optimal number of bits
    fn optimal_num_bits(n: usize, p: f64) -> usize {
        let n = n as f64;
        let numerator = -n * p.ln();
        let denominator = (2.0_f64.ln()).powi(2);
        (numerator / denominator).ceil() as usize
    }

    /// Calculate optimal number of hash functions
    fn optimal_num_hash_functions(n: usize, m: usize) -> usize {
        let ratio = m as f64 / n as f64;
        (ratio * 2.0_f64.ln()).ceil() as usize
    }

    /// Insert an element into the bloom filter
    pub fn insert<T: Hash>(&mut self, item: &T) {
        for i in 0..self.num_hash_functions {
            let hash = self.hash(item, i);
            let index = (hash % self.num_bits as u64) as usize;
            self.bits[index] = true;
        }
    }

    /// Check if an element might be in the set
    /// Returns true if the element might be present (possible false positive)
    /// Returns false if the element is definitely not present
    pub fn contains<T: Hash>(&self, item: &T) -> bool {
        for i in 0..self.num_hash_functions {
            let hash = self.hash(item, i);
            let index = (hash % self.num_bits as u64) as usize;
            if !self.bits[index] {
                return false;
            }
        }
        true
    }

    /// Generate hash for an item with a seed
    fn hash<T: Hash>(&self, item: &T, seed: usize) -> u64 {
        let mut hasher = DefaultHasher::new();
        item.hash(&mut hasher);
        seed.hash(&mut hasher);
        hasher.finish()
    }

    /// Get the size of the bloom filter in bytes
    pub fn size_bytes(&self) -> usize {
        // bits vector + metadata
        self.bits.len() / 8 + std::mem::size_of::<Self>()
    }

    /// Get the number of bits
    pub fn num_bits(&self) -> usize {
        self.num_bits
    }

    /// Get the number of hash functions
    pub fn num_hash_functions(&self) -> usize {
        self.num_hash_functions
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bloom_filter_insert_and_contains() {
        let mut bloom = BloomFilter::new(1000, 0.01);

        // Insert some items
        bloom.insert(&"device-001");
        bloom.insert(&"device-002");
        bloom.insert(&"device-003");

        // Check for presence
        assert!(bloom.contains(&"device-001"));
        assert!(bloom.contains(&"device-002"));
        assert!(bloom.contains(&"device-003"));

        // Items not inserted should (probably) not be present
        // Note: false positives are possible but rare with good parameters
        assert!(!bloom.contains(&"device-999"));
    }

    #[test]
    fn test_bloom_filter_false_positive_rate() {
        let mut bloom = BloomFilter::new(1000, 0.01);

        // Insert 1000 items
        for i in 0..1000 {
            bloom.insert(&format!("device-{:04}", i));
        }

        // Check all inserted items are present
        for i in 0..1000 {
            assert!(bloom.contains(&format!("device-{:04}", i)));
        }

        // Check false positive rate on non-inserted items
        let mut false_positives = 0;
        let test_count = 10000;
        for i in 1000..(1000 + test_count) {
            if bloom.contains(&format!("device-{:04}", i)) {
                false_positives += 1;
            }
        }

        let fp_rate = false_positives as f64 / test_count as f64;
        println!("False positive rate: {:.4}", fp_rate);

        // Should be approximately 1% (allowing some variance)
        assert!(fp_rate < 0.05, "False positive rate too high: {}", fp_rate);
    }

    #[test]
    fn test_bloom_filter_serialization() {
        let mut bloom = BloomFilter::new(100, 0.01);
        bloom.insert(&"test-device");

        // Serialize
        let serialized = bincode::serialize(&bloom).unwrap();

        // Deserialize
        let deserialized: BloomFilter = bincode::deserialize(&serialized).unwrap();

        // Should still contain the item
        assert!(deserialized.contains(&"test-device"));
        assert!(!deserialized.contains(&"other-device"));
    }

    #[test]
    fn test_bloom_filter_optimal_parameters() {
        let bloom = BloomFilter::new(10000, 0.01);

        // Check that parameters are reasonable
        assert!(bloom.num_bits() > 0);
        assert!(bloom.num_hash_functions() > 0);
        assert!(bloom.num_hash_functions() < 20); // Shouldn't be excessive

        println!(
            "For 10,000 elements with 1% FP rate: {} bits, {} hash functions",
            bloom.num_bits(),
            bloom.num_hash_functions()
        );
    }
}
