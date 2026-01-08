# Multi-stage build for minimal production image
FROM rust:slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create application directory
WORKDIR /build

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Copy source code
COPY src ./src
COPY benches ./benches

# Build release binary
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r loradb && useradd -r -g loradb loradb

# Create data directory with proper permissions
RUN mkdir -p /var/lib/loradb/data && \
    chown -R loradb:loradb /var/lib/loradb && \
    chmod 0700 /var/lib/loradb/data

# Copy binaries from builder
COPY --from=builder /build/target/release/loradb /usr/local/bin/loradb
COPY --from=builder /build/target/release/generate-token /usr/local/bin/generate-token
COPY --from=builder /build/target/release/generate-api-token /usr/local/bin/generate-api-token

# Set ownership
RUN chown root:root /usr/local/bin/loradb /usr/local/bin/generate-token /usr/local/bin/generate-api-token && \
    chmod 0755 /usr/local/bin/loradb /usr/local/bin/generate-token /usr/local/bin/generate-api-token

# Switch to non-root user
USER loradb

# Set working directory
WORKDIR /var/lib/loradb

# Expose API port
EXPOSE 8443

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/usr/local/bin/loradb", "--health-check"] || exit 1

# Run the binary
ENTRYPOINT ["/usr/local/bin/loradb"]
