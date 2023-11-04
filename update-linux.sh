#!/bin/bash

# Define URLs
ZIP_URL="https://hoosat.fi/hoobot/hoobot-latest.zip"
ZIP_FILE="hoobot-latest.zip"
TMP_DIR="/tmp/hoobot"

# Step 1: Download the zip folder
wget $ZIP_URL

# Step 2: Create tmp directory if it doesn't exist
mkdir -p $TMP_DIR

# Step 3: Extract the zip folder to tmp
unzip $ZIP_FILE -d $TMP_DIR

# Step 4: Find the extracted directory
EXTRACTED_DIR=$(find $TMP_DIR -type d -name 'Hoobot-*.*.*' -print -quit)

# Check if the directory was found
if [ -z "$EXTRACTED_DIR" ]; then
    echo "Error: Extracted directory not found."
    rm -r $ZIP_FILE $TMP_DIR # Clean up downloaded zip file and temporary directory
    exit 1
fi

# Step 5: Use rsync to copy files and directories
rm -rf $EXTRACTED_DIR/update-linux.sh
rsync -av $EXTRACTED_DIR/ .

# Step 6: Remove the downloaded zip file and tmp folder
rm $ZIP_FILE
rm -r $TMP_DIR

npm install

echo "Update completed successfully."
