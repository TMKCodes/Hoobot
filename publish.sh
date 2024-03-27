#!/bin/bash
# Remove dependancies and make sure the publish directory and zip does not exist.
rm -rf ../hoobot-latest/
rm -rf ../hoobot-latest.zip
rm -rf package-lock.json 
rm -rf node_modules/
# Install and build the project.
npm install
npm run build
# Change out of project dir to create publish dir and move required files for publish.
cd ..
mkdir hoobot-latest
mkdir hoobot-latest/settings
mkdir hoobot-latest/logs
cp hoobot-dev/settings/hoobot-options.json.example hoobot-latest/settings/hoobot-options.json.example
cp hoobot-dev/settings/hoobot-options-simulate.json.example hoobot-latest/settings/hoobot-options-simulate.json.example
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
# Zip the publish folder for delivery
zip -r hoobot-latest.zip hoobot-latest/
# Delete the publish folder as it's not needed anymore
rm -rf hoobot-latest/
# Now move the zip to servers for users.
rsync -avz --progress hoobot-latest.zip tonto@hoosat.fi:~/new.hoosat.fi/build/public/hoobot/

