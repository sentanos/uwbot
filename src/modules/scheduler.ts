import {Module} from "../module";
import {Bot} from "../bot";
import {Jobs} from "../database/models/job";
import {CronJob} from "cron";

// The scheduler module executes events scheduler for certain times. It ensures that events are
// persisted across restarts and that in the event of the bot being offline at the scheduled
// time it will be executed as soon as possible when the bot comes back online.
export class SchedulerModule extends Module {
    private jobs: Map<number, CronJob>;

    constructor(bot: Bot) {
        super(bot, "scheduler");
    }

    public async initialize() {
        this.jobs = new Map<number, CronJob>();
    }

    public async modulesEnabled() {
        await this.loadJobs();
    }

    public async unload() {
        for (const job of this.jobs.values()) {
            job.stop();
        }
    }

    // Deletes all jobs with the given event and payload
    public async deleteJobsByContent(event: string, payload: string): Promise<void> {
        const jobs = await Jobs.findAll({
            where: {event, payload}
        });
        for (let i = 0; i < jobs.length; i++) {
            const id = jobs[i].id;
            if (this.jobs.has(id)) {
                this.jobs.get(id).stop();
                this.jobs.delete(id);
            }
        }
        await Jobs.destroy({
            where: {event, payload}
        });
    }

    private async loadJobs(): Promise<void> {
        let jobs = await Jobs.findAll();
        for (let i = 0; i < jobs.length; i++) {
            this.loadJob(jobs[i]);
        }
    }

    private async tick(job: Jobs): Promise<void> {
        if (this.bot.isEnabled(job.module)) {
            const mod = this.bot.getModule(job.module);
            await mod.event(job.event, job.payload);
        } else {
            throw new Error("Module disabled");
        }
        this.jobs.delete(job.id);
        await job.destroy();
    }

    private loadJob(job: Jobs): void {
        if (job.date.getTime() < new Date().getTime()) { // Date is in past
            this.tick(job)
                .catch((err: Error) => {
                    console.error(`Immediate execute of job ${job.id} for module ${job.module} with ` +
                        `event ${job.event} and payload ${job.payload} failed to fire with error: `
                        + err.stack);
                });
            return;
        }
        let scheduler = this;
        // We must use "function" here and not an arrow function because of the different ways
        // they treat "this"
        // "this" in the cron job refers to the job itself
        let cron = new CronJob(job.date, function() {
            scheduler.tick(job)
                .catch((err: Error) => {
                    console.error(`Cron job ${job.id}} for module ${job.module} with event ` +
                    `${job.event} and payload ${job.payload} failed to fire with error: ${err.stack}`);
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