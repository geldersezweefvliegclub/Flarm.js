import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { pipeline } from 'stream/promises';

const TIMEZONE = 'Europe/Amsterdam';

@Injectable()
export class OgnRecorder implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(OgnRecorder.name);
    private readonly logDir: string;
    private writeStream: fs.WriteStream | null = null;
    private currentHour: string | null = null;

    constructor() {
        this.logDir = process.env.OGN_LOG_DIR ?? '';
    }

    onApplicationBootstrap(): void {
        if (!this.logDir) {
            this.logger.warn('OGN_LOG_DIR is not set. OGN recordings will not be saved.');
            return;
        }

        fs.mkdirSync(this.logDir, { recursive: true });
        this.openFile(this.currentHourTag());
        this.compressOldFiles();
    }

    onApplicationShutdown(): void {
        this.writeStream?.end();
    }

    record(rawLine: string): void {
        if (!this.logDir) return;

        const now = DateTime.now().setZone(TIMEZONE);
        const hour = this.hourTag(now);

        if (hour !== this.currentHour) {
            this.openFile(hour);
        }

        this.writeStream?.write(`${now.toISO()} ${rawLine}\n`);
    }

    @Cron('0 0 * * * *')
    private onHourBoundary(): void {
        if (!this.logDir) return;

        this.openFile(this.currentHourTag());
        this.compressOldFiles();
        this.deleteOldRecordings();
    }

    private deleteOldRecordings(): void {
        const cutoff = DateTime.now().setZone(TIMEZONE).minus({ days: 14 });

        let files: string[];
        try {
            files = fs.readdirSync(this.logDir).filter(f => f.endsWith('.log.gz'));
        } catch (e) {
            this.logger.error(`Cannot read log dir ${this.logDir}: ${e.message}`);
            return;
        }

        for (const file of files) {
            const hourTag = file.replace('.log.gz', '');
            const fileTime = DateTime.fromFormat(hourTag, "yyyy-MM-dd'T'HH", { zone: TIMEZONE });

            if (fileTime.isValid && fileTime < cutoff) {
                try {
                    fs.unlinkSync(path.join(this.logDir, file));
                    this.logger.log(`Deleted old recording ${file}`);
                } catch (e) {
                    this.logger.error(`Failed to delete ${file}: ${e.message}`);
                }
            }
        }
    }

    private openFile(hour: string): void {
        this.writeStream?.end();
        this.currentHour = hour;
        const filePath = path.join(this.logDir, `${hour}.log`);
        this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });
        this.logger.log(`Recording to ${filePath}`);
    }

    private compressOldFiles(): void {
        const currentFile = `${this.currentHourTag()}.log`;

        let files: string[];
        try {
            files = fs.readdirSync(this.logDir).filter(f => f.endsWith('.log') && f !== currentFile);
        } catch (e) {
            this.logger.error(`Cannot read log dir ${this.logDir}: ${e.message}`);
            return;
        }

        for (const file of files) {
            const src = path.join(this.logDir, file);
            const dst = src + '.gz';

            pipeline(
                fs.createReadStream(src),
                zlib.createGzip(),
                fs.createWriteStream(dst),
            )
            .then(() => {
                fs.unlinkSync(src);
                this.logger.log(`Compressed ${file}`);
            })
            .catch(e => this.logger.error(`Failed to compress ${file}: ${e.message}`));
        }
    }

    private hourTag(dt: DateTime): string {
        return dt.toFormat("yyyy-MM-dd'T'HH");
    }

    private currentHourTag(): string {
        return this.hourTag(DateTime.now().setZone(TIMEZONE));
    }
}
