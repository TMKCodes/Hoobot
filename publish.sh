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
cp Hoobot/settings/hoobot-options.json.example hoobot-latest/settings/hoobot-options.json.example
cp Hoobot/settings/hoobot-options-simulate.json.example hoobot-latest/settings/hoobot-options-simulate.json.example
cp Hoobot/alarm2.mp3 hoobot-latest/alarm2.mp3
cp Hoobot/alarm.mp3 hoobot-latest/alarm.mp3
cp Hoobot/hoobot.service hoobot-latest/hoobot.service
cp Hoobot/linux.sh hoobot-latest/linux.sh
cp Hoobot/osx.sh hoobot-latest/osx.sh
cp Hoobot/package.json hoobot-latest/package.json
cp Hoobot/publish.sh hoobot-latest/publish.sh
cp Hoobot/README.md hoobot-latest/README.md
cp Hoobot/windows.bat hoobot-latest/windows.bat
cp -r Hoobot/build hoobot-latest/build
# Zip the publish folder for delivery
zip -r hoobot-latest.zip hoobot-latest/
# Delete the publish folder as it's not needed anymore
rm -rf hoobot-latest/
# Now move the zip to servers for users.
rsync -avz --progress hoobot-latest.zip tonto@hoosat.fi:~/new.hoosat.fi/build/public/hoobot/

