import {
    ConfigParameter,
    ConfigParametersResult,
    TemplateReducerInterface,
    ReplaceFileContentItem,
} from '@karcass/template-reducer'

export class ReducerService {
    protected templateReducer: TemplateReducerInterface
    protected replacers?: ReplaceFileContentItem[]

    public constructor(
        templateReducerConstructor: new (...args: any[]) => TemplateReducerInterface,
        applicationName: string,
        directoryPath: string,
    ) {
        this.templateReducer = new templateReducerConstructor(applicationName, directoryPath)
    }

    public async getConfigParameters(): Promise<ConfigParametersResult> {
        return this.templateReducer.getConfigParameters()
    }

    public getDirectoriesForRemove() {
        return this.templateReducer.getDirectoriesForRemove()
    }

    public async getFilesForRemove() {
        return [
            'TemplateReducer.ts',
            'TemplateReducer.js',
            ... await this.templateReducer.getFilesForRemove(),
        ]
    }

    public updateConfig(configParameter: ConfigParameter, result: any) {
        this.templateReducer.setConfig({ [configParameter.name]: result })
    }

    public getConfig() {
        return this.templateReducer.getConfig()
    }

    public getTestConfigSet() {
        return this.templateReducer.getTestConfigSet()
    }

    public async reduceFile(content: string, filename: string): Promise<string> {
        if (filename === 'package.json') {
            const dependencies = [
                '@karcass/template-reducer',
                ...await this.templateReducer.getDependenciesForRemove(),
            ]
            const json = JSON.parse(content)
            for (const dependency of dependencies) {
                if (dependency in json.dependencies) {
                    delete json.dependencies[dependency]
                }
                if (dependency in json.devDependencies) {
                    delete json.devDependencies[dependency]
                }
            }
            content = JSON.stringify(json, undefined, 4)
        }
        for (const replacer of await this.getReplacers()) {
            if (replacer.filename instanceof RegExp && replacer.filename.test(filename) || replacer.filename === filename) {
                content = await replacer.replacer(content, filename)
            }
        }

        return content
    }

    public finish() {
        return this.templateReducer.finish()
    }

    protected async getReplacers() {
        if (this.replacers) {
            return this.replacers
        }
        return this.replacers = await this.templateReducer.getFilesContentReplacers()
    }

}
