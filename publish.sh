#!/bin/bash
# Remove dependancies
rm -rf package-lock.json 
rm -rf node_modules/
# Install and build
npm install
npm run build
# Change out of project dir to create publish dir and move required files.
cd ..
mkdir hoobot-latest
mkdir hoobot-dev/settings
mkdir hoobot-dev/logs
cp hoobot-dev/settings/hoobot-options.json.example hoobot-dev/settings/hoobot-options.json.example
cp hoobot-dev/settings/hoobot-options-simulation.json.example hoobot-dev/settings/hoobot-options-simulation.json.example
cp hoobot-dev/alarm2.mp3 hoobot-latest/alarm2.mp3
cp hoobot-dev/alarm.mp3 hoobot-latest/alarm.mp3
cp hoobot-dev/hoobot.service hoobot-latest/hoobot.service
cp hoobot-dev/linux.sh hoobot-latest/linux.sh
cp hoobot-dev/osx.sh hoobot-latest/osx.sh
cp hoobot-dev/package.json hoobot-latest/package.json
cp hoobot-dev/publish.sh hoobot-latest/publish.sh
cp hoobot-dev/README.md hoobot-latest/README.md
cp hoobot-dev/windows.bat hoobot-latest/windows.bat
cp -r hoobot-dev/build hoobot-latest/build