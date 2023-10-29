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
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.4/install.sh | bash
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
}

# Function to prompt user for .env file information
prompt_for_env() {
  echo "Please enter the Binance Bot configuration:"
  read -p "API_KEY: " API_KEY
  read -p "API_SECRET: " API_SECRET
  read -p "PAIR: " PAIR
  read -p "CANDLESTICK_INTERVAL: " CANDLESTICK_INTERVAL
  read -p "USE_EMA: " USE_EMA
  read -p "USE_MACD: " USE_MACD
  read -p "USE_RSI: " USE_RSI
  read -p "SHORT_EMA: " SHORT_EMA
  read -p "LONG_EMA: " LONG_EMA
  read -p "FAST_MACD: " FAST_MACD
  read -p "SLOW_MACD: " SLOW_MACD
  read -p "SIGNAL_MACD: " SIGNAL_MACD
  read -p "RSI_LENGTH: " RSI_LENGTH
  read -p "RSI_SMOOTHING: " RSI_SMOOTHING
  read -p "RSI_HISTORY_LENGTH: " RSI_HISTORY_LENGTH
  read -p "OVERBOUGHT_TRESHOLD: " OVERBOUGHT_TRESHOLD
  read -p "OVERSOLD_TRESHOLD: " OVERSOLD_TRESHOLD
  read -p "MAX_AMOUNT: " MAX_AMOUNT
  read -p "CANCEL_PERCENTAGE: " CANCEL_PERCENTAGE
  read -p "MAX_ORDER_AGE_SECONDS: " MAX_ORDER_AGE_SECONDS
  read -p "TRADE_FEE_PERCENTAGE: " TRADE_FEE_PERCENTAGE
  read -p "TRADE_FEE_PERCENTAGE: " TRADE_FEE_PERCENTAGE

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
PAIR="$PAIR"
CANDLESTICK_INTERVAL="$CANDLESTICK_INTERVAL"
USE_EMA="$USE_EMA"
USE_MACD="$USE_MACD"
USE_RSI="$USE_RSI"
SHORT_EMA=$SHORT_EMA
LONG_EMA=$LONG_EMA
FAST_MACD=$FAST_MACD
SHORT_MACD=$SHORT_MACD
SIGNAL_MACD=$SIGNAL_MACD
RSI_LENGTH=$RSI_LENGTH
RSI_SMOOTHING=$RSI_SMOOTHING
RSI_HISTORY_LENGTH=$RSI_HISTORY_LENGTH
OVERBOUGHT_TRESHOLD=$OVERBOUGHT_TRESHOLD
OVERSOLD_TRESHOLD=$OVERSOLD_TRESHOLD
MAX_AMOUNT=$MAX_AMOUNT
CANCEL_PERCENTAGE=$CANCEL_PERCENTAGE
MAX_ORDER_AGE_SECONDS=$MAX_ORDER_AGE_SECONDS
TRADE_FEE_PERCENTAGE=$TRADE_FEE_PERCENTAGE

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
