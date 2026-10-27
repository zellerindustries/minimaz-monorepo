import { defaultBuildConfig, defaultConfig, defaultServeConfig } from '@minimaz/config'
import type { MinimazConfig } from '@minimaz/config'

/**
 * A full `MinimazConfig` built from the package defaults, with `input`/`output` fields overridden.
 *
 * @param {Partial<MinimazConfig['input']>} [inputOverrides] - Fields replacing `defaultBuildConfig.input`'s
 * @param {Partial<MinimazConfig['output']>} [outputOverrides] - Fields replacing `defaultBuildConfig.output`'s
 * @returns {MinimazConfig} The assembled config
 */
export function makeBuildConfig(
    inputOverrides: Partial<MinimazConfig['input']> = {},
    outputOverrides: Partial<MinimazConfig['output']> = {},
): MinimazConfig {
    return {
        ...defaultConfig,
        ...defaultBuildConfig,
        ...defaultServeConfig,
        input: { ...defaultBuildConfig.input, ...inputOverrides },
        output: { ...defaultBuildConfig.output, ...outputOverrides },
    }
}
