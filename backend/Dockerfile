# Named for its Debian, to match the runtime below: a binary built against a
# newer glibc than the one it runs on does not start.
FROM rust:1-slim-trixie AS build
WORKDIR /app
COPY . .
# The target directory is a cache mount, so the binary is copied out of it.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
	--mount=type=cache,target=/app/target \
	cargo build --release --locked \
	&& cp target/release/spaceguesser-backend /spaceguesser-backend

FROM debian:trixie-slim
# The roots Cloudflare's certificate is checked against when a proof is.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=build /spaceguesser-backend /usr/local/bin/spaceguesser-backend
USER nobody
ENV BIND=0.0.0.0:8787
ENV METRICS_BIND=0.0.0.0:9787
EXPOSE 8787 9787
CMD ["spaceguesser-backend"]
