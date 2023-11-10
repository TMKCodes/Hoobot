#!/bin/bash

# Function to check if Node.js is installed and matches the required version (v18.17.0)
is_node_installed() {
  if command -v node &>/dev/null; then
    # Get the installed Node.js version and compare it with the required version (v18.17.0)
    local installed_version
    installed_version=$(node -v)

    if [[ $installed_version == v18.17.0 ]]; then
      return 0 # Node.js is installed and matches the required version
    else
      return 1 # Node.js is installed but doesn't match the required version
    fi
  else
    return 1 # Node.js is not installed
  fi
}

# Function to install NVM
install_nvm() {
  echo "Installing NVM..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
}

# Function to install Node.js and NPM using NVM
install_node_npm() {
  echo "Installing Node.js and NPM..."
  nvm install v18.17.0
  nvm use v18.17.0
}

# Function to install project dependencies with NPM
install_dependencies() {
  echo "Installing project dependencies..."
  npm install
  npm run postinstall
}

# Function to prompt user for .env file information
prompt_for_env() {
  echo "Please enter the Binance API configuration:"
  read -p "API_KEY: " API_KEY
  read -p "API_SECRET: " API_SECRET
  echo "Please enter Hoobot license:"
  read -p "LICENSE: " LICENSE
  echo "Please enter the Discord configuration:"
  read -p "DISCORD_ENABLED: " DISCORD_ENABLED
  read -p "DISCORD_BOT_TOKEN: " DISCORD_BOT_TOKEN
  read -p "DISCORD_APPLICATION_ID: " DISCORD_APPLICATION_ID
  read -p "DISCORD_SERVER_ID: " DISCORD_SERVER_ID
  read -p "DISCORD_CHANNEL_ID: " DISCORD_CHANNEL_ID

  # Create the .env file with user inputs
  cat <<EOF > .env
API_KEY="$API_KEY"
API_SECRET="$API_SECRET"
LICENSE="$LICENSE"
DISCORD_ENABLED="$DISCORD_ENABLED"
DISCORD_BOT_TOKEN="$DISCORD_BOT_TOKEN"
DISCORD_APPLICATION_ID="$DISCORD_APPLICATION_ID"
DISCORD_SERVER_ID="$DISCORD_SERVER_ID"
DISCORD_CHANNEL_ID="$DISCORD_CHANNEL_ID"
EOF
  echo "Configuration saved to .env file."
}


# Main script
main() {
  # Check if Node.js is installed
  if is_node_installed; then
    echo "Node.js is already installed."
  else
    # Check if NVM is installed
    if ! command -v nvm &> /dev/null; then
      install_nvm
      # Load NVM into this shell session
      export NVM_DIR="$HOME/.nvm"
      [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi

    # Install Node.js and NPM using NVM
    install_node_npm
  fi

  # Prompt user for .env file information
  prompt_for_env

  # Install project dependencies with NPM
  install_dependencies

  echo "Hoobot installation completed successfully."
}

# Call the main function
main
