import { AbstractConsoleCommand, ConsoleColors as cc } from '@karcass/cli'
import * as ts from 'typescript'
import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import { MorphyService } from './MorphyService'
import { execSync } from 'child_process'
import { ConfigParameterType, ConfigParametersResult, TemplateReducerInterface } from '@karcass/template-reducer'

enum SourceType {
    github = 'github',
    local = 'local',
}

export class CreateCommand extends AbstractConsoleCommand {
    public static meta = {
        name: 'create',
        description: 'Creates new project in specified directory',
        usage: 'create <dir-name> [template (optional, link to github repository or local directory)]',
    }

    public async execute() {
        const originalCwd = process.cwd()
        const config = this.checkBaseConfig()
        let status: 'check'|'copied'|'done' = 'check'
        const cleaner = () => {
            if (status === 'copied') {
                process.chdir(originalCwd)
                this.deleteDir(config.destination)
            }
        }

        process.on('exit', cleaner)
        process.on('SIGINT', cleaner)
        process.on('SIGUSR1', cleaner)
        process.on('SIGUSR2', cleaner)
        process.on('uncaughtException', cleaner)
        process.on('unhandledRejection', cleaner)

        try {
            if (config.sourceType === SourceType.local) {
                this.copyDir(config.source, config.destination)
            }
            status = 'copied'
            const templateReducerConstructor = this.getTemplateReducer(config.destination)
            const morphyService = new MorphyService(templateReducerConstructor)

            this.writeLn('')
            await this.processConfigParameters(morphyService)

            for (const dir of await morphyService.getDirectoriesForRemove()) {
                this.deleteDir(path.join(config.destination, dir))
            }
            for (const file of await morphyService.getFilesForRemove()) {
                fs.unlinkSync(path.join(config.destination, file))
            }
            for (const file of this.getDirFilesFlatten(config.destination)) {
                const innerFilepath = file.slice(config.destination.length + 1)
                const originalContent = fs.readFileSync(file).toString()
                const morphedContent = await morphyService.morphyFile(originalContent, innerFilepath)
                if (originalContent !== morphedContent) {
                    fs.writeFileSync(file, morphedContent)
                }
            }

            this.writeLn('\nInstalling packages...')
            this.exec(`cd ${config.destination} && npm install`)
            process.chdir(config.destination)
            await morphyService.finish()
            status = 'done'
        } catch (err) {
            this.writeLn(err.message, cc.FgRed)
            process.exit()
        }
    }

    private checkBaseConfig() {
        const config = {
            name: '',
            destination: process.argv[3],
            source: process.argv[4] ? process.argv[4] : 'https://github.com/karcass-ts/template',
        }
        if (!config.destination) {
            this.write('Missing required argument ', cc.FgRed)
            this.writeLn('<dir-name>', cc.FgYellow)
            process.exit()
        }
        if (fs.existsSync(config.destination)) {
            this.writeLn(`Directory ${config.destination} already exists`, cc.FgRed)
            process.exit()
        }
        const nameSymbols = config.destination.toLowerCase().match(/[a-z-_]{1}/g)
        if (!nameSymbols) {
            this.writeLn('Incorrect project name', cc.FgRed)
            process.exit()
        }
        config.name = nameSymbols.join('')
        let sourceType: SourceType
        if (config.source.indexOf('https://github.com/') >= 0) {
            sourceType = SourceType.github
        } else {
            sourceType = SourceType.local
        }

        return {
            ...config,
            sourceType,
        }
    }

    private deleteDir(destination: string) {
        if (fs.existsSync(destination)) {
            fs.rmdirSync(destination, { recursive: true })
        }
    }

    private copyDir(source: string, destination: string) {
        try {
            fs.mkdirSync(destination)
        } catch (err) {
            throw new Error(`Error while creating directory ${destination}: ${err.message}`)
        }

        for (const part of fs.readdirSync(source)) {
            const sourceFile = path.join(source, part)
            const destinationFile = path.join(destination, part)
            if (['node_modules', '.git', 'package-lock.json'].includes(part)) {
                continue
            }
            if (fs.statSync(sourceFile).isDirectory()) {
                this.copyDir(sourceFile, destinationFile)
                continue
            }
            this.write('Copying ')
            this.writeLn(destinationFile, cc.FgGreen)
            fs.copyFileSync(sourceFile, destinationFile)
        }
    }

    private getTemplateReducer(destinationDir: string): new () => TemplateReducerInterface {
        const templateReducerPath = path.join(destinationDir, 'TemplateReducer')
        let sourceCode: string
        if (fs.existsSync(`${templateReducerPath}.ts`)) {
            this.write('\nCompiling ')
            this.write(`${templateReducerPath}.ts`, cc.FgGreen)
            this.write('... ')
            sourceCode = fs.readFileSync(`${templateReducerPath}.ts`).toString()
            sourceCode = ts.transpile(sourceCode, {
                target: ts.ScriptTarget.ES2017,
                module: ts.ModuleKind.CommonJS,
                esModuleInterop: true,
            })
            this.writeLn('compiled')
        } else if (fs.existsSync(`${templateReducerPath}.js`)) {
            sourceCode = fs.readFileSync(`${templateReducerPath}.js`).toString()
        } else {
            throw new Error(`File ${templateReducerPath}.js does not exists in template, unable to continue`)
        }
        sourceCode = `let exports = {}; {\n${sourceCode}\n}; exports.TemplateReducer || exports;`
        return eval(sourceCode)
    }

    private async processConfigParameters(morphyService: MorphyService) {
        const process = async (configParameters: ConfigParametersResult) => {
            for (let configParameter of configParameters) {
                if (typeof configParameter === 'function') {
                    const result = await configParameter(morphyService.getConfig())
                    if (!result) {
                        continue
                    }
                    if (Array.isArray(result)) {
                        await process(result)
                        continue
                    } else {
                        configParameter = result
                    }
                }
                const baseOpts = { name: configParameter.name, message: configParameter.description }
                if (configParameter.type === ConfigParameterType.radio || configParameter.type === ConfigParameterType.checkbox) {
                    const result = await inquirer.prompt({
                        ...baseOpts,
                        type: configParameter.type === ConfigParameterType.radio ? 'list' : 'checkbox',
                        choices: configParameter.choices.map(c => ({
                            value: c.value,
                            name: c.description,
                            checked: c.checked,
                        })),
                    })
                    morphyService.updateConfig(configParameter, result[configParameter.name])
                } else {
                    const result = await inquirer.prompt({
                        ...baseOpts,
                        type: configParameter.type as any,
                        default: configParameter.default,
                    })
                    morphyService.updateConfig(configParameter, result[configParameter.name])
                }
            }
        }
        return process(await morphyService.getConfigParameters())
    }

    private getDirFilesFlatten(directory: string) {
        const result: string[] = []
        for (const part of fs.readdirSync(directory)) {
            const filename = path.join(directory, part)
            const stat = fs.statSync(filename)
            if (stat.isFile()) {
                result.push(filename)
                continue
            } else if (stat.isDirectory()) {
                result.push(...this.getDirFilesFlatten(filename))
            }
        }
        return result
    }

    private exec(command: string) {
        execSync(command, {
            stdio: 'inherit',
        })
    }

}
