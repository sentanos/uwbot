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
    // A reference to the bot this module belongs to
    public readonly bot: Bot;
    // An array of module names that the module depends on
    public readonly dependencies: string[];
    // An array of module names that depend on the module
    public dependents: string[];
    public readonly settingsConfig: SettingsConfig;
    // Helper that returns the value of the given setting
    public settings: SettingsHelper;
    public settingsHas: SettingsHasHelper;
    public state: ModuleState;
    private listeners: Listener[];
    private intervals: number[];

    // Constructs a new module with the given name, dependencies, and settings to be loaded into
    // the given bot. If required is true, the module will be marked as required and will be
    // automatically enabled; otherwise, it will be considered optional and must be enabled by
    // the user.
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

    // Given an event name, listens to that event from the module's bot client with the given
    // function.
    protected listen(event: string, func: Function) {
        this.bot.client.on(event, func);
        this.listeners.push({event, func})
    }

    // Same functionality as setInterval
    protected interval(handler: TimerHandler, time: number) {
        this.intervals.push(setInterval(handler, time))
    }

    // Asynchronously loads the module
    // This function is asynchronous, unlike the constructor. A module cannot be considered
    // loaded until it is both constructed and initialized.
    public async initialize(): Promise<void> {
        return Promise.resolve();
    }

    // This function is called when all relevant modules have been enabled by the bot (including
    // the given module).
    public async modulesEnabled(): Promise<void> {
        return Promise.resolve();
    }

    // Unloads the module, detaching all listeners and clearing all intervals as to make it
    // completely inactive.
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

    // Unload and then immediately load the module again
    public async reload(): Promise<void> {
        await this.unload();
        await this.initialize();
    }

    // This function is called when an event from the scheduler module fires.
    public async event(name: string, payload: string): Promise<void> {}

    // Returns the value of a given setting parsed as a number
    public settingsN(key: string): number {
        return parseInt(this.settings(key), 10);
    }

    // Returns the value of a given setting as an array for settings that are comma separated lists
    public settingsArr(key: string): string[] {
        return this.settings(key).split(",");
    }
}