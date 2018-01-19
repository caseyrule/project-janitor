import {
  AbstractLogger,
  LFService,
  LogFormat,
  Logger,
  LoggerFactoryOptions,
  LoggerType,
  LogGroupRule,
  LogLevel,
  LogMessage,
} from 'typescript-logging';
import * as vscode from 'vscode';

class VSLogger extends AbstractLogger {
  private outputChannel: vscode.OutputChannel;

  private constructor(name: string, settings) {
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
          (name, settings) => new VSLogger(name, settings)
        )
      )
    ).getLogger(name);
  }
}

export { Logger, VSLogger };
