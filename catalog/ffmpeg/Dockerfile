# ffmpeg + ffprobe for the cataloguer, and nothing else.
#
# Why this image exists: the catalog's tier-0 stages (probe, audio, motion,
# colors) and the VLM keyframe grab shell out to ffmpeg/ffprobe. Those used to
# be host packages; the host stopped carrying them on 2026-11-07 (containers
# first, own Dockerfile preferred), and from that night every new capture would
# have failed its probe. catalog/stages/media.ts `run()` now starts this image
# once per call, with the input's directory mounted read-only and no network.
#
# Conventions: base pinned by digest, a comment per package, and a build-time
# assertion so a base change fails the build instead of the 01:15 batch.
#
# Build:    ./build.sh   (tags life-museum-ffmpeg:<date>; media.ts names the tag)
# Upgrade:  bump the digest, ./build.sh, update FFMPEG_IMAGE in media.ts.

# debian:bookworm-slim as of 2026-11-08. Debian 12 ships ffmpeg 5.1.x, the
# version the catalog was developed against on the host.
ARG BASE=debian@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
FROM ${BASE}

# ffmpeg : provides both ffmpeg and ffprobe.
# (nice and ionice come with the base, from coreutils and util-linux; media.ts
#  uses them inside the container, because a priority set on the docker client
#  does not reach a process the daemon starts.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && ffmpeg -hide_banner -version | head -1 \
    && ffprobe -hide_banner -version | head -1 \
    && command -v nice ionice
