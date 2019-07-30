import {Module} from "../module";
import {Bot} from "../bot";
import {Jobs} from "../database/models/job";
import {CronJob} from "cron";

export class SchedulerModule extends Module {
    private jobs: Map<number, CronJob>;

    constructor(bot: Bot) {
        super(bot, "scheduler");
    }

    public async initialize() {
        this.jobs = new Map<number, CronJob>();
        await this.loadJobs();
    }

    public async unload() {
        for (const job of this.jobs.values()) {
            job.stop();
        }
    }

    private async loadJobs(): Promise<void> {
        let jobs = await Jobs.findAll();
        for (let i = 0; i < jobs.length; i++) {
            this.loadJob(jobs[i]);
        }
    }

    private async tick(job: Jobs, cron: CronJob): Promise<void> {
        if (this.bot.isEnabled(job.module)) {
            const mod = this.bot.getModule(job.module);
            await mod.event(job.event, job.payload);
        }
        this.jobs.delete(job.id);
        await job.destroy();
    }

    private loadJob(job: Jobs): void {
        if (job.date.getTime() < new Date().getTime()) { // Date is in past
            job.destroy();
            return;
        }
        let scheduler = this;
        // We must use "function" here and not an arrow function because of the different ways
        // they treat "this"
        let cron = new CronJob(job.date, function() {
            scheduler.tick(job, this)
                .catch((err: Error) => {
                    console.error(`Cron job ${job.id}} for module ${job.module} with event \
                    ${job.event} and payload ${job.payload} failed to fire with error: ${err.stack}`);
                });
        });
        cron.start();
        this.jobs.set(job.id, cron);
    }

    public async schedule(module: string, date: Date, event: string, payload: string):
        Promise<void> {
        await this.loadJob(await Jobs.create({module, date, event, payload}));
    }
}