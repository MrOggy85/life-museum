#!/usr/bin/env bash
# Downloads the GeoNames files the place stage reads (CC-BY 4.0, https://www.geonames.org). One-time; fully offline after.
set -euo pipefail
DATA_ROOT="${DATA_ROOT:-/mnt/usbssd/museum-data}"
DIR="$DATA_ROOT/catalog/gazetteer"
mkdir -p "$DIR"
cd "$DIR"
base=https://download.geonames.org/export/dump
curl -fsSL -o cities1000.zip "$base/cities1000.zip" && unzip -oq cities1000.zip cities1000.txt && rm cities1000.zip
curl -fsSL -O "$base/admin1CodesASCII.txt"
curl -fsSL -O "$base/countryInfo.txt"
ls -l "$DIR"
