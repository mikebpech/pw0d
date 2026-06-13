module.exports = (api) => {
  api.cache(true);
  return {
    // babel-preset-expo wires up expo-router and resolves the `@/*` tsconfig
    // path alias (via its built-in tsconfig-paths support).
    presets: [["babel-preset-expo", { "react-compiler": false }]],
  };
};
