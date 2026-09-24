import packageJson from "../../package.json";

/**
 * The running Rewind version, from package.json. Server-only: pass it to
 * client components as a prop so the browser never bundles package.json.
 */
export const REWIND_VERSION: string = packageJson.version;
