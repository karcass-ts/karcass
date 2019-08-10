import { Application } from '../../Application'
import { AbstractConsoleCommand, ConsoleColors as cc } from '../../Base/Console/AbstractConsoleCommand'
import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import { IMorphyConfig } from '../Service/MorphyService'
import { exec } from 'child_process'

type ICreateConfig = {
    directory: string,
} & IMorphyConfig

export class CreateCommand extends AbstractConsoleCommand {
    constructor(app: Application) {
        super(app, 'create', 'Creates new project in specified directory', 'create <dir-name>')
    }

    public async execute() {
        const config = {
            directory: process.argv[3],
            name: '',
            useDb: 'postgres' as any,
            useTwing: true,
            useLogger: true,
            tabSize: 4,
            semicolon: true,
            doubleQuotemark: false,
            port: Math.round(10000 + Math.random() * 50000),
        }
        if (!config.directory) {
            this.write('Missing required argument ', cc.FgRed)
            return this.writeLn('<dir-name>', cc.FgYellow)
        }
        if (fs.existsSync(config.directory)) {
            return this.writeLn(`Directory ${config.directory} already exists`, cc.FgRed)
        }
        config.name = config.directory.toLowerCase().match(/[a-z-_]{1}/g)!.join('')

        const choice: { type: 'default'|'select' } = await inquirer.prompt({
            name: 'type',
            message: 'Select installation type',
            type: 'list',
            choices: [
                { value: 'default', name: 'Default + all features' },
                { value: 'select', name: 'Select features' },
            ],
        })
        if (choice.type === 'select') {
            const features: string[] = (await inquirer.prompt({
                name: 'features',
                message: 'Select features',
                type: 'checkbox',
                choices: [
                    { value: 'typeorm', name: 'TypeORM for DB', checked: !!config.useDb },
                    { value: 'logger', name: 'Logger for logs', checked: !!config.useLogger },
                    { value: 'twing', name: 'Twing for HTML', checked: !!config.useTwing },
                ],
            }) as any).features
            config.useDb = features.indexOf('typeorm') >= 0 ? 'postgres' : false
            config.useLogger = features.indexOf('logger') >= 0
            config.useTwing = features.indexOf('twing') >= 0

            const tabSize: number = (await inquirer.prompt({
                name: 'tabSize',
                type: 'number',
                message: 'Tab size',
                default: config.tabSize,
            }) as any).tabSize
            config.tabSize = tabSize ? tabSize : config.tabSize

            const semicolon = (await inquirer.prompt({
                name: 'semicolon',
                type: 'confirm',
                message: 'Semicolons at end of the lines?',
                default: config.semicolon,
            }) as any).semicolon
            config.semicolon = semicolon

            const quotemark = (await inquirer.prompt({
                name: 'quotemark',
                type: 'confirm',
                message: 'Use single quitemark (\') instead double (")',
                default: !config.doubleQuotemark,
            }) as any).quotemark
            config.doubleQuotemark = !quotemark

            const listeningPort = (await inquirer.prompt({
                name: 'port',
                type: 'number',
                message: 'Listening port',
                default: config.port,
            }) as any).port
            config.port = listeningPort
        }
        await this.createProject(config)
    }

    private async createProject(config: ICreateConfig) {
        try {
            fs.mkdirSync(config.directory)
        } catch (err) {
            return this.writeLn(`Error while creating directory ${config.directory}`, cc.FgRed)
        }

        const templateDir = path.join(this.app.rootDir, 'template')
        const processDir = (dir: string, relativePath: string) => {
            for (const part of fs.readdirSync(dir)) {
                const ph = path.join(dir, part)
                const rPh = path.join(relativePath, part)
                if (fs.statSync(ph).isDirectory()) {
                    if (['node_modules', 'dist'].indexOf(part) === -1 && this.app.morphyService.isDirCopyNeeded(ph, config)) {
                        fs.mkdirSync(rPh)
                        processDir(ph, rPh)
                    }
                    continue
                }
                this.write('Writing ')
                this.writeLn(rPh, cc.FgGreen)
                this.app.morphyService.morphyFile(ph, rPh, config)
            }
        }
        processDir(templateDir, config.directory)
        console.log('Installing npm packages...')
        await new Promise(resolve => {
            const pr = exec('cd ' + config.directory + ' ; npm i')
            pr.on('close', resolve)
            pr.on('error', (err) => {
                console.log(+ err.message)
                resolve()
            })
            pr.stdout!.on('data', data => console.log(data))
        })
        console.log('Project successfully created.')
        console.log('Available commands:\nnpm run build\nnpm run watch\nnode index.js')
    }

}
