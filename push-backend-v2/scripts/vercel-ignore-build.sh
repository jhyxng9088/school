#!/bin/sh

branch="${VERCEL_GIT_COMMIT_REF:-}"

case "$branch" in
  main|preview/s-hub-v2)
    exit 1
    ;;
  safety/*)
    exit 0
    ;;
  stability/*)
    if ! git rev-parse HEAD^ >/dev/null 2>&1; then
      exit 1
    fi
    if git diff --quiet HEAD^ HEAD -- .; then
      exit 0
    fi
    exit 1
    ;;
  *)
    exit 1
    ;;
esac
