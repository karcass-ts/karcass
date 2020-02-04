import fs from 'fs'
import path from 'path'
import {
    BasicInstallationConfig,
    ConfigParameter,
    ConfigParametersResult,
    ConfigParameterType,
    TemplateReducerInterface,
} from '@karcass/template-reducer'

export interface LintConfig {
    tabSize: number
    semicolon: boolean
    doubleQuotemark: boolean
}

export interface MorphyConfig {
    name: string
    useDb: 'postgres'
    useTwing: boolean
    useLogger: boolean
    tabSize: number
    semicolon: boolean
    doubleQuotemark: boolean
    port: number
}

export class MorphyService {
    protected templateReducer: TemplateReducerInterface
    protected config: BasicInstallationConfig&Record<string, any> = {
        name: '',
        defaultInstallation: true,
        singleQuotemark: true,
        semicolon: true,
        tabSize: 4,
    }

    public constructor(templateReducerConstructor: new () => TemplateReducerInterface) {
        console.log(templateReducerConstructor)
        this.templateReducer = new templateReducerConstructor()
    }

    public async getConfigParameters(): Promise<ConfigParametersResult> {
        return [
            { name: 'type', description: 'Select installation type', type: ConfigParameterType.radio, choices: [
                { value: 'default', description: 'Default + all features', checked: true },
                { value: 'select', description: 'Select features' },
            ] },
            async config => config.defaultInstallation ? [] : [
                { name: 'tabSize', description: 'Tab size', type: ConfigParameterType.number, default: 4 },
                {
                    name: 'quotemark',
                    description: 'Use single quitemark (\') instead double (")?',
                    type: ConfigParameterType.confirm, default: this.config.singleQuotemark,
                },
                {
                    name: 'semicolon',
                    description: 'Semicolons at end of the lines?',
                    type: ConfigParameterType.confirm,
                    default: this.config.semicolon,
                },
                ...await this.templateReducer.getConfigParameters(),
            ],
        ]
    }

    public updateConfig(configParameter: ConfigParameter, result: any) {
        if (configParameter.name === 'type') {
            this.config.defaultInstallation = result === 'default'
            return
        }
        this.config[configParameter.name] = result
    }

    public getConfig() {
        return this.config
    }

    public morphyFile(srcFile: string, destFile: string, config: MorphyConfig) {
        if (destFile.indexOf('.gitignore.template') >= 0) {
            destFile = destFile.replace('.gitignore.template', '.gitignore')
        }
        const basename = path.basename(srcFile)
        if (basename === 'package.json') {
            const json = JSON.parse(fs.readFileSync(srcFile).toString())
            json.name = config.name
            if (!config.useDb) {
                delete json.dependencies.typeorm
                delete json.dependencies.pg
            }
            if (!config.useTwing) {
                delete json.dependencies['@types/luxon']
                delete json.dependencies.twing
            }
            fs.writeFileSync(destFile, JSON.stringify(json, undefined, config.tabSize))
            return
        }

        let code = fs.readFileSync(srcFile).toString()
        if (['package-lock.json'].indexOf(basename) >= 0) {
            return
        }
        if (basename === '.eslintrc.json') {
            if (config.tabSize !== 4) {
                code = code.replace('"indent": ["error", 4, { "SwitchCase": 1 }],',
                    `"indent": ["error", ${config.tabSize}, { "SwitchCase": 1 }],`)
                code = code.replace('"@typescript-eslint/indent": ["error", 4, { "SwitchCase": 1 }],',
                    `"@typescript-eslint/indent": ["error", ${config.tabSize}, { "SwitchCase": 1 }],`)
            }
            if (!config.semicolon) {
                code = code.replace('"semi": ["error", "always"],', '"semi": ["error", "never"],')
            }
            if (config.doubleQuotemark) {
                code = code.replace('"quotes": ["error", "single"],', '"quotes": ["error", "double"],')
            }
        }

        if (config.doubleQuotemark) {
            code = code.replace('"quotemark": { "options": "single" },', '"quotemark": { "options": "double" },')
        }
        if (['config.js', 'config.js.dist'].indexOf(basename) >= 0) {
            code = code.replace('1000000000', `${config.port}`)
        }
        if (['.ts', '.js'].indexOf(path.extname(srcFile).toLowerCase()) >= 0) {
            code = this.lint(code, config)
        }
        fs.writeFileSync(destFile, code)
        if (code.indexOf('#!/usr/bin/env node') >= 0) {
            fs.chmodSync(destFile, '0755')
        }
    }

    public lint(code: string, config: LintConfig) {
        if (config.tabSize !== 4) {
            let str = ''
            for (str = ''; str.length < config.tabSize; str += ' ') {/**/}
            code = code.replace(/ {4}/g, str)
        }
        if (!config.semicolon) {
            code = code.replace(/;/g, '')
        }
        if (config.doubleQuotemark) {
            code = code.replace(/'/g, '"')
        }
        return code
    }

}
