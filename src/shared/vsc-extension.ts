'use strict';
import * as vscode from 'vscode';
import { ExtensionContext, GlobPattern, TextDocument, Uri } from 'vscode';

import { Logger, VSLogger } from './logger';
import { Promiser } from './promiser';

export type ProjectFile = Uri;

export class VSCExtensionError extends Error {}

export abstract class VSCExtension {
  protected readonly logger: Logger;

  constructor(private context: ExtensionContext, private prefix: string, name: string) {
    this.logger = VSLogger.get(name);
  }
  protected executeCommandSequence(commands: string[]): Thenable<void> {
    return Promiser.forEach(commands, c => vscode.commands.executeCommand(c));
  }

  public findFiles(include: GlobPattern, exclude?: GlobPattern): Thenable<ProjectFile[]> {
    return vscode.workspace.findFiles(include, exclude);
  }

  protected relativePath(file: Uri): string {
    return vscode.workspace.asRelativePath(file);
  }

  protected forEachFile(files: ProjectFile[], callback: (doc: TextDocument) => Thenable<boolean>): Thenable<number> {
    let count = 0;

    return Promiser.forEach(files, file => {
      this.logger.trace(`Cleaning up ${file}`);

      return vscode.workspace
        .openTextDocument(file)
        .then(doc => callback(doc))
        .then(() => count++);
    }).then(() => count);
  }

  protected static registerMethods<T extends VSCExtension>(extension: T, methods: Array<keyof T>): void {
    methods.forEach(method => {
      extension.context.subscriptions.push(
        vscode.commands.registerCommand(`${extension.prefix}.${method}`, extension[method], extension)
      );
    });
  }
}
