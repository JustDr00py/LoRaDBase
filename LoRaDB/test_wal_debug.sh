#!/bin/bash
export RUST_BACKTRACE=1
cargo test --lib engine::wal::tests::test_wal_append_and_replay -- --nocapture 2>&1 | grep -A 30 "test engine"
