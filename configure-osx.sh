#!/bin/bash

#!/bin/bash

# Function to check if Homebrew is installed
is_brew_installed() {
  command -v brew &>/dev/null
}

# Function to install Node.js using brew
install_node_with_brew() {
  echo "Installing Node.js using Homebrew..."
  brew install node@18
}

# Function to install project dependencies with NPM
install_dependencies() {
  echo "Installing project dependencies..."
  npm install
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
EOF
  echo "Configuration saved to .env file."
}

# Main script
main() {
  if is_brew_installed; then
    echo "Homebrew is already installed."
  else
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi

  if brew list node@18 &>/dev/null; then
    echo "Node.js is already installed with Homebrew."
  else
    install_node_with_brew
  fi

  prompt_for_env

  install_dependencies

  echo "Hoobot installation completed successfully."
}

main
