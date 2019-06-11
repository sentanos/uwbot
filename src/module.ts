import {Bot} from "./bot";

export class Module {
    public readonly name: string;
    public readonly bot: Bot;
    public readonly dependencies: string[];

    constructor(bot: Bot, name: string, dependencies?: string[]) {
        this.bot = bot;
        this.name = name;
        if (dependencies == null) {
            this.dependencies = [];
        } else {
            this.dependencies = dependencies;
        }
    }

    public async initialize(): Promise<void> {
        return Promise.resolve();
    }

    public async loadDependencies(): Promise<void> {
        return Promise.resolve();
    }
}