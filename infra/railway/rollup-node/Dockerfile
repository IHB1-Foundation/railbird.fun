FROM golang:1.24-alpine3.20 AS builder

ARG MINIEVM_VERSION=v1.2.15
ARG GOARCH=amd64
ARG MIMALLOC_VERSION=v2.2.2

RUN set -eux; apk add --no-cache ca-certificates build-base git cmake

WORKDIR /code

RUN git clone --branch "${MINIEVM_VERSION}" --depth 1 https://github.com/initia-labs/minievm.git .

RUN git clone -b "${MIMALLOC_VERSION}" --depth 1 https://github.com/microsoft/mimalloc /tmp/mimalloc && \
  cd /tmp/mimalloc && \
  mkdir build && \
  cd build && \
  cmake .. && \
  make -j"$(nproc)" && \
  make install

ENV MIMALLOC_RESERVE_HUGE_OS_PAGES=4

RUN VERSION="${MINIEVM_VERSION}" \
  COMMIT=docker \
  LEDGER_ENABLED=false \
  GOARCH="${GOARCH}" \
  LDFLAGS='-linkmode=external -extldflags "-L/tmp/mimalloc/build -lmimalloc -Wl,-z,muldefs -static"' \
  make build

FROM debian:bullseye-slim

RUN apt-get update && \
  apt-get install -y --no-install-recommends ca-certificates curl && \
  rm -rf /var/lib/apt/lists/*

COPY --from=builder /code/build/minitiad /usr/local/bin/minitiad
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY seed-home /seed-home

RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
  mkdir -p /data

EXPOSE 1317 8545 8546 9090 26656 26657

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
