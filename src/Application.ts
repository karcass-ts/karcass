import { CreateCommand } from './CreateCommand'
import path from 'path'
import { MorphyService } from './MorphyService'
import { Cli } from '@karcass/cli'

export class Application {
    public console = new Cli()

    // Services
    public morphyService!: MorphyService

    public get rootDir() {
        return path.dirname(__dirname)
    }

    public async run() {
        this.console.add(CreateCommand, () => new CreateCommand())
        await this.console.run()
    }

}
