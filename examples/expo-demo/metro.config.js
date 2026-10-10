// Metro for a pnpm monorepo: watch the workspace (the SDK ships TypeScript source from
// ../../packages), and make sure React, React Native and the native modules the SDK peers on
// resolve to this app's single copy — pnpm keeps a separate copy under the SDK's devDependencies.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

const SINGLETONS = [
  "react",
  "react-native",
  "react-native-safe-area-context",
  "expo",
  "expo-image-picker",
  "expo-document-picker",
];

function isSingleton(moduleName) {
  return SINGLETONS.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));
}

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  // Only workspace source (the SDK and protocol, outside any node_modules) is redirected;
  // packages inside node_modules already resolve their peers through pnpm's layout.
  const fromWorkspaceSource = !context.originModulePath.includes(`${path.sep}node_modules${path.sep}`);
  if (fromWorkspaceSource && isSingleton(moduleName)) {
    // Resolve as if this app imported it.
    return resolve({ ...context, originModulePath: path.join(projectRoot, "index.ts") }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
