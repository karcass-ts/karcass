import { AbstractConsoleCommand, ConsoleColors as cc } from '@karcass/cli'
import unzip from 'unzipper'
import http from 'https'
import * as ts from 'typescript'
import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import { ReducerService } from './ReducerService'
import { execSync } from 'child_process'
import { ConfigParameterType, ConfigParametersResult, TemplateReducerInterface } from '@karcass/template-reducer'

export enum SourceType {
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
        let status: 'check'|'copy'|'copied'|'done' = 'check'
        const cleaner = () => {
            if (['copy', 'copied'].includes(status)) {
                console.log('> Cleanup...')
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
                status = 'copy'
                this.copyDir(config.source, config.destination)
            } else {
                await this.downloadFromGithub(config.source, config.destination)
            }
            status = 'copied'
            const templateReducerConstructor = this.getTemplateReducer(config.destination)
            const reducerService = new ReducerService(
                templateReducerConstructor,
                config.name,
                path.join(originalCwd, config.destination),
            )

            console.log('')
            await this.processConfigParameters(reducerService)
            await this.reduceTemplate(reducerService, config.destination, config.name)
            status = 'done'
        } catch (err) {
            this.writeLn('> ' + err.message, cc.FgRed)
            process.exit(1)
        }
    }

    protected checkBaseConfig() {
        const config = {
            name: '',
            destination: process.argv[3],
            source: process.argv[4] ? process.argv[4] : 'https://github.com/karcass-ts/default-template',
        }
        if (!config.destination) {
            this.write('> Missing required argument ', cc.FgRed)
            this.writeLn('<dir-name>', cc.FgYellow)
            process.exit(1)
        }
        if (fs.existsSync(config.destination)) {
            this.writeLn(`> Directory "${config.destination}" already exists`, cc.FgRed)
            process.exit(1)
        }
        const nameSymbols = config.destination.toLowerCase().match(/[a-z-_]{1}/g)
        if (!nameSymbols) {
            this.writeLn('> Incorrect project name', cc.FgRed)
            process.exit(1)
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

    protected async reduceTemplate(reducerService: ReducerService, destination: string, projectName: string) {
        for (const dir of await reducerService.getDirectoriesForRemove()) {
            if (fs.existsSync(path.join(destination, dir))) {
                this.deleteDir(path.join(destination, dir))
            }
        }
        for (const file of await reducerService.getFilesForRemove()) {
            if (fs.existsSync(path.join(destination, file))) {
                fs.unlinkSync(path.join(destination, file))
            }
        }
        for (const file of this.getDirFilesFlatten(destination)) {
            const innerFilepath = file.slice(destination.length + 1)
            let originalContent = fs.readFileSync(file).toString()
            if (innerFilepath === 'package.json') {
                const json = JSON.parse(originalContent)
                json.name = projectName
                originalContent = JSON.stringify(json, undefined, 4)
            }
            const reducedContent = await reducerService.reduceFile(originalContent, innerFilepath)
            if (originalContent !== reducedContent) {
                fs.writeFileSync(file, reducedContent)
            }
        }

        console.log('\n> Installing packages...')
        this.exec(`cd ${destination} && npm install`)
        process.chdir(destination)
        await reducerService.finish()
        process.chdir('..')
    }

    protected async downloadFromGithub(projectUrl: string, destination: string, silent = false) {
        const githubZipPath = `${projectUrl}/archive/master.zip`
        if (!silent) {
            console.log(`> Retreiving ${githubZipPath}...`)
        }
        const downloadUrl: string = await new Promise((resolve, reject) => http.get(githubZipPath, res => {
            if (!res.statusCode || res.statusCode < 300 || res.statusCode > 308) {
                return reject(new Error('Cannot receive download redirect from github.com'))
            }
            resolve(res.headers.location)
        }))
        const file: Buffer = await new Promise((resolve, reject) => http.get(downloadUrl, res => {
            const chunks: any[] = []
            res.on('data', chunk => {
                chunks.push(chunk)
            })
            res.on('end', () => resolve(Buffer.concat(chunks)))
            res.on('error', reject)
        }))
        await (await unzip.Open.buffer(file)).extract({ path: destination })
        const unzippedDir = path.join(destination, fs.readdirSync(destination)[0])
        this.copyDir(unzippedDir, destination, silent)
        fs.rmdirSync(unzippedDir, { recursive: true })
    }

    protected deleteDir(destination: string) {
        if (fs.existsSync(destination)) {
            fs.rmdirSync(destination, { recursive: true })
        }
    }

    protected copyDir(source: string, destination: string, silent = false) {
        try {
            if (!fs.existsSync(destination)) {
                fs.mkdirSync(destination)
            }
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
                this.copyDir(sourceFile, destinationFile, silent)
                continue
            }
            if (!silent) {
                this.write('> Copying ')
                this.writeLn(destinationFile, cc.FgGreen)
            }
            fs.copyFileSync(sourceFile, destinationFile)
        }
    }

    protected getTemplateReducer(destinationDir: string, silent = false): new () => TemplateReducerInterface {
        const templateReducerPath = path.join(destinationDir, 'TemplateReducer')
        let sourceCode: string
        if (fs.existsSync(`${templateReducerPath}.ts`)) {
            if (!silent) {
                this.write('\n> Transpiling ')
                this.write(`${templateReducerPath}.ts`, cc.FgGreen)
                this.write('... ')
            }
            sourceCode = fs.readFileSync(`${templateReducerPath}.ts`).toString()
            sourceCode = ts.transpile(sourceCode, {
                target: ts.ScriptTarget.ES2017,
                module: ts.ModuleKind.CommonJS,
                esModuleInterop: true,
            })
            if (!silent) {
                this.writeLn('compiled')
            }
        } else if (fs.existsSync(`${templateReducerPath}.js`)) {
            sourceCode = fs.readFileSync(`${templateReducerPath}.js`).toString()
        } else {
            throw new Error(`> File ${templateReducerPath}.js does not exists in template, unable to continue`)
        }
        sourceCode = `let exports = {}; {\n${sourceCode}\n}; exports.TemplateReducer || exports;`
        return eval(sourceCode)
    }

    protected async processConfigParameters(reducerService: ReducerService) {
        const process = async (configParameters: ConfigParametersResult) => {
            for (let configParameter of configParameters) {
                if (typeof configParameter === 'function') {
                    const result = await configParameter(reducerService.getConfig())
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
                    reducerService.updateConfig(configParameter, result[configParameter.name])
                } else {
                    const result = await inquirer.prompt({
                        ...baseOpts,
                        type: configParameter.type as any,
                        default: configParameter.default,
                    })
                    reducerService.updateConfig(configParameter, result[configParameter.name])
                }
            }
        }
        return process(await reducerService.getConfigParameters())
    }

    protected getDirFilesFlatten(directory: string) {
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

    protected exec(command: string) {
        execSync(command, {
            stdio: 'inherit',
        })
    }

}
