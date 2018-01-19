'use strict';
import * as vscode from 'vscode';
import { ExtensionContext, TextDocument, Uri } from 'vscode';

import { Logger, VSLogger } from './logging';
import { Promiser } from './Promiser';

export abstract class VSCExtension {
  protected readonly logger: Logger;

  constructor(private context: ExtensionContext, private prefix: string, name: string) {
    this.logger = VSLogger.get(name);
  }

  public static activate<T extends VSCExtension>(extension: T, methods: Array<keyof T>) {
    methods.forEach(method => {
      extension.context.subscriptions.push(
        vscode.commands.registerCommand(`${extension.prefix}.${method}`, extension[method], extension)
      );
    });
  }

  protected executeCommandSequence(commands: string[]): Thenable<void> {
    return Promiser.forEach(commands, c => vscode.commands.executeCommand(c));
  }

  protected forEachFile(files: Uri[], callback: (doc: TextDocument) => Thenable<boolean>): Thenable<number> {
    let count: number = 0;

    return Promiser.forEach(files, file => {
      this.logger.trace(`Cleaning up ${file}`);

      return vscode.workspace
        .openTextDocument(file)
        .then(doc => callback(doc))
        .then(() => count++);
    }).then(() => count);
  }
}
