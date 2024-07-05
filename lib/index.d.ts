import * as vite from 'vite';
export declare const viteIncrementalBuild: ({ config, bundleName, watcherIgnoredFiles, beforeBuildCallback, }: {
    config: vite.UserConfig;
    bundleName: string;
    watcherIgnoredFiles: (string | RegExp)[];
    beforeBuildCallback: () => void;
}) => void;
/** patch up vite config with necessary prerequisites for incremental build */
export declare const patchConfig: (config: vite.UserConfig, { ignoreWarnings }?: {
    ignoreWarnings?: boolean | undefined;
}) => vite.UserConfig;
