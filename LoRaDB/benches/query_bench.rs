use criterion::{criterion_group, criterion_main, Criterion};

fn query_benchmarks(c: &mut Criterion) {
    // TODO: Add query engine benchmarks
}

criterion_group!(benches, query_benchmarks);
criterion_main!(benches);
