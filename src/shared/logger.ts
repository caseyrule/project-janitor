import {
  AbstractLogger,
  LFService,
  LogFormat,
  Logger,
  LoggerFactoryOptions,
  LoggerType,
  LogGroupRule,
  LogLevel,
  LogMessage
} from 'typescript-logging';
import * as vscode from 'vscode';

import {
  LogGroupRuntimeSettings
} from '../../node_modules/typescript-logging/dist/commonjs/log/standard/LoggerFactoryService';

class VSLogger extends AbstractLogger {
  private outputChannel: vscode.OutputChannel;

  private constructor(name: string, settings: LogGroupRuntimeSettings) {
    super(name, settings);
    this.outputChannel = vscode.window.createOutputChannel(name);
    this.outputChannel.show();
  }

  protected doLog(msg: LogMessage): void {
    this.outputChannel.appendLine(this.createDefaultLogMessage(msg));
  }

  public static get(name: string): Logger {
    return LFService.createNamedLoggerFactory(
      'LoggerFactory',
      new LoggerFactoryOptions().addLogGroupRule(
        new LogGroupRule(
          new RegExp('.+'),
          LogLevel.Trace,
          new LogFormat(),
          LoggerType.Custom,
          (loggerName, settings) => new VSLogger(loggerName, settings)
        )
      )
    ).getLogger(name);
  }
}

export { Logger, VSLogger };
