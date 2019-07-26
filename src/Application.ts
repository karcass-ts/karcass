import { AbstractConsoleCommand } from './Base/Console/AbstractConsoleCommand'
import { HelpCommand } from './Base/Console/HelpCommand'
import { CreateCommand } from './Create/Console/CreateCommand'
import path from 'path'
import { MorphyService } from './Create/Service/MorphyService'

export class Application {

    // Commands
    public helpCommand!: HelpCommand
    public createCommand!: CreateCommand

    // Services
    public morphyService!: MorphyService

    public get rootDir() {
        return path.dirname(__dirname)
    }

    public async run() {
        this.helpCommand = new HelpCommand(this)
        this.createCommand = new CreateCommand(this)

        this.morphyService = new MorphyService(this)

        if (process.argv[2]) {
            for (const command of Object.values(this).filter((c: any) => c instanceof AbstractConsoleCommand) as AbstractConsoleCommand[]) {
                if (command.name === process.argv[2]) {
                    await command.execute()
                    process.exit()
                }
            }
        }
        await this.helpCommand.execute()
        process.exit()
    }

}
