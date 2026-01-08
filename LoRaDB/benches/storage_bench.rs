use criterion::{criterion_group, criterion_main, Criterion};

fn storage_benchmarks(c: &mut Criterion) {
    // TODO: Add storage engine benchmarks
}

criterion_group!(benches, storage_benchmarks);
criterion_main!(benches);
