#!/bin/bash
set -e

DEST="/mnt/c/Users/dwils/Documents/testvault/.obsidian/plugins/obsidian-monaco"

echo "Building plugin..."
npm run build

echo "Deploying to vault..."
mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST"

echo "Done. Files copied to $DEST"
