import { CreateCommand } from './CreateCommand'
import path from 'path'
import { Cli } from '@karcass/cli'
import { TestCommand } from './TestCommand'

export class Application {
    public console = new Cli()

    public get rootDir() {
        return path.dirname(__dirname)
    }

    public async run() {
        this.console.add(CreateCommand, () => new CreateCommand())
        this.console.add(TestCommand, () => new TestCommand())
        await this.console.run()
    }

}
