module.exports = {
  mode: "production",
  entry: "./src/index.ts",
  target: "node",
  resolve: { extensions: [".ts", ".js"] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        // Loaders run right-to-left: llmtsc repairs the source first, then ts-loader transpiles it.
        use: [{ loader: "ts-loader", options: { transpileOnly: true } }, "llmtsc/webpack-loader"],
      },
    ],
  },
  output: { filename: "bundle.js" },
};
