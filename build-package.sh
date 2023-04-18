#!/bin/sh

BUILD_PATH="$TMPDIR/rave-electron-app-builder"

if [ -f "$BUILD_PATH" ]; then
  rm -rf "$BUILD_PATH"
fi

mkdir -p "$BUILD_PATH"

cd "$BUILD_PATH"

git clone
