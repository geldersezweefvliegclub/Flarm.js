import 'dotenv/config';
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
  level: process.env.LOGGER_LEVEL || 'info',
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
    new winston.transports.Console({
      level: 'silly',
      format: winston.format.combine(
          winston.format.colorize({
            all: true,
          }),
          winston.format.simple(),
      ),
    }),
    ...(process.env.LOGGER_SERVER_URL ? [new SeqTransport({
      serverUrl: process.env.LOGGER_SERVER_URL,
      apiKey: process.env.LOGGER_API_KEY,
      onError: ((e: Error) => {
        console.error(e);
      }),
      handleExceptions: true,
      handleRejections: true,
    })] : []),
  ],
});

const logger = createLogger();

// Vangnet: zonder dit stopt Node.js het hele proces bij een onverwachte fout (bv. een Helios-
// aanroep die faalt zonder dat er ergens een .catch op zit). Dit voorkomt dat de hele applicatie
// (Flarm-verwerking, websockets, ...) onderuitgaat door één enkele, geïsoleerde fout.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason instanceof Error ? reason.stack : String(reason));
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err.stack);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger
  });
  await app.listen(3000);
}
bootstrap();
