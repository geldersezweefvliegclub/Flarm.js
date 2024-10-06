import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import {SeqTransport} from "@datalust/winston-seq";

/**
 * Create a logger for the application using Winston instead of the built-in nestjs logger.
 * Allows for logging to multiple transports, such as the console and Seq, or modifying the log format.
 */
const createLogger = () => WinstonModule.createLogger({
  // todo take from config file?
  level: 'debug',
  format: winston.format.combine(   /* This is required to get errors to log with stack traces. See https://github.com/winstonjs/winston/issues/1498 */
      winston.format.errors({stack: true}),
      winston.format.json(),
  ),
  defaultMeta: {
    Application: 'Flarm API',
    Instance: process.env.INSTANCE || 'Local',
    Environment: process.env.NODE_ENV || 'Local',
  },
  transports: [
    // log everything to the console
    new winston.transports.Console({
      format: winston.format.combine(
          winston.format.colorize({
            all: true,
          }),
          winston.format.simple(),
      ),
    }),
    new SeqTransport({
      serverUrl: process.env.LOGGER_SERVER_URL || 'http://localhost:5341',
      apiKey: process.env.LOGGER_API_KEY,
      onError: (e => {
        console.error(e);
      }),
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: createLogger()
  });
  await app.listen(3000);
}
bootstrap();
