import _ from 'lodash';
import moment from 'moment';
import winston, { format, Logger } from 'winston';
import Transport from 'winston-transport';
import { LoggingWinston } from '@google-cloud/logging-winston';
import { TransformableInfo, Format } from 'logform';
import { prettyJSON } from '../utils';

interface IWinstonLoggerOptions {
  serviceName: string;
}

function createLoggerPrefix(info: TransformableInfo): string {
  return `[${info.timestamp}][${info.level}]`;
}

function replacer(key: string, value: any): any {
  if (key === 'message') {
    return value.replace(/[^\w\s]/gi, '');
  }
  return value;
}

const printfTemplateFunctions: { [key: string]: (info: TransformableInfo) => string } = {
  joi(info: TransformableInfo): string {
    const { level: l, stack, isJoi, ...rest } = info;
    const loggerPrefix: string = createLoggerPrefix(info);
    const log = `${loggerPrefix}: ${JSON.stringify(rest, replacer, 2)}\n\n${stack}\n\n`;
    return log;
  },
  common(info: TransformableInfo): string {
    const { level: l, ...rest } = info;
    let log: string = '';
    const loggerPrefix: string = createLoggerPrefix(info);
    if (rest.stack) {
      const { stack, ...others } = rest;
      log = `${loggerPrefix}: ${prettyJSON(others)}\n\n${stack}\n\n`;
    } else if (_.isPlainObject(rest.message) || _.isArray(rest.message)) {
      log = `${loggerPrefix}: ${prettyJSON(rest)}\n\n`;
    } else if (_.isString(rest.message)) {
      const keepFields = ['service', 'message', 'timestamp'];
      const hasMeta = _.chain(rest)
        .keys()
        .some(key => {
          return !_.includes(keepFields, key);
        })
        .value();

      if (hasMeta) {
        log = `${loggerPrefix}: ${prettyJSON(rest)}`;
      } else {
        log = `${loggerPrefix}: ${rest.message}`;
      }
    }
    return log;
  }
};

function isJoiValidationError(info: TransformableInfo): boolean {
  return info.isJoi && info.name === 'ValidationError';
}

function prinfFormatProxy(): Format {
  return format.printf(
    (info: TransformableInfo): string => {
      if (isJoiValidationError(info)) {
        return printfTemplateFunctions.joi(info);
      }
      return printfTemplateFunctions.common(info);
    }
  );
}

function createWinstonLogger(options?: Partial<IWinstonLoggerOptions>): Logger {
  const defaultOptions: IWinstonLoggerOptions = {
    serviceName: ''
  };
  const finalOptions = _.defaults(options, defaultOptions);
  let transports: Transport[] = [];
  let level: string = 'debug';
  if (process.env.NODE_ENV === 'production') {
    const loggingWinston: Logger = new LoggingWinston({
      keyFilename: process.env.KEY_FILE_NAME,
      projectId: process.env.PROJECT_ID,
      serviceContext: {
        service: finalOptions.serviceName
      }
    });
    // loggingWinston.format = format.combine(format.timestamp(), format.errors({ stack: true }), prinfFormatProxy());
    transports = [new winston.transports.Console(), loggingWinston];
    if (process.env.DEVELOPMENT_BUILD !== 'true') {
      level = 'error';
    }
  } else {
    transports = [
      new winston.transports.Console({
        format: format.combine(
          format.colorize(),
          format.timestamp({ format: moment().format() }),
          format.errors({ stack: true }),
          prinfFormatProxy()
        )
      })
    ];
  }
  let defaultMeta: any;
  if (finalOptions.serviceName) {
    defaultMeta = { service: finalOptions.serviceName };
  }

  return winston.createLogger({
    level,
    defaultMeta,
    transports
  });
}

interface ILoggerMeta {
  context: string;
  arguments: any;
  labels: string[];
  extra: any;
}

type ILogMethod = (message: any, meta?: Partial<ILoggerMeta>) => Logger;
interface ILogMethods {
  debug: ILogMethod;
  info: ILogMethod;
  error: ILogMethod;
}

function preProcessMessage(message: any) {
  if (process.env.NODE_ENV === 'production') {
    if (_.isPlainObject(message)) {
      return prettyJSON(message);
    }
  }
  return message;
}

function createLogger(options?: Partial<IWinstonLoggerOptions>): ILogMethods {
  const winstonLogger = createWinstonLogger(options);
  function debug(message: any, meta?: Partial<ILoggerMeta>): Logger {
    return winstonLogger.debug(preProcessMessage(message), meta);
  }
  function info(message: any, meta?: Partial<ILoggerMeta>): Logger {
    return winstonLogger.info(preProcessMessage(message), meta);
  }
  function error(message: any, meta?: Partial<ILoggerMeta>): Logger {
    return winstonLogger.error(preProcessMessage(message), meta);
  }

  return {
    debug,
    info,
    error
  };
}

export { ILoggerMeta, createLogger, IWinstonLoggerOptions, ILogMethod, ILogMethods };
