#!/bin/bash
set -x

# Function to check if Homebrew is installed
is_brew_installed() {
  command -v brew &>/dev/null
}

# Function to install Node.js using brew
install_node_with_brew() {
  echo "Installing Node.js using Homebrew..."
  brew install node
}

# Function to install project dependencies with NPM
install() {
  echo "Installing project dependencies..."
  npm install
  npm run postinstall
}

# Main script
main() {
  if is_brew_installed; then
    echo "Homebrew is already installed."
  else
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi

  if brew list node.js &>/dev/null; then
    echo "Node.js is already installed with Homebrew."
  else
    install_node_with_brew
  fi

  install

  echo "Hoobot installation completed successfully."
}

main
