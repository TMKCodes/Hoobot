// webpack.config.js

// Import the "resolve" method from the "path" module
import { resolve as _resolve } from "path";
import webpack from 'webpack';
import dotenv from 'dotenv';
dotenv.config();

// Filter out environment keys that do not start with "REACT_"
const filteredEnv = Object.keys(process.env)
  .filter((key) => key.startsWith('REACT_'));

// Export the configuration object
export default {
  // Set the source map type to "source-map" for easier debugging
  devtool: "source-map",
  // Set the build mode to "development"
  mode: "development",
  // Specify the target environment as "web" to bundle for web browsers
  target: "web",
  // Specify the entry point for the client application
  entry: "./src/client/index.tsx",
  // Specify the output file name and path
  output: {
    filename: "bundle.js",
    path: _resolve(new URL(".", import.meta.url).pathname, "build/public"),
    // Set the output format to "module"
    module: true,
    // Set the chunk format to "module"
    chunkFormat: "module",
    // Set the library target to "module"
    library: { type: "module" },
    libraryTarget: "module",
  },
  // Enable the "outputModule" experiment
  experiments: {
    outputModule: true,
  },
  optimization: {
    minimize: true,
    usedExports: true,
  },
  // Specify the module loaders and rules
  module: {
    rules: [
      {
        test: /.(ts|tsx)$/,
        exclude: /node_modules/,
        use: ["ts-loader"],
      },
      {
        test: /.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.json$/,
        loader: 'json-loader',
        type: 'javascript/auto',
      },
      {
        test: /\.(node|png|jpg|gif)$/,
        loader: 'file-loader',
        options: {
          name: '[name].[ext]',
        },
      },
      {
        test: /\.node$/,
        loader: 'node-loader',
      },
    ],
  },
  // Specify the file extensions to resolve
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".jsx"],
  },
  plugins: [
    new webpack.DefinePlugin({
      'global.GENTLY': false,
    }),
    new webpack.DefinePlugin({
      '__filename': false,
      '__dirname': false
    }),
    new webpack.EnvironmentPlugin(filteredEnv), // Use the filtered environment object
  ]
};