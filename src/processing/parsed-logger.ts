import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { FlarmDataWithStatus } from './processing';
import { ConfigService } from '@nestjs/config';

const TIMEZONE = 'Europe/Amsterdam';

@Injectable()
export class ParsedLogger implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(ParsedLogger.name);
    private readonly logDir: string;
    private readonly simulatorActive: boolean;
    private writeStream: fs.WriteStream | null = null;
    private currentHour: string | null = null;

    constructor(private readonly configService: ConfigService) {
        this.logDir = process.env.PARSED_LOG_DIR ?? '';
        this.simulatorActive = !!this.configService.get('OGN').simulator;
    }

    onApplicationBootstrap(): void {
        if (!this.logDir) {
            this.logger.warn('PARSED_LOG_DIR is not set. Parsed data will not be saved.');
            return;
        }

        fs.mkdirSync(this.logDir, { recursive: true });
        this.openFile(this.currentHourTag());
        this.compressOldFiles();
        this.deleteOldRecordings();
    }

    onApplicationShutdown(): void {
        this.writeStream?.end();
    }

    record(data: FlarmDataWithStatus): void {
        if (!this.logDir || this.simulatorActive) return;

        const hour = this.currentHourTag();
        if (hour !== this.currentHour) {
            this.openFile(hour);
        }

        this.writeStream?.write(JSON.stringify(data) + '\n');
    }

    @Cron('0 0 * * * *')
    private onHourBoundary(): void {
        if (!this.logDir) return;

        this.openFile(this.currentHourTag());
        this.compressOldFiles();
        this.deleteOldRecordings();
    }

    private openFile(hour: string): void {
        this.writeStream?.end();
        this.currentHour = hour;
        const filePath = path.join(this.logDir, `${hour}.json`);
        this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });
        this.logger.log(`Recording parsed data to ${filePath}`);
    }

    private compressOldFiles(): void {
        const currentFile = `${this.currentHourTag()}.json`;

        let files: string[];
        try {
            files = fs.readdirSync(this.logDir).filter(f => f.endsWith('.json') && f !== currentFile);
        } catch (e) {
            this.logger.error(`Cannot read log dir ${this.logDir}: ${e.message}`);
            return;
        }

        for (const file of files) {
            const src = path.join(this.logDir, file);

            if (fs.statSync(src).size === 0) {
                fs.unlinkSync(src);
                this.logger.log(`Deleted empty file ${file}`);
                continue;
            }

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

    private deleteOldRecordings(): void {
        const cutoff = DateTime.now().setZone(TIMEZONE).minus({ days: 14 });

        let files: string[];
        try {
            files = fs.readdirSync(this.logDir).filter(f => f.endsWith('.json.gz'));
        } catch (e) {
            this.logger.error(`Cannot read log dir ${this.logDir}: ${e.message}`);
            return;
        }

        for (const file of files) {
            const hourTag = file.replace('.json.gz', '');
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

    private hourTag(dt: DateTime): string {
        return dt.toFormat("yyyy-MM-dd'T'HH");
    }

    private currentHourTag(): string {
        return this.hourTag(DateTime.now().setZone(TIMEZONE));
    }
}
