import {Bot} from "./bot";
import {SettingsConfig, SettingsHasHelper, SettingsHelper} from "./modules/settings.skip";

export enum ModuleState {
    Disabled,
    Enabled,
    Required
}

type Listener = {
    event: string,
    func: Function
}

export abstract class Module {
    public readonly name: string;
    public readonly bot: Bot;
    public readonly dependencies: string[];
    public dependents: string[];
    public readonly settingsConfig: SettingsConfig;
    public settings: SettingsHelper;
    public settingsHas: SettingsHasHelper;
    public state: ModuleState;
    private listeners: Listener[];
    private intervals: number[];

    protected constructor(bot: Bot, name: string, dependencies?: string[], settings?: SettingsConfig,
                          required: boolean = false) {
        this.bot = bot;
        this.name = name;
        if (dependencies == null) {
            this.dependencies = [];
        } else {
            this.dependencies = dependencies;
        }
        if (settings != null) {
            this.settingsConfig = settings;
            this.dependencies.push("settings");
        }
        if (required) {
            this.state = ModuleState.Required;
        } else {
            this.state = ModuleState.Disabled;
        }
        this.listeners = [];
        this.dependents = [];
        this.intervals = [];
    }

    protected listen(event: string, func: Function) {
        this.bot.client.on(event, func);
        this.listeners.push({event, func})
    }

    protected interval(handler: TimerHandler, time: number) {
        this.intervals.push(setInterval(handler, time))
    }

    public async initialize(): Promise<void> {
        return Promise.resolve();
    }

    public async unload(): Promise<void> {
        for (let i = 0; i < this.intervals.length; i++) {
            clearInterval(this.intervals[i]);
        }
        this.intervals = [];
        for (let i = 0; i < this.listeners.length; i++) {
            const listener: Listener = this.listeners[i];
            this.bot.client.off(listener.event, listener.func as (...args: any[]) => void)
        }
        this.listeners = [];
    }

    public async reload(): Promise<void> {
        await this.unload();
        await this.initialize();
    }

    public async event(name: string, payload: string): Promise<void> {}

    public settingsN(key: string): number {
        return parseInt(this.settings(key), 10);
    }

    public settingsArr(key: string): string[] {
        return this.settings(key).split(",");
    }
}