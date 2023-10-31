#!/bin/bash

# Define URLs
ZIP_URL="https://hoosat.fi/hoobot/hoobot-latest.zip"
TMP_DIR="/tmp/hoobot"
ZIP_FILE="hoobot-latest.zip"

# Step 1: Download the zip folder
wget $ZIP_URL -O $ZIP_FILE

# Step 2: Create tmp directory if it doesn't exist
mkdir -p $TMP_DIR

# Step 3: Extract the zip folder to tmp
unzip $ZIP_FILE -d $TMP_DIR

# Step 4: Overwrite the working directory with the extracted files
cp -r $TMP_DIR/* .

# Step 5: Remove the downloaded zip file and tmp folder
rm $ZIP_FILE
rm -r $TMP_DIR

echo "Update completed successfully."