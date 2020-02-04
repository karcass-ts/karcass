import { AbstractConsoleCommand, ConsoleColors as cc } from '@karcass/cli'
import * as ts from 'typescript'
import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import { MorphyConfig, MorphyService } from './MorphyService'
import { execSync } from 'child_process'
import { ConfigParameterType, ConfigParametersResult } from '@karcass/template-reducer'

type ICreateConfig = {
    directory: string,
} & MorphyConfig

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
        const config = this.checkBaseConfig()
        let status: 'check'|'copied'|'done' = 'check'
        const cleaner = () => {
            if (status === 'copied') {
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
                status = 'copied'
            }
            const templateReducerPath = path.join(config.destination, 'TemplateReducer')
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
            const morphyService = new MorphyService(eval(sourceCode))

            const processConfigParameters = async (configParameters: ConfigParametersResult) => {
                for (let configParameter of configParameters) {
                    if (typeof configParameter === 'function') {
                        const result = await configParameter(morphyService.getConfig())
                        if (!result) {
                            continue
                        }
                        if (Array.isArray(result)) {
                            await processConfigParameters(result)
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
            this.writeLn('')
            await processConfigParameters(await morphyService.getConfigParameters())

            this.writeLn('\nInstalling packages...')
            this.exec(`cd ${config.destination} && npm install`)
        } catch (err) {
            this.writeLn(err.message, cc.FgRed)
            process.exit()
        }
    }

    private checkBaseConfig() {
        const config = {
            destination: process.argv[3],
            source: process.argv[4] ? process.argv[4] : 'https://github.com/karcass-ts/template',
            name: '',
            tabSize: 4,
            semicolon: true,
            doubleQuotemark: false,
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

        /*
            console.log('Installing npm packages...')
            await new Promise(resolve => {
                const pr = exec('cd ' + config.directory + ' ; npm i')
                pr.on('close', resolve)
                pr.on('error', (err) => {
                    console.log(err.message)
                    resolve()
                })
                if (!pr.stdout) {
                    return this.writeLn('Error: stdout is unavailable')
                }
                pr.stdout.on('data', data => console.log(data))
            })
            console.log('Project successfully created.')
            console.log('Available commands:\nnpm run build\nnpm run watch\nnode index.js')
        */
    }

    private exec(command: string) {
        execSync(command, {
            stdio: 'inherit',
        })
    }

}
