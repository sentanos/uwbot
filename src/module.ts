import {Bot} from "./bot";

export class Module {
    public readonly name: string;
    public readonly bot: Bot;

    constructor(bot: Bot, name: string) {
        this.bot = bot;
        this.name = name;
    }

    public async initialize(): Promise<void> {
        return Promise.resolve();
    }
}