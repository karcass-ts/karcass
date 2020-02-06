import { ConsoleColors as cc } from '@karcass/cli'
import path from 'path'
import fs from 'fs'
import { CreateCommand, SourceType } from './CreateCommand'
import { MorphyService } from './MorphyService'
import { ConfigParametersResult } from '@karcass/template-reducer'

export class TestCommand extends CreateCommand {
    public static meta = {
        name: 'test',
        description: 'Perform template testing',
        usage: 'test <template (optional, link to github repository or local directory)> [case_number (for testing specific case)]',
    }

    public async execute() {
        const originalCwd = process.cwd()

        const config = this.checkBaseConfig()
        const clean = () => {
            if (['copy', 'copied'].includes(status)) {
                console.log('> Cleanup...')
                process.chdir(originalCwd)
                this.deleteDir(config.destination)
            }
        }

        process.on('SIGINT', clean)
        process.on('SIGUSR1', clean)
        process.on('SIGUSR2', clean)

        let configSet: Record<string, any>[]|undefined
        let currentConfigIndex = config.caseNumber ? config.caseNumber - 1 : 0
        let fakeInput: string|undefined

        try {
            while (!configSet || currentConfigIndex < configSet.length) {
                config.name = config.destination = `test${Date.now()}`
                if (config.sourceType === SourceType.local) {
                    this.copyDir(config.source, config.destination, true)
                } else {
                    await this.downloadFromGithub(config.source, config.destination, true)
                }
                const templateReducerConstructor = this.getTemplateReducer(config.destination, true)
                const morphyService = new MorphyService(templateReducerConstructor)

                configSet = await morphyService.getTestConfigSet()
                if (!configSet || !configSet.length) {
                    this.writeLn('> The result of TemplateReducer::getTestConfigSet() is empty, nothing to test', cc.FgRed)
                    clean()
                    process.exit()
                }
                if (currentConfigIndex >= configSet.length) {
                    this.writeLn(`> There is no case ${currentConfigIndex + 1} in TemplateReducer::getTestConfigSet() result`, cc.FgRed)
                    clean()
                    process.exit()
                }

                console.log(`\n=== Testing case ${currentConfigIndex + 1} of ${configSet.length} ===`.toUpperCase())
                console.log('> Fake user input:')
                fakeInput = ''
                await this.processTestConfigParameters(morphyService, configSet[currentConfigIndex], message => {
                    fakeInput += message + '\n'
                    console.log('  ' + message)
                })

                await this.reduceTemplate(morphyService, config.destination, config.name)

                this.deleteDir(config.destination)
                currentConfigIndex++
                if (config.caseNumber) {
                    break
                }
            }
        } catch (err) {
            this.writeLn('> ' + err.message, cc.FgRed)
            console.log('Template installation which cause error is saved here: ' + path.join(originalCwd, config.destination))
            if (fakeInput) {
                const fakeInputFile = path.join(originalCwd, config.destination, 'fakeInput.txt')
                fs.writeFileSync(fakeInputFile, fakeInput)
                console.log(`Fake user input (also saved at ${fakeInputFile}):`)
                console.log(fakeInput.split('\n').filter(s => !!s).map(s => '  ' + s).join('\n'))
            }
            process.exit(1)
        }
    }

    protected async processTestConfigParameters(
        morphyService: MorphyService,
        config: Record<string, any>,
        logCallback: (message: string) => void,
    ) {
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
                const val = configParameter.name in config ? config[configParameter.name] : undefined
                logCallback(`${configParameter.description}: ${val}`)
                morphyService.updateConfig(configParameter, val)
            }
        }
        return process(await morphyService.getConfigParameters())
    }

    protected checkBaseConfig() {
        const config = {
            name: '',
            destination: '',
            source: process.argv[3],
            caseNumber: isNaN(Number(process.argv[4])) ? undefined : Number(process.argv[4]),
        }
        let sourceType: SourceType
        if (config.source.indexOf('https://github.com/') >= 0) {
            sourceType = SourceType.github
        } else {
            sourceType = SourceType.local
        }

        return { ...config, sourceType }
    }

}
