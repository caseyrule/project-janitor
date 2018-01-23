'use strict';
import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { ExtensionContext, GlobPattern, TextDocument, Uri, ViewColumn, WorkspaceConfiguration } from 'vscode';

import { Promised, Promiser } from './shared/promiser';
import { VSCExtension } from './shared/vsc-extension';

interface RenameRule {
  match: string;
  rename: string;
}

interface FileRename {
  from: string;
  to: string;
}

class ProjectJanitorConfig {
  get commands(): string[] {
    return this.config.get<string[]>('commands', ['editor.action.formatDocument']);
  }

  get excludePattern(): GlobPattern {
    return this.config.get<string[]>('excludePattern', ['**/node_modules/**/*']).join(',');
  }

  get includePattern(): GlobPattern {
    return this.config.get<string[]>('includePattern', ['src/**/*.ts']).join(',');
  }

  get skipConfirmation(): boolean {
    return this.config.get<boolean>('skipConfirmation');
  }

  get fileRenameRules(): RenameRule[] {
    return this.config.get<RenameRule[]>('fileRenameRules');
  }

  private get config(): WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('janitor');
  }
}

export class ProjectJanitor extends VSCExtension {
  private config: ProjectJanitorConfig;

  constructor(context: ExtensionContext) {
    super(context, 'janitor', 'Project Janitor');
    this.config = new ProjectJanitorConfig();
  }

  public cleanUpActiveDocument(): void {
    if (!vscode.window.activeTextEditor) {
      this.logger.info('No active document.');
    } else {
      Promiser.try(() => this.cleanUpDocument(vscode.window.activeTextEditor.document), e => this.onError(e));
    }
  }

  public validateFileNames(): void {
    const rules = this.config.fileRenameRules;

    if (rules && rules.length > 0) {
      Promiser.try(
        () =>
          Promiser.if(true)
            .then(() => this.checkForUnsavedWork())
            .then(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'))
            .then(() => {
              this.logger.info('Validating file names...');
              return this.findFiles(this.config.includePattern, this.config.excludePattern);
            })
            .then(files => {
              const renames: FileRename[] = [];

              this.logger.info(`Validating ${files.length} file names:`);

              for (let file of files) {
                const path = this.relativePath(file);

                for (let rule of this.config.fileRenameRules) {
                  const regEx: RegExp = new RegExp(rule.match);

                  if (regEx.test(path)) {
                    const newPath = path.replace(regEx, rule.rename);

                    this.logger.info(` - ${path} -> ${newPath}`);
                    renames.push({
                      from: path,
                      to: newPath
                    });
                  }
                }
              }

              return this.performRenames(renames);
            })
            .then(() => this.logger.info(`Done.`)),
        e => this.onError(e)
      );
    } else {
      vscode.window.showErrorMessage('No rules configured');
    }
  }

  public cleanUpProject(): void {
    Promiser.try(
      () =>
        Promiser.if(() => this.confirm(this.config.skipConfirmation, `Make sure you've backed up your code first.`))
          .then(() => this.checkForUnsavedWork())
          .then(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'))
          .then(() => {
            this.logger.info('Cleaning up project...');
            return vscode.workspace.findFiles(this.config.includePattern, this.config.excludePattern);
          })
          .then(files => {
            this.logger.info(`Cleaning up ${files.length} files:`);
            return this.forEachFile(files.sort(ProjectJanitor.compareUris), doc => this.cleanUpDocument(doc));
          })
          .then(count => this.logger.info(`Modified ${count} files.`))
          .then(() => vscode.commands.executeCommand('workbench.action.closeEditorsInGroup')),
      e => this.onError(e)
    );
  }

  private onError(e: any): void {
    try {
      if (e) {
        if (e instanceof Error) {
          this.logger.error(e.message, e);
          vscode.window.showErrorMessage(e.message);
        } else {
          this.logger.error('Error: ' + e);
          vscode.window.showErrorMessage('Error: ' + e);
        }
      } else {
        console.error(new Error('Undefined error'));
      }
    } catch (e2) {
      console.error(e);
    }
  }

  private cleanUpDocument(doc: TextDocument): Thenable<boolean> {
    const originalText: string = doc.getText();
    let edited: boolean = false;

    return vscode.window
      .showTextDocument(doc, ViewColumn.Active)
      .then(() => this.executeCommandSequence(this.config.commands))
      .then(() => {
        if (doc.isDirty && doc.getText() !== originalText) {
          edited = true;
          this.logger.info(` - ${this.relativePath(doc.uri)}`);
          return doc.save();
        }
      })
      .then(() => edited);
  }

  private checkForUnsavedWork(): Promised<void> {
    return Promiser.if(() => {
      let needSave: boolean = false;

      return Promiser.forEach(vscode.workspace.textDocuments, document => {
        if (document.isDirty) {
          needSave = true;
          return vscode.window.showTextDocument(document, ViewColumn.Active);
        }
      }).then(() => (needSave ? this.promptSave() : true));
    });
  }

  private performRenames(renames: FileRename[]): Thenable<any> {
    return Promiser.if(this.confirm(this.config.skipConfirmation, `Rename ${renames.length} files`)).then(() => {
      const promises: Promise<void>[] = [];

      for (let rename of renames) {
        this.logger.info(`Renaming ${rename.from} to ${rename.to}`);
        promises.push(fs.rename(rename.from, rename.to));
      }

      return Promise.all(promises);
    });
  }

  private promptSave(): Thenable<boolean> {
    return vscode.window
      .showErrorMessage('Save all your files before running clean up.', 'Save all', 'Cancel')
      .then(val => {
        if (val === 'Save all') {
          return vscode.workspace.saveAll().then(() => true);
        } else {
          return false;
        }
      });
  }

  private confirm(
    skipConfirmation: boolean = false,
    continueMessage?: string,
    cancelMessage?: string
  ): Thenable<boolean> {
    if (skipConfirmation) {
      return Promise.resolve(true);
    } else {
      return vscode.window
        .showQuickPick([
          {
            confirmed: true,
            label: 'Continue',
            description: continueMessage
          },
          {
            confirmed: false,
            label: 'Cancel',
            description: cancelMessage
          }
        ])
        .then(val => val.confirmed);
    }
  }

  private static compareUris(a: Uri, b: Uri): number {
    return a.path.localeCompare(b.path);
  }

  public static activate(extension: ProjectJanitor, methods: Array<keyof ProjectJanitor>): void {
    VSCExtension.registerMethods(extension, methods);
  }
}
